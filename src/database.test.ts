import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { selected, seedExercises } from "./domain";
it("SQL migrace, transakční série, RLS a právě jeden posun sdíleného kola", async () => {
  const db = new PGlite();
  await db.exec(
    `create role authenticated; create schema auth; create schema storage; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$; create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(bucket_id text);`,
  );
  await db.exec(readFileSync("supabase/001_fitlog.sql", "utf8"));
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
  const payload = (user: string, id: string) => ({
    id,
    round,
    day: 1,
    user,
    date: new Date().toISOString(),
    entries: selected(1, seedExercises).map((exerciseId) => ({
      exerciseId,
      sets: [0, 1, 2].map(() => ({ weight: "12,5", reps: "10" })),
    })),
  });
  await db.query("select set_config('test.uid',$1,false)", [h]);
  const hw = "20000000-0000-4000-8000-000000000001";
  await db.query("select save_workout($1::jsonb)", [
    JSON.stringify(payload("Honza", hw)),
  ]);
  expect(
    (await db.query<{ n: number }>("select count(*)::int n from sets")).rows[0]
      .n,
  ).toBe(24);
  await db.exec(readFileSync("supabase/003_shared_editing.sql", "utf8"));
  await db.exec(readFileSync("supabase/003_shared_editing.sql", "utf8"));
  await db.exec(
    "grant usage on schema auth to authenticated; set role authenticated;",
  );
  await db.query("select set_config('test.uid',$1,false)", [d]);
  await db.query("select complete_workout($1)", [hw]);
  await db.query("select complete_workout($1)", [hw]);
  expect(
    (await db.query<{ day: number }>("select day from cycle")).rows[0].day,
  ).toBe(2);
  await db.query("select set_config('test.uid',$1,false)", [d]);
  const dw = (
    await db.query<{ id: string }>("select id from workouts where user_id=$1", [
      d,
    ])
  ).rows[0].id;
  await db.query("select set_config('test.uid',$1,false)", [h]);
  await db.query("select save_workout($1::jsonb)", [
    JSON.stringify(payload("David", "20000000-0000-4000-8000-000000000099")),
  ]);
  await db.query("select complete_workout($1)", [dw]);
  expect(
    (await db.query<{ day: number }>("select day from cycle")).rows[0].day,
  ).toBe(2);
  await db.query("select set_config('test.uid',$1,false)", [d]);
  const corrected = payload("Honza", hw);
  corrected.entries[0].sets[0].weight = "77,5";
  await db.query("select save_workout($1::jsonb)", [JSON.stringify(corrected)]);
  expect(
    (
      await db.query<{ user_id: string }>(
        "select user_id from workouts where id=$1",
        [hw],
      )
    ).rows[0].user_id,
  ).toBe(h);
  expect(
    (
      await db.query<{ weight: string }>(
        "select s.weight from sets s join workout_exercises e on e.id=s.workout_exercise_id where e.workout_id=$1 and e.position=0 and s.ordinal=1",
        [hw],
      )
    ).rows[0].weight,
  ).toBe("77.50");
  const legacy = payload("Honza", hw);
  legacy.entries = [0, 3, 1, 4, 2, 5, 6, 7].map((i) => legacy.entries[i]);
  await db.query("select save_workout($1::jsonb)", [JSON.stringify(legacy)]);
  const wrong = payload("Honza", hw);
  wrong.entries[0].exerciseId = wrong.entries[3].exerciseId;
  await expect(
    db.query("select save_workout($1::jsonb)", [JSON.stringify(wrong)]),
  ).rejects.toThrow("Nesprávná partie nebo duplicitní cvik");
  const bad = payload("David", dw);
  bad.entries[0].sets.pop();
  await expect(
    db.query("select save_workout($1::jsonb)", [JSON.stringify(bad)]),
  ).rejects.toThrow("Požadovány přesně 3 série");
  expect(
    (await db.query<{ n: number }>("select count(*)::int n from sets")).rows[0]
      .n,
  ).toBe(48);
  await db.exec(
    "grant usage on schema auth to authenticated; set role authenticated;",
  );
  expect((await db.query("select * from profiles")).rows).toHaveLength(2);
  expect((await db.query("select * from workouts")).rows).toHaveLength(2);
  await expect(
    db.query(
      "update workouts set completed=false where user_id=$1 returning id",
      [h],
    ),
  ).rejects.toThrow("permission denied for table workouts");
  expect(
    (await db.query("delete from workouts where id=$1 returning id", [hw]))
      .rows,
  ).toHaveLength(1);
  await db.query(
    "select set_config('test.uid','10000000-0000-4000-8000-000000000003',false)",
  );
  await expect(
    db.query("select save_workout($1::jsonb)", [
      JSON.stringify(payload("David", dw)),
    ]),
  ).rejects.toThrow("Nepovolený účet");
  await expect(db.query("select complete_workout($1)", [dw])).rejects.toThrow(
    "Nepovolený účet",
  );
  expect(
    (await db.query("delete from workouts returning id")).rows,
  ).toHaveLength(0);
  await db.query("select set_config('test.uid','',false)");
  expect((await db.query("select * from workouts")).rows).toHaveLength(0);
  await db.close();
}, 20000);
