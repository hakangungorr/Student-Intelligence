import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/paginate";
import { criterionTrends, type Assessment } from "@/lib/assessments";
import { hasRoom, seatsLeft, type LibraryItem } from "@/lib/library";
import type { Step } from "@/lib/narrative";
import {
  NEEDS_WORK_AT, SKILLS, SKILL_LABEL, addDays, dayText, todayIso,
  type Owner, type Skill, type TaskKind, type TaskStatus
} from "@/lib/rubric";

/** Plan: bir öğrencinin yapılacaklar listesi.
 *
 *  One path — measure, plan, do, measure again — and one rule to remember: a
 *  student has at most one open plan. The system suggests; a person adds. Adding
 *  a suggestion is the approval, so there is no draft to review and no queue to
 *  empty.
 *
 *  Suggestions are computed, never stored. They are whatever the evidence says
 *  today, which means a new measurement changes them immediately and a stale
 *  suggestion cannot sit in a table waiting to be approved.
 */

// ── Öneriler ────────────────────────────────────────────────────────────────

export type Need = {
  skill: Skill; code: string; label: string;
  latest: number; scaleMax: number;
  /** A single reading. Worth a look, not a verdict. */
  thin: boolean;
  evidence: string;
};

export type Suggestion = {
  /** Stored on the task as source_key, so the same suggestion cannot be added
   *  twice and disappears from the list once it is in. */
  key: string;
  kind: TaskKind;
  title: string;
  why: string;
  owner: Owner;
  minutes: number | null;
  libraryItemId: string | null;
  dueOn: string | null;
  expectedOutput: string | null;
  /** What to know before adding: a sample item, seats left, no library match. */
  note: string | null;
  /** An event with no seats. Shown so the teacher knows it exists; cannot be added. */
  full: boolean;
};

export type Suggestions = {
  items: Suggestion[];
  needs: Need[];
  unmeasured: Skill[];
};

const OWNER_OF: Record<string, Owner> = {
  "Eğitmen": "teacher", "Akademik koordinatör": "coordinator", "Öğrenci ilişkileri": "student_relations"
};

/** When the library has nothing for a need, the suggestion still says what to
 *  do — and says the library is missing it, rather than inventing an item. */
const GENERIC: Record<Skill, { title: string; output: string }> = {
  speaking: { title: "Kısa anlatma ve yeniden anlatma çalışması", output: "İki kısa sözlü anlatım" },
  writing: { title: "Kısa yazı ve düzeltme turu", output: "Bir kısa yazı ve düzeltilmiş hâli" },
  listening: { title: "Seviyeye uygun dinleme ve yeniden anlatma", output: "Beş anlama sorusu ve sözlü özet" },
  reading: { title: "Seviyeye uygun okuma ve özetleme", output: "Kısa yazılı özet" }
};

const MAX_NEEDS = 2;
const PER_NEED_STUDIES = 2;

export function needsFrom(assessments: Assessment[]): { needs: Need[]; unmeasured: Skill[] } {
  const needs: Need[] = [];
  const unmeasured: Skill[] = [];
  for (const skill of SKILLS) {
    const trends = criterionTrends(assessments, skill);
    if (trends.every(t => t.latest === null)) { unmeasured.push(skill); continue; }
    for (const t of trends) {
      if (t.latest === null || t.latest > NEEDS_WORK_AT) continue;
      const thin = t.readings < 2;
      const reading = `${t.latest}/${t.scaleMax} (${dayText(t.latestOn!)}, "${t.latestTask}")`;
      needs.push({
        skill, code: t.code, label: `${SKILL_LABEL[skill]} · ${t.label}`,
        latest: t.latest, scaleMax: t.scaleMax, thin,
        evidence: thin
          ? `${SKILL_LABEL[skill]} · ${t.label}: ${reading}. Tek ölçüm — kesin eksiklik sayılmaz, `
            + "kontrol ölçümü bunu netleştirir."
          : `${SKILL_LABEL[skill]} · ${t.label}: ${reading}`
            + (t.comparable ? `; önceki ${t.previous}/${t.scaleMax}.` : ".")
      });
    }
  }
  // The product acts hardest where it knows most: repeated readings before single
  // ones, the weakest first within each.
  needs.sort((a, b) => Number(a.thin) - Number(b.thin) || a.latest / a.scaleMax - b.latest / b.scaleMax);
  return { needs, unmeasured };
}

