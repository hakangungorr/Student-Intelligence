"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export type AudienceState = { status: "idle" | "done" | "error"; message?: string };

/** Raporun kime yazıldığı, öğrencinin bir özelliğidir.
 *
 *  Most of this institution's roster is adults, and an adult's development
 *  report is their own. The audience therefore defaults to the student and only
 *  moves when somebody sets it — a report never promotes itself to a guardian
 *  report because the student happens to be doing badly.
 *
 *  Setting this does not grant anybody access. Student and guardian logins are a
 *  separate decision the institution has not made yet; until it does, the report
 *  is something staff print and hand over.
 */
export async function setAudience(_prev: AudienceState, form: FormData): Promise<AudienceState> {
  const input = z.object({
    studentId: z.uuid(), audience: z.enum(["student", "guardian"])
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: "Geçersiz istek." };

  const { client } = await requireUser();
  const written = await client.from("students")
    .update({ report_audience: input.data.audience })
    .eq("id", input.data.studentId).select("id");
  if (written.error) return { status: "error", message: written.error.message };
  if (!written.data?.length) return { status: "error", message: "Bu değişiklik için yetkiniz yok." };
  revalidatePath(`/workspace/students/${input.data.studentId}/report`);
  return { status: "done", message: "Rapor alıcısı güncellendi." };
}
