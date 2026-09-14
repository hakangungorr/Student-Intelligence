import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreAll, availableDimensions, ENGINE_VERSION, type Measures } from "@/lib/engine";
import { AREA, type Dimension } from "@/lib/narrative";
import { fetchAll } from "@/lib/paginate";
import { loadSettings } from "@/lib/settings";

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

const SKILLS = ["speaking", "writing", "listening", "reading"] as const;

/** Why a dimension could not be computed, in the institution's own terms.
 *
 *  A student is only skipped when every one of these is true at once, and then
 *  the reason has to say which measurement is missing — "veri eksik" tells an
 *  administrator nothing they can go and fix. */
function unmeasurable(m: Measures): Partial<Record<Dimension, string>> {
  const out: Partial<Record<Dimension, string>> = {};
  if (m.exams.length === 0) out.test = "hiç sınav notu yok";
  else if (m.exams.length < 2) out.test = "tek sınav notu var, eğilim için en az iki gerekiyor";
  if (SKILLS.every(k => m[k] === undefined)) out.skill = "hiç beceri puanı yok";
  if (m.participation === undefined && m.homework === undefined && m.concern === undefined)
    out.classroom = "sınıf içi gözlem girilmemiş";
  if (m.attendanceRate === undefined) out.attendance = "devam oranı yok";
  return out;
}

/** The period a snapshot belongs to is a reporting checkpoint the institution
 *  chooses, not the day somebody happened to type a mark in. Saving a class sheet
 *  updates the current checkpoint; a new one is opened deliberately, from the
 *  scoring form. Otherwise every entry would open a fresh period and the
 *  week-over-week comparison the agenda is built on would compare today with
 *  today. */
export async function latestPeriod(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.from("risk_snapshots")
    .select("period_end").order("period_end", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Dönem okunamadı.");
  return (data?.period_end as string) ?? null;
}

export async function scoreInstitution(
  client: SupabaseClient, organizationId: string, periodEnd: string
): Promise<ScoringResult> {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

  const [settings, students, enrollments, readings, observations] = await Promise.all([
    loadSettings(client),
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
  // Exams are kept apart and keyed by their own reference: how many a course runs
  // is the institution's decision, so the engine is handed the run it finds in
  // natural order rather than four fixed slots.
  const examsOf = new Map<string, Map<string, number>>();
  for (const m of readings) {
    if (m.kind === "exam") {
      const row = examsOf.get(m.student_id) ?? examsOf.set(m.student_id, new Map()).get(m.student_id)!;
      row.set(m.source_reference, Number(m.value));
      continue;
    }
    const row = byStudent.get(m.student_id) ?? byStudent.set(m.student_id, new Map()).get(m.student_id)!;
    row.set(m.kind === "attendance" ? m.source_reference : m.kind, Number(m.value));
  }
  const examRun = (id: string) => [...(examsOf.get(id) ?? new Map<string, number>()).entries()]
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .map(([, v]) => v);
  // Ordered newest first, so the first sighting of a student is their latest.
  const latestObservation = new Map<string, Observation>();
  for (const o of observations) if (!latestObservation.has(o.student_id)) latestObservation.set(o.student_id, o);

  const skipped: ScoringResult["skipped"] = [];
  const scoreable: { id: string; branchId: string; measures: Measures }[] = [];

  for (const s of students) {
    const lvl = level.get(s.id);
    if (!lvl) {
      skipped.push({ externalId: s.external_id, reason: "aktif kur kaydı yok" });
      continue;
    }
    const values = byStudent.get(s.id) ?? new Map();
    const observation = latestObservation.get(s.id);
    const homework = observation?.homework_completion;

    const measures: Measures = {
      level: lvl, exams: examRun(s.id),
      speaking: values.get("speaking"), writing: values.get("writing"),
      listening: values.get("listening"), reading: values.get("reading"),
      participation: observation?.participation ?? undefined,
      homework: homework === null || homework === undefined ? undefined : Number(homework),
      concern: observation?.teacher_concern ?? undefined,
      attendanceRate: values.get("term_rate"), attendanceRecent: values.get("last_four_weeks")
    };

    // Partial data scores on what it has. Only a student with nothing at all to
    // measure is left off, and then the reason names every dimension and why —
    // an institution loading its first file needs to know what to add next, not
    // that something unspecified was missing.
    if (!availableDimensions(measures).length) {
      const why = unmeasurable(measures);
      skipped.push({
        externalId: s.external_id,
        reason: (Object.keys(why) as Dimension[])
          .map(d => `${AREA[d].toLocaleLowerCase("tr")}: ${why[d]}`).join(" · ")
      });
      continue;
    }

    scoreable.push({ id: s.id, branchId: s.branch_id, measures });
  }
  if (!scoreable.length) return { scored: 0, created: 0, updated: 0, skipped, periodEnd };

  // The passing mark is the institution's, so a school that sets 70 gets scores
  // that treat 65 as a failed exam. Changing it therefore requires re-scoring,
  // which is what the settings screen does after it saves.
  const { scores } = scoreAll(scoreable.map(s => s.measures), settings.passMark);

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
