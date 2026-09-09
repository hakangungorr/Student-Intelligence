/** Turns the engine's evidence into the sentences the approved screens show.
 *
 * The scores say how bad it is; this says why, and it is the whole point of the
 * product. Kept as pure functions over a snapshot so the screens stay dumb and
 * the wording can be reviewed in one place.
 */

import { DEFAULTS } from "@/lib/settings";

export const DIMENSIONS = ["test", "skill", "classroom", "attendance"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const AREA: Record<Dimension, string> = {
  test: "Sınav notları", skill: "Dil becerileri",
  classroom: "Derse katılım", attendance: "Devamsızlık"
};
const SKILL: Record<string, string> = {
  speaking: "Konuşma", writing: "Yazma", listening: "Dinleme", reading: "Okuma"
};

export type DimensionScores = Record<Dimension, number>;
export type DimensionDetail = {
  test: { delta: number; last_exam: number; monotonic_decline: boolean; cohort_gap_pct: number;
    recent_avg?: number };
  skill: { weakest: string; weakest_score: number; spread: number; diagnosis: string;
    own_avg?: number; cohort_gap_pct?: number };
  classroom: { participation: number; homework: number; teacher_concern: boolean };
  attendance: { rate: number; recent: number; drop: number };
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

export const band = (v: number) => v >= 60 ? "crit" : v >= 30 ? "warn" : "good";

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

  if (s.dimensions.attendance >= 30 && d.attendance) {
    const a = d.attendance, missed = Math.max(1, Math.round((100 - a.rate) / 10));
    let t = a.rate < 85
      ? `Her 10 dersin ${missed}${possessiveDative(missed)} gelmiyor — devam oranı %${a.rate}`
      : `Devam oranı %${a.rate}`;
    if (a.drop >= 8) t += `, son bir ayda %${a.recent}${dative(a.recent)} düştü`;
    else if (a.drop >= 5) t += `, son bir ayda %${a.recent}${dative(a.recent)} geriledi`;
    out.push({ dim: "attendance", score: s.dimensions.attendance, text: t });
  }

  if (s.dimensions.test >= 30 && d.test) {
    const t0 = d.test;
    let t: string;
    if (t0.monotonic_decline && s.examFirst !== null && s.examLast !== null)
      t = `Sınav notları dört sınavdır üst üste düşüyor (${s.examFirst} → ${s.examLast})`;
    else if (t0.delta <= -8) t = `Sınav ortalaması ${Math.abs(t0.delta)} puan düştü`;
    else if (t0.delta <= -4) t = `Sınav ortalaması ${Math.abs(t0.delta)} puan geriledi`;
    else if (t0.last_exam < passMark) t = `Son sınavdan ${t0.last_exam} aldı — geçme notu ${passMark}`;
    else t = `Sınavlarda sınıfının %${Math.round(t0.cohort_gap_pct)} gerisinde`;
    if (t0.last_exam < passMark && !t.includes("geçme notu")) t += `; son sınavı ${t0.last_exam}`;
    out.push({ dim: "test", score: s.dimensions.test, text: t });
  }

  if (s.dimensions.skill >= 30 && d.skill) {
    const k = d.skill, w = SKILL[k.weakest] ?? k.weakest;
    const t = k.diagnosis === "beceri_acigi"
      ? `${w} çok zayıf: ${k.weakest_score} puan — kendi diğer becerilerinin ${Math.round(k.spread)} puan gerisinde`
      : k.diagnosis === "seviye_dusuklugu"
        ? `Tüm dil becerileri ${s.level} seviyesinin altında (en zayıfı ${w.toLocaleLowerCase("tr")}, ${k.weakest_score})`
        : `${w} ${k.weakest_score} puan`;
    out.push({ dim: "skill", score: s.dimensions.skill, text: t });
  }

  if (s.dimensions.classroom >= 30 && d.classroom) {
    const c = d.classroom, bits: string[] = [];
    if (c.participation <= 3) bits.push("derse neredeyse hiç katılmıyor");
    else if (c.participation <= 5) bits.push(`derse katılımı zayıf (${c.participation}/10)`);
    if (c.homework < 50) bits.push(`ödev tamamlama oranı sadece %${c.homework}`);
    else if (c.homework < 75) bits.push(`ödev tamamlama oranı %${c.homework}`);
    if (c.teacher_concern) bits.push("öğretmeni endişesini bildirdi");
    if (bits.length) {
      const t = bits.join(", ");
      out.push({ dim: "classroom", score: s.dimensions.classroom, text: t[0].toLocaleUpperCase("tr") + t.slice(1) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function shortProblem(s: Source, dim: Dimension): string {
  const d = s.detail!;
  if (dim === "attendance") return d.attendance.rate < 70 ? "derse gelmiyor" : "devamı düşüyor";
  if (dim === "test") return (d.test.monotonic_decline || d.test.delta <= -4)
    ? "notları düşüyor" : "notları sınıfın gerisinde";
  if (dim === "skill") return d.skill.diagnosis === "beceri_acigi"
    ? `${(SKILL[d.skill.weakest] ?? d.skill.weakest).toLocaleLowerCase("tr")}sı çok zayıf`
    : "seviyesi kurun altında";
  return d.classroom.participation <= 5 ? "derse katılmıyor" : "ödevlerini yapmıyor";
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

export type Step = { text: string; who: string | null };

export const needsAction = (action: string) => !action.startsWith("Aksiyon gerekmiyor");

/** The engine writes one action string; the screen owes the reader who does what. */
export function steps(action: string): Step[] {
  let a = action.replace(/^ACİL:\s*/, "");
  if (!needsAction(a)) return [{ text: "Aksiyon gerekmiyor — rutin takip", who: null }];
  a = a.replace("eğitmen görüşmesi + telafi planı", "@TEACHER");
  return a.split(" + ").map<Step>(part => {
    if (part === "@TEACHER") return { text: "Eğitmenle görüşme ve telafi planı", who: "Eğitmen" };
    if (part.startsWith("hedefli")) {
      const skill = part.split(" ")[1];
      return { text: `2 haftalık ${SKILL[skill.toLocaleLowerCase("tr")] ?? skill} destek programı`, who: "Eğitmen" };
    }
    if (part.startsWith("eğitmen ile")) return { text: "Öğrenci değerlendirme toplantısı", who: "Akademik koordinatör" };
    if (part.startsWith("öğrenci ilişkileri")) return { text: "Aileyi/öğrenciyi ara — devamsızlığın nedenini öğren", who: "Öğrenci ilişkileri" };
    if (part.startsWith("seviye değerlendirmesi")) return { text: "Seviye değerlendirmesi — kur tekrarı gerekebilir", who: "Akademik koordinatör" };
    return { text: part, who: null };
  });
}
