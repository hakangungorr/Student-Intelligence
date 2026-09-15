import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/paginate";
import {
  NEEDS_WORK_AT, SKILL_LABEL, SKILLS, addDays, dayOffsets, weekStartOf,
  type Skill, type TaskOwner, type TaskState
} from "@/lib/rubric";
import {
  availabilityOf, criterionTrends, loadAssessments, loadAvailability,
  loadResources, loadSessions, type Assessment, type Availability,
  type Resource, type Session
} from "@/lib/learning";
import type { DimensionScores } from "@/lib/narrative";

/** Kanıttan haftalık plana.
 *
 *  The rule this module is built around is that a need has to be able to name
 *  its evidence. Three kinds come out of it and they are deliberately not the
 *  same kind:
 *
 *   - `measured`   — a criterion assessed below the line more than once. The one
 *                    case where the product is willing to say a student needs
 *                    work on something.
 *   - `thin`       — assessed below the line exactly once. A single observation
 *                    is a day, not a pattern, so the week gets a light task and
 *                    a second measurement rather than a fortnight of drilling.
 *   - `unmeasured` — never assessed. This is not a weakness and is never written
 *                    as one; what it earns is a short diagnostic, because the
 *                    honest answer to "what should they practise" is "measure
 *                    first".
 *
 *  Everything the draft proposes is a proposal. A plan is not a plan until a
 *  teacher has approved it, and the approval queue leads with the drafts whose
 *  evidence is thin, whose resource could not be found, or whose minutes do not
 *  fit — the ones where a human has something to decide.
 */
export type NeedKind = "measured" | "thin" | "unmeasured" | "attendance" | "classroom";
export type Need = {
  kind: NeedKind;
  skill: Skill | null;
  criterion: string | null;
  label: string;
  /** The sentence a teacher reads to judge whether the need is real. Always the
   *  reading and its date, never a conclusion drawn from them. */
  evidence: string;
  objectiveId: string | null;
  priority: number;
};

export type DraftTask = {
  position: number; scheduledOn: string; title: string; why: string;
  objectiveId: string | null; resourceId: string | null; sessionId: string | null;
  minutes: number; owner: TaskOwner; expectedOutput: string; checkMethod: string;
};
export type Draft = {
  studentId: string; studentName: string; branchId: string; level: string;
  weekStart: string; minutesBudget: number; budgetRecorded: boolean;
  sourcePeriodEnd: string | null;
  needs: Need[]; tasks: DraftTask[];
  /** Why this draft needs a teacher's eye before anything else does. */
  problems: string[];
};

const PREP_MINUTES = 15, PRACTICE_MINUTES = 15, REASSESS_MINUTES = 15, REVIEW_MINUTES = 15;

/** Beceri başına, görevin ne olduğu ve neyle kontrol edileceği. */
const WORDING: Record<Skill, {
  prep: string; prepOutput: string;
  practice: string; practiceOutput: string;
  reassess: string; reassessOutput: string;
}> = {
  speaking: {
    prep: "Hedef yapı ve kelimelerle konuşma hazırlığı",
    prepOutput: "5 örnek cümle ve kısa bir anlatım taslağı",
    practice: "Kısa anlatma ve yeniden anlatma çalışması",
    practiceOutput: "İki kısa sözlü anlatım",
    reassess: "Farklı konuda kısa konuşma değerlendirmesi",
    reassessOutput: "Aynı ölçütlerle puanlanmış yeni konuşma görevi"
  },
  writing: {
    prep: "Örnek metin incelemesi ve plan çıkarma",
    prepOutput: "Paragraf planı ve bağlaç listesi",
    practice: "Kısa yazı ve düzeltme turu",
    practiceOutput: "Bir kısa yazı ve düzeltilmiş ikinci hâli",
    reassess: "Farklı konuda ikinci yazı değerlendirmesi",
    reassessOutput: "Aynı ölçütlerle puanlanmış yeni yazı"
  },
  listening: {
    prep: "Kayıt öncesi kelime ve bağlam hazırlığı",
    prepOutput: "Beklenen kelimeler ve tahmin notları",
    practice: "Seviyeye uygun dinleme ve yeniden anlatma",
    practiceOutput: "5 anlama sorusu ve sözlü özet",
    reassess: "Farklı kayıtta ayrıntı soruları",
    reassessOutput: "Aynı ölçütlerle puanlanmış yeni dinleme görevi"
  },
  reading: {
    prep: "Metin öncesi kelime çalışması",
    prepOutput: "Anahtar kelimeler ve tahmin notları",
    practice: "Seviyeye uygun okuma ve özetleme",
    practiceOutput: "Kısa yazılı özet ve 5 soru",
    reassess: "Farklı metinde ikinci okuma değerlendirmesi",
    reassessOutput: "Aynı ölçütlerle puanlanmış yeni okuma görevi"
  }
};

