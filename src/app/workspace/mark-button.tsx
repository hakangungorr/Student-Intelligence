"use client";
import { useActionState } from "react";
import { markAction, type MarkState } from "./mark";

const idle: MarkState = { status: "idle" };

export function MarkDone({ studentId, title, done }: {
  studentId: string; title: string; done: boolean;
}) {
  const [state, submit, saving] = useActionState(markAction, idle);
  return <form action={submit} className="mark">
    <input type="hidden" name="studentId" value={studentId} />
    <input type="hidden" name="title" value={title} />
    <input type="hidden" name="done" value={done ? "0" : "1"} />
    <button type="submit" className={done ? "undo" : "markbtn"} disabled={saving}>
      {saving ? "…" : done ? "✓ Yapıldı — geri al" : "✓ Yapıldı olarak işaretle"}
    </button>
    {state.status === "error" && <small className="error-note">{state.message}</small>}
  </form>;
}
