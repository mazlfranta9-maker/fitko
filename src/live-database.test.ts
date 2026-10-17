import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { selected, seedExercises } from "./domain";
it("průběžné série: částečný zápis, dva profily, zastaralý snímek a bezpečné dokončení", async () => {
  const db = new PGlite();
  await db.exec(
    `create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text);`,
  );
  for (const file of [
    "001_fitlog.sql",
    "004_live_sets.sql",
    "004_live_sets.sql",
  ])
    await db.exec(readFileSync("supabase/" + file, "utf8"));
  const h = "10000000-0000-4000-8000-000000000001",
    d = "10000000-0000-4000-8000-000000000002";
  await db.query("insert into auth.users values($1),($2)", [h, d]);
  await db.query("insert into profiles values($1,'Honza'),($2,'David')", [
    h,
    d,
  ]);
  const round = (
    await db.query<{ round_id: string }>("select round_id from cycle")
  ).rows[0].round_id;
  const payload = (user = "Honza") => ({
    id:
      user === "Honza"
        ? "20000000-0000-4000-8000-000000000001"
        : "20000000-0000-4000-8000-000000000002",
    user,
    round,
    day: 1,
    date: new Date().toISOString(),
    entries: selected(1, seedExercises).map((exerciseId) => ({
      exerciseId,
      sets: [0, 1, 2].map(() => ({ weight: "", reps: "" })),
    })),
  });
  const patch = (
    position: number,
    ordinal: number,
    weight: string,
    reps: string,
  ) => ({
    position,
    ordinal,
    exerciseId: payload().entries[position].exerciseId,
    weight,
    reps,
  });
  await db.exec(
    "grant usage on schema auth to authenticated;set role authenticated;",
  );
  await db.query("select set_config('test.uid',$1,false)", [h]);
  async function save(user: string, changes: unknown[]) {
    return (
      await db.query<{ save_workout_patch: string }>(
        "select save_workout_patch($1::jsonb,$2::jsonb)",
        [JSON.stringify(payload(user)), JSON.stringify(changes)],
      )
    ).rows[0].save_workout_patch;
  }
  const id = await save("Honza", [patch(0, 1, "12,5", "")]);
  await expect(db.query("select complete_workout($1)", [id])).rejects.toThrow(
    "Neúplné série",
  );
  await save("Honza", [patch(0, 2, "20", "8")]);
  await save("Honza", [patch(0, 1, "12,5", "10")]);
  const rows = await db.query<{
    ordinal: number;
    weight: string;
    reps: number;
  }>(
    "select s.ordinal,s.weight,s.reps from sets s join workout_exercises e on e.id=s.workout_exercise_id where e.workout_id=$1 and e.position=0 order by s.ordinal",
    [id],
  );
  expect(rows.rows.slice(0, 2)).toEqual([
    { ordinal: 1, weight: "12.50", reps: 10 },
    { ordinal: 2, weight: "20.00", reps: 8 },
  ]);
  const did = await save("David", [patch(0, 1, "35", "7")]);
  expect(did).not.toBe(id);
  await db.query("select set_config('test.uid',$1,false)", [d]);
  await save("Honza", [patch(0, 3, "25", "8")]);
  await expect(save("Honza", [patch(0, 1, "-5", "10")])).rejects.toThrow();
  const all = payload().entries.flatMap((_, position) =>
    [1, 2, 3].map((ordinal) => patch(position, ordinal, "10", "10")),
  );
  await save("Honza", all);
  await db.query("select complete_workout($1)", [id]);
  await db.query("select complete_workout($1)", [id]);
  expect(
    (await db.query<{ day: number }>("select day from cycle")).rows[0].day,
  ).toBe(2);
  await expect(save("Honza", [patch(0, 1, "100", "10")])).rejects.toThrow(
    "Trénink už je dokončený",
  );
  await expect(
    db.query("select save_workout($1::jsonb)", [JSON.stringify(payload())]),
  ).rejects.toThrow("Dokončený trénink musí mít vyplněné série");
  await save("David", all);
  await db.query("select complete_workout($1)", [did]);
  expect(
    (await db.query<{ day: number }>("select day from cycle")).rows[0].day,
  ).toBe(2);
  await db.query(
    "select set_config('test.uid','10000000-0000-4000-8000-000000000003',false)",
  );
  await expect(save("Honza", [patch(0, 1, "1", "1")])).rejects.toThrow(
    "Nepovolený účet",
  );
  await db.close();
}, 20000);
