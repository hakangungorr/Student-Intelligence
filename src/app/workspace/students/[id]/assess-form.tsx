"use client";
import { useActionState, useState } from "react";
import { assess, type AssessState } from "./assess-actions";
import {
  RUBRICS, RUBRIC_SCALE, RUBRIC_VERSION, SKILLS, SKILL_LABEL, type Skill
} from "@/lib/rubric";

const idle: AssessState = { status: "idle" };

export function AssessForm({ studentId, today, open }: {
  studentId: string; today: string; open: boolean;
}) {
  const [state, submit, saving] = useActionState(assess, idle);
  const [skill, setSkill] = useState<Skill>("speaking");

  return <details className="panel pad" open={open || state.status === "error"}>
    <summary><b>Ölçüm gir</b> <span className="note">— bir görevde gözlediğinizi
      tarihiyle kaydedin</span></summary>
    <form action={submit} className="form-stack">
      <input type="hidden" name="studentId" value={studentId} />
      {state.status !== "idle" && <p className={`note${state.status === "error" ? " error-note" : ""}`}>
        {state.message}</p>}

      <label>Beceri<select name="skill" value={skill}
        onChange={e => setSkill(e.target.value as Skill)}>
        {SKILLS.map(s => <option key={s} value={s}>{SKILL_LABEL[s]}</option>)}</select></label>

      <label>Hangi görevde ölçüldü
        <input name="taskLabel" required maxLength={300} autoComplete="off"
          placeholder="örn. Hafta sonu tatilini anlatma görevi" />
        <small className="note">Puanın tek başına anlamı yok; hangi görevde alındığı
          yazılmadan aynı koşullarda tekrar ölçülemez.</small></label>

      <label>Tarih<input type="date" name="assessedOn" required defaultValue={today} max={today} /></label>

      <fieldset className="crit-inputs">
        <legend>Ölçütler <span className="note">0–{RUBRIC_SCALE} · {RUBRIC_VERSION} ·
          ölçmediğinizi boş bırakın</span></legend>
        {RUBRICS[skill].map(c => <label key={c.code} className="crit-input">
          <span>{c.label}<small>{c.hint}</small></span>
          <input type="number" name={`c:${c.code}`} min={0} max={RUBRIC_SCALE} step={1}
            inputMode="numeric" placeholder="—" />
        </label>)}
      </fieldset>

      <label>Not <span className="note">isteğe bağlı</span>
        <textarea name="note" rows={2} maxLength={2000} /></label>

      <button type="submit" className="primary" disabled={saving}>
        {saving ? "Kaydediliyor…" : "Ölçümü kaydet"}</button>
      <p className="note">Kaydedilen ölçüm sonradan düzeltilmez. Yanlış girilen bir puan, yeni
        bir ölçümle düzeltilir — kâğıt üzerinde de böyle olurdu.</p>
    </form>
  </details>;
}
