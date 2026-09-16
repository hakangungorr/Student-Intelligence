"use client";
import { useActionState, useState } from "react";
import {
  addOwnTaskAction, addSuggestionAction, closePlanAction, openPlanAction,
  removeTaskAction, setStatusAction, updatePlanAction, type PlanState
} from "./plan-actions";
import { OWNERS, ownerLabel, type TaskStatus } from "@/lib/rubric";

const idle: PlanState = { status: "idle" };
const Result = ({ s }: { s: PlanState }) => s.status === "idle" || !s.message ? null
  : <p className={`note${s.status === "error" ? " error-note" : ""}`}>{s.message}</p>;

export type SuggestionView = {
  key: string; title: string; why: string; owner: string;
  minutes: number | null; note: string | null; full: boolean; kind: string;
};

/** Planı aç: önerilerden hangileri ilk görevler olsun. */
export function OpenPlanForm({ studentId, suggestions, checkOn, today }: {
  studentId: string; suggestions: SuggestionView[]; checkOn: string; today: string;
}) {
  const [state, submit, saving] = useActionState(openPlanAction, idle);
  return <form action={submit} className="form-stack">
    <input type="hidden" name="studentId" value={studentId} />
    <Result s={state} />
    {suggestions.length > 0 ? <fieldset className="pick-list">
      <legend>İlk görevler <span className="note">— işaretliler plana girer, sonra da eklenebilir</span></legend>
      {suggestions.map(s => <label key={s.key} className={`pick${s.full ? " is-off" : ""}`}>
        <input type="checkbox" name="key" value={s.key} defaultChecked={!s.full} disabled={s.full} />
        <span><b>{s.title}</b>
          <small>{ownerLabel(s.owner)}{s.minutes ? ` · ${s.minutes} dk` : ""}{s.note ? ` · ${s.note}` : ""}</small>
          <small className="why">{s.why}</small></span>
      </label>)}
    </fieldset> : <p className="note">Şu an önerilecek bir görev yok. Plan boş açılır; görevleri
      kendiniz ekleyebilirsiniz.</p>}
    <div className="inline-fields">
      <label>Kontrol tarihi<input type="date" name="checkOn" defaultValue={checkOn} min={today} required />
        <small className="note">Bu tarihte kontrol ölçümü yapılır ve plana yeniden bakılır.</small></label>
      <label>Haftalık süre (dk)<input type="number" name="weeklyMinutes" min={15} max={1200} step={15}
        defaultValue={120} required />
        <small className="note">Öğrencinin ek çalışmaya ayırabileceği süre.</small></label>
    </div>
    <button type="submit" className="primary" disabled={saving}>
      {saving ? "Açılıyor…" : "Planı aç"}</button>
  </form>;
}

export function AddSuggestion({ studentId, s }: { studentId: string; s: SuggestionView }) {
  const [state, submit, saving] = useActionState(addSuggestionAction, idle);
  return <form action={submit} className="sugg">
    <input type="hidden" name="studentId" value={studentId} />
    <input type="hidden" name="key" value={s.key} />
    <span className="sugg-body"><b>{s.title}</b>
      <small>{ownerLabel(s.owner)}{s.minutes ? ` · ${s.minutes} dk` : ""}{s.note ? ` · ${s.note}` : ""}</small>
      <small className="why">{s.why}</small>
      {state.status === "error" && <small className="error-note">{state.message}</small>}</span>
    <button type="submit" disabled={saving || s.full}>{s.full ? "Dolu" : saving ? "…" : "Ekle"}</button>
  </form>;
}

