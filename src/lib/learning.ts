import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/paginate";
import {
  RUBRICS, RUBRIC_SCALE, RUBRIC_VERSION, type Criterion, type Skill
} from "@/lib/rubric";

/** Tarihli kanıt: ne ölçüldü, hangi görevde, hangi ölçütle, kim ölçtü.
 *
 *  student_measurements holds one current number per skill and overwrites it, so
 *  it can answer "how is this student's speaking" and nothing else. This module
 *  reads and writes the layer that answers the questions a plan depends on:
 *  which criterion, on which task, on which date, against which rubric — and
 *  therefore whether anything changed after the support was given.
 *
 *  Nothing here is derived from the summary scores. Manufacturing a per-criterion
 *  history out of a single stored "speaking: 22" would put invented evidence
 *  under a real plan, which is the one failure this whole layer exists to avoid.
 */
export type Objective = {
  id: string; level: string; skill: Skill; code: string; label: string;
  curriculumVersion: string; confirmed: boolean;
};
export type AssessmentScore = { code: string; label: string; score: number };
export type Assessment = {
  id: string; studentId: string; assessedOn: string; skill: Skill;
  objectiveId: string | null; taskLabel: string;
  rubricVersion: string; scaleMax: number;
  source: "teacher" | "import" | "sample"; note: string | null;
  scores: AssessmentScore[];
};

export async function loadObjectives(client: SupabaseClient): Promise<Objective[]> {
  const rows = await fetchAll<{ id: string; level: string; skill: string; code: string;
    label: string; curriculum_version: string; confirmed: boolean }>(
    () => client.from("learning_objectives")
      .select("id,level,skill,code,label,curriculum_version,confirmed")
      .eq("active", true).order("level").order("skill").order("code"),
    "Alt beceri kataloğu okunamadı");
  return rows.map(r => ({
    id: r.id, level: r.level, skill: r.skill as Skill, code: r.code, label: r.label,
    curriculumVersion: r.curriculum_version, confirmed: r.confirmed
  }));
}

/** Every dated assessment for a set of students, newest first.
 *
 *  Scores are fetched separately and stitched here rather than embedded: the two
 *  tables are linked by a plain foreign key, but reading them apart keeps one
 *  paged query per table instead of a nested select whose row cap applies to the
 *  join. */
export async function loadAssessments(
  client: SupabaseClient, studentIds: string[]
): Promise<Map<string, Assessment[]>> {
  const out = new Map<string, Assessment[]>();
  if (!studentIds.length) return out;
  const oops = "Beceri değerlendirmeleri okunamadı";
  const [events, scores] = await Promise.all([
    fetchAll<{ id: string; student_id: string; assessed_on: string; skill: string;
      objective_id: string | null; task_label: string; rubric_version: string;
      scale_max: number; source: string; note: string | null }>(
      () => client.from("skill_assessments")
        .select("id,student_id,assessed_on,skill,objective_id,task_label,rubric_version,scale_max,source,note")
        .in("student_id", studentIds).order("assessed_on", { ascending: false }), oops),
    fetchAll<{ assessment_id: string; criterion_code: string; criterion_label: string; score: number }>(
      () => client.from("skill_assessment_scores")
        .select("assessment_id,criterion_code,criterion_label,score")
        .in("student_id", studentIds), oops)
  ]);
  const byEvent = new Map<string, AssessmentScore[]>();
  for (const s of scores) {
    const list = byEvent.get(s.assessment_id) ?? byEvent.set(s.assessment_id, []).get(s.assessment_id)!;
    list.push({ code: s.criterion_code, label: s.criterion_label, score: Number(s.score) });
  }
  for (const e of events) {
    const row: Assessment = {
      id: e.id, studentId: e.student_id, assessedOn: e.assessed_on, skill: e.skill as Skill,
      objectiveId: e.objective_id, taskLabel: e.task_label, rubricVersion: e.rubric_version,
      scaleMax: Number(e.scale_max), source: e.source as Assessment["source"], note: e.note,
      scores: byEvent.get(e.id) ?? []
    };
    (out.get(row.studentId) ?? out.set(row.studentId, []).get(row.studentId)!).push(row);
  }
  return out;
}