/** Bir öğrencinin bu hafta neye ihtiyacı olduğu, kanıtıyla birlikte. */
export function needsOf(
  assessments: Assessment[], dimensions: DimensionScores, attendanceRate: number | null,
  attendanceFloor: number
): Need[] {
  const out: Need[] = [];
  for (const skill of SKILLS) {
    for (const t of criterionTrends(assessments, skill)) {
      if (t.latest === null) continue;              // unmeasured is handled below, per skill
      if (t.latest > NEEDS_WORK_AT) continue;
      const reading = `${t.latestOn} · ${t.latestTask} · ${t.latest}/${t.scaleMax}`;
      const thin = t.readings < 2;
      out.push({
        kind: thin ? "thin" : "measured", skill, criterion: t.code,
        label: `${SKILL_LABEL[skill]} — ${t.label}`,
        evidence: thin
          ? `Tek ölçüm: ${reading}. Bir ölçümden kesin eksiklik çıkarılmıyor; ikinci ölçüm planlandı.`
          : `${t.readings} ölçüm, en yenisi ${reading}`
          + (t.previous !== null ? ` (önceki ${t.previous}/${t.scaleMax}, ${t.previousOn})` : ""),
        objectiveId: null,
        // Weakest first, and a single reading always yields to a repeated one:
        // the product acts hardest where it knows most.
        priority: (thin ? 100 : 0) + t.latest * 10
      });
    }
  }
  for (const skill of SKILLS) {
    if (assessments.some(a => a.skill === skill)) continue;
    out.push({
      kind: "unmeasured", skill, criterion: null,
      label: `${SKILL_LABEL[skill]} — ölçülmedi`,
      evidence: `${SKILL_LABEL[skill]} için tarihli değerlendirme yok. Bu bir zayıflık kaydı değil; `
        + "ihtiyaç üretilmeden önce kısa bir tanılama gerekiyor.",
      objectiveId: null, priority: 300
    });
  }
  if (attendanceRate !== null && attendanceRate < attendanceFloor) out.push({
    kind: "attendance", skill: null, criterion: null, label: "Devam",
    evidence: `Devam oranı %${attendanceRate}, kurumun sınırı %${attendanceFloor}.`,
    objectiveId: null, priority: -100
  });
  if ((dimensions.classroom ?? 0) >= 50) out.push({
    kind: "classroom", skill: null, criterion: null, label: "Derse hazırlık",
    evidence: `Sınıf içi göstergeler ${dimensions.classroom} (0–100, yüksek = sorunlu).`,
    objectiveId: null, priority: -50
  });
  return out.sort((a, b) => a.priority - b.priority);
}

const pickResource = (resources: Resource[], skill: Skill, level: string) => {
  const fit = resources.filter(r => r.skill === skill && (r.level === null || r.level === level));
  // A confirmed resource beats a sample of the same shape; nothing here invents
  // one when the catalogue is empty.
  return fit.find(r => !r.isSample) ?? fit[0] ?? null;
};
const pickSession = (sessions: Session[], skill: Skill, level: string, branchId: string,
  weekStart: string, used: Set<string>) =>
  sessions.find(s => s.branchId === branchId && !used.has(s.id)
    && (s.skill === null || s.skill === skill)
    && (s.level === null || s.level === level)
    && s.startsAt.slice(0, 10) >= weekStart && s.startsAt.slice(0, 10) < addDays(weekStart, 7)
    && s.taken < s.capacity) ?? null;

