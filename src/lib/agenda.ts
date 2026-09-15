import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AREA, DIMENSIONS, type Dimension, type DimensionScores, type DimensionDetail,
  evidence, headline, steps, needsAction, type Evidence, type Step
} from "@/lib/narrative";
import { fetchAll } from "@/lib/paginate";
import { loadSettings, type Settings } from "@/lib/settings";
import { latestPeriod } from "@/lib/scoring";
import { weekStartOf } from "@/lib/rubric";

export type AgendaStudent = {
  id: string; externalId: string; name: string;
  branch: string; level: string; teacher: string | null;
  score: number; raw: number; level_: RiskLevel;
  dimensions: DimensionScores; detail: DimensionDetail | null; attendanceRate: number | null;
  found: Evidence[]; headline: string; steps: PlannedStep[]; needsAction: boolean;
  previous: RiskLevel | null; previousScore: number | null;
  skills: Record<string, number>;
  /** Every recommended task closed. Not the same as "this student is fine" and
   *  not the same as "this student learned something" — see `tasksDone`. */
  done: boolean;
  tasks: number; tasksDone: number;
  /** This week's study plan, if there is one. Carried on the agenda so the row
   *  can offer the next move — prepare a plan, review a draft, chase a student
   *  who asked for help — instead of stopping at "what to do" forever. */
  plan: PlanSummary;
};
export type PlanSummary = {
  id: string | null; state: "none" | "draft" | "approved";
  tasks: number; done: number; blocked: number;
  /** An approved plan whose re-assessment task nobody has checked off. Without
   *  it the week produces work and no evidence. */
  reassessPending: boolean;
};
/** One recommended task and whether it has been closed for this checkpoint. */
export type PlannedStep = Step & { done: boolean };
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

/** A dimension nobody in the group has data for is absent from `scores`, not
 *  zero — a column of green for a measurement the institution never takes is the
 *  same lie at group level as it is on a student row. */
export type HeatRow = { label: string; count: number;
  scores: Partial<Record<Dimension, number>>; urgent: number };
