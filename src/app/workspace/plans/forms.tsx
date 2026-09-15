"use client";
import { useActionState } from "react";
import { approve, editTask, generate, saveAvailability, updateTask, type PlanState } from "./actions";
import { taskStateLabel, type TaskState } from "@/lib/rubric";

const idle: PlanState = { status: "idle" };
const Result = ({ s }: { s: PlanState }) => s.status === "idle" ? null
  : <p className={`note${s.status === "error" ? " error-note" : ""}`}>{s.message}
    {s.alternatives && s.alternatives.length > 0 && <>
      <br />Yeri olan oturumlar: {s.alternatives.join(" · ")}</>}</p>;

export function GenerateForm({ levels, branches, weekStart, lockedBranch }: {
  levels: string[]; branches: { id: string; name: string }[];
  weekStart: string; lockedBranch: boolean;
}) {
  const [state, submit, saving] = useActionState(generate, idle);
  return <form className="panel pad form-stack" action={submit}>
    <h2>Taslak hazırla</h2>
    <p className="note">Seçilen kurdaki her öğrenci için kanıta bakar ve haftalık bir taslak
      yazar. Planı zaten olan öğrenciye dokunmaz. Taslak onaylanana kadar hiçbir yerde
      öğrenciye gösterilmez.</p>
    <Result s={state} />
    <label>Kur<select name="level" required defaultValue={levels[Math.floor(levels.length / 2)] ?? ""}>
      {levels.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
    {!lockedBranch && <label>Şube<select name="branchId" defaultValue="">
      <option value="">Erişebildiğim bütün şubeler</option>
      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
    <label>Hafta başlangıcı
      <input type="date" name="weekStart" required defaultValue={weekStart} />
      <small className="note">Hangi gün seçilirse seçilsin o haftanın pazartesisine
        yuvarlanır.</small></label>
    <button type="submit" className="primary" disabled={saving}>
      {saving ? "Hazırlanıyor…" : "Taslakları hazırla"}</button>
  </form>;
}

export function ApproveButton({ planId, problems }: { planId: string; problems: number }) {
  const [state, submit, saving] = useActionState(approve, idle);
  return <form action={submit} className="mark">
    <input type="hidden" name="planId" value={planId} />
    <button type="submit" className="primary" disabled={saving}>
      {saving ? "Onaylanıyor…" : problems > 0 ? "Yine de onayla" : "Planı onayla"}</button>
    <Result s={state} />
  </form>;
}

/** Yapmak, kontrol etmek ve yardım istemek ayrı ayrı kaydedilir. */
export function TaskStatusButtons({ taskId, studentId, status }: {
  taskId: string; studentId: string; status: TaskState;
}) {
  const [state, submit, saving] = useActionState(updateTask, idle);
  const options: TaskState[] = status === "open"
    ? ["student_done", "blocked"]
    : status === "student_done" ? ["teacher_checked", "blocked", "open"]
      : status === "blocked" ? ["student_done", "open"]
        : ["open"];
  return <form action={submit} className="task-actions">
    <input type="hidden" name="taskId" value={taskId} />
    <input type="hidden" name="studentId" value={studentId} />
    {options.map(o => <button key={o} type="submit" name="status" value={o} disabled={saving}>
      {o === "open" ? "Yeniden aç" : taskStateLabel(o)}</button>)}
    {state.status === "error" && <small className="error-note">{state.message}</small>}
  </form>;
}

export function TaskEdit({ task, sessions }: {
  task: { id: string; title: string; minutes: number; scheduledOn: string; sessionId: string | null };
  sessions: { id: string; label: string; full: boolean }[];
}) {
  const [state, submit, saving] = useActionState(editTask, idle);
  return <details className="raw"><summary>Bu görevi düzenle</summary>
    <form action={submit} className="form-stack">
      <input type="hidden" name="taskId" value={task.id} />
      <label>Görev<input name="title" defaultValue={task.title} required maxLength={300} /></label>
      <label>Süre (dakika)
        <input type="number" name="minutes" min={5} max={240} defaultValue={task.minutes} required /></label>
      <label>Gün<input type="date" name="scheduledOn" defaultValue={task.scheduledOn} required /></label>
      {task.sessionId !== null && <label>Destek oturumu
        <select name="sessionId" defaultValue={task.sessionId}>
          <option value="">Oturumsuz görev</option>
          {sessions.map(s => <option key={s.id} value={s.id} disabled={s.full}>
            {s.label}{s.full ? " · dolu" : ""}</option>)}
        </select>
        <small className="note">Dolu bir oturum seçilemez; onayda yer ayrılamazsa plan
          onaylanmaz.</small></label>}
      <button type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Görevi kaydet"}</button>
      <Result s={state} />
    </form>
  </details>;
}

export function AvailabilityForm({ studentId, weeklyMinutes, recorded }: {
  studentId: string; weeklyMinutes: number; recorded: boolean;
}) {
  const [state, submit, saving] = useActionState(saveAvailability, idle);
  return <form action={submit} className="form-stack inline-form">
    <input type="hidden" name="studentId" value={studentId} />
    <label>Haftalık ek çalışma kapasitesi (dakika)
      <input type="number" name="weeklyMinutes" min={15} max={1200} step={15}
        defaultValue={weeklyMinutes} required />
      <small className="note">{recorded
        ? "Kurumun girdiği değer."
        : "Henüz girilmedi — planlar varsayılan 120 dakikaya göre hesaplanıyor."}</small></label>
    <button type="submit" disabled={saving}>{saving ? "…" : "Kaydet"}</button>
    <Result s={state} />
  </form>;
}
