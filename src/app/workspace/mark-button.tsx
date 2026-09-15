"use client";
import { useActionState } from "react";
import { markAction, type MarkState } from "./mark";

const idle: MarkState = { status: "idle" };

/** One button per task. The task's key travels with it, so closing the meeting
 *  does not close the phone call that was recommended alongside it. */
export function MarkDone({ studentId, taskKey, title, done }: {
  studentId: string; taskKey: string; title: string; done: boolean;
}) {
  const [state, submit, saving] = useActionState(markAction, idle);
  return <form action={submit} className="mark">
    <input type="hidden" name="studentId" value={studentId} />
    <input type="hidden" name="taskKey" value={taskKey} />
    <input type="hidden" name="title" value={title} />
    <input type="hidden" name="done" value={done ? "0" : "1"} />
    <button type="submit" className={done ? "undo" : "markbtn"} disabled={saving}
      aria-label={`${title} — ${done ? "geri al" : "yapıldı olarak işaretle"}`}>
      {saving ? "…" : done ? "✓ Yapıldı — geri al" : "Yapıldı"}
    </button>
    {state.status === "error" && <small className="error-note">{state.message}</small>}
  </form>;
}