/** Bir öğrenci için haftalık taslak. */
export function draftFor(input: {
  studentId: string; studentName: string; branchId: string; level: string;
  weekStart: string; availability: Availability; sourcePeriodEnd: string | null;
  assessments: Assessment[]; dimensions: DimensionScores;
  attendanceRate: number | null; attendanceFloor: number;
  resources: Resource[]; sessions: Session[];
}): Draft {
  const needs = needsOf(input.assessments, input.dimensions,
    input.attendanceRate, input.attendanceFloor);
  const budget = input.availability.weeklyMinutes;
  const problems: string[] = [];
  const tasks: DraftTask[] = [];
  const usedSessions = new Set<string>();
  let day = 0, spent = 0;

  // The closing review is reserved out of the budget before anything competes
  // for it: a week of work nobody looks at afterwards produces no evidence, and
  // evidence is the only thing that makes the next plan better than this one.
  const reserved = REVIEW_MINUTES;
  const room = (minutes: number) => spent + minutes <= budget - reserved;
  // Tasks land on the days the institution recorded the student as available.
  // A plan that schedules work for a day somebody cannot study is a plan that
  // gets ignored, and then the week's evidence is missing for a reason nobody
  // wrote down.
  const days = dayOffsets(input.availability.days);
  const add = (t: Omit<DraftTask, "position" | "scheduledOn">) => {
    tasks.push({
      ...t, position: tasks.length + 1,
      scheduledOn: addDays(input.weekStart, days[day % days.length])
    });
    spent += t.minutes; day++;
  };

  if (!needs.length) problems.push("Bu öğrenci için kanıta dayalı bir ihtiyaç bulunamadı.");

  for (const need of needs) {
    if (need.kind === "attendance") {
      if (!room(PREP_MINUTES)) continue;
      add({
        title: "Öğrenci ilişkileri görüşmesi", why: need.evidence,
        objectiveId: null, resourceId: null, sessionId: null,
        minutes: PREP_MINUTES, owner: "student_relations",
        expectedOutput: "Devamsızlığın nedeni ve öğrenciye uyan saat aralığı",
        checkMethod: "Sonraki dört haftanın katılım kaydı — beceri gelişimi ayrıca ölçülür"
      });
      continue;
    }
    if (need.kind === "classroom") {
      if (!room(PREP_MINUTES)) continue;
      add({
        title: "Sonraki derse kısa hazırlık", why: need.evidence,
        objectiveId: null, resourceId: null, sessionId: null,
        minutes: PREP_MINUTES, owner: "student",
        expectedOutput: "Dersin konusuna ait hazırlık notu",
        checkMethod: "Ders içi gözlem"
      });
      continue;
    }
    const skill = need.skill!;
    if (need.kind === "unmeasured") {
      if (!room(PREP_MINUTES)) continue;
      add({
        title: `Kısa tanılama görevi — ${SKILL_LABEL[skill].toLocaleLowerCase("tr")}`,
        why: need.evidence, objectiveId: need.objectiveId, resourceId: null, sessionId: null,
        minutes: PREP_MINUTES, owner: "teacher",
        expectedOutput: "Ölçütlere göre puanlanmış ilk değerlendirme",
        checkMethod: "Beceri profilinde tarihli kayıt olarak görünmesi"
      });
      continue;
    }

    const words = WORDING[skill];
    const resource = pickResource(input.resources, skill, input.level);
    if (!resource) problems.push(
      `${SKILL_LABEL[skill]} için ${input.level} kuruna uygun içerik katalogda yok.`);
    else if (resource.isSample) problems.push(
      `${SKILL_LABEL[skill]} için önerilen içerik örnek kayıt: "${resource.title}".`);

    if (room(PREP_MINUTES)) add({
      title: words.prep, why: need.evidence, objectiveId: need.objectiveId,
      resourceId: resource?.id ?? null, sessionId: null,
      minutes: PREP_MINUTES, owner: "student",
      expectedOutput: words.prepOutput, checkMethod: "Eğitmen ders öncesi hazırlığı görür"
    });

    const session = pickSession(input.sessions, skill, input.level, input.branchId,
      input.weekStart, usedSessions);
    if (session && room(session.minutes)) {
      usedSessions.add(session.id);
      add({
        title: session.title, why: `${need.evidence} Bu oturum ${SKILL_LABEL[skill].toLocaleLowerCase("tr")} `
          + "için uygun görünüyor.", objectiveId: need.objectiveId,
        resourceId: null, sessionId: session.id,
        minutes: session.minutes, owner: "student",
        expectedOutput: "Oturumda eğitmen eşliğinde uygulama",
        checkMethod: "Katılım kaydı ve eğitmenin kısa gözlemi"
      });
    } else if (!session) problems.push(
      `${SKILL_LABEL[skill]} için bu hafta uygun ve yeri olan destek oturumu bulunamadı.`);

    if (need.kind === "measured" && room(PRACTICE_MINUTES)) add({
      title: resource ? resource.title : words.practice, why: need.evidence,
      objectiveId: need.objectiveId, resourceId: resource?.id ?? null, sessionId: null,
      minutes: resource?.minutes ?? PRACTICE_MINUTES, owner: "student",
      expectedOutput: words.practiceOutput, checkMethod: "Eğitmen çıktıyı görür"
    });

    if (room(REASSESS_MINUTES)) add({
      title: words.reassess,
      why: "Aynı alt beceri, benzer zorluk ve aynı ölçütlerle yeniden ölçülmeden gelişme "
        + "iddia edilemez.", objectiveId: need.objectiveId, resourceId: null, sessionId: null,
      minutes: REASSESS_MINUTES, owner: "teacher",
      expectedOutput: words.reassessOutput,
      checkMethod: `Aynı ölçüt (${need.label}) ile tarihli yeni değerlendirme`
    });
  }

  if (tasks.length) add({
    title: "Geri bildirim ve sonraki haftanın planı",
    why: "Yapılan çalışma ile ölçülen değişimin ayrı ayrı gözden geçirilmesi.",
    objectiveId: null, resourceId: null, sessionId: null,
    minutes: REVIEW_MINUTES, owner: "teacher",
    expectedOutput: "Sürecek ve değişecek görevlerin kararı",
    checkMethod: "Sonraki haftanın planına yazılması"
  });

  if (spent > budget) problems.push(
    `Plan ${spent} dakika, öğrencinin haftalık bütçesi ${budget} dakika.`);
  if (!input.availability.recorded) problems.push(
    "Öğrencinin haftalık çalışma kapasitesi girilmemiş; varsayılan 120 dakikaya göre hesaplandı.");
  if (!tasks.some(t => t.checkMethod.includes("ölçüt")) && needs.some(n => n.skill))
    problems.push("Planda yeniden değerlendirme görevi yok.");

  return {
    studentId: input.studentId, studentName: input.studentName, branchId: input.branchId,
    level: input.level, weekStart: input.weekStart, minutesBudget: budget,
    budgetRecorded: input.availability.recorded, sourcePeriodEnd: input.sourcePeriodEnd,
    needs, tasks, problems
  };
}

