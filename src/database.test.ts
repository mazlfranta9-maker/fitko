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
  await db.query("select save_workout($1::jsonb)", [
    JSON.stringify(payload("David", "20000000-0000-4000-8000-000000000099")),
  ]);
  await db.query("select complete_workout($1)", [dw]);
  expect(
    (await db.query<{ day: number }>("select day from cycle")).rows[0].day,
  ).toBe(2);
  await expect(
    db.query("select save_workout($1::jsonb)", [
      JSON.stringify(payload("Honza", hw)),
    ]),
  ).rejects.toThrow("Cizí profil");
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
    "grant usage on schema public,auth to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated; set role authenticated;",
  );
  await expect(
    db.query(
      "update workouts set completed=false where user_id=$1 returning id",
      [h],
    ),
  ).resolves.toMatchObject({ rows: [] });
  await db.query("select set_config('test.uid','',false)");
  expect((await db.query("select * from workouts")).rows).toHaveLength(0);
  await db.close();
}, 20000);
