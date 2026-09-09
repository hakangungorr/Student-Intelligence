import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AREA, DIMENSIONS, type Dimension, type DimensionScores, type DimensionDetail,
  evidence, headline, steps, needsAction, type Evidence, type Step
} from "@/lib/narrative";
import { fetchAll } from "@/lib/paginate";

export type AgendaStudent = {
  id: string; externalId: string; name: string;
  branch: string; level: string; teacher: string | null;
  score: number; raw: number; level_: RiskLevel;
  dimensions: DimensionScores; detail: DimensionDetail | null; attendanceRate: number | null;
  found: Evidence[]; headline: string; steps: Step[]; needsAction: boolean;
  previous: RiskLevel | null; previousScore: number | null;
  skills: Record<string, number>;
  /** Set once the recommendation has been carried out; see lib/actions.ts. */
  done: boolean;
};
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type HeatRow = { label: string; count: number; scores: Record<Dimension, number>; urgent: number };
export type Finding = { tone: "crit" | "good"; title: string; text: string };
export type Agenda = {
  students: AgendaStudent[]; total: number;
  urgent: number; watched: number; enteredUrgent: number; attendanceCritical: number;
  previousUrgent: number | null; previousWatched: number | null;
  byBranch: HeatRow[]; byLevel: HeatRow[];
  findings: Finding[]; recovered: AgendaStudent[];
  actionable: number; completed: number;
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
  const [students, branches, enrollments, snapshots, measurements, completedActions] = await Promise.all([
    fetchAll<{ id: string; external_id: string; name: string; branch_id: string }>(
      () => client.from("students").select("id,external_id,name,branch_id").eq("active", true), oops),
    fetchAll<{ id: string; name: string }>(() => client.from("branches").select("id,name"), oops),
    fetchAll<{ student_id: string; level: string; teacher_name: string | null }>(
      () => client.from("enrollments").select("student_id,level,teacher_name").eq("active", true), oops),
    fetchAll<SnapshotRow>(() => client.from("risk_snapshots")
      .select("student_id,period_end,risk_score,risk_score_raw,risk_level,dimensions,dimension_detail,reasons,recommended_action")
      .order("period_end", { ascending: false }), oops),
    fetchAll<{ student_id: string; kind: string; source_reference: string; value: number }>(
      () => client.from("student_measurements").select("student_id,kind,source_reference,value")
        .in("source_reference", ["exam_1", "exam_4", "term_rate", "skill_profile"]), oops),
    fetchAll<{ student_id: string; status: string }>(
      () => client.from("actions").select("student_id,status").eq("status", "completed"), oops)
  ]);
  const doneFor = new Set(completedActions.map(a => a.student_id));

  const branchName = new Map(branches.map(b => [b.id, b.name]));
  const enrolment = new Map(enrollments.map(e => [e.student_id, e]));
  const reading = new Map<string, number>();
  const skillsOf = new Map<string, Record<string, number>>();
  for (const m of measurements) {
    if (m.source_reference === "skill_profile") {
      const row = skillsOf.get(m.student_id) ?? skillsOf.set(m.student_id, {}).get(m.student_id)!;
      row[m.kind] = Number(m.value);
    } else reading.set(`${m.student_id}:${m.source_reference}`, Number(m.value));
  }

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
      previous: previous.get(s.id)?.risk_level ?? null,
      previousScore: previous.has(s.id) ? Number(previous.get(s.id)!.risk_score) : null,
      skills: skillsOf.get(s.id) ?? {}, done: doneFor.has(s.id)
    });
  }
  rows.sort((a, b) => b.raw - a.raw);

  const count = (list: AgendaStudent[], l: RiskLevel) => list.filter(s => s.level_ === l).length;
  const hasHistory = previous.size > 0;

  const branchHeat = heat(rows, s => s.branch), levelHeat = heat(rows, s => s.level);

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
    byBranch: branchHeat, byLevel: levelHeat,
    findings: buildFindings(rows, branchHeat, levelHeat),
    // Improvement is the only evidence that acting on this list changes anything.
    recovered: rows.filter(s => s.previousScore !== null && s.score < s.previousScore)
      .sort((a, b) => (a.score - a.previousScore!) - (b.score - b.previousScore!)),
    actionable: rows.filter(s => s.needsAction).length,
    completed: rows.filter(s => s.needsAction && s.done).length,
    periodEnd, comparedTo
  };
}

