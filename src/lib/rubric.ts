/** Alt beceriler, ölçütler ve plan sözlüğü.
 *
 *  A speaking score of 22 does not say what to practise. What does is the level
 *  underneath it: how fluent, how intelligible, how well the target structure
 *  was used — judged on a named task, on a date, against criteria somebody wrote
 *  down. That is what this module names.
 *
 *  These criteria are **our draft**, not American LIFE's curriculum. The version
 *  string says so and travels with every stored result, so the day the
 *  institution hands over its own rubric the old results keep their own wording
 *  instead of being silently re-labelled — and a score on one version is never
 *  compared with a score on another.
 *
 *  Deliberately free of server imports, the same way lib/roles.ts is: the plan
 *  and assessment forms are client components and need the same vocabulary the
 *  server validates against.
 */
export const SKILLS = ["speaking", "writing", "listening", "reading"] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_LABEL: Record<Skill, string> = {
  speaking: "Konuşma", writing: "Yazma", listening: "Dinleme", reading: "Okuma"
};

export type Criterion = { code: string; label: string; hint: string };

/** Bumped whenever a criterion is added, removed or reworded.
 *
 *  Not a formality: re-assessment is only meaningful against the same criteria,
 *  so a stored result carries the version it was judged under and the screens
 *  refuse to draw a trend across two of them. */
export const RUBRIC_VERSION = "pilot-taslak-v1";
/** 0–4, because a teacher can hold four bands in their head between two students
 *  and cannot hold a hundred. The maximum is stored per result anyway — an
 *  institution that grades out of 5 should not have its numbers rescaled. */
export const RUBRIC_SCALE = 4;

export const RUBRICS: Record<Skill, Criterion[]> = {
  speaking: [
    { code: "akicilik", label: "Akıcılık", hint: "Duraksama, tekrar ve düzeltme sıklığı" },
    { code: "anlasilabilirlik", label: "Anlaşılabilirlik", hint: "Dinleyicinin çaba harcamadan anlaması" },
    { code: "etkilesim", label: "Etkileşim", hint: "Soru sorma, sırayı alma, konuyu sürdürme" },
    { code: "hedef_yapi", label: "Hedef yapıyı kullanma", hint: "Haftanın hedef yapısı ve kelimeleri" }
  ],
  writing: [
    { code: "duzen", label: "Düzen", hint: "Paragraf yapısı ve sıralama" },
    { code: "baglaclar", label: "Bağlaçlar ve akış", hint: "Cümleler arası bağ" },
    { code: "dogruluk", label: "Dil doğruluğu", hint: "Anlamı bozan hatalar" },
    { code: "hedef_yapi", label: "Hedef yapıyı kullanma", hint: "Haftanın hedef yapısı ve kelimeleri" }
  ],
  listening: [
    { code: "ana_fikir", label: "Ana fikri yakalama", hint: "Kaydın genel amacı" },
    { code: "ayrinti", label: "Ayrıntıyı yakalama", hint: "Sayı, isim, zaman gibi belirli bilgiler" },
    { code: "cikarim", label: "Çıkarım", hint: "Doğrudan söylenmeyeni anlama" }
  ],
  reading: [
    { code: "ana_fikir", label: "Ana fikri yakalama", hint: "Metnin genel amacı" },
    { code: "ayrinti", label: "Ayrıntıyı yakalama", hint: "Metindeki belirli bilgiler" },
    { code: "cikarim", label: "Çıkarım", hint: "Bağlamdan anlam çıkarma" }
  ]
};

/** Bir ölçütte "yeterli" sayılan en düşük değer.
 *
 *  Half the scale, and the threshold is a product decision rather than a
 *  pedagogical claim: below it the criterion is worth a week's work, above it
 *  there are better uses of the student's hundred and twenty minutes. */
export const NEEDS_WORK_AT = RUBRIC_SCALE / 2;

export const BAND_LABEL = (score: number, scaleMax: number) => {
  const share = score / scaleMax;
  return share <= .25 ? "çok zayıf" : share <= .5 ? "geride" : share <= .75 ? "yeterli" : "güçlü";
};

export const RESOURCE_KINDS = [
  { key: "art", label: "ART dijital çalışma" },
  { key: "guided_practice", label: "Guided Practice" },
  { key: "more", label: "+More etkinliği" },
  { key: "other", label: "Diğer" }
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number]["key"];
export const resourceKindLabel = (k: string) =>
  RESOURCE_KINDS.find(x => x.key === k)?.label ?? k;

export const TASK_OWNERS = [
  { key: "student", label: "Öğrenci" },
  { key: "teacher", label: "Eğitmen" },
  { key: "student_relations", label: "Öğrenci ilişkileri" },
  { key: "coordinator", label: "Akademik koordinatör" }
] as const;
export type TaskOwner = (typeof TASK_OWNERS)[number]["key"];
export const ownerLabel = (k: string) => TASK_OWNERS.find(x => x.key === k)?.label ?? k;

/** Yapmak ile öğrenmek ayrı durumlardır.
 *
 *  "student_done" is the student's claim, "teacher_checked" is somebody having
 *  looked, and neither of them is the re-assessment — that is a separate
 *  measurement with its own row. Collapsing the three is how a report comes to
 *  say a student improved because they ticked six boxes. */
export const TASK_STATES = [
  { key: "open", label: "Yapılacak", tone: "" },
  { key: "student_done", label: "Öğrenci tamamladı", tone: "warn" },
  { key: "teacher_checked", label: "Eğitmen kontrol etti", tone: "good" },
  { key: "blocked", label: "Yardım istendi", tone: "crit" },
  { key: "cancelled", label: "İptal", tone: "" }
] as const;
export type TaskState = (typeof TASK_STATES)[number]["key"];
export const taskStateLabel = (k: string) => TASK_STATES.find(x => x.key === k)?.label ?? k;
export const taskStateTone = (k: string) => TASK_STATES.find(x => x.key === k)?.tone ?? "";

export const PARTICIPATION_STATES = [
  { key: "proposed", label: "Önerildi" },
  { key: "reserved", label: "Yer ayrıldı" },
  { key: "attended", label: "Katıldı" },
  { key: "absent", label: "Gelmedi" }
] as const;
export type ParticipationState = (typeof PARTICIPATION_STATES)[number]["key"];
export const participationLabel = (k: string) =>
  PARTICIPATION_STATES.find(x => x.key === k)?.label ?? k;

/** Pazartesi'den başlayan hafta. */
export function weekStartOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}
export const DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
/** Hafta başından kaçıncı gün. Kurumun kaydettiği uygun günleri plana çevirir. */
export const dayOffsets = (days: string[]): number[] => {
  const found = days.map(d => DAY_NAMES.indexOf(d)).filter(i => i >= 0).sort((a, b) => a - b);
  // Nothing recorded, or nothing recognisable: spread over the working week
  // rather than stacking every task on Monday.
  return found.length ? found : [0, 1, 2, 3, 4];
};
