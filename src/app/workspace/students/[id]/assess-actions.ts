"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { canPlan, currentMembership } from "@/lib/membership";
import { recordAssessment } from "@/lib/assessments";
import { RUBRICS, RUBRIC_SCALE, SKILLS } from "@/lib/rubric";

export type AssessState = { status: "idle" | "done" | "error"; message?: string };

/** Ölçüm: bir görevde gözlenenin tarihli kaydı.
 *
 *  Deliberately demanding about what has to be filled in: the task the student
 *  actually did, the day it happened, and a score for at least one named
 *  criterion. A rating with no task behind it cannot be repeated, and a
 *  measurement that cannot be repeated cannot show whether anything changed —
 *  which is the only question a control measurement exists to answer.
 *
 *  There is no edit path. An assessment is what somebody observed on a day; a
 *  correction is a new observation, and the migration explains why.
 */
export async function assess(_prev: AssessState, form: FormData): Promise<AssessState> {
  const base = z.object({
    studentId: z.uuid(),
    skill: z.enum(SKILLS),
    assessedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı."),
    taskLabel: z.string().trim().min(1, "Hangi görevde ölçüldüğünü yazın.").max(300),
    note: z.string().trim().max(2000).optional()
  }).safeParse(Object.fromEntries(form));
  if (!base.success) return { status: "error", message: base.error.issues[0].message };

  const today = new Date().toISOString().slice(0, 10);
  if (base.data.assessedOn > today) return {
    status: "error", message: "Ölçüm tarihi gelecekte olamaz."
  };

  const scores: { code: string; score: number }[] = [];
  for (const c of RUBRICS[base.data.skill]) {
    const raw = String(form.get(`c:${c.code}`) ?? "").trim();
    if (raw === "") continue;                  // ölçülmeyen ölçüt boş kalır, sıfır sayılmaz
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > RUBRIC_SCALE) return {
      status: "error", message: `${c.label}: 0–${RUBRIC_SCALE} arası bir değer girin.`
    };
    scores.push({ code: c.code, score: value });
  }
  if (!scores.length) return {
    status: "error", message: "En az bir ölçüt puanlanmalı. Ölçmediğiniz ölçütü boş bırakın."
  };

  const { client } = await requireUser();
  const me = await currentMembership(client);
  if (!canPlan(me)) return { status: "error", message: "Ölçüm girme yetkiniz yok." };

  try {
    await recordAssessment(client, me!.organizationId, {
      studentId: base.data.studentId, assessedOn: base.data.assessedOn,
      skill: base.data.skill,
      taskLabel: base.data.taskLabel, note: base.data.note || null, scores
    });
  } catch (e) {
    const message = (e as Error).message;
    return {
      status: "error",
      message: message.includes("row-level security")
        ? "Bu öğrenci için ölçüm girme yetkiniz yok."
        : `Kaydedilemedi: ${message}`
    };
  }
  revalidatePath(`/workspace/students/${base.data.studentId}`);
  return {
    status: "done",
    message: `${scores.length} ölçüt kaydedildi. Bu kayıt önceki değerlendirmeyi silmez; `
      + "tarihiyle birlikte listede durur."
  };
}
