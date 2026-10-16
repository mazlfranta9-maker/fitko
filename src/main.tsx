import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Dumbbell,
  History,
  TrendingUp,
  Library,
  Settings,
  X,
  ChevronRight,
  Check,
  Plus,
  ArrowUpRight,
  Cloud,
  Flame,
  Camera,
  Download,
  LogOut,
} from "lucide-react";
import {
  type Person,
  type Exercise,
  type Workout,
  type SetEntry,
  muscles,
  seedExercises,
  demoHistory,
  plan,
  typeOf,
  nextDay,
  selected,
  validSets,
  volume,
  kg,
  category,
} from "./domain";
import {
  supabase,
  read,
  persist,
  loadRemote,
  saveRemote,
  finishRemote,
  saveExercise,
} from "./storage";
import "./style.css";
import { ExerciseCard } from "./components/ExerciseCard";
const uid = (): string => crypto.randomUUID();
const fmt = (n: number) =>
  n.toLocaleString("cs-CZ", { maximumFractionDigits: 1 });
function App() {
  const prefix = supabase ? "fitlog-online-" : "fitlog-demo-";
  const [tab, setTab] = useState("Trénink"),
    [person, setPerson] = useState<Person>("Honza"),
    [owner, setOwner] = useState<Person>("Honza"),
    [auth, setAuth] = useState(false),
    [ready, setReady] = useState(!supabase);
  const [synced, setSynced] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>(() =>
    read(prefix + "exercises", supabase ? [] : seedExercises),
  );
  const [workouts, setWorkouts] = useState<Workout[]>(() =>
    read(prefix + "history", supabase ? [] : demoHistory()),
  );
  const [cycle, setCycle] = useState(() =>
    read(prefix + "cycle", { day: 1, round: uid() }),
  );
  const [drafts, setDrafts] = useState<Workout[]>(() =>
    read(prefix + "drafts", []),
  );
  const [settings, setSettings] = useState(false),
    [light, setLight] = useState(() => read("fitlog-light", false)),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [muscle, setMuscle] = useState("Všechny partie"),
    [search, setSearch] = useState(""),
    [filterUser, setFilterUser] = useState("Oba"),
    [filterType, setFilterType] = useState("Všechny typy"),
    [filterDay, setFilterDay] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [editing, setEditing] = useState<Exercise | null>(null),
    [progressId, setProgressId] = useState(seedExercises[0].id),
    [progressType, setProgressType] = useState("Lehký");
  const notify = (s: string) => {
    setMessage(s);
  };
  async function refresh() {
    if (!supabase) return;
    const d = await loadRemote();
    const { data } = await supabase.auth.getUser();
    const me = d.profiles.find((p) => p.id === data.user?.id);
    if (!me)
      throw Error(
        "Účet nemá profil Honza nebo David. Správce musí dokončit nastavení databáze.",
      );
    setOwner(me.name);
    persist(prefix + "verified-owner", me.name);
    setPerson(me.name);
    setExercises(d.exercises);
    setWorkouts(d.workouts);
    const pending = d.workouts
      .filter((w) => w.user === me.name && !w.completed)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    setCycle(
      pending
        ? { day: pending.day, round: pending.round }
        : { day: d.cycle.day, round: d.cycle.round_id },
    );
    setReady(true);
    setSynced(true);
  }
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        setAuth(!!data.session);
        if (data.session)
          refresh().catch((e) => {
            const cached = read<Person | null>(prefix + "verified-owner", null);
            if (cached) {
              setOwner(cached);
              setPerson(cached);
              setReady(true);
            }
            notify(
              "Online data nejsou dostupná. Používám místní zápis. " +
                e.message,
            );
          });
      });
      const { data } = supabase.auth.onAuthStateChange((_e, s) => {
        setAuth(!!s);
        if (s)
          setTimeout(
            () =>
              refresh().catch((e) => {
                const cached = read<Person | null>(
                  prefix + "verified-owner",
                  null,
                );
                if (cached) {
                  setOwner(cached);
                  setPerson(cached);
                  setReady(true);
                }
                notify(
                  "Online data nejsou dostupná. Používám místní zápis. " +
                    e.message,
                );
              }),
            0,
          );
        else setReady(false);
      });
      return () => {
        data.subscription.unsubscribe();
        window.removeEventListener("online", on);
        window.removeEventListener("offline", on);
      };
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    try {
      persist(prefix + "exercises", exercises);
      persist(prefix + "history", workouts);
      persist(prefix + "cycle", cycle);
      persist(prefix + "drafts", drafts);
    } catch {
      notify(
        "Úložiště telefonu je plné. Exportujte historii a zmenšete fotografie.",
      );
    }
  }, [exercises, workouts, cycle, drafts]);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
    persist("fitlog-light", light);
  }, [light]);
  const editable = !supabase || person === owner;
  const current =
    drafts.find((w) => w.user === person && w.round === cycle.round) ||
    workouts.find((w) => w.user === person && w.round === cycle.round);
  const makeDraft = (): Workout => ({
    id: uid(),
    round: cycle.round,
    day: cycle.day,
    user: person,
    date: new Date().toISOString(),
    completed: false,
    entries: selected(cycle.day, exercises).map((exerciseId) => ({
      exerciseId,
      sets: [0, 1, 2].map(() => ({ weight: "", reps: "" })),
    })),
  });
  const workout = current
    ? current.entries.length
      ? current
      : { ...current, entries: makeDraft().entries }
    : makeDraft();
  const update = (w: Workout) => {
    if (!editable || w.completed) return;
    setDrafts((ds) => [
      ...ds.filter((d) => !(d.user === w.user && d.round === w.round)),
      w,
    ]);
  };
  const done = workout.entries.filter((e) => validSets(e.sets)).length;
  const last = (id: string, day: number, user = person) =>
    workouts
      .filter(
        (w) =>
          w.user === user &&
          w.completed &&
          typeOf(w.day) === typeOf(day) &&
          w.id !== workout.id &&
          w.entries.some((e) => e.exerciseId === id),
      )
      .sort((a, b) => b.date.localeCompare(a.date))[0]
      ?.entries.find((e) => e.exerciseId === id);
  async function save(finish = false) {
    if (!editable) return;
    if (
      new Set(workout.entries.map((e) => e.exerciseId)).size !==
        workout.entries.length ||
      !workout.entries.every((e) => e.exerciseId && validSets(e.sets))
    ) {
      notify(
        "Vyplňte u každého cviku všechny 3 série: váha 0–2000 kg a 1–1000 opakování.",
      );
      return;
    }
    setBusy(true);
    update(workout);
    try {
      if (supabase) {
        const savedId = await saveRemote(workout);
        if (finish)
          await finishRemote({ ...workout, id: savedId || workout.id });
        await refresh();
      } else {
        const w = { ...workout, completed: finish };
        setWorkouts((ws) => [...ws.filter((x) => x.id !== w.id), w]);
        if (
          finish &&
          !workouts.some((x) => x.round === workout.round && x.completed)
        ) {
          const other = person === "Honza" ? "David" : "Honza";
          setDrafts((ds) =>
            ds.some((x) => x.round === workout.round && x.user === other)
              ? ds
              : [...ds, { ...makeDraft(), id: uid(), user: other }],
          );
          const nextRound = uid();
          persist(prefix + "next-round-" + workout.round, nextRound);
          setCycle((c) => ({ day: nextDay(c.day), round: nextRound }));
        }
      }
      if (
        finish &&
        !supabase &&
        workouts.some((x) => x.round === workout.round && x.completed)
      )
        setCycle({
          day: nextDay(workout.day),
          round: read(prefix + "next-round-" + workout.round, uid()),
        });
      if (finish) setDrafts((ds) => ds.filter((w) => w.id !== workout.id));
      notify(
        finish
          ? "Trénink dokončen. Další den cyklu je připraven."
          : "Trénink uložen.",
      );
    } catch (e) {
      setSynced(false);
      notify("Neodesláno. Zápis zůstává v telefonu. " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = workouts
    .filter(
      (w) =>
        (filterUser === "Oba" || w.user === filterUser) &&
        (filterType === "Všechny typy" || typeOf(w.day) === filterType) &&
        (!filterDay || w.day === +filterDay) &&
        (!from || w.date.slice(0, 10) >= from) &&
        (!to || w.date.slice(0, 10) <= to),
    )
    .map((w) => ({
      ...w,
      entries: w.entries.filter((e) => {
        const ex = exercises.find((x) => x.id === e.exerciseId);
        return (
          (muscle === "Všechny partie" || ex?.muscle === muscle) &&
          (!search || ex?.name.toLowerCase().includes(search.toLowerCase()))
        );
      }),
    }))
    .filter((w) => w.entries.length)
    .sort((a, b) => b.date.localeCompare(a.date));
  function csv() {
    const rows = [
      [
        "Datum",
        "Uživatel",
        "Den",
        "Typ",
        "Partie",
        "Kategorie",
        "Cvik",
        "Fotografie",
        "Série",
        "Váha kg",
        "Opakování",
      ],
      ...filtered.flatMap((w) =>
        w.entries.flatMap((e) =>
          e.sets.map((s, i) => {
            const ex = exercises.find((x) => x.id === e.exerciseId);
            return [
              w.date,
              w.user,
              w.day,
              typeOf(w.day),
              ex?.muscle,
              category(ex?.muscle || ""),
              ex?.name,
              ex?.photo,
              i + 1,
              s.weight,
              s.reps,
            ];
          }),
        ),
      ),
    ];
    const blob = new Blob(
      [
        "\ufeff" +
          rows
            .map((r) =>
              r
                .map((v) => '"' + String(v ?? "").replaceAll('"', '""') + '"')
                .join(";"),
            )
            .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fitlog-historie.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function commitExercise(e: Exercise) {
    if (!e.name.trim()) {
      notify("Vyplňte název cviku.");
      return;
    }
    setBusy(true);
    try {
      const saved = (await saveExercise(e)) || e;
      setExercises((es) => [...es.filter((x) => x.id !== e.id), saved]);
      setEditing(null);
      notify("Cvik uložen.");
    } catch (err) {
      notify("Cvik nebyl uložen: " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function photo(file: File) {
    if (file.size > 12 * 1024 * 1024) {
      notify("Fotografie může mít nejvýše 12 MB.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const c = document.createElement("canvas");
      const ratio = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
      c.width = bitmap.width * ratio;
      c.height = bitmap.height * ratio;
      c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
      setEditing((e) =>
        e ? { ...e, photo: c.toDataURL("image/jpeg", 0.75) } : e,
      );
      bitmap.close();
    } catch {
      notify("Fotografii se nepodařilo načíst. Vyberte JPEG nebo PNG.");
    }
  }
  const filterControls = (
    <div className="filters">
      <select
        value={filterUser}
        onChange={(e) => setFilterUser(e.target.value)}
      >
        {["Oba", "Honza", "David"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
        {["Všechny partie", ...muscles].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select
        value={filterType}
        onChange={(e) => setFilterType(e.target.value)}
      >
        {["Všechny typy", "Lehký", "Těžký"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <input
        placeholder="Hledat cvik…"
        aria-label="Hledat cvik"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <input
        type="number"
        min="1"
        max="12"
        placeholder="Den cyklu"
        aria-label="Den cyklu"
        value={filterDay}
        onChange={(e) => setFilterDay(e.target.value)}
      />
      <label>
        Od
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label>
        Do
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
    </div>
  );
  if (supabase && (!auth || !ready))
    return (
      <main className="login">
        <Dumbbell size={42} />
        <h1>
          FitLog<span>.</span>
        </h1>
        <p>Tvůj trénink. Tvůj progres.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const { error } = await supabase!.auth.signInWithPassword({
              email,
              password,
            });
            if (error) notify(error.message);
            setBusy(false);
          }}
        >
          <h2>Přihlášení</h2>
          <label>
            E-mail
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Heslo
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button disabled={busy}>Přihlásit se</button>
        </form>
        {auth && (
          <button
            onClick={() =>
              refresh().catch((e) => {
                const cached = read<Person | null>(
                  prefix + "verified-owner",
                  null,
                );
                if (cached) {
                  setOwner(cached);
                  setPerson(cached);
                  setReady(true);
                }
                notify(
                  "Online data nejsou dostupná. Používám místní zápis. " +
                    e.message,
                );
              })
            }
          >
            Znovu načíst profil
          </button>
        )}
        {message && <p role="alert">{message}</p>}
      </main>
    );
  return (
    <div className="app">
      <aside>
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-icon">
            <Dumbbell />
          </span>
          FitLog<span className="dot">.</span>
        </a>
        <div className="aside-caption">TVŮJ OSOBNÍ TRÉNINKOVÝ DENÍK</div>
        <nav>
          {[
            [Dumbbell, "Trénink"],
            [History, "Historie"],
            [TrendingUp, "Progres"],
            [Library, "Cviky"],
          ].map(([Icon, name]) => {
            const I = Icon as typeof Dumbbell;
            return (
              <button
                key={String(name)}
                className={tab === name ? "active" : ""}
                onClick={() => setTab(String(name))}
              >
                <I size={21} />
                <span>{String(name)}</span>
                {tab === name && <ChevronRight size={16} />}
              </button>
            );
          })}
        </nav>
        <div className="aside-bottom">
          <div className="cycle-mini">
            <span className="eyebrow">SPOLEČNĚ SILNĚJŠÍ</span>
            <h3>Každá série se počítá.</h3>
            <p>
              Společný plán.
              <br />
              Vlastní tempo. Vlastní progres.
            </p>
            <div className="avatars">
              <b>H</b>
              <b>D</b>
              <span>Honza & David</span>
            </div>
          </div>
          <button className="settings-link" onClick={() => setSettings(true)}>
            <Settings size={19} /> Nastavení
          </button>
          <span className="version">FITLOG / VERZE 1.0</span>
        </div>
      </aside>
      <div className="main">
        <header>
          <div>
            <span className="breadcrumb">
              MŮJ DENÍK <ChevronRight size={12} /> {tab.toUpperCase()}
            </span>
            <span className={"connection " + (!online ? "offline" : "")}>
              <i />
              {!supabase
                ? "Demonstrační režim"
                : online
                  ? synced
                    ? "Online data načtena"
                    : "Čeká na synchronizaci"
                  : "Offline · zápis v telefonu"}
            </span>
          </div>
          <div className="header-right">
            <button
              className="icon-button"
              aria-label="Nastavení"
              onClick={() => setSettings(true)}
            >
              <Settings size={20} />
            </button>
            <span className="avatar">{owner[0]}</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {new Date()
                  .toLocaleDateString("cs-CZ", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                  .toUpperCase()}
              </div>
              <h1>
                {tab === "Trénink"
                  ? "Dnes je den pro progres."
                  : tab === "Historie"
                    ? "Každý trénink má svůj příběh."
                    : tab === "Progres"
                      ? "Výsledky, které jsou vidět."
                      : "Tvoje cviky. Tvůj plán."}
              </h1>
              <p>
                {tab === "Trénink"
                  ? "Soustřeď se na další sérii. O zbytek se postará FitLog."
                  : tab === "Historie"
                    ? "Všechny série na jednom místě. Vrať se k tomu, co fungovalo."
                    : tab === "Progres"
                      ? "Sleduj všechny tři série a porovnávej stejné typy tréninku."
                      : "Sestav si knihovnu, která odpovídá tvému tréninku."}
              </p>
            </div>
            {tab === "Trénink" && (
              <div className="person-switch">
                {(["Honza", "David"] as Person[]).map((p) => (
                  <button
                    className={person === p ? "selected" : ""}
                    key={p}
                    onClick={() => {
                      setPerson(p);
                      const pending = drafts.find((d) => d.user === p);
                      if (pending)
                        setCycle({ day: pending.day, round: pending.round });
                      else if (
                        workouts.some(
                          (w) => w.round === cycle.round && w.completed,
                        )
                      )
                        setCycle({
                          day: nextDay(cycle.day),
                          round: read(
                            prefix + "next-round-" + cycle.round,
                            uid(),
                          ),
                        });
                    }}
                  >
                    <span>{p[0]}</span>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!supabase && (
            <div className="demo-note">
              <Cloud size={15} /> Demo · data se ukládají pouze v tomto
              prohlížeči. Online synchronizace není aktivní.
            </div>
          )}
          {tab === "Trénink" && (
            <>
              <section className="workout-hero">
                <div>
                  <span className="eyebrow">TVŮJ DNEŠNÍ TRÉNINK</span>
                  <h2>{plan(cycle.day).main.join(" & ")}</h2>
                  <p>{plan(cycle.day).extra.join(" · ")}</p>
                  <div className="hero-tags">
                    <span>
                      <Flame size={15} />
                      {typeOf(cycle.day)} trénink
                    </span>
                    <span>{cycle.day <= 6 ? "8–12" : "3–7"} opakování</span>
                    <span>
                      {workout.entries.length} cviků ·{" "}
                      {workout.entries.length * 3} sérií
                    </span>
                  </div>
                </div>
                <div className="day-display">
                  <span>DEN CYKLU</span>
                  <strong>
                    {String(cycle.day).padStart(2, "0")}
                    <small>/ 12</small>
                  </strong>
                  <div className="cycle-dots">
                    {Array.from({ length: 12 }, (_, i) => (
                      <i
                        key={i}
                        className={i + 1 <= cycle.day ? "filled" : ""}
                      />
                    ))}
                  </div>
                  <button onClick={() => setSettings(true)}>
                    Změnit den <ChevronRight size={13} />
                  </button>
                </div>
              </section>
              <div className="training-layout">
                <section>
                  <div className="section-title">
                    <h2>
                      Tréninkový plán <span>{workout.entries.length}</span>
                    </h2>
                    <span className="muted">
                      {typeOf(cycle.day) === "Lehký"
                        ? "Postupně zvyšuj váhu ↗"
                        : "Postupně snižuj váhu ↘"}
                    </span>
                  </div>
                  {!editable && (
                    <div className="demo-note">
                      Prohlížíš výsledky druhého uživatele. Zápis je dostupný
                      pouze vlastníkovi.
                    </div>
                  )}
                  {workout.entries.map((entry, index) => (
                    <ExerciseCard
                      key={index}
                      entry={entry}
                      index={index}
                      muscle={plan(cycle.day).slots[index]}
                      exercises={exercises}
                      previous={last(entry.exerciseId, cycle.day)}
                      disabled={!editable || workout.completed}
                      onChange={(entry) => {
                        const w = structuredClone(workout);
                        w.entries[index] = entry;
                        update(w);
                      }}
                    />
                  ))}
                  <div className="save-bar">
                    <span>
                      <Cloud size={16} /> Rozepsané série se ukládají v telefonu
                    </span>
                    <button
                      className="secondary"
                      disabled={busy || !editable}
                      onClick={() => save()}
                    >
                      Uložit trénink
                    </button>
                  </div>
                </section>
                <div className="right-column">
                  <section className="summary-card">
                    <span className="eyebrow">DNEŠNÍ PŘEHLED</span>
                    <div className="summary-number">
                      {done}
                      <span>/ {workout.entries.length}</span>
                    </div>
                    <p>dokončených cviků</p>
                    <div className="progress-track">
                      <div
                        style={{
                          width: `${(done / workout.entries.length) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="summary-line">
                      <span>Zapsané série</span>
                      <b>
                        {workout.entries.reduce(
                          (n, e) =>
                            n +
                            e.sets.filter(
                              (s) => s.weight !== "" && s.reps !== "",
                            ).length,
                          0,
                        )}{" "}
                        / {workout.entries.length * 3}
                      </b>
                    </div>
                    <div className="summary-line">
                      <span>Celkový objem</span>
                      <b>
                        {fmt(
                          workout.entries.reduce(
                            (n, e) => n + volume(e.sets),
                            0,
                          ),
                        )}{" "}
                        kg
                      </b>
                    </div>
                    <button
                      className="finish"
                      disabled={
                        busy || !editable || done !== workout.entries.length
                      }
                      onClick={() => {
                        if (
                          confirm(
                            "Dokončit trénink a posunout společný cyklus?",
                          )
                        )
                          save(true);
                      }}
                    >
                      <Check size={18} /> Dokončit trénink
                    </button>
                    <small>
                      Po dokončení přejdeme na den {nextDay(cycle.day)}.
                    </small>
                  </section>
                  <section className="tip-card">
                    <span className="tip-icon">
                      <TrendingUp size={22} />
                    </span>
                    <h3>Technika před čísly.</h3>
                    <p>
                      {cycle.day <= 6
                        ? "U lehkého tréninku začni nižší váhou a postupně přidávej. Míř na 8–12 čistých opakování."
                        : "U těžkého tréninku začni nejvyšší pracovní váhou a postupně ubírej. Míř na 3–7 opakování."}
                    </p>
                    <span>DOPORUČENÍ, NE OMEZENÍ</span>
                  </section>
                  <section className="next-card">
                    <span className="eyebrow">PŘÍŠTĚ NA ŘADĚ</span>
                    <h3>{plan(nextDay(cycle.day)).main.join(" & ")}</h3>
                    <p>
                      Den {nextDay(cycle.day)} <span>·</span>{" "}
                      {typeOf(nextDay(cycle.day))} trénink{" "}
                      <ArrowUpRight size={17} />
                    </p>
                  </section>
                </div>
              </div>
            </>
          )}
          {tab === "Historie" && (
            <>
              <div className="section-title">
                <h2>Historie tréninků</h2>
                <button className="secondary" onClick={csv}>
                  <Download size={16} /> Export CSV
                </button>
              </div>
              {filterControls}
              {!filtered.length && (
                <div className="empty">Zatím žádné odpovídající záznamy.</div>
              )}
              {filtered.map((w) => (
                <article className="history-card" key={w.id}>
                  <div className="section-title">
                    <div>
                      <h3>
                        {new Date(w.date).toLocaleDateString("cs-CZ")} ·{" "}
                        {w.user}
                      </h3>
                      <span className="muted">
                        Den {w.day} · {typeOf(w.day)} ·{" "}
                        {w.completed ? "Dokončeno" : "Uloženo"}
                      </span>
                    </div>
                    {(!supabase || w.user === owner) && (
                      <div className="history-actions">
                        <button
                          className="secondary"
                          onClick={async () => {
                            if (
                              !confirm(
                                "Opravit série tohoto vlastního tréninku?",
                              )
                            )
                              return;
                            const changed = structuredClone(
                              workouts.find((x) => x.id === w.id)!,
                            );
                            for (const e of changed.entries) {
                              const ex = exercises.find(
                                (x) => x.id === e.exerciseId,
                              );
                              for (let i = 0; i < 3; i++) {
                                const weight = prompt(
                                  `${ex?.name} – série ${i + 1}: váha v kg`,
                                  e.sets[i].weight,
                                );
                                if (weight === null) return;
                                const reps = prompt(
                                  `${ex?.name} – série ${i + 1}: opakování`,
                                  e.sets[i].reps,
                                );
                                if (reps === null) return;
                                e.sets[i] = { weight, reps };
                              }
                              if (!validSets(e.sets)) {
                                notify(
                                  "Neplatná série. Oprava nebyla uložena.",
                                );
                                return;
                              }
                            }
                            try {
                              await saveRemote(changed);
                              setWorkouts((ws) =>
                                ws.map((x) => (x.id === w.id ? changed : x)),
                              );
                              notify("Oprava uložena.");
                            } catch (e) {
                              notify((e as Error).message);
                            }
                          }}
                        >
                          Opravit
                        </button>
                        <button
                          className="text-button danger"
                          onClick={async () => {
                            if (
                              !confirm(
                                "Opravdu smazat tento vlastní záznam? Cyklus se nevrátí.",
                              )
                            )
                              return;
                            try {
                              if (supabase) {
                                const { error } = await supabase
                                  .from("workouts")
                                  .delete()
                                  .eq("id", w.id);
                                if (error) throw error;
                              }
                              setWorkouts((ws) =>
                                ws.filter((x) => x.id !== w.id),
                              );
                              setDrafts((ds) =>
                                ds.filter((x) => x.id !== w.id),
                              );
                            } catch (e) {
                              notify((e as Error).message);
                            }
                          }}
                        >
                          Smazat
                        </button>
                      </div>
                    )}
                  </div>
                  {w.entries.map((e, i) => {
                    const ex = exercises.find((x) => x.id === e.exerciseId);
                    return (
                      <div className="history-entry" key={i}>
                        {ex?.photo && <img src={ex.photo} alt={ex.name} />}
                        <div>
                          <b>{ex?.name || "Archivovaný cvik"}</b>
                          <small>
                            {ex?.muscle} · {category(ex?.muscle || "")}
                          </small>
                        </div>
                        <div className="history-sets">
                          {e.sets.map((s, j) => (
                            <span key={j}>
                              <small>{j + 1}. série</small>
                              {s.weight} kg × {s.reps}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </article>
              ))}
            </>
          )}
          {tab === "Cviky" && (
            <>
              <div className="section-title">
                <h2>
                  Knihovna cviků{" "}
                  <span>{exercises.filter((e) => !e.archived).length}</span>
                </h2>
                <button
                  onClick={() =>
                    setEditing({
                      id: uid(),
                      name: "",
                      muscle: "Prsa",
                      note: "",
                      photo: "",
                      archived: false,
                    })
                  }
                >
                  <Plus size={18} /> Přidat cvik
                </button>
              </div>
              <div className="filters">
                <input
                  placeholder="Hledat cvik…"
                  aria-label="Hledat cvik"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  value={muscle}
                  onChange={(e) => setMuscle(e.target.value)}
                >
                  {["Všechny partie", ...muscles].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="library-grid">
                {exercises
                  .filter(
                    (e) =>
                      (muscle === "Všechny partie" || e.muscle === muscle) &&
                      e.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((e) => (
                    <button
                      className={
                        "library-card " + (e.archived ? "archived" : "")
                      }
                      key={e.id}
                      onClick={() => setEditing(e)}
                    >
                      <div className="library-image">
                        {e.photo ? (
                          <img src={e.photo} alt={e.name} />
                        ) : (
                          <Dumbbell size={50} />
                        )}
                        <span>{e.muscle}</span>
                      </div>
                      <div>
                        <h3>{e.name}</h3>
                        <p>
                          {e.archived
                            ? "Archivováno"
                            : e.note || "3 pracovní série"}{" "}
                          <ChevronRight size={15} />
                        </p>
                      </div>
                    </button>
                  ))}
              </div>
            </>
          )}
          {tab === "Progres" && (
            <>
              <div className="filters">
                <select
                  value={progressId}
                  onChange={(e) => setProgressId(e.target.value)}
                >
                  {exercises.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                <select
                  value={progressType}
                  onChange={(e) => setProgressType(e.target.value)}
                >
                  <option>Lehký</option>
                  <option>Těžký</option>
                </select>
              </div>
              {(["Honza", "David"] as Person[]).map((p) => {
                const ws = workouts
                  .filter(
                    (w) =>
                      w.user === p &&
                      w.completed &&
                      typeOf(w.day) === progressType &&
                      w.entries.some((e) => e.exerciseId === progressId),
                  )
                  .sort((a, b) => a.date.localeCompare(b.date));
                const data = ws.map((w) => ({
                  date: w.date,
                  sets: w.entries.find((e) => e.exerciseId === progressId)!
                    .sets,
                }));
                return (
                  <section className="progress-card" key={p}>
                    <div className="section-title">
                      <h2>
                        <span className="avatar">{p[0]}</span> {p}
                      </h2>
                      <span className="badge">{progressType}</span>
                    </div>
                    {!data.length ? (
                      <p className="muted">
                        Pro tento cvik a typ tréninku zatím nejsou výsledky.
                      </p>
                    ) : (
                      <>
                        <div className="metric-row">
                          <div>
                            <small>NEJVYŠŠÍ PRACOVNÍ VÁHA</small>
                            <strong>
                              {fmt(
                                Math.max(
                                  ...data.flatMap((d) =>
                                    d.sets.map((s) => kg(s.weight)),
                                  ),
                                ),
                              )}{" "}
                              <span>kg</span>
                            </strong>
                          </div>
                          <div>
                            <small>POSLEDNÍ OBJEM</small>
                            <strong>
                              {fmt(volume(data.at(-1)!.sets))} <span>kg</span>
                            </strong>
                          </div>
                        </div>
                        <div className="charts">
                          {(
                            ["Váha (kg)", "Opakování", "Objem (kg)"] as const
                          ).map((label, idx) => {
                            const vals = data.map((d) =>
                              idx === 0
                                ? Math.max(...d.sets.map((s) => kg(s.weight)))
                                : idx === 1
                                  ? d.sets.reduce((n, s) => n + +s.reps, 0)
                                  : volume(d.sets),
                            );
                            const max = Math.max(...vals, 1);
                            return (
                              <div key={label}>
                                <h4>
                                  {label}
                                  {idx === 1 ? " · součet 3 sérií" : ""}
                                </h4>
                                <svg
                                  viewBox="0 0 300 110"
                                  role="img"
                                  aria-label={`${p} vývoj ${label}`}
                                >
                                  <path d="M10 95H290" stroke="var(--line)" />
                                  <polyline
                                    points={vals
                                      .map(
                                        (v, i) =>
                                          `${10 + i * (280 / Math.max(vals.length - 1, 1))},${95 - (v / max) * 75}`,
                                      )
                                      .join(" ")}
                                    fill="none"
                                    stroke={
                                      p === "Honza" ? "#46e0c2" : "#72a7ff"
                                    }
                                    strokeWidth="3"
                                  />
                                  {vals.map((v, i) => (
                                    <circle
                                      key={i}
                                      cx={
                                        10 +
                                        i * (280 / Math.max(vals.length - 1, 1))
                                      }
                                      cy={95 - (v / max) * 75}
                                      r="4"
                                      fill={
                                        p === "Honza" ? "#46e0c2" : "#72a7ff"
                                      }
                                    >
                                      <title>
                                        {new Date(
                                          data[i].date,
                                        ).toLocaleDateString("cs-CZ")}
                                        : {fmt(v)}
                                      </title>
                                    </circle>
                                  ))}
                                </svg>
                                <div className="chart-dates">
                                  <span>
                                    {new Date(data[0].date).toLocaleDateString(
                                      "cs-CZ",
                                    )}
                                  </span>
                                  <span>
                                    {new Date(
                                      data.at(-1)!.date,
                                    ).toLocaleDateString("cs-CZ")}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <h4>Poslední odpovídající tréninky · všechny série</h4>
                        {data
                          .slice(-2)
                          .reverse()
                          .map((d) => (
                            <div className="comparison" key={d.date}>
                              <span>
                                {new Date(d.date).toLocaleDateString("cs-CZ")}
                              </span>
                              {d.sets.map((s, i) => (
                                <b key={i}>
                                  <small>{i + 1}. série</small>
                                  {s.weight} kg × {s.reps}
                                </b>
                              ))}
                            </div>
                          ))}
                      </>
                    )}
                  </section>
                );
              })}
            </>
          )}
          <footer>
            FITLOG <span>Malé kroky. Silnější zítřek.</span>
            <span>Honza & David</span>
          </footer>
        </main>
      </div>
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button aria-label="Zavřít zprávu" onClick={() => setMessage("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="section-title">
              <h2>Nastavení</h2>
              <button
                className="icon-button"
                aria-label="Zavřít"
                onClick={() => setSettings(false)}
              >
                <X />
              </button>
            </div>
            <label className="toggle">
              Světlý vzhled
              <input
                type="checkbox"
                checked={light}
                onChange={(e) => setLight(e.target.checked)}
              />
            </label>
            <label>
              Aktuální den cyklu
              <select
                value={cycle.day}
                onChange={async (e) => {
                  const day = +e.target.value;
                  if (
                    !confirm(
                      "Změnit společný den cyklu? Rozepsaný trénink zůstane v telefonu.",
                    )
                  )
                    return;
                  try {
                    if (supabase) {
                      const { error } = await supabase.rpc("change_cycle", {
                        new_day: day,
                      });
                      if (error) throw error;
                      await refresh();
                    } else setCycle({ day, round: uid() });
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    Den {i + 1} · {plan(i + 1).main.join(" / ")} ·{" "}
                    {typeOf(i + 1)}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Profil: <b>{owner}</b>
              <br />
              {supabase
                ? "Účet Supabase"
                : "Demo: oba profily můžeš upravovat."}
            </p>
            <p>
              {online ? "Telefon je online." : "Telefon je offline."}{" "}
              {drafts.length} lokálně rozpracovaných tréninků.
            </p>
            {drafts.length > 0 && (
              <div className="draft-list">
                {drafts
                  .filter((d) => !supabase || d.user === owner)
                  .map((d) => (
                    <div key={d.id}>
                      <span>
                        {d.user} · den {d.day} ·{" "}
                        {new Date(d.date).toLocaleDateString("cs-CZ")}
                      </span>
                      <button
                        className="secondary"
                        onClick={() => {
                          setPerson(d.user);
                          setCycle({ day: d.day, round: d.round });
                          setSettings(false);
                          setTab("Trénink");
                        }}
                      >
                        Pokračovat v zápisu
                      </button>
                      <button
                        className="secondary"
                        onClick={async () => {
                          if (
                            !d.entries.every(
                              (e) => e.exerciseId && validSets(e.sets),
                            )
                          ) {
                            notify(
                              "Zápis je neúplný. Nejprve jej doplňte v odpovídajícím tréninku.",
                            );
                            return;
                          }
                          try {
                            if (supabase) {
                              const savedId = await saveRemote(d);
                              await finishRemote({ ...d, id: savedId || d.id });
                              await refresh();
                            } else {
                              setWorkouts((ws) => [
                                ...ws.filter((w) => w.id !== d.id),
                                { ...d, completed: true },
                              ]);
                              if (cycle.round === d.round)
                                setCycle({ day: nextDay(d.day), round: uid() });
                            }
                            setDrafts((ds) => ds.filter((x) => x.id !== d.id));
                            notify("Zápis odeslán a dokončen.");
                          } catch (e) {
                            notify((e as Error).message);
                          }
                        }}
                      >
                        Odeslat a dokončit
                      </button>
                    </div>
                  ))}
              </div>
            )}
            {supabase && (
              <>
                <button
                  className="secondary"
                  onClick={() =>
                    refresh()
                      .then(() => notify("Data načtena ze Supabase."))
                      .catch((e) => notify(e.message))
                  }
                >
                  <Cloud size={17} /> Obnovit online data
                </button>
                <button
                  className="text-button"
                  onClick={() => supabase!.auth.signOut()}
                >
                  <LogOut size={17} /> Odhlásit
                </button>
              </>
            )}
            <p className="muted">
              {supabase
                ? "Synchronizace vyžaduje dostupný Supabase projekt a aplikovanou migraci."
                : "Demo neobsahuje skutečná produkční data. Pro online režim nastavte proměnné podle README."}
            </p>
          </section>
        </div>
      )}
      {editing && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              commitExercise(editing);
            }}
          >
            <div className="section-title">
              <h2>
                {exercises.some((e) => e.id === editing.id)
                  ? "Upravit cvik"
                  : "Nový cvik"}
              </h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Zavřít"
                onClick={() => setEditing(null)}
              >
                <X />
              </button>
            </div>
            <label>
              Název
              <input
                required
                maxLength={120}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              Partie
              <select
                value={editing.muscle}
                onChange={(e) =>
                  setEditing({ ...editing, muscle: e.target.value })
                }
              >
                {muscles.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label>
              Poznámka
              <textarea
                maxLength={1000}
                value={editing.note}
                onChange={(e) =>
                  setEditing({ ...editing, note: e.target.value })
                }
              />
            </label>
            {editing.photo && (
              <img
                className="photo-preview"
                src={editing.photo}
                alt="Fotografie cviku"
              />
            )}
            <div className="photo-buttons">
              <label className="file-button">
                <Camera size={18} /> Vyfotit
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) =>
                    e.target.files?.[0] && photo(e.target.files[0])
                  }
                />
              </label>
              <label className="file-button">
                Vybrat z galerie
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    e.target.files?.[0] && photo(e.target.files[0])
                  }
                />
              </label>
            </div>
            <label className="toggle">
              Archivovat cvik
              <input
                type="checkbox"
                checked={editing.archived}
                onChange={(e) =>
                  setEditing({ ...editing, archived: e.target.checked })
                }
              />
            </label>
            <button disabled={busy}>Uložit cvik</button>
          </form>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
