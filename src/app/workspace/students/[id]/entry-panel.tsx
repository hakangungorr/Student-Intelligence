"use client";
import { useActionState, useEffect, useState } from "react";
import { saveStudent, type StudentSaveState } from "./actions";
import { EntryFields, type Group } from "../../entry-fields";
import type { EntryRow } from "@/lib/entry";

const idle: StudentSaveState = { status: "idle" };

/** One student's numbers, all of them, on the card they belong to.
 *
 *  Open by default when the student has nothing yet: somebody who just enrolled
 *  a student is on this page to type their marks in, and closing the form they
 *  came for would be a puzzle, not tidiness.
 */
export function EntryPanel({ studentId, name, values, today, groups, open }: {
  studentId: string; name: string; values: EntryRow["values"]; today: string;
  groups: Group[]; open: boolean;
}) {
  const [state, submit, saving] = useActionState(saveStudent, idle);
  const [dirty, setDirty] = useState(false);

  // Adjusted while rendering rather than in an effect: a finished save is
  // already in hand, and an effect would flash "kaydedilmedi" after it.
  const [settled, setSettled] = useState(state);
  if (settled !== state) { setSettled(state); if (state.status === "done") setDirty(false); }

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const bad = new Set((state.problems ?? []).map(p => p.field));
  const filled = groups.flatMap(g => g.fields)
    .filter(f => values[f.name] !== null && values[f.name] !== undefined).length;

  return <details className="panel entry-card" open={open || state.status !== "idle"}>
    <summary>
      <span><b>Bilgi gir</b>
        <span className="note">{filled === 0
          ? "Bu öğrencinin henüz hiçbir ölçümü yok"
          : `${filled} alan dolu — düzeltmek için açın`}</span></span>
      <span className="chev" aria-hidden="true">▾</span>
    </summary>

    <form action={submit} onInput={() => setDirty(true)}>
      <p className="note pad-note">Bildiğiniz alanları doldurun, gerisini boş bırakın — boş
        bıraktığınız hücreye dokunulmaz. Her alan istediğiniz zaman değiştirilebilir.</p>

      <EntryFields studentId={studentId} name={name} values={values} groups={groups} bad={bad} />

      <div className="entry-foot">
        <label className="entry-when">Ölçüm tarihi
          <input type="date" name="on" defaultValue={today} required /></label>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "Kaydediliyor…" : "Kaydet"}</button>
        {dirty && state.status !== "done" && <span className="note">kaydedilmedi</span>}

        {state.status === "done" && <span className="note">
          {state.written === 0
            ? "Değişen bir şey yoktu."
            : `${state.written} değer kaydedildi.`}
          {state.written! > 0 && (state.scored === null
            ? " Risk skoru kurum yöneticisi hesaplamayı çalıştırınca güncellenecek."
            : " Risk skoru yeniden hesaplandı.")}</span>}
        {state.status === "error" && <span className="note error-note">{state.message}</span>}
      </div>

      {state.problems && state.problems.length > 0 && <ul className="issues">
        {state.problems.map((p, i) => {
          const f = groups.flatMap(g => g.fields).find(x => x.name === p.field);
          return <li key={i}><b>{p.label}</b> — &ldquo;{p.text}&rdquo; yerine
            {" "}{f ? `${f.min}–${f.max}` : "geçerli"} aralığında bir sayı girin.</li>;
        })}
      </ul>}
    </form>
  </details>;
}