export type StoredTask = DraftTask & {
  id: string; status: TaskState;
  resourceTitle: string | null; resourceIsSample: boolean;
  sessionTitle: string | null; sessionStartsAt: string | null; sessionIsSample: boolean;
  participation: string | null;
};
export type StoredPlan = {
  id: string; studentId: string; studentName: string; branch: string; level: string;
  weekStart: string; version: number; status: "draft" | "approved" | "archived";
  minutesBudget: number; sourcePeriodEnd: string | null; needs: Need[]; note: string | null;
  approvedAt: string | null; tasks: StoredTask[];
};

const planColumns = "id,student_id,week_start,version,status,minutes_budget,source_period_end,basis,note,approved_at";

export async function loadPlans(
  client: SupabaseClient, filter: { id?: string; status?: string; studentId?: string } = {}
): Promise<StoredPlan[]> {
  const oops = "Çalışma planları okunamadı";
  const plans = await fetchAll<{ id: string; student_id: string; week_start: string;
    version: number; status: string; minutes_budget: number; source_period_end: string | null;
    basis: Need[]; note: string | null; approved_at: string | null }>(
    () => {
      let q = client.from("study_plans").select(planColumns);
      if (filter.id) q = q.eq("id", filter.id);
      if (filter.status) q = q.eq("status", filter.status);
      if (filter.studentId) q = q.eq("student_id", filter.studentId);
      return q.order("week_start", { ascending: false }).order("version", { ascending: false });
    }, oops);
  if (!plans.length) return [];

  const planIds = plans.map(p => p.id);
  const studentIds = [...new Set(plans.map(p => p.student_id))];
  const [tasks, students, enrollments, branches] = await Promise.all([
    fetchAll<{ id: string; plan_id: string; position: number; scheduled_on: string; title: string;
      why: string; objective_id: string | null; resource_id: string | null; session_id: string | null;
      minutes: number; owner: string; expected_output: string; check_method: string; status: string }>(
      () => client.from("study_tasks")
        .select("id,plan_id,position,scheduled_on,title,why,objective_id,resource_id,session_id,minutes,owner,expected_output,check_method,status")
        .in("plan_id", planIds).order("position"), oops),
    fetchAll<{ id: string; name: string; branch_id: string }>(
      () => client.from("students").select("id,name,branch_id").in("id", studentIds), oops),
    fetchAll<{ student_id: string; level: string }>(
      () => client.from("enrollments").select("student_id,level")
        .in("student_id", studentIds).eq("active", true), oops),
    fetchAll<{ id: string; name: string }>(() => client.from("branches").select("id,name"), oops)
  ]);

  const resourceIds = [...new Set(tasks.map(t => t.resource_id).filter((v): v is string => !!v))];
  const sessionIds = [...new Set(tasks.map(t => t.session_id).filter((v): v is string => !!v))];
  const [resources, sessions, participations] = await Promise.all([
    resourceIds.length ? fetchAll<{ id: string; title: string; is_sample: boolean }>(
      () => client.from("learning_resources").select("id,title,is_sample").in("id", resourceIds), oops)
      : Promise.resolve([]),
    sessionIds.length ? fetchAll<{ id: string; title: string; starts_at: string; is_sample: boolean }>(
      () => client.from("support_sessions").select("id,title,starts_at,is_sample").in("id", sessionIds), oops)
      : Promise.resolve([]),
    sessionIds.length ? fetchAll<{ session_id: string; student_id: string; status: string }>(
      () => client.from("session_participations").select("session_id,student_id,status")
        .in("session_id", sessionIds).in("student_id", studentIds), oops)
      : Promise.resolve([])
  ]);
  const resourceOf = new Map(resources.map(r => [r.id, r]));
  const sessionOf = new Map(sessions.map(s => [s.id, s]));
  const partOf = new Map(participations.map(p => [`${p.session_id}:${p.student_id}`, p.status]));
  const studentOf = new Map(students.map(s => [s.id, s]));
  const levelOf = new Map(enrollments.map(e => [e.student_id, e.level]));
  const branchOf = new Map(branches.map(b => [b.id, b.name]));

  const tasksOf = new Map<string, StoredTask[]>();
  for (const t of tasks) {
    const plan = plans.find(p => p.id === t.plan_id)!;
    const resource = t.resource_id ? resourceOf.get(t.resource_id) : undefined;
    const session = t.session_id ? sessionOf.get(t.session_id) : undefined;
    const row: StoredTask = {
      id: t.id, position: Number(t.position), scheduledOn: t.scheduled_on, title: t.title,
      why: t.why, objectiveId: t.objective_id, resourceId: t.resource_id,
      sessionId: t.session_id, minutes: Number(t.minutes), owner: t.owner as TaskOwner,
      expectedOutput: t.expected_output, checkMethod: t.check_method, status: t.status as TaskState,
      resourceTitle: resource?.title ?? null, resourceIsSample: resource?.is_sample ?? false,
      sessionTitle: session?.title ?? null, sessionStartsAt: session?.starts_at ?? null,
      sessionIsSample: session?.is_sample ?? false,
      participation: t.session_id ? partOf.get(`${t.session_id}:${plan.student_id}`) ?? null : null
    };
    (tasksOf.get(t.plan_id) ?? tasksOf.set(t.plan_id, []).get(t.plan_id)!).push(row);
  }

  return plans.map(p => ({
    id: p.id, studentId: p.student_id,
    studentName: studentOf.get(p.student_id)?.name ?? "—",
    branch: branchOf.get(studentOf.get(p.student_id)?.branch_id ?? "") ?? "—",
    level: levelOf.get(p.student_id) ?? "—",
    weekStart: p.week_start, version: Number(p.version),
    status: p.status as StoredPlan["status"], minutesBudget: Number(p.minutes_budget),
    sourcePeriodEnd: p.source_period_end, needs: Array.isArray(p.basis) ? p.basis : [],
    note: p.note, approvedAt: p.approved_at, tasks: tasksOf.get(p.id) ?? []
  }));
}

