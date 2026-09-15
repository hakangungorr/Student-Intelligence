"use client";
import { useActionState } from "react";
import { setAudience, type AudienceState } from "./actions";

const idle: AudienceState = { status: "idle" };

export function AudienceForm({ studentId, audience }: {
  studentId: string; audience: "student" | "guardian";
}) {
  const [state, submit, saving] = useActionState(setAudience, idle);
  return <form action={submit} className="inline-form no-print">
    <input type="hidden" name="studentId" value={studentId} />
    <label>Rapor kime yazılıyor
      <select name="audience" defaultValue={audience}>
        <option value="student">Öğrencinin kendisine</option>
        <option value="guardian">Veliye (çocuk/genç programı)</option>
      </select></label>
    <button type="submit" disabled={saving}>{saving ? "…" : "Değiştir"}</button>
    {state.status !== "idle" && <small className={state.status === "error" ? "error-note" : "note"}>
      {state.message}</small>}
  </form>;
}
