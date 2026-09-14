"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { latestPeriod } from "@/lib/scoring";

export type MarkState = { status: "idle" | "error"; message?: string };

/** Records that a recommendation was carried out.
 *
 *  Without this the agenda can only ever say what to do, never what was done:
 *  the same student reappears every week and nobody can tell an untouched case
 *  from a handled one. The row is kept rather than deleted on undo — who
 *  proposed what, and when it was closed or reopened, is the audit trail.
 *
 *  Each row belongs to the evaluation checkpoint whose recommendation it answers.
 *  A new checkpoint means a new recommendation, so it gets its own row and the
 *  student is outstanding again; the closed row from the period before is left
 *  untouched as the record of what was done then.
 */
const form = z.object({
  studentId: z.uuid(),
  title: z.string().trim().min(1).max(1000),
  done: z.enum(["1", "0"])
});

export async function markAction(_prev: MarkState, data: FormData): Promise<MarkState> {
  const parsed = form.safeParse({
    studentId: data.get("studentId"), title: data.get("title"), done: data.get("done")
  });
  if (!parsed.success) return { status: "error", message: "Geçersiz istek." };
  const { studentId, title, done } = parsed.data;
  const status = done === "1" ? "completed" : "cancelled";

  const { client } = await requireUser();
  const student = await client.from("students")
    .select("organization_id,branch_id").eq("id", studentId).maybeSingle();
  if (student.error || !student.data) return { status: "error", message: "Öğrenci bulunamadı." };

  const period = await latestPeriod(client);
  const query = client.from("actions").select("id").eq("student_id", studentId);
  const existing = await (period === null ? query.is("period_end", null) : query.eq("period_end", period))
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) return { status: "error", message: "Aksiyon okunamadı." };

  const written = existing.data
    ? await client.from("actions").update({ status }).eq("id", existing.data.id)
    : await client.from("actions").insert({
      organization_id: student.data.organization_id, branch_id: student.data.branch_id,
      student_id: studentId, title, status, period_end: period
    });
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