/** A column is only called out when it genuinely stands apart: the peak has to
 *  clear 35 and beat the next group by 15%. Small groups are not peaks — three
 *  students having a bad month is not a branch-wide problem. */
function peak(rows: HeatRow[], dimension: Dimension): HeatRow | null {
  const big = rows.filter(r => r.count >= 5).sort((a, b) => b.scores[dimension] - a.scores[dimension]);
  if (big.length < 2) return null;
  const [top, next] = big;
  return top.scores[dimension] >= 35 && top.scores[dimension] >= next.scores[dimension] * 1.15 ? top : null;
}
function topPeak(rows: HeatRow[]): [Dimension, HeatRow] | null {
  const found = DIMENSIONS.map(d => [d, peak(rows, d)] as const)
    .filter((x): x is [Dimension, HeatRow] => x[1] !== null)
    .sort((a, b) => b[1].scores[b[0]] - a[1].scores[a[0]]);
  return found[0] ?? null;
}

/** What is true of a whole branch or level, as opposed to a whole student. This
 *  is where the dimensional model earns its keep: institution-wide the four
 *  averages sit on top of each other and say nothing. */
function buildFindings(rows: AgendaStudent[], byBranch: HeatRow[], byLevel: HeatRow[]): Finding[] {
  const out: Finding[] = [];
  const mean = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;

  const branchPeak = topPeak(byBranch);
  if (branchPeak) {
    const [dimension, row] = branchPeak;
    let text = `${row.label} şubesinde ${AREA[dimension].toLocaleLowerCase("tr")} ortalaması `
      + `${row.scores[dimension]}, diğer şubelerin belirgin şekilde üzerinde.`;
    if (dimension === "skill") {
      const group = rows.filter(s => s.branch === row.label && s.skills.speaking !== undefined);
      if (group.length) {
        const speaking = mean(group.map(s => s.skills.speaking));
        const others = mean(group.map(s => mean(["writing", "listening", "reading"]
          .map(k => s.skills[k]).filter(v => v !== undefined))));
        text = `${row.label}'de konuşma ortalaması ${speaking.toFixed(0)}, diğer üç beceri `
          + `${others.toFixed(0)}. Yani sorun tek tek öğrencilerde değil — bu şubede konuşma `
          + `pratiği yetersiz.`;
      }
    }
    out.push({ tone: "crit", title: `${row.label} şubesinde ${AREA[dimension].toLocaleLowerCase("tr")} sorunu var`, text });
  }

  const levelPeak = topPeak(byLevel);
  if (levelPeak) {
    const [dimension, row] = levelPeak;
    const group = rows.filter(s => s.level === row.label);
    const small = row.count < 10;
    const extra = dimension === "attendance"
      ? ` ${row.count} öğrencinin ${group.filter(s => s.attendanceRate !== null && s.attendanceRate < 75).length} tanesi `
        + `derslerin dörtte birinden fazlasını kaçırıyor. Bu kurda içerik desteği vermeden önce `
        + `öğrencileri derse getirmek gerekiyor.`
      : ` ${row.count} öğrencinin ${row.urgent} tanesi acil listede.`;
    out.push({
      tone: "crit", title: `${row.label} kurunda ${AREA[dimension].toLocaleLowerCase("tr")} en yüksek`,
      text: `${AREA[dimension]} ortalaması ${row.scores[dimension]}, diğer kurların `
        + `${small ? "üzerinde" : "belirgin şekilde üzerinde"}.` + extra
        + (small ? " Grup küçük olduğu için bunu bir eğilim değil, tek tek bakılacak bir işaret sayın." : "")
    });
  }

  // A list of problems with no reference point reads as though everything is broken.
  const best = byBranch.filter(r => r.count >= 5)
    .map(r => ({ r, average: mean(DIMENSIONS.map(d => r.scores[d])) }))
    .sort((a, b) => a.average - b.average)[0];
  if (best) out.push({
    tone: "good", title: `${best.r.label} şubesi dört alanda da en iyi durumda`,
    text: `${best.r.count} öğrencinin ${best.r.urgent === 0 ? "hiçbiri" : `sadece ${best.r.urgent} tanesi`} acil listede.`
      + (best.r.count >= 10 ? " Diğer şubelerde işe yarayan bir şey aranıyorsa, önce buraya bakmak mantıklı." : "")
  });
  return out;
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
