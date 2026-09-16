import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/paginate";
import {
  RUBRICS, RUBRIC_SCALE, RUBRIC_VERSION, type Criterion, type Skill
} from "@/lib/rubric";

/** Ölçümler: ne gözlendi, hangi görevde, hangi ölçütle, ne zaman.
 *
 *  student_measurements holds one current number per skill and overwrites it, so
 *  it can answer "how is this student's speaking" and nothing else. This is the
 *  layer a plan is built from and a control measurement is compared against.
 *
 *  Nothing here is derived from the summary scores. Manufacturing a per-criterion
 *  history out of a single stored "speaking: 22" would put invented evidence
 *  under a real plan.
 */
export type Score = { code: string; label: string; score: number };
export type Assessment = {
  id: string; studentId: string; assessedOn: string; skill: Skill;
  taskLabel: string; rubricVersion: string; scaleMax: number;
  note: string | null; scores: Score[];
};

/** Every measurement for a set of students, newest first. */
export async function loadAssessments(
  client: SupabaseClient, studentIds: string[]
): Promise<Map<string, Assessment[]>> {
  const out = new Map<string, Assessment[]>();
  if (!studentIds.length) return out;
  const oops = "Ölçümler okunamadı";
  const [events, scores] = await Promise.all([
    fetchAll<{ id: string; student_id: string; assessed_on: string; skill: string;
      task_label: string; rubric_version: string; scale_max: number; note: string | null }>(
      () => client.from("skill_assessments")
        .select("id,student_id,assessed_on,skill,task_label,rubric_version,scale_max,note")
        .in("student_id", studentIds).order("assessed_on", { ascending: false }), oops),
    fetchAll<{ assessment_id: string; criterion_code: string; criterion_label: string; score: number }>(
      () => client.from("skill_assessment_scores")
        .select("assessment_id,criterion_code,criterion_label,score")
        .in("student_id", studentIds), oops)
  ]);
  const byEvent = new Map<string, Score[]>();
  for (const s of scores) {
    const list = byEvent.get(s.assessment_id) ?? byEvent.set(s.assessment_id, []).get(s.assessment_id)!;
    list.push({ code: s.criterion_code, label: s.criterion_label, score: Number(s.score) });
  }
  for (const e of events) {
    const row: Assessment = {
      id: e.id, studentId: e.student_id, assessedOn: e.assessed_on, skill: e.skill as Skill,
      taskLabel: e.task_label, rubricVersion: e.rubric_version, scaleMax: Number(e.scale_max),
      note: e.note, scores: byEvent.get(e.id) ?? []
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
  /** How many dated readings this criterion has. One is an observation, not a
   *  pattern, and nothing downstream calls it a deficit. */
  readings: number;
};

/** What is known about one skill, criterion by criterion.
 *
 *  An unmeasured criterion comes back with `latest: null` and stays that way —
 *  never zero, never filled in from the summary score. "Ölçülmedi" is an answer
 *  the plan needs, because the response to it is a measurement, not a guess. */
export function criterionTrends(all: Assessment[], skill: Skill): CriterionTrend[] {
  const mine = all.filter(a => a.skill === skill)
    .sort((a, b) => b.assessedOn.localeCompare(a.assessedOn));
  return RUBRICS[skill].map(c => {
    const readings = mine
      .map(a => ({ a, hit: a.scores.find(s => s.code === c.code) }))
      .filter((x): x is { a: Assessment; hit: Score } => x.hit !== undefined);
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
  studentId: string; assessedOn: string; skill: Skill;
  taskLabel: string; note: string | null;
  scores: { code: string; score: number }[];
};

/** Writes one measurement and its criterion scores.
 *
 *  The event is written first so a failure half-way leaves a measurement with no
 *  scores — visible and correctable — rather than scores that belong to nothing.
 *  There is no update path by design: a correction is a new measurement.
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
    task_label: input.taskLabel, rubric_version: RUBRIC_VERSION, scale_max: RUBRIC_SCALE,
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