/** Writes a draft as a new version of that student's week.
 *
 *  An approved plan is never edited in place: the live version is archived and
 *  this one takes its place with the next version number, so "what was approved
 *  on Monday" survives Thursday's rewrite. The partial unique index in the
 *  migration is what makes that a rule rather than a habit.
 */
export async function saveDraft(
  client: SupabaseClient, organizationId: string, draft: Draft
): Promise<{ id: string }> {
  const live = await client.from("study_plans")
    .select("id,version").eq("student_id", draft.studentId).eq("week_start", draft.weekStart)
    .neq("status", "archived").order("version", { ascending: false }).limit(1).maybeSingle();
  if (live.error) throw new Error(`Mevcut plan okunamadı: ${live.error.message}`);
  if (live.data) {
    const archived = await client.from("study_plans")
      .update({ status: "archived" }).eq("id", live.data.id);
    if (archived.error) throw new Error(`Önceki sürüm arşivlenemedi: ${archived.error.message}`);
  }

  const plan = await client.from("study_plans").insert({
    organization_id: organizationId, branch_id: draft.branchId, student_id: draft.studentId,
    week_start: draft.weekStart, version: (Number(live.data?.version) || 0) + 1,
    status: "draft", minutes_budget: draft.minutesBudget,
    source_period_end: draft.sourcePeriodEnd, basis: draft.needs
  }).select("id").single();
  if (plan.error) throw new Error(`Plan yazılamadı: ${plan.error.message}`);

  if (draft.tasks.length) {
    const written = await client.from("study_tasks").insert(draft.tasks.map(t => ({
      plan_id: plan.data.id, organization_id: organizationId, branch_id: draft.branchId,
      student_id: draft.studentId, position: t.position, scheduled_on: t.scheduledOn,
      title: t.title, why: t.why, objective_id: t.objectiveId, resource_id: t.resourceId,
      session_id: t.sessionId, minutes: t.minutes, owner: t.owner,
      expected_output: t.expectedOutput, check_method: t.checkMethod
    })));
    if (written.error) throw new Error(`Görevler yazılamadı: ${written.error.message}`);
  }

  // Proposed, not reserved. Proposing costs nobody a seat; the seat is taken at
  // approval, which is also where a full session has to be able to say no.
  const sessionTasks = draft.tasks.filter(t => t.sessionId);
  for (const t of sessionTasks) {
    const existing = await client.from("session_participations").select("id")
      .eq("session_id", t.sessionId!).eq("student_id", draft.studentId).maybeSingle();
    if (existing.data) continue;
    await client.from("session_participations").insert({
      session_id: t.sessionId, organization_id: organizationId, branch_id: draft.branchId,
      student_id: draft.studentId, status: "proposed"
    });
  }
  return { id: plan.data.id as string };
}

