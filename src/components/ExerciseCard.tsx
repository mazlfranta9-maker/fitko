import { Check, Dumbbell } from "lucide-react";
import { type Exercise, type SetEntry, validSets } from "../domain";
type Entry = { exerciseId: string; sets: SetEntry[] };
type Props = {
  person: import("../domain").Person;
  activeSet?: number;
  onPass: (series: number) => void;
  onActivate?: (series: number) => void;
  partnerDone?: boolean;
  entry: Entry;
  index: number;
  muscle: string;
  exercises: Exercise[];
  previous?: Entry;
  disabled: boolean;
  selectionDisabled?: boolean;
  onChange: (entry: Entry) => void;
};
export function ExerciseCard({
  entry,
  index,
  person,
  activeSet,
  onPass,
  onActivate,
  partnerDone = false,
  muscle,
  exercises,
  previous,
  disabled,
  selectionDisabled = false,
  onChange,
}: Props) {
  const ex = exercises.find((e) => e.id === entry.exerciseId),
    complete = validSets(entry.sets);
  const changeSet = (i: number, field: keyof SetEntry, value: string) => {
    if (!(field === "weight" ? /^\d*([.,]\d{0,2})?$/ : /^\d*$/).test(value))
      return;
    onChange({
      ...entry,
      sets: entry.sets.map((s, j) => (j === i ? { ...s, [field]: value } : s)),
    });
  };
  return (
    <article className={"exercise-card " + (complete ? "complete" : "")}>
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
            disabled={disabled || selectionDisabled || person === "David"}
            value={entry.exerciseId}
            onChange={(e) => onChange({ ...entry, exerciseId: e.target.value })}
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
          </select>
          {person === "David" && <small>Cvik podle Honzy</small>}
          {ex?.note && <small>{ex.note}</small>}
        </div>
        <span className={"status-check " + (complete ? "checked" : "")}>
          {complete ? <Check size={17} /> : <span>3 série</span>}
        </span>
      </div>
      <div className="set-table">
        <div className="set-row table-labels">
          <span>SÉRIE</span>
          <span>
            VÁHA <small>KG</small>
          </span>
          <span>OPAKOVÁNÍ</span>
          <span>
            MINULE <small>KG × OPAK.</small>
          </span>
        </div>
        {entry.sets.map((s, i) => (
          <div
            className={"set-row " + (activeSet === i ? "active-set" : "")}
            id={`set-${index}-${i}`}
            key={i}
          >
            <span className="set-number">
              {i + 1}
              <small>PRACOVNÍ</small>
            </span>
            <input
              aria-label={`${ex?.name} série ${i + 1} váha`}
              inputMode="decimal"
              placeholder="—"
              value={s.weight}
              disabled={disabled}
              onFocus={() => onActivate?.(i)}
              onChange={(e) => changeSet(i, "weight", e.target.value)}
            />
            <input
              aria-label={`${ex?.name} série ${i + 1} opakování`}
              inputMode="numeric"
              placeholder="—"
              value={s.reps}
              disabled={disabled}
              onFocus={() => onActivate?.(i)}
              onChange={(e) => changeSet(i, "reps", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onPass(i);
                }
              }}
            />
            <span className="previous">
              {previous
                ? `${previous.sets[i].weight} × ${previous.sets[i].reps}`
                : "—"}
            </span>
            {!disabled && (
              <button
                className="pass-turn"
                onClick={() => onPass(i)}
                aria-label={
                  partnerDone
                    ? `Potvrdit sérii ${i + 1} cviku ${index + 1}`
                    : `Zapsat sérii ${i + 1} cviku ${index + 1} a předat ${person === "Honza" ? "Davidovi" : "Honzovi"}`
                }
              >
                ✓ Zapsat sérii {i + 1} ·{" "}
                {partnerDone
                  ? "Potvrdit"
                  : `${person === "Honza" ? "David" : "Honza"} →`}
              </button>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
