/** Risk engine v0.4, ported from risk_engine_v4.py.
 *
 *  The Python engine stays the reference: it produced the dataset the approved
 *  screens were designed against, and a score that disagrees with it is a bug
 *  here, not a difference of opinion. tests/engine.test.ts scores all hundred
 *  reference students through this port and requires every score, level,
 *  dimension and diagnosis to match.
 *
 *  Four dimensions, fixed weights. The academic two are calibrated inside the
 *  level — no threshold is handed in from outside — while attendance and
 *  classroom stay absolute, because 60% attendance is bad at every level.
 */
import { DIMENSIONS, type Dimension, type DimensionScores, type DimensionDetail } from "@/lib/narrative";
import { DEFAULTS } from "@/lib/settings";

export const ENGINE_VERSION = "v0.4";

const HIGH_THRESHOLD = 65;
const MEDIUM_THRESHOLD = 30;
const WEIGHTS: Record<Dimension, number> = { test: .30, skill: .25, classroom: .20, attendance: .25 };
const MAX_DIMENSION_FLOOR = .60;
const ESCALATION = [0, 0, 10, 22, 32];
const ELEVATED_AT = 50;
/** The only figure in here the institution sets. Everything else is calibrated
 *  from the institution's own data; a passing mark is a rule somebody wrote
 *  down, so it is handed in rather than guessed. The default is what the
 *  reference dataset was scored with. */
const PASS_MARK = DEFAULTS.passMark;
const BENCHMARK_QUANTILE = .25;

/** Python's round(), which JavaScript does not have.
 *
 *  Two behaviours have to survive, and they pull in different directions.
 *
 *  Rounding follows the double's *exact* binary value, not a tidied decimal.
 *  A composite of 56.85 is really 56.850000000000001, and 34.15 is really
 *  34.149999999999999 — Python rounds the first up and the second down, and
 *  normalising them to "56.85" and "34.15" first loses exactly the digit that
 *  decides. Four of the hundred reference students disagreed on that alone.
 *
 *  A genuine tie breaks to the even digit. Ties are unreachable for most values,
 *  but a skill spread is the mean of four integers and so lands on .25 or .75
 *  exactly, where the choice is real.
 */
export function pyRoundTo(n: number, digits: number): number {
  if (!Number.isFinite(n)) return n;
  const negative = n < 0;
  const magnitude = Math.abs(n);
  // toFixed is correctly rounded, so this carries the exact value far enough
  // past the target digit to tell a tie from a near miss.
  const text = magnitude.toFixed(Math.min(20, digits + 18));
  const dot = text.indexOf(".");
  const whole = text.slice(0, dot);
  const fraction = text.slice(dot + 1);
  const kept = fraction.slice(0, digits);
  const rest = fraction.slice(digits);

  const ONE = BigInt(1), TWO = BigInt(2), ZERO = BigInt(0);
  let scaled = BigInt(whole + kept);
  const tie = rest[0] === "5" && /^0*$/.test(rest.slice(1));
  if (tie ? scaled % TWO !== ZERO : rest[0] >= "5") scaled += ONE;

  const value = Number(scaled) / 10 ** digits;
  return negative ? -value : value;
}
export const pyRound = (n: number) => pyRoundTo(n, 0);

const fmt = (n: number, digits: number) => pyRoundTo(n, digits).toFixed(digits);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const clamp = (v: number) => Math.max(0, Math.min(100, v));

export type Measures = {
  level: string;
  exams: number[];                    // four, oldest first
  speaking: number; writing: number; listening: number; reading: number;
  participation: number; homework: number; concern: boolean;
  attendanceRate: number; attendanceRecent: number;
};
export type Benchmark = { exam: number; skill: number; cohortSize: number };

/** Each level's benchmark is the mean of its own strongest quarter. Calibration
 *  therefore follows whatever institution the product is pointed at. */
export function buildBenchmarks(students: Measures[]): Map<string, Benchmark> {
  const byLevel = new Map<string, Measures[]>();
  for (const s of students) (byLevel.get(s.level) ?? byLevel.set(s.level, []).get(s.level)!).push(s);

  const marks = new Map<string, Benchmark>();
  for (const [level, group] of byLevel) {
    const n = Math.max(1, pyRound(group.length * BENCHMARK_QUANTILE));
    const top = (values: number[]) => mean(values.sort((a, b) => b - a).slice(0, n));
    marks.set(level, {
      exam: top(group.map(s => mean(s.exams.slice(-2)))),
      skill: top(group.map(s => mean([s.speaking, s.writing, s.listening, s.reading]))),
      cohortSize: group.length
    });
  }
  return marks;
}

