import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DIMENSIONS, type Dimension, type DimensionScores, type DimensionDetail,
  evidence, headline, steps, needsAction, type Evidence, type Step
} from "@/lib/narrative";
import { fetchAll } from "@/lib/paginate";

export type AgendaStudent = {
  id: string; externalId: string; name: string;
  branch: string; level: string; teacher: string | null;
  score: number; raw: number; level_: RiskLevel;
  dimensions: DimensionScores; detail: DimensionDetail | null; attendanceRate: number | null;
  found: Evidence[]; headline: string; steps: Step[]; needsAction: boolean;
  previous: RiskLevel | null;
};
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type HeatRow = { label: string; count: number; scores: Record<Dimension, number>; urgent: number };
export type Agenda = {
  students: AgendaStudent[]; total: number;
  urgent: number; watched: number; enteredUrgent: number; attendanceCritical: number;
  previousUrgent: number | null; previousWatched: number | null;
  byBranch: HeatRow[]; byLevel: HeatRow[];
  periodEnd: string | null; comparedTo: string | null;
};

type SnapshotRow = {
  student_id: string; period_end: string; risk_score: number; risk_score_raw: number;
  risk_level: RiskLevel; dimensions: DimensionScores;
  dimension_detail: DimensionDetail | null; reasons: string[]; recommended_action: string;
};

/** Reads the agenda for whatever the signed-in user is allowed to see.
 *
 * Deliberately several small queries joined here rather than one nested select:
 * enrollments and students are linked by a composite foreign key, which PostgREST
 * does not resolve into an embedded resource. Every row still passes through RLS.
 */
export async function loadAgenda(client: SupabaseClient): Promise<Agenda> {
  const oops = "Öğrenci gündemi yüklenemedi";
  const [students, branches, enrollments, snapshots, measurements] = await Promise.all([
    fetchAll<{ id: string; external_id: string; name: string; branch_id: string }>(
      () => client.from("students").select("id,external_id,name,branch_id").eq("active", true), oops),
    fetchAll<{ id: string; name: string }>(() => client.from("branches").select("id,name"), oops),
    fetchAll<{ student_id: string; level: string; teacher_name: string | null }>(
      () => client.from("enrollments").select("student_id,level,teacher_name").eq("active", true), oops),
    fetchAll<SnapshotRow>(() => client.from("risk_snapshots")
      .select("student_id,period_end,risk_score,risk_score_raw,risk_level,dimensions,dimension_detail,reasons,recommended_action")
      .order("period_end", { ascending: false }), oops),
    fetchAll<{ student_id: string; source_reference: string; value: number }>(
      () => client.from("student_measurements").select("student_id,source_reference,value")
        .in("source_reference", ["exam_1", "exam_4", "term_rate"]), oops)
  ]);

  const branchName = new Map(branches.map(b => [b.id, b.name]));
  const enrolment = new Map(enrollments.map(e => [e.student_id, e]));
  const reading = new Map<string, number>();
  for (const m of measurements) reading.set(`${m.student_id}:${m.source_reference}`, Number(m.value));

  // Newest period wins; the one before it is what the change figures compare against.
  const periods = [...new Set(snapshots.map(s => s.period_end))].sort().reverse();
  const [periodEnd = null, comparedTo = null] = periods;
  const current = new Map<string, SnapshotRow>();
  const previous = new Map<string, SnapshotRow>();
  for (const s of snapshots) {
    if (s.period_end === periodEnd) current.set(s.student_id, s);
    else if (s.period_end === comparedTo) previous.set(s.student_id, s);
  }

  const rows: AgendaStudent[] = [];
  for (const s of students) {
    const snap = current.get(s.id);
    if (!snap) continue;                      // no score yet: nothing to put on an agenda
    const e = enrolment.get(s.id);
    const source = {
      dimensions: snap.dimensions, detail: snap.dimension_detail,
      level: e?.level ?? "—",
      examFirst: reading.get(`${s.id}:exam_1`) ?? null,
      examLast: reading.get(`${s.id}:exam_4`) ?? null
    };
    const found = evidence(source);
    rows.push({
      id: s.id, externalId: s.external_id, name: s.name,
      branch: branchName.get(s.branch_id) ?? "—", level: source.level,
      teacher: e?.teacher_name ?? null,
      score: Number(snap.risk_score), raw: Number(snap.risk_score_raw), level_: snap.risk_level,
      dimensions: snap.dimensions, detail: snap.dimension_detail,
      attendanceRate: reading.get(`${s.id}:term_rate`) ?? null,
      found, headline: headline(source, found), steps: steps(snap.recommended_action),
      needsAction: needsAction(snap.recommended_action),
      previous: previous.get(s.id)?.risk_level ?? null
    });
  }
  rows.sort((a, b) => b.raw - a.raw);

  const count = (list: AgendaStudent[], l: RiskLevel) => list.filter(s => s.level_ === l).length;
  const hasHistory = previous.size > 0;

  return {
    students: rows, total: rows.length,
    urgent: count(rows, "HIGH"), watched: count(rows, "MEDIUM"),
    // Not every worsening: the ones that crossed into urgent this week. A student
    // sliding from low to medium is not who the institution acts on tomorrow.
    enteredUrgent: rows.filter(s => s.level_ === "HIGH" && s.previous && s.previous !== "HIGH").length,
    // The institution average hides the tail; the count of students below the line
    // is the same data in a form somebody can act on.
    attendanceCritical: rows.filter(s => s.attendanceRate !== null && s.attendanceRate < 75).length,
    previousUrgent: hasHistory ? [...previous.values()].filter(s => s.risk_level === "HIGH").length : null,
    previousWatched: hasHistory ? [...previous.values()].filter(s => s.risk_level === "MEDIUM").length : null,
    byBranch: heat(rows, s => s.branch), byLevel: heat(rows, s => s.level),
    periodEnd, comparedTo
  };
}

/** Aggregation is where the dimensional model earns its keep: institution-wide the
 *  four averages sit on top of each other, but per branch they pull three-fold apart. */
function heat(rows: AgendaStudent[], key: (s: AgendaStudent) => string): HeatRow[] {
  const groups = new Map<string, AgendaStudent[]>();
  for (const s of rows) {
    const k = key(s);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "tr")).map(([label, list]) => ({
    label, count: list.length, urgent: list.filter(s => s.level_ === "HIGH").length,
    scores: Object.fromEntries(DIMENSIONS.map(d =>
      [d, Math.round(list.reduce((t, s) => t + (s.dimensions[d] ?? 0), 0) / list.length)]
    )) as Record<Dimension, number>
  }));
}
