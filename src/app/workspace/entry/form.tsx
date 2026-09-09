"use client";
import { useActionState } from "react";
import { save, type SaveState } from "./actions";
import type { EntryRow, Field } from "@/lib/entry";

const idle: SaveState = { status: "idle" };

export function Sheet({ rows, fields, kind, on }: {
  rows: EntryRow[]; fields: Field[]; kind: string; on: string;
}) {
  const [state, submit, saving] = useActionState(save, idle);

  return <form action={submit}>
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="on" value={on} />

    <section className="panel">
      <div className="table-scroll"><table className="sheet">
        <thead><tr>
          <th>Öğrenci</th><th>Şube</th><th>Kur</th>
          {fields.map(f => <th key={f.name}>{f.label}</th>)}
        </tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}>
          <th scope="row">{r.name}<small>{r.externalId}</small></th>
          <td>{r.branch}</td><td>{r.level}</td>
          {fields.map(f => <td key={f.name}>
            {f.kind === "boolean"
              ? <input type="checkbox" name={`v:${r.id}:${f.name}`}
                defaultChecked={r.values[f.name] === true}
                aria-label={`${r.name} — ${f.label}`} />
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
        {saving ? "Kaydediliyor…" : `${rows.length} öğrenciyi kaydet`}</button>
      {state.status === "done" && <span className="note">
        {state.written === 0
          ? "Değişen bir şey yoktu."
          : `${state.written} değer kaydedildi${state.unchanged ? `, ${state.unchanged} değer zaten aynıydı` : ""}.`}
        {state.written! > 0 && (state.scored === null
          ? " Risk skorları kurum yöneticisi hesaplamayı çalıştırınca güncellenecek."
          : ` Risk skorları yeniden hesaplandı (${state.scored} öğrenci).`)}</span>}
      {state.status === "error" && <span className="note error-note">{state.message}</span>}
    </div>
  </form>;
}