export function suggest(input: {
  steps: Step[]; because: string;
  assessments: Assessment[];
  level: string; branchId: string;
  library: LibraryItem[];
  checkOn: string;
  already: Set<string>;
}): Suggestions {
  const items: Suggestion[] = [];
  const push = (s: Omit<Suggestion, "full" | "note" | "dueOn" | "expectedOutput"> &
    Partial<Pick<Suggestion, "full" | "note" | "dueOn" | "expectedOutput">>) => {
    if (input.already.has(s.key) || items.some(x => x.key === s.key)) return;
    items.push({ full: false, note: null, dueOn: null, expectedOutput: null, ...s });
  };

  // What the risk review asked the institution to do. Staff work, in the same
  // list as the student's — that was the point of merging the two.
  for (const step of input.steps) push({
    key: `staff:${step.key}`, kind: "staff", title: step.text,
    why: `Risk değerlendirmesinin önerisi — ${input.because}`,
    owner: OWNER_OF[step.who ?? ""] ?? "teacher", minutes: null, libraryItemId: null
  });

  const { needs, unmeasured } = needsFrom(input.assessments);

  // One measurement task, however many skills are missing. The first version
  // wrote four identical diagnostics per student and nobody could act on them.
  if (unmeasured.length) push({
    key: "measure", kind: "measure", owner: "teacher", minutes: 15, libraryItemId: null,
    title: unmeasured.length === SKILLS.length
      ? "İlk ölçümü yap"
      : `Eksik becerileri ölç: ${unmeasured.map(s => SKILL_LABEL[s].toLocaleLowerCase("tr")).join(", ")}`,
    why: unmeasured.length === SKILLS.length
      ? "Bu öğrencinin tarihli bir beceri ölçümü yok. Ölçüm olmadan neyin çalışılacağı söylenemez."
      : "Bu becerilerde ölçüm yok. Bu bir zayıflık kaydı değil; ölçülmemiş olan hakkında bir şey söylenmez.",
    expectedOutput: "Öğrenci kartında ölçütlere göre puanlanmış bir ölçüm"
  });

  const used = new Set<string>();
  const fits = (i: LibraryItem, skill: Skill) =>
    !used.has(i.id) && i.skill === skill && (i.level === null || i.level === input.level);

  for (const need of needs.slice(0, MAX_NEEDS)) {
    const studies = input.library.filter(i => i.kind === "study" && fits(i, need.skill))
      .sort((a, b) => Number(a.isSample) - Number(b.isSample))
      .slice(0, PER_NEED_STUDIES);
    for (const i of studies) {
      used.add(i.id);
      push({
        key: `lib:${i.id}`, kind: "work", title: i.title, why: need.evidence,
        owner: "student", minutes: i.minutes, libraryItemId: i.id,
        note: i.isSample ? "Örnek kayıt — kurumun doğrulanmış içeriği değil" : null
      });
    }
    if (!studies.length) push({
      key: `work:${need.skill}:${need.code}`, kind: "work", title: GENERIC[need.skill].title,
      why: need.evidence, owner: "student", minutes: 15, libraryItemId: null,
      expectedOutput: GENERIC[need.skill].output,
      note: "Kütüphanede bu beceri için içerik yok"
    });

    const event = input.library.find(i => i.kind === "event" && fits(i, need.skill)
      && i.branchId === input.branchId);
    if (event) {
      used.add(event.id);
      const left = seatsLeft(event);
      push({
        key: `lib:${event.id}`, kind: "work", title: event.title, why: need.evidence,
        owner: "student", minutes: event.minutes, libraryItemId: event.id,
        dueOn: event.startsAt!.slice(0, 10), full: !hasRoom(event),
        note: [
          hasRoom(event) ? `${left} yer kaldı` : "Dolu",
          event.isSample ? "örnek kayıt" : null
        ].filter(Boolean).join(" · ")
      });
    }
  }

  // Without this the plan produces activity and no evidence.
  if (needs.length) {
    const skills = [...new Set(needs.slice(0, MAX_NEEDS).map(n => n.skill))];
    push({
      key: "check", kind: "check", owner: "teacher", minutes: 15, libraryItemId: null,
      dueOn: input.checkOn,
      title: `Kontrol ölçümü: ${skills.map(s => SKILL_LABEL[s].toLocaleLowerCase("tr")).join(", ")}`,
      why: "Aynı ölçütlerle yeni bir ölçüm yapılmadan bir şeyin değiştiği söylenemez.",
      expectedOutput: "Aynı ölçütlerle, farklı bir görevde yapılmış ölçüm"
    });
  }

  return { items, needs, unmeasured };
}

// ── Okuma ───────────────────────────────────────────────────────────────────

export type PlanTask = {
  id: string; kind: TaskKind; title: string; why: string; owner: Owner;
  minutes: number | null; dueOn: string | null; status: TaskStatus; note: string | null;
  expectedOutput: string | null; sourceKey: string | null;
  item: { title: string; kind: string; program: string; startsAt: string | null; isSample: boolean } | null;
};
export type Plan = {
  id: string; studentId: string; status: "open" | "closed";
  checkOn: string; weeklyMinutes: number; sourcePeriodEnd: string | null;
  openedAt: string; closedAt: string | null; closeNote: string | null;
  tasks: PlanTask[];
};

