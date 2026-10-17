import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { profileForAccount, hasLogin, linkDavidSql } from "./profiles";
import { selected, seedExercises } from "./domain";
it("Davidův profil funguje před účtem a pozdější přihlášení zachová jeho i Honzovy záznamy", async () => {
  const db = new PGlite();
  await db.exec(
    `create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text);`,
  );
  for (const file of ["001_fitlog.sql", "004_live_sets.sql"])
    await db.exec(readFileSync("supabase/" + file, "utf8"));
  const h = "10000000-0000-4000-8000-000000000001",
    d = "10000000-0000-4000-8000-000000000002",
    other = "10000000-0000-4000-8000-000000000003";
  await db.query("insert into auth.users values($1,'honza@example.com')", [h]);
  await db.query("insert into profiles(id,name) values($1,'Honza')", [h]);
  await db.exec(
    readFileSync("supabase/005_profiles_without_login.sql", "utf8"),
  );
  const before = (
    await db.query<{ id: string; name: string; auth_user_id: string | null }>(
      "select * from profiles order by name",
    )
  ).rows;
  const david = before.find((p) => p.name === "David")!;
  expect(david.auth_user_id).toBeNull();
  expect(hasLogin(david)).toBe(false);
  expect(profileForAccount(before, h)?.name).toBe("Honza");
  await db.exec(
    readFileSync("supabase/005_profiles_without_login.sql", "utf8"),
  );
  expect(
    (
      await db.query<{ id: string }>(
        "select id from profiles where name='David'",
      )
    ).rows[0].id,
  ).toBe(david.id);
  const round = (
    await db.query<{ round_id: string }>("select round_id from cycle")
  ).rows[0].round_id;
  const payload = (user: string) => ({
    id: crypto.randomUUID(),
    round,
    day: 1,
    user,
    date: new Date().toISOString(),
    entries: selected(1, seedExercises).map((exerciseId) => ({
      exerciseId,
      sets: [0, 1, 2].map(() => ({ weight: "", reps: "" })),
    })),
  });
  const change = (weight: string) => [
    {
      position: 0,
      ordinal: 1,
      exerciseId: selected(1, seedExercises)[0],
      weight,
      reps: "10",
    },
  ];
  await db.exec(
    "grant usage on schema auth to authenticated;set role authenticated;",
  );
  await db.query("select set_config('test.uid',$1,false)", [h]);
  await db.query("select save_workout_patch($1::jsonb,$2::jsonb)", [
    JSON.stringify(payload("Honza")),
    JSON.stringify(change("10")),
  ]);
  await db.query("select save_workout_patch($1::jsonb,$2::jsonb)", [
    JSON.stringify(payload("David")),
    JSON.stringify(change("20")),
  ]);
  expect((await db.query("select * from workouts")).rows).toHaveLength(2);
  await db.exec("reset role;");
  await db.query(
    "insert into auth.users values($1,'david@example.com'),($2,'other@example.com')",
    [d, other],
  );
  await expect(db.exec(linkDavidSql("honza@example.com"))).rejects.toThrow(
    "Tento účet patří Honzovi",
  );
  await db.exec(linkDavidSql("DAVID@example.com"));
  await db.exec(linkDavidSql("david@example.com"));
  const after = (
    await db.query<{ id: string; name: string; auth_user_id: string | null }>(
      "select * from profiles",
    )
  ).rows;
  expect(profileForAccount(after, d)).toMatchObject({
    id: david.id,
    name: "David",
  });
  expect(hasLogin(after.find((p) => p.name === "David"))).toBe(true);
  await expect(db.exec(linkDavidSql("other@example.com"))).rejects.toThrow(
    "David už je propojen",
  );
  await expect(db.exec(linkDavidSql("o'$fitlog$@example.com"))).rejects.toThrow(
    "Nejprve vytvořte tento účet",
  );
  await db.exec("set role authenticated;");
  await db.query("select set_config('test.uid',$1,false)", [d]);
  expect(
    (await db.query<{ member: boolean }>("select is_member() as member"))
      .rows[0].member,
  ).toBe(true);
  expect(
    (
      await db.query<{ name: string; weight: string }>(
        "select p.name,s.weight from workouts w join profiles p on p.id=w.user_id join workout_exercises e on e.workout_id=w.id join sets s on s.workout_exercise_id=e.id where s.weight is not null order by p.name",
      )
    ).rows,
  ).toEqual([
    { name: "David", weight: "20.00" },
    { name: "Honza", weight: "10.00" },
  ]);
  await expect(
    db.query("update profiles set auth_user_id=$1 where name=$2", [
      other,
      "David",
    ]),
  ).rejects.toThrow("permission denied");
  await db.query("select set_config('test.uid',$1,false)", [other]);
  expect((await db.query("select * from workouts")).rows).toHaveLength(0);
  await db.exec("reset role;");
  await db.query("delete from auth.users where id=$1", [d]);
  expect(
    (
      await db.query<{ auth_user_id: string | null }>(
        "select auth_user_id from profiles where name='David'",
      )
    ).rows[0].auth_user_id,
  ).toBeNull();
  expect((await db.query("select * from workouts")).rows).toHaveLength(2);
  await db.close();
}, 20000);
it("přihlášení rozlišuje starší a oddělené profily", () => {
  expect(
    profileForAccount(
      [{ id: "profile", auth_user_id: "account", name: "David" }],
      "account",
    )?.id,
  ).toBe("profile");
  expect(
    profileForAccount([{ id: "legacy", name: "Honza" }], "legacy")?.name,
  ).toBe("Honza");
  expect(
    profileForAccount(
      [{ id: "guest", auth_user_id: null, name: "David" }],
      undefined,
    ),
  ).toBeUndefined();
});

it("nepřiřadí nepřihlášenému profilu účet jen kvůli shodě ID", () => {
  expect(
    profileForAccount(
      [{ id: "guest", auth_user_id: null, name: "David" }],
      "guest",
    ),
  ).toBeUndefined();
});
