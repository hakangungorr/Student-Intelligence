/** Turns the engine's evidence into the sentences the approved screens show.
 *
 * The scores say how bad it is; this says why, and it is the whole point of the
 * product. Kept as pure functions over a snapshot so the screens stay dumb and
 * the wording can be reviewed in one place.
 */

import { DEFAULTS } from "@/lib/settings";

export const DIMENSIONS = ["test", "skill", "classroom", "attendance"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** "üç sınavdır" reads; "3 sınavdır" does not. Only the counts a course can
 *  plausibly run are spelled out; anything larger falls back to the digit. */
const WRITTEN: Record<number, string> = {
  2: "iki", 3: "üç", 4: "dört", 5: "beş", 6: "altı", 7: "yedi", 8: "sekiz"
};

export const AREA: Record<Dimension, string> = {
  test: "Sınav notları", skill: "Dil becerileri",
  classroom: "Derse katılım", attendance: "Devamsızlık"
};
/** What to say when a dimension has no data, phrased as the thing somebody has
 *  to go and enter rather than as a state the student is in. */
export const MISSING: Record<Dimension, string> = {
  test: "Sınav notu girilmemiş", skill: "Beceri puanı girilmemiş",
  classroom: "Sınıf içi gözlem girilmemiş", attendance: "Devam bilgisi girilmemiş"
};
/** The dimensions a snapshot could not answer for, in the declared order. */
export const missingDimensions = (d: DimensionScores): Dimension[] =>
  DIMENSIONS.filter(k => d[k] === undefined);

const SKILL: Record<string, string> = {
  speaking: "Konuşma", writing: "Yazma", listening: "Dinleme", reading: "Okuma"
};

/** A dimension the student's data could not answer for is absent, never zero:
 *  "no skill scores on file" and "skills are fine" must not look the same. */
export type DimensionScores = Partial<Record<Dimension, number>>;
export type DimensionDetail = {
  test?: { delta: number; last_exam: number; monotonic_decline: boolean; cohort_gap_pct: number;
    recent_avg?: number; exam_count?: number; first_exam?: number };
  skill?: { weakest: string; weakest_score: number; spread: number; diagnosis: string;
    own_avg?: number; cohort_gap_pct?: number };
  classroom?: { participation?: number; homework?: number; teacher_concern: boolean };
  attendance?: { rate: number; recent: number; drop: number };
};

/* Turkish suffixes follow how the number is *read*, not its digits: "47'si" but
   "54'ü". Hand-written suffixes were coming out wrong, so they are looked up. */
const SUFFIX: Record<number, [string, string]> = {  // [possessive, dative]
  0: ["ı","a"], 1: ["i","e"], 2: ["si","ye"], 3: ["ü","e"], 4: ["ü","e"], 5: ["i","e"],
  6: ["sı","ya"], 7: ["si","ye"], 8: ["i","e"], 9: ["u","a"],
  10: ["u","a"], 20: ["si","ye"], 30: ["u","a"], 40: ["ı","a"], 50: ["si","ye"],
  60: ["ı","a"], 70: ["i","e"], 80: ["i","e"], 90: ["ı","a"], 100: ["ü","e"]
};
function suffixKey(n: number) {
  const v = Math.abs(Math.round(n));
  if (v >= 100) return 100;
  return v % 10 !== 0 ? v % 10 : v;
}
const dative = (n: number) => "'" + SUFFIX[suffixKey(n)][1];
function possessiveDative(n: number) {           // 5'ine · 2'sine
  const p = SUFFIX[suffixKey(n)][0];
  return "'" + p + (/[ıua]$/.test(p) ? "na" : "ne");
}

/** The fourth state is not a severity. "none" means nobody has told us, and it
 *  has to be drawn as an absence — a dimension with no data shown in green reads
 *  as a clean bill of health the product never issued. */
export const band = (v: number | undefined) =>
  v === undefined ? "none" : v >= 60 ? "crit" : v >= 30 ? "warn" : "good";

export const STATE = {
  HIGH: { cls: "crit", word: "Acil" },
  MEDIUM: { cls: "warn", word: "Takipte" },
  LOW: { cls: "good", word: "Düşük risk" }
} as const;

export type Evidence = { dim: Dimension; score: number; text: string };

type Source = {
  dimensions: DimensionScores; detail: DimensionDetail | null;
  level: string; examFirst: number | null; examLast: number | null;
  /** The institution's passing mark; absent means the default it was scored with. */
  passMark?: number;
};

/** One sentence per dimension that is at least elevated, worst first. */
export function evidence(s: Source): Evidence[] {
  const passMark = s.passMark ?? DEFAULTS.passMark;
  const d = s.detail;
  if (!d) return [];
  const out: Evidence[] = [];

  const at = s.dimensions.attendance;
  if (at !== undefined && at >= 30 && d.attendance) {
    const a = d.attendance, missed = Math.max(1, Math.round((100 - a.rate) / 10));
    let t = a.rate < 85
      ? `Her 10 dersin ${missed}${possessiveDative(missed)} gelmiyor — devam oranı %${a.rate}`
      : `Devam oranı %${a.rate}`;
    if (a.drop >= 8) t += `, son bir ayda %${a.recent}${dative(a.recent)} düştü`;
    else if (a.drop >= 5) t += `, son bir ayda %${a.recent}${dative(a.recent)} geriledi`;
    out.push({ dim: "attendance", score: at, text: t });
  }

  const te = s.dimensions.test;
  if (te !== undefined && te >= 30 && d.test) {
    const t0 = d.test;
    // How many exams there actually were. Older snapshots predate the field and
    // were all scored on four.
    const examCount = t0.exam_count ?? 4;
    const first = t0.first_exam ?? s.examFirst;
    let t: string;
    if (t0.monotonic_decline && first !== null && first !== undefined)
      t = `Sınav notları ${WRITTEN[examCount] ?? examCount} sınavdır üst üste düşüyor (${first} → ${t0.last_exam})`;
    else if (t0.delta <= -8) t = `Sınav ortalaması ${Math.abs(t0.delta)} puan düştü`;
    else if (t0.delta <= -4) t = `Sınav ortalaması ${Math.abs(t0.delta)} puan geriledi`;
    else if (t0.last_exam < passMark) t = `Son sınavdan ${t0.last_exam} aldı — geçme notu ${passMark}`;
    else t = `Sınavlarda sınıfının %${Math.round(t0.cohort_gap_pct)} gerisinde`;
    if (t0.last_exam < passMark && !t.includes("geçme notu")) t += `; son sınavı ${t0.last_exam}`;
    out.push({ dim: "test", score: te, text: t });
  }

  const sk = s.dimensions.skill;
  if (sk !== undefined && sk >= 30 && d.skill) {
    const k = d.skill, w = SKILL[k.weakest] ?? k.weakest;
    const t = k.diagnosis === "beceri_acigi"
      ? `${w} çok zayıf: ${k.weakest_score} puan — kendi diğer becerilerinin ${Math.round(k.spread)} puan gerisinde`
      : k.diagnosis === "seviye_dusuklugu"
        ? `Tüm dil becerileri ${s.level} seviyesinin altında (en zayıfı ${w.toLocaleLowerCase("tr")}, ${k.weakest_score})`
        : `${w} ${k.weakest_score} puan`;
    out.push({ dim: "skill", score: sk, text: t });
  }

  const cl = s.dimensions.classroom;
  if (cl !== undefined && cl >= 30 && d.classroom) {
    const c = d.classroom, bits: string[] = [];
    if (c.participation !== undefined && c.participation <= 3) bits.push("derse neredeyse hiç katılmıyor");
    else if (c.participation !== undefined && c.participation <= 5) bits.push(`derse katılımı zayıf (${c.participation}/10)`);
    if (c.homework !== undefined && c.homework < 50) bits.push(`ödev tamamlama oranı sadece %${c.homework}`);
    else if (c.homework !== undefined && c.homework < 75) bits.push(`ödev tamamlama oranı %${c.homework}`);
    if (c.teacher_concern) bits.push("öğretmeni endişesini bildirdi");
    if (bits.length) {
      const t = bits.join(", ");
      out.push({ dim: "classroom", score: cl, text: t[0].toLocaleUpperCase("tr") + t.slice(1) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function shortProblem(s: Source, dim: Dimension): string {
  const d = s.detail!;
  if (dim === "attendance") return (d.attendance?.rate ?? 0) < 70 ? "derse gelmiyor" : "devamı düşüyor";
  if (dim === "test") return (d.test?.monotonic_decline || (d.test?.delta ?? 0) <= -4)
    ? "notları düşüyor" : "notları sınıfın gerisinde";
  if (dim === "skill") return d.skill?.diagnosis === "beceri_acigi"
    ? `${(SKILL[d.skill.weakest] ?? d.skill.weakest).toLocaleLowerCase("tr")}sı çok zayıf`
    : "seviyesi kurun altında";
  const c = d.classroom;
  return c?.participation !== undefined && c.participation <= 5 ? "derse katılmıyor" : "ödevlerini yapmıyor";
}

/** The one line that has to carry the row on its own. */
export function headline(s: Source, found: Evidence[]): string {
  if (!found.length) return "Belirgin bir sorunu yok.";
  const p = found.map(x => shortProblem(s, x.dim));
  if (found.length === 1) return `Tek sorun: ${p[0]}.`;
  if (found.length === 2) return `İki sorun bir arada: ${p[0]} ve ${p[1]}.`;
  if (found.length === 3) return `Üç alanda birden sorunlu; en ağırı: ${p[0]}.`;
  return "Dört alanda birlikte destek gerekiyor.";
}

export type Step = { key: string; text: string; who: string | null };

export const needsAction = (action: string) => !action.startsWith("Aksiyon gerekmiyor");

/** A task's identity, taken from the task itself.
 *
 *  Recommendations are not stored with an id — the engine writes a sentence and
 *  the screen splits it — so the only thing that can identify one task across a
 *  page load is what the task says. Deriving the key from the text gives the two
 *  properties this has to have at once: the same task stays the same task while
 *  the recommendation holds, and a recommendation that is rewritten produces new
 *  keys, so the new plan starts open instead of inheriting the old plan's ticks.
 *
 *  A readable slug rather than a hash, because this value ends up in the audit
 *  trail and somebody reading the table should be able to tell what was closed.
 */
const FOLD: Record<string, string> = {
  "ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ğ": "g", "Ğ": "g",
  "ü": "u", "Ü": "u", "ö": "o", "Ö": "o", "ç": "c", "Ç": "c"
};
export const taskKey = (text: string) => text.toLocaleLowerCase("tr")
  .replace(/[ıİşŞğĞüÜöÖçÇ]/g, c => FOLD[c] ?? c)
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);

/** The engine writes one action string; the screen owes the reader who does what. */
export function steps(action: string): Step[] {
  let a = action.replace(/^ACİL:\s*/, "");
  if (!needsAction(a)) return [withKey({ text: "Aksiyon gerekmiyor — rutin takip", who: null })];
  a = a.replace("eğitmen görüşmesi + telafi planı", "@TEACHER");
  return a.split(" + ").map<Step>(part => withKey(describe(part)));
}
const withKey = (s: Omit<Step, "key">): Step => ({ key: taskKey(s.text), ...s });

function describe(part: string): Omit<Step, "key"> {
  if (part === "@TEACHER") return { text: "Eğitmenle görüşme ve telafi planı", who: "Eğitmen" };
  if (part.startsWith("hedefli")) {
    const skill = part.split(" ")[1];
    return { text: `2 haftalık ${SKILL[skill.toLocaleLowerCase("tr")] ?? skill} destek programı`, who: "Eğitmen" };
  }
  if (part.startsWith("eğitmen ile")) return { text: "Öğrenci değerlendirme toplantısı", who: "Akademik koordinatör" };
  if (part.startsWith("öğrenci ilişkileri")) return { text: "Aileyi/öğrenciyi ara — devamsızlığın nedenini öğren", who: "Öğrenci ilişkileri" };
  if (part.startsWith("seviye değerlendirmesi")) return { text: "Seviye değerlendirmesi — kur tekrarı gerekebilir", who: "Akademik koordinatör" };
  return { text: part, who: null };
}