/** How far behind the benchmark, as risk points rather than a percentage. */
function gapPoints(value: number, benchmark: number, scale: number): [number, number] {
  if (benchmark <= 0) return [0, 0];
  const gap = (benchmark - value) / benchmark * 100;
  const points = gap >= 35 ? scale
    : gap >= 25 ? pyRound(scale * .75)
      : gap >= 15 ? pyRound(scale * .47)
        : gap >= 8 ? pyRound(scale * .20) : 0;
  return [points, pyRoundTo(gap, 1)];
}

type Part = { score: number; notes: string[] };

function testDimension(s: Measures, bm: Benchmark, passMark: number): Part & { detail: DimensionDetail["test"] } {
  const exams = s.exams;
  const delta = mean(exams.slice(-2)) - mean(exams.slice(0, 2));
  const recent = mean(exams.slice(-2));
  const last = exams[exams.length - 1];

  const trend = delta <= -12 ? 45 : delta <= -8 ? 36 : delta <= -4 ? 22
    : delta <= -1.5 ? 10 : delta >= 6 ? -8 : 0;
  const [rel, gap] = gapPoints(recent, bm.exam, 40);
  const floor = last < passMark - 10 ? 25 : last < passMark ? 15 : 0;

  // A student slipping a little every time is the case the product exists to
  // catch, and the delta alone can miss it: a trajectory, not a wobble.
  const monotonic = exams.every((v, i) => i === 0 || exams[i - 1] > v);
  const notes: string[] = [];
  if (monotonic) notes.push("Son 4 sınavın her biri bir öncekinden düşük");
  if (delta <= -4) notes.push(`Son 4 sınavda ${fmt(Math.abs(delta), 1)} puan düşüş`);
  else if (delta >= 6) notes.push(`Sınav trendi yükselişte (+${fmt(delta, 1)})`);
  if (gap >= 15) notes.push(`${s.level} kur ortalamasının %${fmt(gap, 0)} altında`);
  if (last < passMark) notes.push(`Son sınav ${last} — geçme notunun altında`);

  return {
    score: clamp(trend + rel + floor + (monotonic ? 10 : 0)), notes,
    detail: {
      delta: pyRoundTo(delta, 1), last_exam: last, monotonic_decline: monotonic,
      recent_avg: pyRoundTo(recent, 1), cohort_gap_pct: gap
    }
  };
}

const SKILL_KEYS = ["speaking", "writing", "listening", "reading"] as const;
const SKILL_LABEL: Record<string, string> = {
  speaking: "Konuşma", writing: "Yazma", listening: "Dinleme", reading: "Okuma"
};

/** Two different illnesses: one hole in an otherwise sound profile, or a level
 *  that is simply too high. Same score, different diagnosis, different action. */
function skillDimension(s: Measures, bm: Benchmark, passMark: number): Part & { detail: DimensionDetail["skill"] } {
  const values = SKILL_KEYS.map(k => s[k]);
  let weakestIndex = 0;
  for (let i = 1; i < values.length; i++) if (values[i] < values[weakestIndex]) weakestIndex = i;
  const weakest = values[weakestIndex], weakestKey = SKILL_KEYS[weakestIndex];
  const ownAvg = mean(values);

  const [rel, gap] = gapPoints(ownAvg, bm.skill, 45);
  const spread = ownAvg - weakest;
  const imbalance = spread >= 22 ? 35 : spread >= 16 ? 24 : spread >= 10 ? 12 : 0;
  const floor = weakest < passMark - 10 ? 25 : weakest < passMark ? 14 : 0;

  const label = SKILL_LABEL[weakestKey];
  const notes: string[] = [];
  if (gap >= 15) notes.push(`Beceri ortalaması ${s.level} kurunun %${fmt(gap, 0)} altında`);
  if (imbalance >= 24) notes.push(`${label} ${weakest} — kendi ortalamasının ${fmt(spread, 0)} puan altında`);
  else if (weakest < passMark) notes.push(`${label} ${weakest} — geçme notunun altında`);

  return {
    score: clamp(rel + imbalance + floor), notes,
    detail: {
      weakest: weakestKey, weakest_score: weakest, own_avg: pyRoundTo(ownAvg, 1),
      spread: pyRoundTo(spread, 1), cohort_gap_pct: gap, diagnosis: imbalance >= 24 ? "beceri_acigi" : gap >= 15 ? "seviye_dusuklugu" : "temiz"
    }
  };
}

