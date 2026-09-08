import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreAll, ENGINE_VERSION, type Measures } from "@/lib/engine";
import { fetchAll } from "@/lib/paginate";

/** Scores everyone the signed-in administrator can see and stores the result.
 *
 *  Institution-wide by necessity: the benchmark for a level is the mean of that
 *  level's strongest quarter, so scoring a subset would measure students against
 *  the subset. The database enforces the same thing — only an institution admin
 *  may write snapshots.
 */
export type ScoringResult = {
  scored: number; created: number; updated: number;
  skipped: { externalId: string; reason: string }[];
  periodEnd: string;
};

type Observation = { student_id: string; participation: number | null;
  homework_completion: number | null; teacher_concern: boolean | null };

const EXAMS = ["exam_1", "exam_2", "exam_3", "exam_4"];
const SKILLS = ["speaking", "writing", "listening", "reading"] as const;

export async function scoreInstitution(
  client: SupabaseClient, organizationId: string, periodEnd: string
): Promise<ScoringResult> {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

  const [students, enrollments, readings, observations] = await Promise.all([
    fetchAll<{ id: string; external_id: string; branch_id: string }>(
      () => client.from("students").select("id,external_id,branch_id").eq("active", true),
      "Öğrenciler okunamadı"),
    fetchAll<{ student_id: string; level: string }>(
      () => client.from("enrollments").select("student_id,level").eq("active", true),
      "Kur kayıtları okunamadı"),
    fetchAll<{ student_id: string; kind: string; source_reference: string; value: number }>(
      () => client.from("student_measurements").select("student_id,kind,source_reference,value"),
      "Ölçümler okunamadı"),
    fetchAll<Observation & { observed_on: string }>(
      () => client.from("classroom_observations")
        .select("student_id,observed_on,participation,homework_completion,teacher_concern")
        .order("observed_on", { ascending: false }),
      "Gözlemler okunamadı")
  ]);

  const level = new Map(enrollments.map(e => [e.student_id, e.level]));
  const byStudent = new Map<string, Map<string, number>>();
  for (const m of readings) {
    const row = byStudent.get(m.student_id) ?? byStudent.set(m.student_id, new Map()).get(m.student_id)!;
    row.set(m.kind === "exam" || m.kind === "attendance" ? m.source_reference : m.kind, Number(m.value));
  }
  // Ordered newest first, so the first sighting of a student is their latest.
  const latestObservation = new Map<string, Observation>();
  for (const o of observations) if (!latestObservation.has(o.student_id)) latestObservation.set(o.student_id, o);

  const skipped: ScoringResult["skipped"] = [];
  const scoreable: { id: string; branchId: string; measures: Measures }[] = [];

  for (const s of students) {
    const missing: string[] = [];
    const lvl = level.get(s.id);
    if (!lvl) missing.push("kur kaydı");
    const values = byStudent.get(s.id) ?? new Map();
    const exams = EXAMS.map(k => values.get(k));
    if (exams.some(v => v === undefined)) missing.push("dört sınav notu");
    if (SKILLS.some(k => values.get(k) === undefined)) missing.push("dört beceri puanı");
    const rate = values.get("term_rate"), recent = values.get("last_four_weeks");
    if (rate === undefined) missing.push("devam oranı");
    const observation = latestObservation.get(s.id);
    if (!observation || observation.participation === null || observation.homework_completion === null)
      missing.push("sınıf içi gözlem");

    if (missing.length) { skipped.push({ externalId: s.external_id, reason: missing.join(", ") + " eksik" }); continue; }

    scoreable.push({
      id: s.id, branchId: s.branch_id,
      measures: {
        level: lvl!, exams: exams as number[],
        speaking: values.get("speaking")!, writing: values.get("writing")!,
        listening: values.get("listening")!, reading: values.get("reading")!,
        participation: observation!.participation!, homework: Number(observation!.homework_completion),
        concern: observation!.teacher_concern ?? false,
        // A student with no recent figure has not moved, rather than collapsed.
        attendanceRate: rate!, attendanceRecent: recent ?? rate!
      }
    });
  }
  if (!scoreable.length) return { scored: 0, created: 0, updated: 0, skipped, periodEnd };

  const { scores } = scoreAll(scoreable.map(s => s.measures));

  const priorSnapshots = await fetchAll<{ id: string; student_id: string }>(
    () => client.from("risk_snapshots").select("id,student_id")
      .eq("period_end", periodEnd).eq("engine_version", ENGINE_VERSION),
    "Önceki skorlar okunamadı");
  const priorId = new Map(priorSnapshots.map(r => [r.student_id, r.id]));

  const rows = scoreable.map((s, i) => ({ s, score: scores[i] }));
  const inserts = rows.filter(({ s }) => !priorId.has(s.id)).map(({ s, score }) => ({
    organization_id: organizationId, branch_id: s.branchId, student_id: s.id,
    period_end: periodEnd, engine_version: ENGINE_VERSION,
    risk_score: score.riskScore, risk_score_raw: score.riskScoreRaw, risk_level: score.riskLevel,
    dimensions: score.dimensions, dimension_detail: score.detail,
    reasons: score.reasons, recommended_action: score.action
  }));
  if (inserts.length) fail((await client.from("risk_snapshots").insert(inserts)).error);

  let updated = 0;
  for (const { s, score } of rows) {
    const existing = priorId.get(s.id);
    if (!existing) continue;
    fail((await client.from("risk_snapshots").update({
      risk_score: score.riskScore, risk_score_raw: score.riskScoreRaw, risk_level: score.riskLevel,
      dimensions: score.dimensions, dimension_detail: score.detail,
      reasons: score.reasons, recommended_action: score.action,
      calculated_at: new Date().toISOString()
    }).eq("id", existing)).error);
    updated++;
  }

  return { scored: rows.length, created: inserts.length, updated, skipped, periodEnd };
}
