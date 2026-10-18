import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  cycle: { data: null as unknown, error: null },
  rpc: vi.fn(),
  table: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mocks.table, rpc: mocks.rpc }),
}));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test");
  const builder = {
    select: () => builder,
    eq: () => builder,
    abortSignal: () => builder,
    maybeSingle: async () => mocks.cycle,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  mocks.table.mockReturnValue(builder);
});
it("neviditelný cyklus vysvětlí bez obecné chyby single JSON", async () => {
  const { loadRemote } = await import("./storage");
  await expect(loadRemote()).rejects.toThrow(
    "propojení profiles.auth_user_id a RLS",
  );
});
it("prázdná odpověď RPC není potvrzení uložení", async () => {
  mocks.rpc.mockReturnValue({
    abortSignal: () => Promise.resolve({ data: null, error: null }),
  });
  const { savePatch } = await import("./storage");
  await expect(
    savePatch({ workout: {} as any, changes: [], revision: 1 }),
  ).rejects.toThrow("Server nepotvrdil ID");
});
