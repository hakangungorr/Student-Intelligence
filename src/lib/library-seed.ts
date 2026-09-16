import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SKILLS, SKILL_LABEL, addDays, todayIso, type Skill } from "@/lib/rubric";

/** Pilot için örnek kütüphane — kurumun kendi içeriği değildir.
 *
 *  The plan cannot suggest anything from an empty library, and American LIFE's
 *  own content list and Guided Practice timetable have not been seen. So the
 *  choice is an empty product or labelled examples, and unlabelled examples are
 *  not on the table: every row written here is `is_sample`, every screen that
 *  shows it says so, and nothing claims a student was put into ART or booked
 *  into a real session.
 *
 *  Scoped to one level and one branch: the pilot is one group, and a library
 *  generated for every level would be five times as much invented material to
 *  disown later.
 */
const STUDIES: Record<Skill, { title: string; program: string; minutes: number }[]> = {
  speaking: [
    { title: "Örnek: hedef yapı hazırlık çalışması", program: "art", minutes: 15 },
    { title: "Örnek: kısa anlatma çalışması", program: "other", minutes: 15 }
  ],
  writing: [
    { title: "Örnek: örnek metin incelemesi", program: "art", minutes: 15 },
    { title: "Örnek: kısa yazı ve düzeltme", program: "other", minutes: 30 }
  ],
  listening: [
    { title: "Örnek: seviyeye uygun dinleme seti", program: "art", minutes: 15 }
  ],
  reading: [
    { title: "Örnek: kısa metin ve anlama soruları", program: "art", minutes: 15 }
  ]
};
const EVENTS: { skill: Skill; program: string; inDays: number; capacity: number }[] = [
  { skill: "speaking", program: "guided_practice", inDays: 2, capacity: 6 },
  { skill: "listening", program: "more", inDays: 4, capacity: 10 },
  { skill: "writing", program: "guided_practice", inDays: 9, capacity: 6 }
];

export async function seedSampleLibrary(
  client: SupabaseClient, organizationId: string, branchId: string, level: string
): Promise<{ studies: number; events: number }> {
  const fail = (e: { message: string } | null, what: string) => {
    if (e) throw new Error(`${what}: ${e.message}`);
  };
  const existing = await client.from("library_items").select("title,kind")
    .eq("organization_id", organizationId).eq("active", true);
  fail(existing.error, "Kütüphane okunamadı");
  const have = new Set((existing.data ?? []).map(r => `${r.kind}:${r.title}`));

  const studies = SKILLS.flatMap(skill => STUDIES[skill].map(s => ({
    organization_id: organizationId, kind: "study", program: s.program,
    title: `${s.title} · ${SKILL_LABEL[skill]}`, skill, level, minutes: s.minutes, is_sample: true
  }))).filter(r => !have.has(`study:${r.title}`));
  if (studies.length) fail((await client.from("library_items").insert(studies)).error, "Çalışmalar yazılamadı");

  // Example times, like everything else here; the institution's timetable replaces them.
  const events = EVENTS.map(e => ({
    organization_id: organizationId, branch_id: branchId, kind: "event", program: e.program,
    title: `Örnek: ${SKILL_LABEL[e.skill].toLocaleLowerCase("tr")} etkinliği`,
    skill: e.skill, level, minutes: 30, capacity: e.capacity, is_sample: true,
    starts_at: `${addDays(todayIso(), e.inDays)}T18:00:00+03:00`
  })).filter(r => !have.has(`event:${r.title}`));
  if (events.length) fail((await client.from("library_items").insert(events)).error, "Etkinlikler yazılamadı");

  return { studies: studies.length, events: events.length };
}

export const SAMPLE_WARNING =
  "“Örnek” işaretli kayıtlar kurumun doğrulanmış içeriği değildir. Kurum kendi içerik listesini "
  + "ve etkinlik takvimini verdiğinde bunlar değiştirilmeli.";
export const RUBRIC_WARNING =
  "Ölçütler pilot taslağıdır; resmî CEFR tanımlayıcıları veya American LIFE müfredat kodları değildir.";
