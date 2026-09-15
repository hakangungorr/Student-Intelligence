"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { canPlan, currentMembership } from "@/lib/membership";
import { loadSettings } from "@/lib/settings";
import { approvePlan, buildDrafts, saveDraft, setTaskStatus } from "@/lib/plan";
import { TASK_STATES, weekStartOf } from "@/lib/rubric";

export type PlanState = {
  status: "idle" | "done" | "error";
  message?: string;
  /** Free seats elsewhere, when an approval was refused because a session filled
   *  up. Offering the alternative is the difference between a refusal and a
   *  dead end. */
  alternatives?: string[];
};

const week = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Hafta YYYY-AA-GG biçiminde olmalı.");

/** Taslak üretir — yazar, ama onaylamaz.
 *
 *  Generation is cheap and reversible; approval is the decision, and it stays
 *  with a person. Students who already have a live plan for the week are skipped
 *  rather than overwritten.
 */
export async function generate(_prev: PlanState, form: FormData): Promise<PlanState> {
  const input = z.object({
    level: z.string().trim().min(1).max(20),
    branchId: z.union([z.uuid(), z.literal("")]),
    weekStart: week
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: input.error.issues[0].message };

  const { client } = await requireUser();
  const me = await currentMembership(client);
  if (!canPlan(me)) return { status: "error", message: "Plan hazırlama yetkiniz yok." };
  const settings = await loadSettings(client);

  try {
    const drafts = await buildDrafts(client, {
      level: input.data.level,
      // A branch role plans its own branch whatever the form said; the database
      // would refuse anything else, and refusing here produces a better sentence.
      branchId: me!.branchId ?? (input.data.branchId || null),
      weekStart: weekStartOf(input.data.weekStart),
      attendanceFloor: settings.attendanceFloor,
      limit: 40
    });
    if (!drafts.length) return {
      status: "done",
      message: "Yeni taslak üretilmedi. Bu kurdaki öğrencilerin ya planı zaten var ya da "
        + "kanıta dayalı bir ihtiyaç bulunamadı."
    };
    let written = 0;
    const failed: string[] = [];
    for (const draft of drafts) {
      try { await saveDraft(client, me!.organizationId, draft); written++; }
      catch (e) { failed.push(`${draft.studentName}: ${(e as Error).message}`); }
    }
    revalidatePath("/workspace/plans");
    return {
      status: failed.length ? "error" : "done",
      message: `${written} taslak oluşturuldu ve onay kuyruğuna alındı.`
        + (failed.length ? ` ${failed.length} öğrencide yazılamadı: ${failed[0]}` : "")
    };
  } catch (e) {
    return { status: "error", message: `Taslak üretilemedi: ${(e as Error).message}` };
  }
}

export async function approve(_prev: PlanState, form: FormData): Promise<PlanState> {
  const planId = z.uuid().safeParse(form.get("planId"));
  if (!planId.success) return { status: "error", message: "Geçersiz istek." };

  const { client } = await requireUser();
  const { data: session } = await client.auth.getUser();
  if (!session.user) return { status: "error", message: "Oturum bulunamadı." };

  const result = await approvePlan(client, planId.data, session.user.id);
  revalidatePath("/workspace/plans");
  revalidatePath(`/workspace/plans/${planId.data}`);
  return result.ok
    ? { status: "done", message: "Plan onaylandı ve oturumlarda yer ayrıldı." }
    : { status: "error", message: result.message, alternatives: result.alternatives };
}

export async function updateTask(_prev: PlanState, form: FormData): Promise<PlanState> {
  const input = z.object({
    taskId: z.uuid(),
    status: z.enum(TASK_STATES.map(s => s.key) as [string, ...string[]]),
    note: z.string().trim().max(2000).optional(),
    studentId: z.union([z.uuid(), z.literal("")]).optional()
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: "Geçersiz istek." };

  const { client } = await requireUser();
  try {
    await setTaskStatus(client, input.data.taskId,
      input.data.status as (typeof TASK_STATES)[number]["key"], input.data.note || null);
  } catch (e) {
    return { status: "error", message: (e as Error).message };
  }
  revalidatePath("/workspace/plans");
  if (input.data.studentId) revalidatePath(`/workspace/students/${input.data.studentId}`);
  return { status: "done" };
}

/** Öğretmen taslağı değiştirebilir; onay öncesi de sonrası da kayıt altında.
 *
 *  Deliberately narrow: what a task says, how long it takes and when it happens.
 *  Which student it belongs to and which plan it is in are not editable, because
 *  moving a task between students is not an edit, it is a new task. */
export async function editTask(_prev: PlanState, form: FormData): Promise<PlanState> {
  const input = z.object({
    taskId: z.uuid(),
    title: z.string().trim().min(1).max(300),
    minutes: z.coerce.number().int().min(5).max(240),
    scheduledOn: week,
    sessionId: z.union([z.uuid(), z.literal("")]).optional()
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: input.error.issues[0].message };

  const { client } = await requireUser();
  const patch: Record<string, unknown> = {
    title: input.data.title, minutes: input.data.minutes,
    scheduled_on: input.data.scheduledOn, updated_at: new Date().toISOString()
  };
  if (input.data.sessionId !== undefined) patch.session_id = input.data.sessionId || null;
  const written = await client.from("study_tasks").update(patch).eq("id", input.data.taskId).select("id");
  if (written.error) return { status: "error", message: written.error.message };
  if (!written.data?.length) return { status: "error", message: "Bu görevi düzenleme yetkiniz yok." };
  revalidatePath("/workspace/plans");
  return { status: "done", message: "Görev güncellendi." };
}

export async function saveAvailability(_prev: PlanState, form: FormData): Promise<PlanState> {
  const input = z.object({
    studentId: z.uuid(),
    weeklyMinutes: z.coerce.number().int().min(15).max(1200)
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: input.error.issues[0].message };

  const { client } = await requireUser();
  const me = await currentMembership(client);
  if (!canPlan(me)) return { status: "error", message: "Bu işlem için yetkiniz yok." };
  const student = await client.from("students").select("branch_id")
    .eq("id", input.data.studentId).maybeSingle();
  if (student.error || !student.data) return { status: "error", message: "Öğrenci bulunamadı." };

  const existing = await client.from("student_availability").select("student_id")
    .eq("student_id", input.data.studentId).maybeSingle();
  const row = {
    weekly_minutes: input.data.weeklyMinutes, updated_at: new Date().toISOString()
  };
  const written = existing.data
    ? await client.from("student_availability").update(row).eq("student_id", input.data.studentId)
    : await client.from("student_availability").insert({
      student_id: input.data.studentId, organization_id: me!.organizationId,
      branch_id: student.data.branch_id, ...row
    });
  if (written.error) return { status: "error", message: written.error.message };
  revalidatePath(`/workspace/students/${input.data.studentId}`);
  return { status: "done", message: "Haftalık kapasite kaydedildi." };
}