export type ApprovalResult = { ok: true } | { ok: false; message: string; alternatives: string[] };

/** Onay: planı sabitler ve önerilen oturumlarda gerçekten yer ayırır.
 *
 *  The reservation is what can fail, and it has to be allowed to. A session that
 *  filled up between drafting and approval must not quietly turn into a student
 *  who appears to be attending it — so the plan stays a draft, the teacher is
 *  told which session and what else is free, and nothing on any screen claims a
 *  booking that does not exist.
 */
export async function approvePlan(
  client: SupabaseClient, planId: string, actorId: string
): Promise<ApprovalResult> {
  const plan = await client.from("study_plans")
    .select("id,organization_id,student_id,branch_id,week_start,status").eq("id", planId).maybeSingle();
  if (plan.error || !plan.data) return { ok: false, message: "Plan bulunamadı.", alternatives: [] };
  const { organization_id: org, branch_id: branch, student_id: student, week_start: week } = plan.data;
  if (plan.data.status === "approved") return { ok: true };

  const tasks = await client.from("study_tasks").select("session_id")
    .eq("plan_id", planId).not("session_id", "is", null);
  if (tasks.error) return { ok: false, message: "Görevler okunamadı.", alternatives: [] };

  /** The capacity trigger raises its own sentence; anything else is a different
   *  failure and must not be reported as a full session. Telling a teacher to go
   *  and find another slot when the real problem was a permission would send
   *  them looking for a problem that is not there. */
  const refused = async (sessionId: string, error: { message: string }): Promise<ApprovalResult> => {
    if (!error.message.includes("yer kalmadı")) return {
      ok: false, message: `Oturumda yer ayrılamadı: ${error.message}`, alternatives: []
    };
    const full = await client.from("support_sessions")
      .select("title").eq("id", sessionId).maybeSingle();
    return {
      ok: false,
      message: `"${full.data?.title ?? "Destek oturumu"}" oturumunda yer kalmadı, plan onaylanmadı. `
        + "Görevdeki oturumu değiştirip yeniden onaylayın.",
      alternatives: await freeSessions(client, branch, week)
    };
  };

  for (const t of tasks.data ?? []) {
    const held = await client.from("session_participations")
      .update({ status: "reserved", updated_at: new Date().toISOString() })
      .eq("session_id", t.session_id).eq("student_id", student).select("id");
    if (held.error) return refused(t.session_id as string, held.error);
    if (held.data?.length) continue;
    const inserted = await client.from("session_participations").insert({
      session_id: t.session_id, organization_id: org, branch_id: branch,
      student_id: student, status: "reserved"
    });
    if (inserted.error) return refused(t.session_id as string, inserted.error);
  }

  const done = await client.from("study_plans").update({
    status: "approved", approved_by: actorId, approved_at: new Date().toISOString()
  }).eq("id", planId).select("id");
  if (done.error) return { ok: false, message: `Onaylanamadı: ${done.error.message}`, alternatives: [] };
  if (!done.data?.length) return {
    ok: false, message: "Bu planı onaylama yetkiniz yok.", alternatives: []
  };
  return { ok: true };
}

