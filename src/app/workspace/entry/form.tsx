"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { save, type SaveState } from "./actions";
import type { EntryRow, Field } from "@/lib/entry";

const idle: SaveState = { status: "idle" };

/** How many students have at least one value on the sheet.
 *  Read off the DOM rather than tracked per input: the form is uncontrolled so
 *  that typing stays instant on a long sheet, and counting is cheap enough. */
function filledRows(form: HTMLFormElement) {
  const seen = new Set<string>();
  for (const el of form.querySelectorAll<HTMLInputElement>("input[name^='v:']")) {
    const id = el.name.split(":")[1];
    if (el.type === "checkbox" ? el.checked : el.value.trim() !== "") seen.add(id);
  }
  return seen.size;
}

/** The same count before anything is on screen to read, taken from the values
 *  the rows were drawn with. */
const filledIn = (rows: EntryRow[], fields: Field[]) => rows.filter(r => fields.some(f =>
  f.kind === "boolean" ? r.values[f.name] === true
    : r.values[f.name] !== null && r.values[f.name] !== undefined)).length;

export function Sheet({ rows, fields, kind, on }: {
  rows: EntryRow[]; fields: Field[]; kind: string; on: string;
}) {
  const [state, submit, saving] = useActionState(save, idle);
  const form = useRef<HTMLFormElement>(null);
  const [filled, setFilled] = useState(() => filledIn(rows, fields));
  const [dirty, setDirty] = useState(false);

  // Adjusted while rendering rather than in an effect: both are derived from
  // something React already handed us — a new set of rows, or a finished save —
  // and an effect would paint the stale number first.
  const [drawn, setDrawn] = useState(rows);
  if (drawn !== rows) { setDrawn(rows); setFilled(filledIn(rows, fields)); setDirty(false); }
  const [settled, setSettled] = useState(state);
  if (settled !== state) { setSettled(state); if (state.status === "done") setDirty(false); }

  // Leaving with marks still in the boxes is the one mistake on this screen that
  // cannot be undone by clicking again.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Enter goes down the column instead of submitting: entering one mark for
   *  twenty-four students is one keystroke per student, not a reach for the mouse. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (e.key !== "Enter") return;
    const el = e.target as HTMLElement;
    if (!(el instanceof HTMLInputElement) || !el.name.startsWith("v:")) return;
    e.preventDefault();
    const field = el.name.slice(el.name.indexOf(":", 2) + 1);
    const column = [...(form.current?.querySelectorAll<HTMLInputElement>(
      `input[name$=":${CSS.escape(field)}"]`) ?? [])];
    const next = column[column.indexOf(el) + (e.shiftKey ? -1 : 1)];
    if (next) { next.focus(); next.select?.(); }
  };

  const badRows = new Set((state.problems ?? []).map(p => p.studentId));
  const nameOf = new Map(rows.map(r => [r.id, r.name]));

  return <form ref={form} action={submit}
    onInput={() => { setDirty(true); if (form.current) setFilled(filledRows(form.current)); }}>
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="on" value={on} />

    <section className="panel">
      <div className="table-scroll"><table className="sheet">
        <thead><tr>
          <th>Öğrenci</th><th>Şube</th><th>Kur</th>
          {fields.map(f => <th key={f.name}>{f.label}</th>)}
        </tr></thead>
        <tbody onKeyDown={onKeyDown}>{rows.map(r => <tr key={r.id}
          className={badRows.has(r.id) ? "is-bad" : undefined}>
          <th scope="row">{r.name}<small>{r.externalId}</small></th>
          <td>{r.branch}</td><td>{r.level}</td>
          {fields.map(f => <td key={f.name}>
            {f.kind === "boolean"
              ? <>
                {/* What the box said when the sheet was drawn, so an untouched
                    row is not mistaken for a deliberate "hayır". */}
                <input type="hidden" name={`p:${r.id}:${f.name}`}
                  value={r.values[f.name] === true ? "1" : "0"} />
                <input type="checkbox" name={`v:${r.id}:${f.name}`}
                  defaultChecked={r.values[f.name] === true}
                  aria-label={`${r.name} — ${f.label}`} />
              </>
              : <input type="number" name={`v:${r.id}:${f.name}`} inputMode="numeric"
                min={f.min} max={f.max} step="1"
                defaultValue={r.values[f.name] === null ? "" : String(r.values[f.name])}
                aria-label={`${r.name} — ${f.label}`} />}
          </td>)}
        </tr>)}</tbody>
      </table></div>
    </section>

    <div className="sheet-actions">
      <button type="submit" className="primary" disabled={saving}>
        {saving ? "Kaydediliyor…" : "Kaydet"}</button>
      <span className="note"><b>{filled}</b> / {rows.length} öğrenci dolduruldu
        {dirty && <> · kaydedilmedi</>}</span>
      {state.status === "done" && <span className="note">
        {state.written === 0
          ? "Değişen bir şey yoktu."
          : `${state.written} değer kaydedildi${state.unchanged ? `, ${state.unchanged} değer zaten aynıydı` : ""}.`}
        {state.written! > 0 && (state.scored === null
          ? " Risk skorları kurum yöneticisi hesaplamayı çalıştırınca güncellenecek."
          : ` Risk skorları yeniden hesaplandı (${state.scored} öğrenci).`)}</span>}
      {state.status === "error" && <span className="note error-note">{state.message}</span>}
    </div>

    {state.problems && state.problems.length > 0 && <ul className="issues">
      {state.problems.map((p, i) => {
        const f = fields.find(x => x.name === p.field);
        return <li key={i}><b>{nameOf.get(p.studentId) ?? "Öğrenci"}</b> · {p.label} —
          {" "}&ldquo;{p.text}&rdquo; yerine {f ? `${f.min}–${f.max}` : "geçerli"} aralığında
          bir sayı girin.</li>;
      })}
    </ul>}
  </form>;
}
