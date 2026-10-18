import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { selected, seedExercises } from "./domain";
it("mobile alone initializes shared plan; David cannot change it; filled history survives conflicts and migration", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text);`,
    );
    for (const f of ["001_fitlog.sql", "004_live_sets.sql"])
      await db.exec(readFileSync("supabase/" + f, "utf8"));
    const h = "10000000-0000-4000-8000-000000000001";
    await db.query("insert into auth.users values($1)", [h]);
    await db.query("insert into profiles(id,name) values($1,'Honza')", [h]);
    for (const f of [
      "005_profiles_without_login.sql",
      "008_shared_exercises.sql",
      "008_shared_exercises.sql",
    ])
      await db.exec(readFileSync("supabase/" + f, "utf8"));
    await db.exec(
      "insert into exercises(id,name,muscle) values('alternate','Alternate press','Prsa');grant usage on schema auth to authenticated;set role authenticated;",
    );
    await db.query("select set_config('test.uid',$1,false)", [h]);
    const round = (
      await db.query<{ round_id: string }>("select round_id from cycle")
    ).rows[0].round_id;
    const ids = selected(1, seedExercises);
    const payload = (user = "David") => ({
      id: crypto.randomUUID(),
      round,
      day: 1,
      user,
      date: new Date().toISOString(),
      honzaPlan: ids,
      entries: ids.map((exerciseId) => ({
        exerciseId,
        sets: [0, 1, 2].map(() => ({ weight: "", reps: "" })),
      })),
    });
    const patch = (
      position = 0,
      exerciseId = ids[position],
      weight = "20",
      reps = "10",
      fields = ["weight", "reps"],
      replaceExercise = false,
    ) => ({
      position,
      ordinal: 1,
      exerciseId,
      weight,
      reps,
      fields,
      replaceExercise,
    });
    const save = (user: string, changes: unknown[]) =>
      db.query("select save_workout_patch($1::jsonb,$2::jsonb)", [
        JSON.stringify(payload(user)),
        JSON.stringify(changes),
      ]);
    await save("David", [patch()]);
    expect(
      (
        await db.query(
          "select p.name,s.weight,s.reps from sets s join workout_exercises e on e.id=s.workout_exercise_id join workouts w on w.id=e.workout_id join profiles p on p.id=w.user_id where e.position=0 and ordinal=1 order by p.name",
        )
      ).rows,
    ).toEqual([
      { name: "David", weight: "20.00", reps: 10 },
      { name: "Honza", weight: null, reps: null },
    ]);
    await expect(save("David", [patch(0, "alternate")])).rejects.toThrow(
      "odpovídat Honzovi",
    );
    // Honza changes an empty slot: both plans update atomically without any PC.
    await save("Honza", [
      patch(1, "alternate", "", "", ["weight", "reps"], true),
    ]);
    expect(
      (
        await db.query(
          "select exercise_id from workout_exercises where position=1",
        )
      ).rows,
    ).toEqual([{ exercise_id: "alternate" }, { exercise_id: "alternate" }]);
    await save("David", [patch(1, "alternate", "25", "8")]);
    await expect(
      save("Honza", [patch(1, ids[1], "", "", ["weight", "reps"], true)]),
    ).rejects.toThrow("David už má");
    // Independent fields from two stale device snapshots survive.
    await Promise.all([
      save("David", [patch(0, ids[0], "30", "", ["weight"])]),
      save("David", [patch(0, ids[0], "20", "12", ["reps"])]),
    ]);
    const before = (await db.query("select * from sets order by id")).rows;
    await db.exec("reset role;");
    await db.exec(readFileSync("supabase/008_shared_exercises.sql", "utf8"));
    expect((await db.query("select * from sets order by id")).rows).toEqual(
      before,
    );
    await db.exec("set role authenticated;");
    const bad = payload();
    bad.entries[0].exerciseId = "alternate";
    await expect(
      db.query("select save_workout($1::jsonb)", [JSON.stringify(bad)]),
    ).rejects.toThrow("odpovídat Honzovi");
    expect((await db.query("select * from sets order by id")).rows).toEqual(
      before,
    );
    // Every cycle day, including nine-exercise legs days, starts on mobile.
    for (let day = 1; day <= 12; day++) {
      await db.exec("reset role;");
      const r = (
        await db.query<{ id: string }>(
          "insert into rounds(day) values($1) returning id",
          [day],
        )
      ).rows[0].id;
      await db.exec("set role authenticated;");
      const p = payload();
      p.round = r;
      p.day = day;
      p.honzaPlan = selected(day, seedExercises);
      p.entries = p.honzaPlan.map((exerciseId) => ({
        exerciseId,
        sets: [0, 1, 2].map(() => ({ weight: "", reps: "" })),
      }));
      await db.query("select save_workout_patch($1::jsonb,$2::jsonb)", [
        JSON.stringify(p),
        JSON.stringify([{ ...patch(), exerciseId: p.honzaPlan[0] }]),
      ]);
      const layout = (
        await db.query<{ name: string; exercise_id: string; position: number }>(
          "select p.name,e.exercise_id,e.position from workout_exercises e join workouts w on w.id=e.workout_id join profiles p on p.id=w.user_id where w.round_id=$1 order by p.name,e.position",
          [r],
        )
      ).rows;
      expect(
        layout.filter((e) => e.name === "David").map((e) => e.exercise_id),
      ).toEqual(p.honzaPlan);
      expect(
        layout.filter((e) => e.name === "Honza").map((e) => e.exercise_id),
      ).toEqual(p.honzaPlan);
    }
  } finally {
    await db.close();
  }
}, 20000);
