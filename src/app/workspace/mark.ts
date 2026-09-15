"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { latestPeriod } from "@/lib/scoring";

export type MarkState = { status: "idle" | "error"; message?: string };

/** Records that one recommended task was carried out.
 *
 *  Without this the agenda can only ever say what to do, never what was done:
 *  the same student reappears every week and nobody can tell an untouched case
 *  from a handled one. The row is kept rather than deleted on undo — who
 *  proposed what, and when it was closed or reopened, is the audit trail.
 *
 *  One row per task, not per student. A recommendation like "eğitmenle görüşme +
 *  öğrenci ilişkileri araması" is two jobs for two different people, and closing
 *  it with one button meant the phone call was recorded as made the moment the
 *  meeting happened. The task's own key carries the identity, so the half that
 *  is still open stays open.
 *
 *  Each row belongs to the evaluation checkpoint whose recommendation it answers,
 *  and to the task text that checkpoint produced. A new checkpoint, or the same
 *  checkpoint rescored into a different recommendation, therefore yields new keys
 *  and an outstanding student; the closed rows from before are left untouched as
 *  the record of what was done then.
 */
const form = z.object({
  studentId: z.uuid(),
  taskKey: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(1000),
  done: z.enum(["1", "0"])
});

/** Two people closing the same task at the same moment, or one person clicking
 *  twice, used to write two rows. The database now refuses the second one; this
 *  turns that refusal into the update it was always meant to be. */
const DUPLICATE = "23505";

export async function markAction(_prev: MarkState, data: FormData): Promise<MarkState> {
  const parsed = form.safeParse({
    studentId: data.get("studentId"), taskKey: data.get("taskKey"),
    title: data.get("title"), done: data.get("done")
  });
  if (!parsed.success) return { status: "error", message: "Geçersiz istek." };
  const { studentId, taskKey, title, done } = parsed.data;
  const status = done === "1" ? "completed" : "cancelled";

  const { client } = await requireUser();
  const student = await client.from("students")
    .select("organization_id,branch_id").eq("id", studentId).maybeSingle();
  if (student.error || !student.data) return { status: "error", message: "Öğrenci bulunamadı." };

  const period = await latestPeriod(client);
  const find = () => {
    const q = client.from("actions").select("id").eq("student_id", studentId).eq("task_key", taskKey);
    return (period === null ? q.is("period_end", null) : q.eq("period_end", period))
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
  };
  const existing = await find();
  if (existing.error) return { status: "error", message: "Aksiyon okunamadı." };

  const update = (id: string) => client.from("actions").update({ status }).eq("id", id);
  let written = existing.data
    ? await update(existing.data.id)
    : await client.from("actions").insert({
      organization_id: student.data.organization_id, branch_id: student.data.branch_id,
      student_id: studentId, title, status, period_end: period, task_key: taskKey
    });
  if (written.error?.code === DUPLICATE) {
    const raced = await find();
    if (raced.data) written = await update(raced.data.id);
  }
  if (written.error) return {
    status: "error",
    message: written.error.message.includes("row-level security")
      ? "Bu öğrenci için işaretleme yetkiniz yok."
      : `İşaretlenemedi: ${written.error.message}`
  };

  revalidatePath("/workspace");
  revalidatePath(`/workspace/students/${studentId}`);
  return { status: "idle" };
}
