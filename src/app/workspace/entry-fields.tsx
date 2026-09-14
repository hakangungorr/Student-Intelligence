"use client";
import type { EntryRow, Field } from "@/lib/entry";

export type Group = { label: string; note: string; fields: Field[] };

/** The grouped inputs for one student's numbers.
 *
 *  Shared by the card and the enrolment form so the two screens ask for the same
 *  things in the same order — somebody who has filled one in should recognise
 *  the other, and a field added in `FIELD_GROUPS` should appear on both.
 */
export function EntryFields({ studentId, name, values, groups, bad }: {
  studentId: string; name: string; values: EntryRow["values"];
  groups: Group[]; bad?: Set<string>;
}) {
  return <div className="entry-groups">{groups.map(g => <fieldset key={g.label}>
    <legend>{g.label} <span className="note">{g.note}</span></legend>
    <div className="entry-fields">{g.fields.map(f => f.kind === "boolean"
      ? <label key={f.name} className="entry-check">
        {/* What the box said when the form was drawn, so an untouched row is not
            mistaken for a deliberate "hayır". */}
        <input type="hidden" name={`p:${studentId}:${f.name}`}
          value={values[f.name] === true ? "1" : "0"} />
        <input type="checkbox" name={`v:${studentId}:${f.name}`}
          defaultChecked={values[f.name] === true} />
        <span>{f.label}</span></label>
      : <label key={f.name} className={bad?.has(f.name) ? "is-bad" : undefined}>
        <span className="entry-lab">{f.label}</span>
        <span className="entry-in">
          <input type="number" name={`v:${studentId}:${f.name}`} inputMode="numeric"
            min={f.min} max={f.max} step="1" placeholder="—"
            defaultValue={values[f.name] === null || values[f.name] === undefined
              ? "" : String(values[f.name])}
            aria-label={`${name} — ${f.label}`} />
          {f.hint && <span className="entry-hint">{f.hint}</span>}</span>
      </label>)}</div>
  </fieldset>)}</div>;
}