const KIND_ORDER: Record<TaskKind, number> = { staff: 0, measure: 1, work: 2, check: 3 };

/** Plans for a set of students, newest first. */
export async function loadPlans(
  client: SupabaseClient, studentIds: string[], opts: { openOnly?: boolean } = {}
): Promise<Map<string, Plan[]>> {
  const out = new Map<string, Plan[]>();
  if (!studentIds.length) return out;
  const oops = "Planlar okunamadı";
  const plans = await fetchAll<{ id: string; student_id: string; status: string; check_on: string;
    weekly_minutes: number; source_period_end: string | null; created_at: string;
    closed_at: string | null; close_note: string | null }>(
    () => {
      const q = client.from("plans")
        .select("id,student_id,status,check_on,weekly_minutes,source_period_end,created_at,closed_at,close_note")
        .in("student_id", studentIds);
      return (opts.openOnly ? q.eq("status", "open") : q).order("created_at", { ascending: false });
    }, oops);
  if (!plans.length) return out;

  const tasks = await fetchAll<{ id: string; plan_id: string; kind: string; title: string; why: string;
    owner: string; minutes: number | null; due_on: string | null; status: string; note: string | null;
    expected_output: string | null; source_key: string | null; library_item_id: string | null }>(
    () => client.from("plan_tasks")
      .select("id,plan_id,kind,title,why,owner,minutes,due_on,status,note,expected_output,source_key,library_item_id")
      .in("plan_id", plans.map(p => p.id)).order("created_at"), oops);
  const itemIds = [...new Set(tasks.map(t => t.library_item_id).filter((v): v is string => !!v))];
  const items = itemIds.length
    ? await fetchAll<{ id: string; title: string; kind: string; program: string;
      starts_at: string | null; is_sample: boolean }>(
      () => client.from("library_items").select("id,title,kind,program,starts_at,is_sample")
        .in("id", itemIds), oops)
    : [];
  const itemOf = new Map(items.map(i => [i.id, i]));

  const tasksOf = new Map<string, PlanTask[]>();
  for (const t of tasks) {
    const i = t.library_item_id ? itemOf.get(t.library_item_id) : undefined;
    (tasksOf.get(t.plan_id) ?? tasksOf.set(t.plan_id, []).get(t.plan_id)!).push({
      id: t.id, kind: t.kind as TaskKind, title: t.title, why: t.why, owner: t.owner as Owner,
      minutes: t.minutes === null ? null : Number(t.minutes), dueOn: t.due_on,
      status: t.status as TaskStatus, note: t.note, expectedOutput: t.expected_output,
      sourceKey: t.source_key,
      item: i ? { title: i.title, kind: i.kind, program: i.program,
        startsAt: i.starts_at, isSample: i.is_sample } : null
    });
  }

  for (const p of plans) {
    const list = (tasksOf.get(p.id) ?? [])
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    (out.get(p.student_id) ?? out.set(p.student_id, []).get(p.student_id)!).push({
      id: p.id, studentId: p.student_id, status: p.status as Plan["status"],
      checkOn: p.check_on, weeklyMinutes: Number(p.weekly_minutes),
      sourcePeriodEnd: p.source_period_end, openedAt: p.created_at,
      closedAt: p.closed_at, closeNote: p.close_note, tasks: list
    });
  }
  return out;
}

export type PlanSummary = {
  id: string; tasks: number; done: number; stuck: number;
  checkOn: string; overdue: boolean;
  /** An open plan whose control measurement is not done. */
  checkPending: boolean;
};

/** What the agenda needs to know about each open plan, and nothing more. */
export async function loadPlanSummaries(client: SupabaseClient): Promise<Map<string, PlanSummary>> {
  const oops = "Planlar okunamadı";
  const plans = await fetchAll<{ id: string; student_id: string; check_on: string }>(
    () => client.from("plans").select("id,student_id,check_on").eq("status", "open"), oops);
  const out = new Map<string, PlanSummary>();
  if (!plans.length) return out;
  const tasks = await fetchAll<{ plan_id: string; kind: string; status: string }>(
    () => client.from("plan_tasks").select("plan_id,kind,status")
      .in("plan_id", plans.map(p => p.id)), oops);
  const today = todayIso();
  for (const p of plans) {
    const mine = tasks.filter(t => t.plan_id === p.id);
    out.set(p.student_id, {
      id: p.id, tasks: mine.length,
      done: mine.filter(t => t.status === "done").length,
      stuck: mine.filter(t => t.status === "stuck").length,
      checkOn: p.check_on, overdue: p.check_on < today,
      checkPending: !mine.some(t => t.kind === "check" && t.status === "done")
    });
  }
  return out;
}