export type CriterionTrend = Criterion & {
  latest: number | null; latestOn: string | null; latestTask: string | null;
  previous: number | null; previousOn: string | null;
  scaleMax: number;
  /** False when the only earlier reading was taken under a different rubric or
   *  scale. Two numbers from two rulers are two numbers, not a trend. */
  comparable: boolean;
  /** How many dated readings this criterion has. One is an observation; the
   *  product does not call it a deficit. */
  readings: number;
};

/** What is known about one skill, criterion by criterion.
 *
 *  A criterion nobody has assessed comes back with `latest: null` and stays
 *  that way. It is not scored as zero, not filled in from the summary number,
 *  and not quietly dropped — "ölçülmedi" is an answer the plan screen needs,
 *  because the right response to it is a short diagnostic task, not a week of
 *  practice aimed at a guess. */
export function criterionTrends(all: Assessment[], skill: Skill): CriterionTrend[] {
  const mine = all.filter(a => a.skill === skill)
    .sort((a, b) => b.assessedOn.localeCompare(a.assessedOn));
  return RUBRICS[skill].map(c => {
    const readings = mine
      .map(a => ({ a, hit: a.scores.find(s => s.code === c.code) }))
      .filter((x): x is { a: Assessment; hit: AssessmentScore } => x.hit !== undefined);
    const [first, ...rest] = readings;
    if (!first) return {
      ...c, latest: null, latestOn: null, latestTask: null, previous: null, previousOn: null,
      scaleMax: RUBRIC_SCALE, comparable: false, readings: 0
    };
    const earlier = rest.find(x =>
      x.a.rubricVersion === first.a.rubricVersion && x.a.scaleMax === first.a.scaleMax);
    return {
      ...c, latest: first.hit.score, latestOn: first.a.assessedOn, latestTask: first.a.taskLabel,
      previous: earlier?.hit.score ?? null, previousOn: earlier?.a.assessedOn ?? null,
      scaleMax: first.a.scaleMax, comparable: earlier !== undefined, readings: readings.length
    };
  });
}

export type NewAssessment = {
  studentId: string; assessedOn: string; skill: Skill; objectiveId: string | null;
  taskLabel: string; note: string | null;
  scores: { code: string; score: number }[];
};

/** Writes one dated assessment and its criterion scores.
 *
 *  Two statements rather than one, and the order matters: the event is written
 *  first so a failure half-way leaves an assessment with no scores — visible and
 *  correctable — rather than scores belonging to no assessment. There is no
 *  update path by design; see the migration.
 */
export async function recordAssessment(
  client: SupabaseClient, organizationId: string, input: NewAssessment
): Promise<{ id: string }> {
  const student = await client.from("students")
    .select("branch_id").eq("id", input.studentId).maybeSingle();
  if (student.error || !student.data) throw new Error("Öğrenci bulunamadı.");

  const labels = new Map(RUBRICS[input.skill].map(c => [c.code, c.label]));
  const scores = input.scores.filter(s => labels.has(s.code));
  if (!scores.length) throw new Error("En az bir ölçüt puanlanmalı.");

  const event = await client.from("skill_assessments").insert({
    organization_id: organizationId, branch_id: student.data.branch_id,
    student_id: input.studentId, assessed_on: input.assessedOn, skill: input.skill,
    objective_id: input.objectiveId, task_label: input.taskLabel,
    rubric_version: RUBRIC_VERSION, scale_max: RUBRIC_SCALE,
    source: "teacher", note: input.note
  }).select("id").single();
  if (event.error) throw new Error(event.error.message);

  const written = await client.from("skill_assessment_scores").insert(scores.map(s => ({
    assessment_id: event.data.id, organization_id: organizationId,
    branch_id: student.data!.branch_id, student_id: input.studentId,
    criterion_code: s.code, criterion_label: labels.get(s.code)!, score: s.score
  })));
  if (written.error) throw new Error(written.error.message);
  return { id: event.data.id as string };
}

