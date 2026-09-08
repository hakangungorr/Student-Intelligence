import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evidence, headline, steps, needsAction,
  type DimensionScores, type DimensionDetail, type Evidence, type Step
} from "@/lib/narrative";
import type { RiskLevel } from "@/lib/agenda";

export const SKILL_ORDER = ["speaking", "writing", "listening", "reading"] as const;
export const SKILL_LABEL: Record<string, string> = {
  speaking: "Konuşma", writing: "Yazma", listening: "Dinleme", reading: "Okuma"
};
export const PASS_MARK = 60;

export type StudentCard = {
  id: string; name: string; branch: string; level: string; teacher: string | null;
  riskLevel: RiskLevel; score: number; change: number | null;
  dimensions: DimensionScores; detail: DimensionDetail | null;
  reasons: string[]; found: Evidence[]; headline: string;
  steps: Step[]; needsAction: boolean;
  exams: { label: string; value: number }[];
  skills: { key: string; label: string; value: number }[];
  attendanceRate: number | null; attendanceRecent: number | null;
  satisfaction: number | null;
  benchmark: { exam: number; skill: number; cohort: number } | null;
};

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const BENCHMARK_QUANTILE = 0.25;

/** The engine sizes the top quarter with Python's round(), which breaks ties to
 *  the even number: a level of 18 takes its best 4, not 5. Math.round always goes
 *  up, which quietly widens the quarter and drags the benchmark down — 86.75 became
 *  86.4 for B2. Matched here so the screen and the score agree. */
function roundHalfToEven(n: number) {
  const floor = Math.floor(n);
  const rest = n - floor;
  if (rest !== 0.5) return Math.round(n);
  return floor % 2 === 0 ? floor : floor + 1;
}

/** The engine calibrates inside the level: the benchmark is the mean of that
 *  level's strongest quarter, never a threshold handed in from outside.
 *  Recomputed here rather than stored, so it tracks the data instead of drifting.
 *  A role that can only see part of the institution gets a benchmark over the part
 *  it can see — correct for an institution admin, narrower for a branch role. */
function benchmarks(cohort: Map<string, { exams: Map<string, number>; skills: Map<string, number> }>) {
  const examVals: number[] = [], skillVals: number[] = [];
  for (const r of cohort.values()) {
    const e3 = r.exams.get("exam_3"), e4 = r.exams.get("exam_4");
    if (e3 !== undefined && e4 !== undefined) examVals.push(mean([e3, e4]));
    const s = SKILL_ORDER.map(k => r.skills.get(k)).filter((v): v is number => v !== undefined);
    if (s.length === SKILL_ORDER.length) skillVals.push(mean(s));
  }
  if (!examVals.length || !skillVals.length) return null;
  const top = (v: number[]) => {
    const n = Math.max(1, roundHalfToEven(v.length * BENCHMARK_QUANTILE));
    return mean([...v].sort((a, b) => b - a).slice(0, n));
  };
  return { exam: top(examVals), skill: top(skillVals), cohort: cohort.size };
}

export async function loadStudent(client: SupabaseClient, id: string): Promise<StudentCard | null> {
  const [student, enrollments, branches, snapshots] = await Promise.all([
    client.from("students").select("id,name,branch_id,satisfaction_score").eq("id", id).maybeSingle(),
    client.from("enrollments").select("student_id,level,teacher_name").eq("active", true),
    client.from("branches").select("id,name"),
    client.from("risk_snapshots")
      .select("student_id,period_end,risk_score,risk_level,dimensions,dimension_detail,reasons,recommended_action")
      .eq("student_id", id).order("period_end", { ascending: false })
  ]);
  for (const r of [student, enrollments, branches, snapshots])
    if (r.error) throw new Error("Öğrenci kartı yüklenemedi.");
  if (!student.data || !snapshots.data?.length) return null;

  const mine = enrollments.data!.find(e => e.student_id === id);
  const level = (mine?.level as string) ?? "—";
  const cohortIds = enrollments.data!.filter(e => e.level === level).map(e => e.student_id as string);

  const readings = await client.from("student_measurements")
    .select("student_id,kind,source_reference,value")
    .in("student_id", cohortIds)
    .in("source_reference", ["exam_1", "exam_2", "exam_3", "exam_4", "skill_profile", "term_rate", "last_four_weeks"]);
  if (readings.error) throw new Error("Öğrenci kartı yüklenemedi.");

  const cohort = new Map<string, { exams: Map<string, number>; skills: Map<string, number> }>();
  const own = { term: null as number | null, recent: null as number | null };
  for (const m of readings.data) {
    const row = cohort.get(m.student_id)
      ?? cohort.set(m.student_id, { exams: new Map(), skills: new Map() }).get(m.student_id)!;
    if (m.kind === "exam") row.exams.set(m.source_reference, Number(m.value));
    else if (m.source_reference === "skill_profile") row.skills.set(m.kind, Number(m.value));
    else if (m.student_id === id) {
      if (m.source_reference === "term_rate") own.term = Number(m.value);
      else own.recent = Number(m.value);
    }
  }
  const me = cohort.get(id) ?? { exams: new Map(), skills: new Map() };

  const [now, before] = snapshots.data;
  const source = {
    dimensions: now.dimensions as DimensionScores,
    detail: now.dimension_detail as DimensionDetail | null,
    level,
    examFirst: me.exams.get("exam_1") ?? null,
    examLast: me.exams.get("exam_4") ?? null
  };
  const found = evidence(source);

  return {
    id, name: student.data.name, level,
    branch: branches.data!.find(b => b.id === student.data!.branch_id)?.name ?? "—",
    teacher: (mine?.teacher_name as string) ?? null,
    riskLevel: now.risk_level as RiskLevel, score: Number(now.risk_score),
    change: before ? Number(now.risk_score) - Number(before.risk_score) : null,
    dimensions: source.dimensions, detail: source.detail,
    reasons: (now.reasons as string[]) ?? [],
    found, headline: headline(source, found),
    steps: steps(now.recommended_action), needsAction: needsAction(now.recommended_action),
    exams: ["exam_1", "exam_2", "exam_3", "exam_4"]
      .map((k, i) => ({ label: `${i + 1}. sınav`, value: me.exams.get(k) ?? NaN }))
      .filter(e => Number.isFinite(e.value)),
    skills: SKILL_ORDER.map(k => ({ key: k, label: SKILL_LABEL[k], value: me.skills.get(k) ?? NaN }))
      .filter(s => Number.isFinite(s.value)),
    attendanceRate: own.term, attendanceRecent: own.recent,
    satisfaction: student.data.satisfaction_score,
    benchmark: benchmarks(cohort)
  };
}
