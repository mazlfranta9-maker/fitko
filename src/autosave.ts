import type { Workout } from "./domain";
export type SetPatch = {
  position: number;
  ordinal: number;
  exerciseId: string;
  weight: string;
  reps: string;
  replaceExercise?: boolean;
};
export type PendingSave = {
  workout: Workout;
  changes: SetPatch[];
  revision: number;
};
export function changedSets(before: Workout, after: Workout): SetPatch[] {
  return after.entries.flatMap((e, position) =>
    e.sets.flatMap((s, index) => {
      const old = before.entries[position];
      const replaced = old?.exerciseId !== e.exerciseId;
      return replaced ||
        old?.sets[index]?.weight !== s.weight ||
        old?.sets[index]?.reps !== s.reps
        ? [
            {
              position,
              ordinal: index + 1,
              exerciseId: e.exerciseId,
              ...s,
              replaceExercise: replaced,
            },
          ]
        : [];
    }),
  );
}
// Jedna fronta odesílá změněné série postupně. Novější úpravy během přenosu nezahodí.
export class AutosaveQueue {
  private jobs: Record<string, PendingSave>;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  constructor(
    private send: (job: PendingSave) => Promise<unknown>,
    private persist: (jobs: Record<string, PendingSave>) => void,
    private status: (
      status: "waiting" | "saving" | "saved" | "error",
      error?: unknown,
    ) => void,
    initial: Record<string, PendingSave> = {},
  ) {
    this.jobs = initial;
    this.revision = Math.max(
      0,
      ...Object.values(initial).map((j) => j.revision),
    );
  }
  enqueue(workout: Workout, changes: SetPatch[]) {
    if (!changes.length) return;
    const key = workout.round + ":" + workout.user;
    const old = this.jobs[key];
    const merged = new Map(
      (old?.changes || []).map((c) => [`${c.position}:${c.ordinal}`, c]),
    );
    for (const c of changes) {
      const k = `${c.position}:${c.ordinal}`;
      merged.set(k, {
        ...c,
        replaceExercise: c.replaceExercise || merged.get(k)?.replaceExercise,
      });
    }
    this.jobs[key] = {
      workout: structuredClone(workout),
      changes: [...merged.values()],
      revision: ++this.revision,
    };
    this.persist(this.jobs);
    this.status("waiting");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 700);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    this.running = this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async drain() {
    const failed = new Set<string>();
    let lastError: unknown;
    for (;;) {
      const key = Object.keys(this.jobs).find((key) => !failed.has(key));
      if (!key) {
        this.status(failed.size ? "error" : "saved", lastError);
        return;
      }
      const job = structuredClone(this.jobs[key]);
      this.status("saving");
      try {
        await this.send(job);
      } catch (e) {
        failed.add(key);
        lastError = e;
        continue;
      }
      if (this.jobs[key]?.revision === job.revision) delete this.jobs[key];
      this.persist(this.jobs);
    }
  }
  pending() {
    return Object.values(this.jobs);
  }
  dispose() {
    clearTimeout(this.timer);
  }
}
