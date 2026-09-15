import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SKILLS, SKILL_LABEL, addDays, type Skill } from "@/lib/rubric";

/** Pilot için örnek katalog — kurumun kendi içeriği değildir.
 *
 *  The plan screens cannot be shown without something to point a student at, and
 *  American LIFE's own content list, lesson codes and Guided Practice timetable
 *  have not been seen. The choice is therefore between an empty product and
 *  labelled examples, and the one thing that is not on the table is unlabelled
 *  examples: every row written here carries `is_sample` / `confirmed = false`,
 *  every screen that shows one says so, and nothing in the product ever claims
 *  a student was enrolled in an ART activity or that a seat was booked in a real
 *  session.
 *
 *  Scoped to one level and one branch on purpose. The pilot is one B1 group; a
 *  catalogue generated across every level would be five times as much invented
 *  material to disown later.
 */
export type SeedResult = { objectives: number; resources: number; sessions: number };

const OBJECTIVES: Record<Skill, { code: string; label: string }[]> = {
  speaking: [
    { code: "gecmis-anlatma", label: "Geçmiş olayları sırasıyla ve tutarlı zamanla anlatmak" },
    { code: "gunluk-etkilesim", label: "Günlük bir konuşmada soru sorup konuyu sürdürmek" }
  ],
  writing: [
    { code: "paragraf-duzeni", label: "Bir paragrafı giriş, gelişme ve sonuç olarak kurmak" },
    { code: "baglac-kullanimi", label: "Cümleleri uygun bağlaçlarla birbirine bağlamak" }
  ],
  listening: [
    { code: "ayrinti-yakalama", label: "Kısa bir kayıtta sayı, isim ve zaman bilgisini yakalamak" },
    { code: "amac-anlama", label: "Konuşmacının amacını doğrudan söylenmeden anlamak" }
  ],
  reading: [
    { code: "ana-fikir", label: "Kısa bir metnin ana fikrini çıkarmak" },
    { code: "baglamdan-anlam", label: "Bilinmeyen kelimenin anlamını bağlamdan tahmin etmek" }
  ]
};

const RESOURCES: Record<Skill, { title: string; kind: string; minutes: number }[]> = {
  speaking: [
    { title: "Örnek: hedef yapı hazırlık çalışması", kind: "art", minutes: 15 },
    { title: "Örnek: kısa anlatım etkinliği", kind: "more", minutes: 30 }
  ],
  writing: [
    { title: "Örnek: örnek metin incelemesi", kind: "art", minutes: 15 },
    { title: "Örnek: kısa yazı ve düzeltme turu", kind: "other", minutes: 30 }
  ],
  listening: [
    { title: "Örnek: seviyeye uygun dinleme seti", kind: "art", minutes: 15 },
    { title: "Örnek: dinleme ve yeniden anlatma etkinliği", kind: "more", minutes: 30 }
  ],
  reading: [
    { title: "Örnek: kısa metin ve anlama soruları", kind: "art", minutes: 15 },
    { title: "Örnek: okuma kulübü etkinliği", kind: "more", minutes: 30 }
  ]
};

export async function seedSampleCatalogue(
  client: SupabaseClient, organizationId: string, branchId: string, level: string
): Promise<SeedResult> {
  const fail = (e: { message: string } | null, what: string) => {
    if (e) throw new Error(`${what}: ${e.message}`);
  };

  const existing = await client.from("learning_objectives")
    .select("code").eq("organization_id", organizationId).eq("level", level);
  fail(existing.error, "Mevcut katalog okunamadı");
  const known = new Set((existing.data ?? []).map(o => o.code as string));

  const objectiveRows = SKILLS.flatMap(skill => OBJECTIVES[skill]
    .filter(o => !known.has(o.code))
    .map(o => ({
      organization_id: organizationId, level, skill, code: o.code, label: o.label,
      curriculum_version: "pilot-taslak", confirmed: false
    })));
  let objectives: { id: string; skill: string; code: string }[] = [];
  if (objectiveRows.length) {
    const written = await client.from("learning_objectives").insert(objectiveRows).select("id,skill,code");
    fail(written.error, "Alt beceriler yazılamadı");
    objectives = written.data as typeof objectives;
  }
  const firstObjective = new Map(SKILLS.map(s =>
    [s, objectives.find(o => o.skill === s)?.id ?? null]));

  const priorResources = await client.from("learning_resources")
    .select("title").eq("organization_id", organizationId).eq("level", level);
  fail(priorResources.error, "Mevcut içerik okunamadı");
  const haveResource = new Set((priorResources.data ?? []).map(r => r.title as string));

  const resourceRows = SKILLS.flatMap(skill => RESOURCES[skill]
    .map(r => ({ ...r, title: `${r.title} · ${SKILL_LABEL[skill]}` }))
    .filter(r => !haveResource.has(r.title))
    .map(r => ({
      organization_id: organizationId, title: r.title, kind: r.kind, level, skill,
      objective_id: firstObjective.get(skill), minutes: r.minutes,
      reference: null, is_sample: true
    })));
  if (resourceRows.length)
    fail((await client.from("learning_resources").insert(resourceRows)).error, "İçerik yazılamadı");

  // Two weeks out, on the weekdays a course most often runs an extra session.
  // Times are examples like everything else here; the institution's real
  // timetable replaces them.
  const monday = addDays(new Date().toISOString().slice(0, 10), 1);
  const sessionRows = [
    { skill: "speaking" as Skill, kind: "guided_practice", day: 1, hour: 18, minutes: 30, capacity: 6 },
    { skill: "listening" as Skill, kind: "more", day: 3, hour: 18, minutes: 30, capacity: 10 },
    { skill: "writing" as Skill, kind: "guided_practice", day: 8, hour: 18, minutes: 30, capacity: 6 }
  ];
  const priorSessions = await client.from("support_sessions")
    .select("title").eq("branch_id", branchId).gte("starts_at", new Date().toISOString());
  fail(priorSessions.error, "Mevcut oturumlar okunamadı");
  const haveSession = new Set((priorSessions.data ?? []).map(s => s.title as string));

  const rows = sessionRows.map(s => ({
    organization_id: organizationId, branch_id: branchId,
    title: `Örnek: ${SKILL_LABEL[s.skill].toLocaleLowerCase("tr")} destek oturumu`,
    kind: s.kind, level, skill: s.skill,
    starts_at: `${addDays(monday, s.day)}T${String(s.hour).padStart(2, "0")}:00:00+03:00`,
    minutes: s.minutes, capacity: s.capacity, is_sample: true
  })).filter(s => !haveSession.has(s.title));
  if (rows.length)
    fail((await client.from("support_sessions").insert(rows)).error, "Oturumlar yazılamadı");

  return { objectives: objectiveRows.length, resources: resourceRows.length, sessions: rows.length };
}

/** Bu ölçütler kurumun mu, bizim taslağımız mı — her ekranın söylemesi gereken cümle. */
export const SAMPLE_WARNING =
  "Örnek olarak işaretli kayıtlar kurumun doğrulanmış içeriği değildir. Kurum kendi içerik "
  + "listesini ve destek takvimini verdiğinde bu kayıtlar değiştirilmeli.";
export const RUBRIC_WARNING =
  "Ölçütler pilot taslağıdır; resmî CEFR tanımlayıcıları veya American LIFE müfredat kodları "
  + "değildir.";
