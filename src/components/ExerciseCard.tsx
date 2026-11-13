import { Check, Dumbbell } from "lucide-react";
import {
  type Exercise,
  type Person,
  type SetEntry,
  validSets,
} from "../domain";
type Entry = { exerciseId: string; sets: SetEntry[] };
type Participant = {
  person: Person;
  entry: Entry;
  activeSet?: number;
  previous?: Entry;
  disabled: boolean;
  completed?: boolean;
  partnerDone?: boolean;
  onPass: (series: number) => void;
  onActivate?: (series: number) => void;
  onChange: (entry: Entry) => void;
};
type Props = Participant & {
  partner: Participant;
  index: number;
  muscle: string;
  exercises: Exercise[];
  selectionDisabled?: boolean;
  onAdd?: () => void;
};
export function ExerciseCard(props: Props) {
  const {
    entry,
    index,
    muscle,
    exercises,
    disabled,
    selectionDisabled,
    onChange,
    onAdd,
    partner,
  } = props;
  const ex = exercises.find((e) => e.id === entry.exerciseId);
  const complete =
    validSets(entry.sets) && validSets(partner.entry?.sets ?? []);
  return (
    <article
      className={`exercise-card paired-exercise ${complete ? "complete" : ""}`}
    >
      <div className="exercise-head">
        <span className="exercise-order">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="exercise-image">
          {ex?.photo ? (
            <img src={ex.photo} alt={ex.name} />
          ) : (
            <Dumbbell size={27} />
          )}
        </div>
        <div className="exercise-name">
          <span className="muscle-label">{muscle}</span>
          <select
            aria-label={`Cvik ${index + 1}`}
            disabled={disabled || selectionDisabled}
            value={entry.exerciseId}
            onChange={(e) => {
              if (e.target.value === "__add_exercise__") onAdd?.();
              else onChange({ ...entry, exerciseId: e.target.value });
            }}
          >
            <option value="">Vyberte cvik</option>
            {exercises
              .filter(
                (e) =>
                  e.muscle === muscle &&
                  (!e.archived || e.id === entry.exerciseId),
              )
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.archived ? " (archiv)" : ""}
                </option>
              ))}
            {onAdd && <option value="__add_exercise__">+ Přidat cvik</option>}
          </select>
          <small>Společný cvik podle Honzy</small>
          {ex?.note && <small>{ex.note}</small>}
        </div>
        <span className={`status-check ${complete ? "checked" : ""}`}>
          {complete ? <Check size={17} /> : <span>3 série</span>}
        </span>
      </div>
      <div className="paired-sets">
        {entry.sets.map((_, series) => (
          <div className="paired-series" key={series}>
            <h3 className="paired-series-title">Série {series + 1}</h3>
            <div className="participant-grid">
              {[props, partner].map((participant) => (
                <ParticipantSet
                  key={participant.person}
                  participant={participant}
                  series={series}
                  index={index}
                  exercises={exercises}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
function ParticipantSet({
  participant: p,
  series,
  index,
  exercises,
}: {
  participant: Participant;
  series: number;
  index: number;
  exercises: Exercise[];
}) {
  const s = p.entry?.sets[series];
  const ex = exercises.find((e) => e.id === p.entry?.exerciseId);
  if (!s)
    return <p role="alert">{p.person}: zápis této série není dostupný.</p>;
  const change = (field: keyof SetEntry, value: string) => {
    if (!(field === "weight" ? /^\d*([.,]\d{0,2})?$/ : /^\d*$/).test(value))
      return;
    p.onChange({
      ...p.entry,
      sets: p.entry.sets.map((set, i) =>
        i === series ? { ...set, [field]: value } : set,
      ),
    });
  };
  return (
    <fieldset
      className={`participant-set person-${p.person.toLowerCase()} ${p.activeSet === series ? "active-set" : ""}`}
      id={`set-${p.person}-${index}-${series}`}
      data-person={p.person}
      disabled={p.disabled}
    >
      <legend className="participant-title">
        {p.person}{" "}
        <span>
          {p.completed ? "Dokončeno" : p.activeSet === series ? "Na řadě" : ""}
        </span>
      </legend>
      {p.entry.exerciseId !== undefined && ex && (
        <span className="participant-exercise">{ex.name}</span>
      )}
      <div className="set-row">
        <label>
          VÁHA <small>KG</small>
          <input
            aria-label={`${p.person} ${ex?.name} série ${series + 1} váha`}
            inputMode="decimal"
            placeholder="—"
            value={s.weight}
            onFocus={() => p.onActivate?.(series)}
            onChange={(e) => change("weight", e.target.value)}
          />
        </label>
        <label>
          OPAKOVÁNÍ
          <input
            aria-label={`${p.person} ${ex?.name} série ${series + 1} opakování`}
            inputMode="numeric"
            placeholder="—"
            value={s.reps}
            onFocus={() => p.onActivate?.(series)}
            onChange={(e) => change("reps", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!e.repeat) p.onPass(series);
              }
            }}
          />
        </label>
      </div>
      <div className="previous">
        Minule:{" "}
        {p.previous?.sets[series]
          ? `${p.previous.sets[series].weight} kg × ${p.previous.sets[series].reps}`
          : "—"}
      </div>
      {!p.disabled && (
        <button
          className="pass-turn"
          onClick={() => p.onPass(series)}
          aria-label={`${p.person}: Zapsat sérii ${series + 1} cviku ${index + 1}${p.partnerDone ? "" : ` a předat ${p.person === "Honza" ? "Davidovi" : "Honzovi"}`}`}
        >
          ✓ Zapsat sérii {series + 1} ·{" "}
          {p.partnerDone
            ? "Potvrdit"
            : `${p.person === "Honza" ? "David" : "Honza"} →`}
        </button>
      )}
    </fieldset>
  );
}
