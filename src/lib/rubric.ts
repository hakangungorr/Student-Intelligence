/** Ölçütler ve planın sözlüğü.
 *
 *  A speaking score of 22 does not say what to practise. What does is the level
 *  underneath it: how fluent, how intelligible, how well the target structure
 *  was used — judged on a named task, on a date, against criteria somebody wrote
 *  down. The criteria here are those sub-skills; there is no second catalogue of
 *  them to keep in step.
 *
 *  They are **our draft**, not American LIFE's curriculum. The version string
 *  says so and travels with every stored result, so the day the institution
 *  hands over its own rubric the old results keep their own wording, and a
 *  score on one version is never compared with a score on another.
 *
 *  Deliberately free of server imports, the same way lib/roles.ts is: forms are
 *  client components and need the same vocabulary the server validates against.
 */
export const SKILLS = ["speaking", "writing", "listening", "reading"] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_LABEL: Record<Skill, string> = {
  speaking: "Konuşma", writing: "Yazma", listening: "Dinleme", reading: "Okuma"
};

export type Criterion = { code: string; label: string; hint: string };

/** Bumped whenever a criterion is added, removed or reworded. */
export const RUBRIC_VERSION = "pilot-taslak-v1";
/** 0–4, because a teacher can hold four bands in their head. The maximum is
 *  stored per result anyway, so an institution grading out of 5 is not rescaled. */
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

/** At or below this a criterion is worth a week's work. Half the scale; a
 *  product decision, not a pedagogical claim. */
export const NEEDS_WORK_AT = RUBRIC_SCALE / 2;

export const bandLabel = (score: number, scaleMax: number) => {
  const share = score / scaleMax;
  return share <= .25 ? "çok zayıf" : share <= .5 ? "geride" : share <= .75 ? "yeterli" : "güçlü";
};

/** Kütüphanedeki bir öğenin hangi programa ait olduğu. Etiket, entegrasyon değil. */
export const PROGRAMS = [
  { key: "art", label: "ART" },
  { key: "guided_practice", label: "Guided Practice" },
  { key: "more", label: "+More" },
  { key: "other", label: "Diğer" }
] as const;
export type Program = (typeof PROGRAMS)[number]["key"];
export const programLabel = (k: string) => PROGRAMS.find(x => x.key === k)?.label ?? k;

export const OWNERS = [
  { key: "student", label: "Öğrenci" },
  { key: "teacher", label: "Eğitmen" },
  { key: "student_relations", label: "Öğrenci ilişkileri" },
  { key: "coordinator", label: "Akademik koordinatör" }
] as const;
export type Owner = (typeof OWNERS)[number]["key"];
export const ownerLabel = (k: string) => OWNERS.find(x => x.key === k)?.label ?? k;

/** Üç durum. "Yapıldı" işin kendisidir, öğrenmenin kanıtı değil — onu yalnızca
 *  kontrol ölçümü söyler. */
export const STATUSES = [
  { key: "todo", label: "Yapılacak", tone: "" },
  { key: "done", label: "Yapıldı", tone: "good" },
  { key: "stuck", label: "Takıldı", tone: "crit" }
] as const;
export type TaskStatus = (typeof STATUSES)[number]["key"];
export const statusLabel = (k: string) => STATUSES.find(x => x.key === k)?.label ?? k;
export const statusTone = (k: string) => STATUSES.find(x => x.key === k)?.tone ?? "";

/** work: öğrencinin çalışması · staff: kurumda biri harekete geçer ·
 *  measure: ölçüm eksik · check: kontrol ölçümü. */
export type TaskKind = "work" | "staff" | "measure" | "check";

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** "16 Eylül", "Çarşamba 17 Eylül" — tarih ekranda hep aynı biçimde. */
export function dayText(iso: string, weekday = false) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric", month: "long", ...(weekday ? { weekday: "long" as const } : {})
  }).format(new Date(y, m - 1, d));
}