/** Yapıldı · Takıldı · Geri al — ve dokunulmamış görev için Çıkar. */
export function TaskButtons({ studentId, taskId, status }: {
  studentId: string; taskId: string; status: TaskStatus;
}) {
  const [s1, setStatus, busy1] = useActionState(setStatusAction, idle);
  const [s2, remove, busy2] = useActionState(removeTaskAction, idle);
  const [asking, setAsking] = useState(false);
  const busy = busy1 || busy2;
  return <div className="task-actions">
    {status === "todo" && !asking && <>
      <form action={setStatus}><Hidden studentId={studentId} taskId={taskId} />
        <button type="submit" name="status" value="done" className="markbtn" disabled={busy}>Yapıldı</button></form>
      <button type="button" onClick={() => setAsking(true)} disabled={busy}>Takıldı</button>
      <form action={remove}><Hidden studentId={studentId} taskId={taskId} />
        <button type="submit" className="quiet" disabled={busy}>Plandan çıkar</button></form>
    </>}
    {asking && <form action={setStatus} className="stuck-form">
      <Hidden studentId={studentId} taskId={taskId} />
      <input type="hidden" name="status" value="stuck" />
      <input name="note" maxLength={1000} placeholder="Neden takıldı? (isteğe bağlı)" autoFocus />
      <button type="submit" disabled={busy}>Kaydet</button>
      <button type="button" className="quiet" onClick={() => setAsking(false)}>Vazgeç</button>
    </form>}
    {status !== "todo" && <form action={setStatus}><Hidden studentId={studentId} taskId={taskId} />
      <button type="submit" name="status" value="todo" className="quiet" disabled={busy}>Geri al</button></form>}
    {[s1, s2].map((s, i) => s.status === "error" &&
      <small key={i} className="error-note">{s.message}</small>)}
  </div>;
}
const Hidden = ({ studentId, taskId }: { studentId: string; taskId: string }) => <>
  <input type="hidden" name="studentId" value={studentId} />
  <input type="hidden" name="taskId" value={taskId} />
</>;

export function OwnTaskForm({ studentId, planId }: { studentId: string; planId: string }) {
  const [state, submit, saving] = useActionState(addOwnTaskAction, idle);
  return <details className="raw"><summary>Kendi görevini ekle</summary>
    <form action={submit} className="form-stack">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="planId" value={planId} />
      <Result s={state} />
      <label>Görev<input name="title" required maxLength={300} autoComplete="off" /></label>
      <label>Neden<input name="why" required maxLength={600} autoComplete="off"
        placeholder="örn. Derste geçmiş zamanı anlatırken zorlandı" /></label>
      <div className="inline-fields">
        <label>Kim yapacak<select name="owner" defaultValue="student">
          {OWNERS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
        <label>Süre (dk)<input type="number" name="minutes" min={5} max={240} placeholder="—" /></label>
        <label>Tarih<input type="date" name="dueOn" /></label>
      </div>
      <button type="submit" disabled={saving}>{saving ? "Ekleniyor…" : "Görevi ekle"}</button>
    </form>
  </details>;
}

export function PlanSettingsForm({ studentId, planId, checkOn, weeklyMinutes }: {
  studentId: string; planId: string; checkOn: string; weeklyMinutes: number;
}) {
  const [state, submit, saving] = useActionState(updatePlanAction, idle);
  return <details className="raw"><summary>Kontrol tarihini ya da süreyi değiştir</summary>
    <form action={submit} className="form-stack">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="planId" value={planId} />
      <div className="inline-fields">
        <label>Kontrol tarihi<input type="date" name="checkOn" defaultValue={checkOn} required /></label>
        <label>Haftalık süre (dk)<input type="number" name="weeklyMinutes" min={15} max={1200}
          step={15} defaultValue={weeklyMinutes} required /></label>
      </div>
      <button type="submit" disabled={saving}>{saving ? "…" : "Kaydet"}</button>
      <Result s={state} />
    </form>
  </details>;
}

export function ClosePlanForm({ studentId, planId, checkDone }: {
  studentId: string; planId: string; checkDone: boolean;
}) {
  const [state, submit, saving] = useActionState(closePlanAction, idle);
  return <details className="raw"><summary>Planı kapat</summary>
    <form action={submit} className="form-stack">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="planId" value={planId} />
      {!checkDone && <p className="field-warn">Kontrol ölçümü yapılmadı. Plan kapatılabilir, ama
        bu plan için “ne değişti” sorusuna cevap olmayacak.</p>}
      <label>Kapanış notu <span className="note">isteğe bağlı</span>
        <textarea name="note" rows={2} maxLength={2000}
          placeholder="örn. Akıcılık 1/4'ten 2/4'e çıktı; bir sonraki plan etkileşime odaklanacak" /></label>
      <button type="submit" disabled={saving}>{saving ? "Kapatılıyor…" : "Planı kapat"}</button>
      <Result s={state} />
    </form>
  </details>;
}

export function PrintButton() {
  return <button type="button" className="no-print" onClick={() => window.print()}>Yazdır</button>;
}