export type Finding = { tone: "crit" | "good"; title: string; text: string };
export type Agenda = {
  students: AgendaStudent[]; total: number;
  urgent: number; watched: number; enteredUrgent: number; attendanceCritical: number;
  previousUrgent: number | null; previousWatched: number | null;
  byBranch: HeatRow[]; byLevel: HeatRow[];
  findings: Finding[]; recovered: AgendaStudent[];
  /** Three different questions, kept as three numbers.
   *
   *  `studentsWithAction` counts people the engine recommended something for.
   *  `tasks` counts the things to do, which is a larger number because a
   *  recommendation is routinely two jobs. `tasksDone` counts what was closed.
   *  These used to be one pair — students needing action against students with
   *  any completed row — so the progress bar reported a recommendation as
   *  finished when half of it was, and the only number the product offers for
   *  "did this list change anything" was measuring something else. */
  studentsWithAction: number; tasks: number; tasksDone: number;
  /** Everybody on the roster, against everybody a score could be produced for.
   *  A student with no current snapshot is missing from the agenda, and the
   *  difference has to be visible as students waiting for data rather than
   *  silently shrinking the institution. */
  registered: number; awaitingScore: number;
  /** The plan cycle, as four questions somebody can act on this morning. */
  planPending: number; planMissing: number; helpWanted: number; reassessDue: number;
  weekStart: string;
  periodEnd: string | null; comparedTo: string | null;
  /** Carried on the agenda so every screen reading it says "below 75%" or
   *  whatever the institution actually set, without asking again. */
  settings: Settings;
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
  // Asked first, and on its own, because the completed-action query needs it:
  // "tamamlandı" is a fact about one checkpoint, so reading every period's
  // closed rows would carry September's decisions into October's list.
  const currentPeriod = await latestPeriod(client);
  const weekStart = weekStartOf(new Date().toISOString().slice(0, 10));
  const [settings, students, branches, enrollments, snapshots, measurements,
    completedActions, plans] = await Promise.all([
    loadSettings(client),
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
    currentPeriod === null ? Promise.resolve([]) : fetchAll<{ student_id: string; task_key: string | null }>(
      () => client.from("actions").select("student_id,task_key")
        .eq("status", "completed").eq("period_end", currentPeriod), oops),
    fetchAll<{ id: string; student_id: string; status: string }>(
      () => client.from("study_plans").select("id,student_id,status")
        .eq("week_start", weekStart).neq("status", "archived"), oops)
  ]);
  // Keyed by task, not by student: a row with no task_key predates the split and
  // cannot be attributed to one of today's tasks without guessing, so it closes
  // nothing. An old tick quietly reappearing against a new task would be the
  // same defect this key was added to remove.
  const doneTasks = new Set(completedActions
    .filter(a => a.task_key).map(a => `${a.student_id}:${a.task_key}`));

  // This week's tasks. Two small queries rather than a nested select:
  // study_plans and study_tasks are linked by a plain key, and paging them
  // separately keeps the row cap off the join. Only this half has to wait —
  // the plans it needs the ids of are fetched with everything else above.
  const planTasks = plans.length
    ? await fetchAll<{ plan_id: string; status: string; check_method: string }>(
      () => client.from("study_tasks").select("plan_id,status,check_method")
        .in("plan_id", plans.map(p => p.id)), oops)
    : [];
  const tasksByPlan = new Map<string, typeof planTasks>();
  for (const t of planTasks)
    (tasksByPlan.get(t.plan_id) ?? tasksByPlan.set(t.plan_id, []).get(t.plan_id)!).push(t);
  const planOf = new Map<string, PlanSummary>();
  for (const p of plans) {
    const list = (tasksByPlan.get(p.id) ?? []).filter(t => t.status !== "cancelled");
    planOf.set(p.student_id, {
      id: p.id, state: p.status === "approved" ? "approved" : "draft",
      tasks: list.length,
      done: list.filter(t => t.status === "student_done" || t.status === "teacher_checked").length,
      blocked: list.filter(t => t.status === "blocked").length,
      reassessPending: p.status === "approved"
        && list.some(t => t.check_method.includes("ölçüt") && t.status !== "teacher_checked")
    });
  }
  const noPlan: PlanSummary = {
    id: null, state: "none", tasks: 0, done: 0, blocked: 0, reassessPending: false
  };

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
      examLast: reading.get(`${s.id}:exam_4`) ?? null,
      passMark: settings.passMark
    };
    const found = evidence(source);
    const plan: PlannedStep[] = steps(snap.recommended_action)
      .map(x => ({ ...x, done: doneTasks.has(`${s.id}:${x.key}`) }));
    const open = needsAction(snap.recommended_action) ? plan : [];
    rows.push({
      id: s.id, externalId: s.external_id, name: s.name,
      branch: branchName.get(s.branch_id) ?? "—", level: source.level,
      teacher: e?.teacher_name ?? null,
      score: Number(snap.risk_score), raw: Number(snap.risk_score_raw), level_: snap.risk_level,
      dimensions: snap.dimensions, detail: snap.dimension_detail,
      attendanceRate: reading.get(`${s.id}:term_rate`) ?? null,
      found, headline: headline(source, found), steps: plan,
      needsAction: needsAction(snap.recommended_action),
      tasks: open.length, tasksDone: open.filter(x => x.done).length,
      done: open.length > 0 && open.every(x => x.done),
      previous: previous.get(s.id)?.risk_level ?? null,
      previousScore: previous.has(s.id) ? Number(previous.get(s.id)!.risk_score) : null,
      skills: skillsOf.get(s.id) ?? {}, plan: planOf.get(s.id) ?? noPlan
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
    attendanceCritical: rows.filter(s =>
      s.attendanceRate !== null && s.attendanceRate < settings.attendanceFloor).length,
    previousUrgent: hasHistory ? [...previous.values()].filter(s => s.risk_level === "HIGH").length : null,
    previousWatched: hasHistory ? [...previous.values()].filter(s => s.risk_level === "MEDIUM").length : null,
    byBranch: branchHeat, byLevel: levelHeat,
    findings: buildFindings(rows, branchHeat, levelHeat, settings.attendanceFloor),
    // A falling risk score, and nothing more than that. It is not proof the
    // support worked and not proof anything was learned: the score moves when a
    // mark is entered, when attendance recovers, when a dimension that had no
    // data gets some. The screen says so, and skill change is reported
    // separately from it on the student's own card.
    recovered: rows.filter(s => s.previousScore !== null && s.score < s.previousScore)
      .sort((a, b) => (a.score - a.previousScore!) - (b.score - b.previousScore!)),
    studentsWithAction: rows.filter(s => s.needsAction).length,
    tasks: rows.reduce((t, s) => t + s.tasks, 0),
    tasksDone: rows.reduce((t, s) => t + s.tasksDone, 0),
    registered: students.length, awaitingScore: students.length - rows.length,
    planPending: rows.filter(s => s.plan.state === "draft").length,
    planMissing: rows.filter(s => s.needsAction && s.plan.state === "none").length,
    helpWanted: rows.filter(s => s.plan.blocked > 0).length,
    reassessDue: rows.filter(s => s.plan.reassessPending).length,
    weekStart,
    periodEnd, comparedTo, settings
  };
}