export type Resource = {
  id: string; title: string; kind: string; level: string | null; skill: Skill | null;
  objectiveId: string | null; minutes: number; reference: string | null; isSample: boolean;
};
export async function loadResources(client: SupabaseClient): Promise<Resource[]> {
  const rows = await fetchAll<{ id: string; title: string; kind: string; level: string | null;
    skill: string | null; objective_id: string | null; minutes: number;
    reference: string | null; is_sample: boolean }>(
    () => client.from("learning_resources")
      .select("id,title,kind,level,skill,objective_id,minutes,reference,is_sample")
      .eq("active", true).order("title"),
    "İçerik kataloğu okunamadı");
  return rows.map(r => ({
    id: r.id, title: r.title, kind: r.kind, level: r.level, skill: r.skill as Skill | null,
    objectiveId: r.objective_id, minutes: Number(r.minutes),
    reference: r.reference, isSample: r.is_sample
  }));
}

export type Session = {
  id: string; branchId: string; title: string; kind: string; level: string | null;
  skill: Skill | null; startsAt: string; minutes: number; capacity: number;
  isSample: boolean; taken: number;
};
/** Sessions with the seats already held counted in.
 *
 *  `taken` counts reservations and attendance, never proposals: proposing a
 *  student for a session does not take a seat away from anyone, and treating it
 *  as though it did would make a half-empty session look full. */
export async function loadSessions(client: SupabaseClient, from: string): Promise<Session[]> {
  const rows = await fetchAll<{ id: string; branch_id: string; title: string; kind: string;
    level: string | null; skill: string | null; starts_at: string; minutes: number;
    capacity: number; is_sample: boolean }>(
    () => client.from("support_sessions")
      .select("id,branch_id,title,kind,level,skill,starts_at,minutes,capacity,is_sample")
      .eq("active", true).gte("starts_at", from).order("starts_at"),
    "Destek oturumları okunamadı");
  if (!rows.length) return [];
  const held = await fetchAll<{ session_id: string; status: string }>(
    () => client.from("session_participations").select("session_id,status")
      .in("session_id", rows.map(r => r.id)).in("status", ["reserved", "attended"]),
    "Oturum katılımları okunamadı");
  const taken = new Map<string, number>();
  for (const h of held) taken.set(h.session_id, (taken.get(h.session_id) ?? 0) + 1);
  return rows.map(r => ({
    id: r.id, branchId: r.branch_id, title: r.title, kind: r.kind, level: r.level,
    skill: r.skill as Skill | null, startsAt: r.starts_at, minutes: Number(r.minutes),
    capacity: Number(r.capacity), isSample: r.is_sample, taken: taken.get(r.id) ?? 0
  }));
}

export type Availability = { weeklyMinutes: number; days: string[]; recorded: boolean };
/** Absent means unknown, not unlimited: the default is stated as a default on
 *  screen so a teacher can see the plan was fitted to a number nobody confirmed. */
export const DEFAULT_AVAILABILITY: Availability = {
  weeklyMinutes: 120, days: ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"], recorded: false
};
export async function loadAvailability(
  client: SupabaseClient, studentIds: string[]
): Promise<Map<string, Availability>> {
  const out = new Map<string, Availability>();
  if (!studentIds.length) return out;
  const rows = await fetchAll<{ student_id: string; weekly_minutes: number; days: string[] }>(
    () => client.from("student_availability").select("student_id,weekly_minutes,days")
      .in("student_id", studentIds), "Öğrenci uygunluğu okunamadı");
  for (const r of rows) out.set(r.student_id, {
    weeklyMinutes: Number(r.weekly_minutes),
    days: Array.isArray(r.days) ? r.days : DEFAULT_AVAILABILITY.days,
    recorded: true
  });
  return out;
}
export const availabilityOf = (map: Map<string, Availability>, id: string) =>
  map.get(id) ?? DEFAULT_AVAILABILITY;
