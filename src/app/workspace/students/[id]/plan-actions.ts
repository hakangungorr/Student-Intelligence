"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { canPlan, currentMembership } from "@/lib/membership";
import { planContext } from "@/lib/plan-context";
import {
  addTask, closePlan, openPlan, removeTask, setTaskStatus, updatePlan, type NewTask
} from "@/lib/plan";
import { OWNERS, STATUSES, type TaskStatus } from "@/lib/rubric";

export type PlanState = { status: "idle" | "done" | "error"; message?: string };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih seçin.");
const done = (studentId: string, message?: string): PlanState => {
  revalidatePath(`/workspace/students/${studentId}`);
  revalidatePath("/workspace");
  return { status: "done", message };
};
const failed = (e: unknown): PlanState => ({ status: "error", message: (e as Error).message });

async function allowed() {
  const { client, user } = await requireUser();
  const me = await currentMembership(client);
  return { client, user, ok: canPlan(me) };
}

/** Planı açar; seçilen öneriler ilk görevleri olur. */
export async function openPlanAction(_prev: PlanState, form: FormData): Promise<PlanState> {
  const input = z.object({
    studentId: z.uuid(), checkOn: day,
    weeklyMinutes: z.coerce.number().int().min(15).max(1200)
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: input.error.issues[0].message };
  const keys = new Set(form.getAll("key").map(String));

  const { client, ok } = await allowed();
  if (!ok) return { status: "error", message: "Plan açma yetkiniz yok." };
  const ctx = await planContext(client, input.data.studentId);
  if (!ctx) return { status: "error", message: "Öğrenci bulunamadı." };

  const tasks: NewTask[] = ctx.suggestions.items
    .filter(s => keys.has(s.key) && !s.full)
    .map(s => s.key === "check" ? { ...s, dueOn: input.data.checkOn } : s);
  try {
    await openPlan(client, {
      studentId: input.data.studentId, checkOn: input.data.checkOn,
      weeklyMinutes: input.data.weeklyMinutes,
      periodEnd: ctx.card.snapshotPeriod, tasks
    });
  } catch (e) { return failed(e); }
  return done(input.data.studentId, `Plan açıldı — ${tasks.length} görevle.`);
}

export async function addSuggestionAction(_prev: PlanState, form: FormData): Promise<PlanState> {
  const input = z.object({ studentId: z.uuid(), key: z.string().min(1).max(200) })
    .safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: "Geçersiz istek." };

  const { client, ok } = await allowed();
  if (!ok) return { status: "error", message: "Plana görev ekleme yetkiniz yok." };
  const ctx = await planContext(client, input.data.studentId);
  if (!ctx?.open) return { status: "error", message: "Açık plan yok." };
  const pick = ctx.suggestions.items.find(s => s.key === input.data.key);
  if (!pick) return { status: "error", message: "Bu öneri artık geçerli değil; sayfa yenilendi." };
  if (pick.full) return { status: "error", message: "Bu etkinlikte yer kalmadı." };
  try { await addTask(client, ctx.open.id, pick); } catch (e) { return failed(e); }
  return done(input.data.studentId);
}

/** Öğretmenin kendi yazdığı görev. Öneriyi değiştirmenin yolu budur. */
export async function addOwnTaskAction(_prev: PlanState, form: FormData): Promise<PlanState> {
  const input = z.object({
    studentId: z.uuid(), planId: z.uuid(),
    title: z.string().trim().min(1, "Görevi yazın.").max(300),
    why: z.string().trim().min(1, "Neden eklendiğini yazın.").max(600),
    owner: z.enum(OWNERS.map(o => o.key) as [string, ...string[]]),
    minutes: z.union([z.coerce.number().int().min(5).max(240), z.literal("")]),
    dueOn: z.union([day, z.literal("")])
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: input.error.issues[0].message };
  const d = input.data;

  const { client, ok } = await allowed();
  if (!ok) return { status: "error", message: "Plana görev ekleme yetkiniz yok." };
  try {
    await addTask(client, d.planId, {
      key: `own:${crypto.randomUUID()}`, kind: d.owner === "student" ? "work" : "staff",
      title: d.title, why: d.why, owner: d.owner as NewTask["owner"],
      minutes: d.minutes === "" ? null : d.minutes, dueOn: d.dueOn || null,
      libraryItemId: null, expectedOutput: null
    });
  } catch (e) { return failed(e); }
  return done(d.studentId, "Görev eklendi.");
}

export async function setStatusAction(_prev: PlanState, form: FormData): Promise<PlanState> {
  const input = z.object({
    studentId: z.uuid(), taskId: z.uuid(),
    status: z.enum(STATUSES.map(s => s.key) as [string, ...string[]]),
    note: z.string().trim().max(1000).optional()
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: "Geçersiz istek." };
  const { client } = await requireUser();
  try {
    await setTaskStatus(client, input.data.taskId, input.data.status as TaskStatus,
      input.data.note || null);
  } catch (e) { return failed(e); }
  return done(input.data.studentId);
}

export async function removeTaskAction(_prev: PlanState, form: FormData): Promise<PlanState> {
  const input = z.object({ studentId: z.uuid(), taskId: z.uuid() }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: "Geçersiz istek." };
  const { client } = await requireUser();
  try { await removeTask(client, input.data.taskId); } catch (e) { return failed(e); }
  return done(input.data.studentId);
}

export async function updatePlanAction(_prev: PlanState, form: FormData): Promise<PlanState> {
  const input = z.object({
    studentId: z.uuid(), planId: z.uuid(), checkOn: day,
    weeklyMinutes: z.coerce.number().int().min(15).max(1200)
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: input.error.issues[0].message };
  const { client } = await requireUser();
  try {
    await updatePlan(client, input.data.planId,
      { checkOn: input.data.checkOn, weeklyMinutes: input.data.weeklyMinutes });
  } catch (e) { return failed(e); }
  return done(input.data.studentId, "Kaydedildi.");
}

export async function closePlanAction(_prev: PlanState, form: FormData): Promise<PlanState> {
  const input = z.object({
    studentId: z.uuid(), planId: z.uuid(),
    note: z.string().trim().max(2000).optional()
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: "Geçersiz istek." };
  const { client, user } = await requireUser();
  try { await closePlan(client, input.data.planId, user.id, input.data.note || null); }
  catch (e) { return failed(e); }
  return done(input.data.studentId, "Plan kapatıldı.");
}