/** A column is only called out when it genuinely stands apart: the peak has to
 *  clear 35 and beat the next group by 15%. Small groups are not peaks — three
 *  students having a bad month is not a branch-wide problem. */
function peak(rows: HeatRow[], dimension: Dimension): HeatRow | null {
  const big = rows.filter(r => r.count >= 5 && r.scores[dimension] !== undefined)
    .sort((a, b) => b.scores[dimension]! - a.scores[dimension]!);
  if (big.length < 2) return null;
  const [top, next] = big;
  return top.scores[dimension]! >= 35 && top.scores[dimension]! >= next.scores[dimension]! * 1.15 ? top : null;
}
function topPeak(rows: HeatRow[]): [Dimension, HeatRow] | null {
  const found = DIMENSIONS.map(d => [d, peak(rows, d)] as const)
    .filter((x): x is [Dimension, HeatRow] => x[1] !== null)
    .sort((a, b) => b[1].scores[b[0]]! - a[1].scores[a[0]]!);
  return found[0] ?? null;
}

/** What is true of a whole branch or level, as opposed to a whole student. This
 *  is where the dimensional model earns its keep: institution-wide the four
 *  averages sit on top of each other and say nothing. */
function buildFindings(
  rows: AgendaStudent[], byBranch: HeatRow[], byLevel: HeatRow[], attendanceFloor: number
): Finding[] {
  const out: Finding[] = [];
  const mean = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;

  const branchPeak = topPeak(byBranch);
  if (branchPeak) {
    const [dimension, row] = branchPeak;
    const peakScore = row.scores[dimension]!;
    let text = `${row.label} şubesinde ${AREA[dimension].toLocaleLowerCase("tr")} ortalaması `
      + `${peakScore}, diğer şubelerin belirgin şekilde üzerinde.`;
    if (dimension === "skill") {
      const group = rows.filter(s => s.branch === row.label && s.skills.speaking !== undefined);
      if (group.length) {
        const speaking = mean(group.map(s => s.skills.speaking));
        const others = mean(group.map(s => mean(["writing", "listening", "reading"]
          .map(k => s.skills[k]).filter(v => v !== undefined))));
        // The gap is measured; the reason for it is not. Saying "pratiği
        // yetersiz" names a cause from a single average, and the product has
        // never looked at how much speaking practice this branch runs or under
        // what conditions it assessed. Naming what to examine keeps the sentence
        // useful without inventing the finding underneath it.
        text = `${row.label}'de konuşma ortalaması ${speaking.toFixed(0)}, diğer üç beceri `
          + `${others.toFixed(0)}. Fark tek tek öğrencilerde değil, ölçümün kendisinde `
          + `toplanıyor — şubedeki konuşma görevleri ve değerlendirme ölçütleri incelenmeli.`;
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
      ? ` ${row.count} öğrencinin ${group.filter(s =>
        s.attendanceRate !== null && s.attendanceRate < attendanceFloor).length} tanesinde `
        + `devam oranı %${attendanceFloor} sınırının altında. Bu kurda içerik desteği vermeden `
        + `önce öğrencileri derse getirmek gerekiyor.`
      : ` ${row.count} öğrencinin ${row.urgent} tanesi acil listede.`;
    out.push({
      tone: "crit", title: `${row.label} kurunda ${AREA[dimension].toLocaleLowerCase("tr")} en yüksek`,
      text: `${AREA[dimension]} ortalaması ${row.scores[dimension]!}, diğer kurların `
        + `${small ? "üzerinde" : "belirgin şekilde üzerinde"}.` + extra
        + (small ? " Grup küçük olduğu için bunu bir eğilim değil, tek tek bakılacak bir işaret sayın." : "")
    });
  }

  // A list of problems with no reference point reads as though everything is broken.
  const best = byBranch.filter(r => r.count >= 5)
    .map(r => ({ r, average: mean(DIMENSIONS.map(d => r.scores[d]).filter(v => v !== undefined)) }))
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
    // Averaged over the students who have the measurement, not over the group:
    // counting a missing dimension as zero reported a branch as healthy in an
    // area it had simply never filled in.
    scores: Object.fromEntries(DIMENSIONS.flatMap(d => {
      const values = list.map(s => s.dimensions[d]).filter(v => v !== undefined);
      return values.length
        ? [[d, Math.round(values.reduce((t, v) => t + v, 0) / values.length)]] : [];
    })) as Partial<Record<Dimension, number>>
  }));
}