async function freeSessions(client: SupabaseClient, branchId: string, weekStart: string) {
  const sessions = await loadSessions(client, weekStart);
  return sessions
    .filter(s => s.branchId === branchId && s.taken < s.capacity
      && s.startsAt.slice(0, 10) < addDays(weekStart, 14))
    .slice(0, 5)
    .map(s => `${s.title} · ${s.startsAt.slice(0, 10)} · ${s.capacity - s.taken} yer`);
}

/** Görev durumu ve olayı birlikte yazılır: durum bugünü, olay geçmişi taşır. */
export async function setTaskStatus(
  client: SupabaseClient, taskId: string, status: TaskState, note: string | null
): Promise<void> {
  const task = await client.from("study_tasks")
    .select("id,organization_id,branch_id,student_id,status").eq("id", taskId).maybeSingle();
  if (task.error || !task.data) throw new Error("Görev bulunamadı.");

  const written = await client.from("study_tasks")
    .update({ status, updated_at: new Date().toISOString() }).eq("id", taskId).select("id");
  if (written.error) throw new Error(written.error.message);
  if (!written.data?.length) throw new Error("Bu görevi güncelleme yetkiniz yok.");

  // The event is what happened, not a tidy synonym for it: recording a
  // cancellation as a reopening would put a sentence in the audit trail that is
  // simply not true of the task.
  const kind = status === "open" ? "reopened" : status;
  await client.from("task_events").insert({
    task_id: taskId, organization_id: task.data.organization_id,
    branch_id: task.data.branch_id, student_id: task.data.student_id,
    kind, note
  });
}

export type TaskEvent = {
  taskId: string; kind: string; note: string | null; createdAt: string;
};
export async function loadTaskEvents(
  client: SupabaseClient, studentId: string
): Promise<TaskEvent[]> {
  const rows = await fetchAll<{ task_id: string; kind: string; note: string | null; created_at: string }>(
    () => client.from("task_events").select("task_id,kind,note,created_at")
      .eq("student_id", studentId).order("created_at", { ascending: false }),
    "Çalışma geçmişi okunamadı");
  return rows.map(r => ({ taskId: r.task_id, kind: r.kind, note: r.note, createdAt: r.created_at }));
}

/** Bir öğrenci için taslak üretmek üzere gereken her şeyi toplar. */
export async function draftInputs(
  client: SupabaseClient, studentIds: string[], weekStart: string
) {
  const [assessments, availability, resources, sessions] = await Promise.all([
    loadAssessments(client, studentIds),
    loadAvailability(client, studentIds),
    loadResources(client),
    loadSessions(client, weekStart)
  ]);
  return {
    assessmentsOf: (id: string) => assessments.get(id) ?? [],
    availabilityFor: (id: string) => availabilityOf(availability, id),
    resources, sessions
  };
}

export const thisWeek = () => weekStartOf(new Date().toISOString().slice(0, 10));

/** Bir sınıf için taslakları toplu üretir.
 *
 *  Scoped to a level, and usually a branch, because that is how the work
 *  arrives: a teacher plans a class, not an institution. Students who already
 *  have a live plan for the week are left alone — regenerating over an approved
 *  plan would be exactly the silent rewrite the versioning exists to prevent.
 */
