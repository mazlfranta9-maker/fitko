import { it, expect, vi } from "vitest";
import { AutosaveQueue, changedSets, type PendingSave } from "./autosave";
import { type Workout, nextTurn, selected, seedExercises } from "./domain";
const workout = (user: "Honza" | "David" = "Honza"): Workout => ({
  id: user,
  round: "shared",
  day: 1,
  user,
  date: "2026-10-17",
  completed: false,
  entries: selected(1, seedExercises).map((exerciseId) => ({
    exerciseId,
    sets: [0, 1, 2].map(() => ({ weight: "", reps: "" })),
  })),
});
it("předává stejnou sérii a potom další, zachovává partnery odděleně", () => {
  const h = workout(),
    d = workout("David");
  h.entries[0].sets[0] = { weight: "12,5", reps: "10" };
  expect(nextTurn(h, d, 0, 0)).toEqual({
    person: "David",
    exercise: 0,
    series: 0,
  });
  d.entries[0].sets[0] = { weight: "15", reps: "8" };
  expect(nextTurn(d, h, 0, 0)).toEqual({
    person: "Honza",
    exercise: 0,
    series: 1,
  });
  expect(h.entries[0].sets[0].weight).toBe("12,5");
});
it("fronta odešle neúplnou sérii bez dokončení celého tréninku", async () => {
  const send = vi.fn(async () => {}),
    saved = vi.fn();
  const q = new AutosaveQueue(send, saved, () => {});
  const a = workout(),
    b = structuredClone(a);
  b.entries[0].sets[0].weight = "12,5";
  q.enqueue(b, changedSets(a, b));
  await q.flush();
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      changes: [
        expect.objectContaining({ weight: "12,5", reps: "", ordinal: 1 }),
      ],
    }),
  );
  expect(q.pending()).toHaveLength(0);
  q.dispose();
});
it("novější editace během přenosu zůstane ve frontě a oba profily se odešlou odděleně", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let count = 0;
  const calls: PendingSave[] = [];
  const q = new AutosaveQueue(
    async (job) => {
      calls.push(job);
      if (++count === 1) await gate;
    },
    () => {},
    () => {},
  );
  const h = workout(),
    first = structuredClone(h);
  first.entries[0].sets[0] = { weight: "10", reps: "8" };
  q.enqueue(first, changedSets(h, first));
  const flushing = q.flush();
  const later = structuredClone(first);
  later.entries[0].sets[0].weight = "12,5";
  q.enqueue(later, changedSets(first, later));
  const d = workout("David"),
    after = structuredClone(d);
  after.entries[0].sets[0] = { weight: "20", reps: "7" };
  q.enqueue(after, changedSets(d, after));
  release();
  await flushing;
  expect(calls.map((c) => c.workout.user)).toEqual(["Honza", "Honza", "David"]);
  expect(calls[1].changes[0].weight).toBe("12,5");
  expect(q.pending()).toHaveLength(0);
  q.dispose();
});
it("chyba přenosu zachová zápis pro obnovení a opakované odeslání", async () => {
  let data: Record<string, PendingSave> = {};
  const q = new AutosaveQueue(
    async () => {
      throw Error("Offline");
    },
    (jobs) => {
      data = structuredClone(jobs);
    },
    () => {},
  );
  const a = workout(),
    b = structuredClone(a);
  b.entries[0].sets[0] = { weight: "5", reps: "3" };
  q.enqueue(b, changedSets(a, b));
  await q.flush();
  expect(q.pending()).toHaveLength(1);
  q.dispose();
  const send = vi.fn(async () => {});
  const resumed = new AutosaveQueue(
    send,
    () => {},
    () => {},
    data,
  );
  await resumed.flush();
  expect(send).toHaveBeenCalledOnce();
  expect(resumed.pending()).toHaveLength(0);
  resumed.dispose();
});
it("chyba jednoho profilu nezablokuje odeslání druhého", async () => {
  const sent: string[] = [];
  const q = new AutosaveQueue(
    async (job) => {
      if (job.workout.user === "Honza") throw Error("Chyba Honzy");
      sent.push(job.workout.user);
    },
    () => {},
    () => {},
  );
  for (const name of ["Honza", "David"] as const) {
    const a = workout(name),
      b = structuredClone(a);
    b.entries[0].sets[0] = { weight: "5", reps: "3" };
    q.enqueue(b, changedSets(a, b));
  }
  await q.flush();
  expect(sent).toEqual(["David"]);
  expect(q.pending().map((j) => j.workout.user)).toEqual(["Honza"]);
  q.dispose();
});
it("prázdná fronta nehlásí potvrzený online zápis", async () => {
  const status = vi.fn();
  const q = new AutosaveQueue(
    async () => {},
    () => {},
    status,
  );
  await q.flush();
  expect(status).not.toHaveBeenCalled();
});
it("souběžná editace posílá pouze změněná pole a sloučí pole ve frontě", async () => {
  const send = vi.fn(async (_job: PendingSave) => {});
  const q = new AutosaveQueue(
    send,
    () => {},
    () => {},
  );
  const a = workout(),
    b = structuredClone(a);
  b.entries[0].sets[0].weight = "20";
  expect(changedSets(a, b)[0].fields).toEqual(["weight"]);
  q.enqueue(b, changedSets(a, b));
  const c = structuredClone(b);
  c.entries[0].sets[0].reps = "10";
  q.enqueue(c, changedSets(b, c));
  await q.flush();
  expect(send.mock.calls[0][0].changes[0].fields).toEqual(["weight", "reps"]);
});
it("po potvrzení starší revize neopakuje již potvrzená pole", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const calls: PendingSave[] = [];
  const q = new AutosaveQueue(
    async (job) => {
      calls.push(job);
      if (calls.length === 1) await gate;
    },
    () => {},
    () => {},
  );
  const a = workout(),
    b = structuredClone(a);
  b.entries[0].sets[0].weight = "20";
  q.enqueue(b, changedSets(a, b));
  const running = q.flush();
  const c = structuredClone(b);
  c.entries[0].sets[0].reps = "10";
  q.enqueue(c, changedSets(b, c));
  release();
  await running;
  expect(calls[1].changes[0].fields).toEqual(["reps"]);
});
it("reconnect během dobíhajícího chybového přenosu neztratí požadavek na opakování", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  const q = new AutosaveQueue(
    async () => {
      if (++calls === 1) {
        await gate;
        throw Error("offline");
      }
    },
    () => {},
    () => {},
  );
  const a = workout(),
    b = structuredClone(a);
  b.entries[0].sets[0] = { weight: "20", reps: "10" };
  q.enqueue(b, changedSets(a, b));
  const first = q.flush();
  const online = q.flush();
  release();
  await Promise.all([first, online]);
  expect(calls).toBe(2);
  expect(q.pending()).toEqual([]);
  q.dispose();
});