function classroomDimension(s: Measures): Part & { detail: DimensionDetail["classroom"] } {
  const p = s.participation <= 3 ? 40 : s.participation <= 5 ? 26 : s.participation <= 6 ? 14 : 0;
  const h = s.homework < 40 ? 40 : s.homework < 60 ? 28 : s.homework < 75 ? 14 : 0;
  const notes: string[] = [];
  if (s.participation <= 5) notes.push(`Derse katılım ${s.participation}/10`);
  if (s.homework < 75) notes.push(`Ödev tamamlama %${s.homework}`);
  if (s.concern) notes.push("Eğitmen endişe bildirdi");
  return {
    score: clamp(p + h + (s.concern ? 20 : 0)), notes,
    detail: { participation: s.participation, homework: s.homework, teacher_concern: s.concern }
  };
}

function attendanceDimension(s: Measures): Part & { detail: DimensionDetail["attendance"] } {
  const { attendanceRate: rate, attendanceRecent: recent } = s;
  const drop = rate - recent;
  const level = rate < 65 ? 60 : rate < 75 ? 45 : rate < 80 ? 28 : rate < 85 ? 14 : 0;
  const trend = drop >= 15 ? 40 : drop >= 10 ? 28 : drop >= 5 ? 15 : 0;
  const notes: string[] = [];
  if (rate < 85) notes.push(`Devam oranı %${rate}`);
  if (drop >= 5) notes.push(`Son 4 haftada %${rate} -> %${recent}`);
  return { score: clamp(level + trend), notes, detail: { rate, recent, drop } };
}

const ACTIONS: Record<Exclude<Dimension, "skill">, string> = {
  test: "eğitmen görüşmesi + telafi planı",
  classroom: "eğitmen ile öğrenci değerlendirme toplantısı",
  attendance: "öğrenci ilişkileri araması (devamsızlık nedeni)"
};

export type Score = {
  dimensions: DimensionScores; detail: DimensionDetail;
  riskScore: number; riskScoreRaw: number; riskLevel: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[]; action: string;
};

export function scoreStudent(s: Measures, bm: Benchmark, passMark = PASS_MARK): Score {
  const test = testDimension(s, bm, passMark), skill = skillDimension(s, bm, passMark);
  const classroom = classroomDimension(s), attendance = attendanceDimension(s);
  const parts = { test, skill, classroom, attendance };
  const dimensions = {
    test: test.score, skill: skill.score,
    classroom: classroom.score, attendance: attendance.score
  } as DimensionScores;

  const weighted = DIMENSIONS.reduce((t, k) => t + dimensions[k] * WEIGHTS[k], 0);
  // Ties keep the declared order, the way Python's max() and stable sort do.
  const byScore = [...DIMENSIONS].sort((a, b) => dimensions[b] - dimensions[a]);
  const floor = dimensions[byScore[0]] * MAX_DIMENSION_FLOOR;
  const elevated = DIMENSIONS.filter(k => dimensions[k] >= ELEVATED_AT).length;

  // Damage in several areas at once is worse than the sum of its parts: a flat
  // weighted average pulls a student who is failing everywhere back to the middle.
  const raw = Math.max(weighted, floor) + ESCALATION[elevated];
  const composite = Math.min(100, pyRound(raw));

  let riskLevel: Score["riskLevel"] =
    composite >= HIGH_THRESHOLD ? "HIGH" : composite >= MEDIUM_THRESHOLD ? "MEDIUM" : "LOW";
  // A safety rule above the composite: three areas in serious trouble is urgent
  // whatever the arithmetic says.
  if (DIMENSIONS.filter(k => dimensions[k] >= 60).length >= 3) riskLevel = "HIGH";

  const skillAction = skill.detail.diagnosis === "beceri_acigi"
    ? `hedefli ${SKILL_LABEL[skill.detail.weakest]} destek planı (2 hafta)`
    : "seviye değerlendirmesi — kur tekrarı / telafi programı";
  const acts = byScore.slice(0, 2).filter(k => dimensions[k] >= 40)
    .map(k => k === "skill" ? skillAction : ACTIONS[k]);
  const action = acts.length
    ? (riskLevel === "HIGH" ? "ACİL: " : "") + acts.join(" + ")
    : "Aksiyon gerekmiyor — rutin takip";

  const reasons = byScore.flatMap(k => parts[k].notes);

  return {
    dimensions,
    detail: {
      test: test.detail, skill: skill.detail,
      classroom: classroom.detail, attendance: attendance.detail
    },
    riskScore: composite, riskScoreRaw: pyRoundTo(raw, 1), riskLevel,
    reasons: reasons.length ? reasons : ["Belirgin risk sinyali yok"],
    action
  };
}

export function scoreAll(students: Measures[], passMark = PASS_MARK):
  { scores: Score[]; benchmarks: Map<string, Benchmark> } {
  const benchmarks = buildBenchmarks(students);
  return {
    scores: students.map(s => scoreStudent(s, benchmarks.get(s.level)!, passMark)),
    benchmarks
  };
}