export async function buildDrafts(
  client: SupabaseClient,
  opts: { level: string; branchId: string | null; weekStart: string; attendanceFloor: number; limit: number }
): Promise<Draft[]> {
  const oops = "Plan için öğrenci verisi okunamadı";
  const enrollments = await fetchAll<{ student_id: string; level: string }>(
    () => client.from("enrollments").select("student_id,level")
      .eq("active", true).eq("level", opts.level), oops);
  if (!enrollments.length) return [];
  const ids = enrollments.map(e => e.student_id);

  const students = await fetchAll<{ id: string; name: string; branch_id: string }>(
    () => client.from("students").select("id,name,branch_id").eq("active", true).in("id", ids), oops);
  const wanted = students.filter(s => !opts.branchId || s.branch_id === opts.branchId);
  if (!wanted.length) return [];
  const wantedIds = wanted.map(s => s.id);

  const [snapshots, attendance, live, inputs] = await Promise.all([
    fetchAll<{ student_id: string; period_end: string; dimensions: DimensionScores }>(
      () => client.from("risk_snapshots").select("student_id,period_end,dimensions")
        .in("student_id", wantedIds).order("period_end", { ascending: false }), oops),
    fetchAll<{ student_id: string; value: number }>(
      () => client.from("student_measurements").select("student_id,value")
        .in("student_id", wantedIds).eq("source_reference", "term_rate"), oops),
    fetchAll<{ student_id: string }>(
      () => client.from("study_plans").select("student_id")
        .in("student_id", wantedIds).eq("week_start", opts.weekStart).neq("status", "archived"), oops),
    draftInputs(client, wantedIds, opts.weekStart)
  ]);

  const newest = new Map<string, { period_end: string; dimensions: DimensionScores }>();
  for (const s of snapshots) if (!newest.has(s.student_id)) newest.set(s.student_id, s);
  const rate = new Map(attendance.map(a => [a.student_id, Number(a.value)]));
  const planned = new Set(live.map(p => p.student_id));

  const drafts: Draft[] = [];
  for (const s of wanted) {
    if (planned.has(s.id)) continue;
    if (drafts.length >= opts.limit) break;
    const snap = newest.get(s.id);
    const draft = draftFor({
      studentId: s.id, studentName: s.name, branchId: s.branch_id, level: opts.level,
      weekStart: opts.weekStart, availability: inputs.availabilityFor(s.id),
      sourcePeriodEnd: snap?.period_end ?? null,
      assessments: inputs.assessmentsOf(s.id), dimensions: snap?.dimensions ?? {},
      attendanceRate: rate.get(s.id) ?? null, attendanceFloor: opts.attendanceFloor,
      resources: inputs.resources, sessions: inputs.sessions
    });
    // A student with nothing to act on does not get an empty plan on somebody's
    // approval queue; an empty queue row is work with no decision in it.
    if (draft.tasks.length) drafts.push(draft);
  }
  return drafts;
}

/** Kaydedilmiş bir planın hâlâ açık olan sorunları.
 *
 *  Recomputed from the stored plan rather than carried from the draft: a session
 *  can fill up, a sample resource can be confirmed, and the queue has to reflect
 *  what is true now. */
export function planProblems(plan: StoredPlan): string[] {
  const out: string[] = [];
  const live = plan.tasks.filter(t => t.status !== "cancelled");
  const minutes = live.reduce((t, x) => t + x.minutes, 0);
  if (minutes > plan.minutesBudget) out.push(
    `Plan ${minutes} dakika, öğrencinin haftalık bütçesi ${plan.minutesBudget} dakika.`);
  if (plan.needs.some(n => n.kind === "thin")) out.push(
    "Bazı ihtiyaçlar tek ölçüme dayanıyor; plan ikinci bir ölçüm içeriyor.");
  if (plan.needs.some(n => n.kind === "unmeasured")) out.push(
    "Ölçülmemiş beceri var; önce kısa tanılama öneriliyor.");
  if (live.some(t => t.resourceIsSample || t.sessionIsSample)) out.push(
    "Planda örnek içerik veya örnek oturum var — kurumun doğrulanmış kaydı değil.");
  if (live.some(t => t.title && !t.resourceId && !t.sessionId && t.owner === "student"
    && t.checkMethod.includes("çıktıyı"))) out.push(
    "Bazı öğrenci görevleri bir kaynağa bağlı değil.");
  if (!live.some(t => t.checkMethod.includes("ölçüt")) && plan.needs.some(n => n.skill))
    out.push("Planda yeniden değerlendirme görevi yok.");
  return out;
}