export type PlanEvent = {
  planId: string; kind: string; note: string | null; createdAt: string;
};
export async function loadPlanEvents(client: SupabaseClient, studentId: string): Promise<PlanEvent[]> {
  const rows = await fetchAll<{ plan_id: string; kind: string; note: string | null; created_at: string }>(
    () => client.from("plan_events").select("plan_id,kind,note,created_at")
      .eq("student_id", studentId).order("created_at", { ascending: false }),
    "Plan geçmişi okunamadı");
  return rows.map(r => ({ planId: r.plan_id, kind: r.kind, note: r.note, createdAt: r.created_at }));
}

// ── Yazma ───────────────────────────────────────────────────────────────────

export type NewTask = Pick<Suggestion, "key" | "kind" | "title" | "why" | "owner" | "minutes"
  | "libraryItemId" | "dueOn" | "expectedOutput">;

const asJson = (t: NewTask) => ({
  kind: t.kind, title: t.title, why: t.why, owner: t.owner,
  minutes: t.minutes ?? "", due_on: t.dueOn ?? "",
  library_item_id: t.libraryItemId ?? "", expected_output: t.expectedOutput ?? "",
  source_key: t.key
});

/** Database refusals, in the words of the screen that caused them. */
export function friendly(message: string): string {
  if (message.includes("plans_one_open")) return "Bu öğrencinin zaten açık bir planı var.";
  if (message.includes("plan_tasks_once")) return "Bu görev planda zaten var.";
  if (message.includes("library_bookings_item_id_student_id_key"))
    return "Öğrenci bu etkinliğe zaten kayıtlı.";
  if (message.includes("row-level security") || message.includes("permission denied"))
    return "Bu öğrenci için yetkiniz yok.";
  return message;
}

export const defaultCheckOn = () => addDays(todayIso(), 7);

/** Plan ve ilk görevleri tek işlemde. Biri başarısız olursa hiçbiri yazılmaz. */
export async function openPlan(client: SupabaseClient, input: {
  studentId: string; checkOn: string; weeklyMinutes: number;
  periodEnd: string | null; tasks: NewTask[];
}): Promise<string> {
  const { data, error } = await client.rpc("open_plan", {
    p_student: input.studentId, p_check_on: input.checkOn,
    p_weekly_minutes: input.weeklyMinutes, p_period: input.periodEnd,
    p_tasks: input.tasks.map(asJson)
  });
  if (error) throw new Error(friendly(error.message));
  return data as string;
}

/** Görev ve — etkinlikse — yeri tek işlemde. Dolu etkinlik görevi de geri alır. */
export async function addTask(client: SupabaseClient, planId: string, task: NewTask): Promise<void> {
  const { error } = await client.rpc("add_plan_task", { p_plan: planId, p_task: asJson(task) });
  if (error) throw new Error(friendly(error.message));
}

export async function setTaskStatus(
  client: SupabaseClient, taskId: string, status: TaskStatus, note: string | null
): Promise<void> {
  const written = await client.from("plan_tasks")
    .update({ status, note }).eq("id", taskId).select("id");
  if (written.error) throw new Error(friendly(written.error.message));
  if (!written.data?.length) throw new Error("Bu görevi güncelleme yetkiniz yok.");
}

/** Only untouched work can be taken back; the database enforces it too. */
export async function removeTask(client: SupabaseClient, taskId: string): Promise<void> {
  const removed = await client.from("plan_tasks").delete().eq("id", taskId).select("id");
  if (removed.error) throw new Error(friendly(removed.error.message));
  if (!removed.data?.length) throw new Error("Yapılmış ya da takılmış bir görev plandan çıkarılamaz.");
}

export async function updatePlan(client: SupabaseClient, planId: string,
  patch: { checkOn?: string; weeklyMinutes?: number }): Promise<void> {
  const written = await client.from("plans").update({
    ...(patch.checkOn ? { check_on: patch.checkOn } : {}),
    ...(patch.weeklyMinutes ? { weekly_minutes: patch.weeklyMinutes } : {})
  }).eq("id", planId).eq("status", "open").select("id");
  if (written.error) throw new Error(friendly(written.error.message));
  if (!written.data?.length) throw new Error("Plan güncellenemedi.");
}

export async function closePlan(client: SupabaseClient, planId: string,
  actorId: string, note: string | null): Promise<void> {
  const written = await client.from("plans").update({
    status: "closed", closed_at: new Date().toISOString(), closed_by: actorId, close_note: note
  }).eq("id", planId).eq("status", "open").select("id");
  if (written.error) throw new Error(friendly(written.error.message));
  if (!written.data?.length) throw new Error("Plan kapatılamadı.");
}
