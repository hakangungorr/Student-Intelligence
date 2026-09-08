import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAgenda, type Agenda, type AgendaStudent } from "@/lib/agenda";
import { AREA, DIMENSIONS, STATE, type Dimension } from "@/lib/narrative";
import { SKILL_ORDER } from "@/lib/student";
import { fetchAll } from "@/lib/paginate";

/** The assistant answers from the database, not from a language model.
 *
 *  Every answer below is a query with a sentence attached: the numbers come from
 *  the same rows the screens draw, so the assistant cannot claim something the
 *  dashboard contradicts. A model can be put in front of this later to widen the
 *  range of questions; it should not be put in the way of the arithmetic. */
export const QUESTIONS = [
  { key: "oncelik", q: "Bu hafta kimlerle ilgilenmeliyiz?" },
  { key: "kur", q: "En sorunlu kur hangisi?" },
  { key: "birlikte", q: "Hem devamsızlığı artan hem notu düşen kimler var?" },
  { key: "konusma", q: "Hangi şubede konuşma zayıf?" }
] as const;
export type QuestionKey = (typeof QUESTIONS)[number]["key"];

const MATCH: Record<QuestionKey, string[]> = {
  oncelik: ["kim", "hafta", "öncelik", "ilgilen"],
  kur: ["kur", "b1", "problem", "sorunlu", "seviye"],
  birlikte: ["devamsız", "not", "düşen", "artan", "hem"],
  konusma: ["konuşma", "speaking", "şube", "beceri", "zayıf"]
};

/** Free text is matched by counting known words, never by guessing. An unmatched
 *  question returns nothing rather than the closest answer, because a confident
 *  answer to a question nobody asked is worse than "bunu henüz cevaplayamıyorum". */
export function match(text: string): QuestionKey | null {
  const t = text.toLocaleLowerCase("tr");
  let best: QuestionKey | null = null, score = 0;
  for (const [key, words] of Object.entries(MATCH) as [QuestionKey, string[]][]) {
    const hits = words.filter(w => t.includes(w)).length;
    if (hits > score) { score = hits; best = key; }
  }
  return score > 0 ? best : null;
}

export type AnswerRow = { label: string; sub?: string; right: string; href?: string; tone?: string };
export type Answer = { lead: string; rows: AnswerRow[]; source: string };

const mean = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
const link = (s: AgendaStudent) => `/workspace/students/${s.id}`;

export async function answer(client: SupabaseClient, key: QuestionKey): Promise<Answer> {
  const agenda = await loadAgenda(client);
  if (key === "oncelik") return priority(agenda);
  if (key === "kur") return worstLevel(agenda);
  if (key === "birlikte") return bothSignals(agenda);
  return weakestSpeaking(client, agenda);
}

function priority(a: Agenda): Answer {
  const top = a.students.slice(0, 10);
  const pending = a.students.filter(s => s.needsAction).length;
  return {
    lead: `**${a.urgent} öğrenci** acil ilgi bekliyor${a.previousUrgent !== null
      ? `, geçen hafta ${a.previousUrgent}'ti` : ""}. Aksiyon önerilen **${pending} öğrenci** var. `
      + `En acil ${top.length} tanesi aşağıda.`,
    rows: top.map(s => ({
      label: s.name, sub: `${s.branch} · ${s.level} — ${s.found[0]?.text ?? s.headline}`,
      right: STATE[s.level_].word, tone: STATE[s.level_].cls, href: link(s)
    })),
    source: `Kaynak: ${a.total} öğrencinin risk sıralaması`
  };
}

function worstLevel(a: Agenda): Answer {
  const rows = a.byLevel.filter(r => r.count >= 5)
    .map(r => ({ r, peak: Math.max(...DIMENSIONS.map(d => r.scores[d])) }))
    .sort((x, y) => y.peak - x.peak);
  if (!rows.length) return { lead: "Karşılaştırma yapacak kadar büyük bir kur yok.", rows: [], source: "" };
  const { r } = rows[0];
  const worst = DIMENSIONS.map(d => [d, r.scores[d]] as [Dimension, number]).sort((x, y) => y[1] - x[1])[0];
  const group = a.students.filter(s => s.level === r.label);
  const below = group.filter(s => s.attendanceRate !== null && s.attendanceRate < 75).length;
  const extra = worst[0] === "attendance"
    ? ` ${r.count} öğrencinin **${below} tanesi** derslerin dörtte birinden fazlasını kaçırıyor. `
      + `Bu kurda önce öğrencileri derse getirmek gerekiyor; içerik desteği tek başına işe yaramaz.`
    : ` ${r.count} öğrencinin ${r.urgent} tanesi acil listede.`;
  return {
    lead: `**${r.label}.** En büyük sorunu ${AREA[worst[0]].toLocaleLowerCase("tr")}.` + extra,
    rows: DIMENSIONS.map(d => ({ label: AREA[d], right: String(r.scores[d]) }))
      .sort((x, y) => Number(y.right) - Number(x.right)),
    source: `Kaynak: ${r.label} kurundaki ${r.count} öğrencinin ortalaması · 0–100, yüksek = kötü`
  };
}

/** Two signals that are unremarkable apart and serious together. */
function bothSignals(a: Agenda): Answer {
  const list = a.students
    .filter(s => s.detail && s.detail.attendance.drop >= 8 && s.detail.test.delta <= -4)
    .sort((x, y) => x.detail!.test.delta - y.detail!.test.delta);
  if (!list.length) return { lead: "İki sinyali birden veren öğrenci yok.", rows: [], source: "" };
  const urgent = list.filter(s => s.level_ === "HIGH").length;
  return {
    lead: `**${list.length} öğrenci.** Bunların hem devamı son bir ayda belirgin düşmüş, hem sınav `
      + `ortalaması gerilemiş. ${urgent} tanesi zaten acil listede. Bu ikisi bir arada görülüyorsa `
      + `öğrenci genelde okuldan kopuyor demektir — ayrı ayrı bakınca fark edilmez.`,
    rows: list.map(s => ({
      label: s.name, sub: `${s.branch} · ${s.level}`, href: link(s),
      right: `devam %${s.detail!.attendance.rate}→%${s.detail!.attendance.recent} · not ${s.detail!.test.delta}`
    })),
    source: "Kaynak: devamı en az 8 puan düşen ve sınav ortalaması en az 4 puan gerileyen öğrenciler"
  };
}

async function weakestSpeaking(client: SupabaseClient, a: Agenda): Promise<Answer> {
  const readings = await fetchAll<{ student_id: string; kind: string; value: number }>(
    () => client.from("student_measurements").select("student_id,kind,value")
      .eq("source_reference", "skill_profile"),
    "Beceri verisi okunamadı");
  const byStudent = new Map<string, Map<string, number>>();
  for (const m of readings) {
    const row = byStudent.get(m.student_id) ?? byStudent.set(m.student_id, new Map()).get(m.student_id)!;
    row.set(m.kind, Number(m.value));
  }
  const branches = new Map<string, { speaking: number[]; other: number[] }>();
  for (const s of a.students) {
    const skills = byStudent.get(s.id);
    if (!skills) continue;
    const speaking = skills.get("speaking");
    const other = SKILL_ORDER.filter(k => k !== "speaking")
      .map(k => skills.get(k)).filter((v): v is number => v !== undefined);
    if (speaking === undefined || other.length < 3) continue;
    const b = branches.get(s.branch) ?? branches.set(s.branch, { speaking: [], other: [] }).get(s.branch)!;
    b.speaking.push(speaking); b.other.push(mean(other));
  }
  const rows = [...branches.entries()]
    .map(([branch, v]) => ({ branch, n: v.speaking.length, sp: mean(v.speaking), ot: mean(v.other) }))
    .sort((x, y) => (x.sp - x.ot) - (y.sp - y.ot));
  if (!rows.length) return { lead: "Beceri verisi yok.", rows: [], source: "" };
  const w = rows[0];
  const others = rows.slice(1).map(r => Math.abs(r.ot - r.sp));
  return {
    lead: `**${w.branch}.** ${w.branch}'de konuşma ortalaması **${w.sp.toFixed(0)}**, diğer üç beceri `
      + `ise **${w.ot.toFixed(0)}** — arada ${(w.ot - w.sp).toFixed(0)} puan var. Diğer şubelerde bu fark `
      + `en fazla ${Math.max(...others).toFixed(0)} puan. Öğrenciler zayıf değil; ${w.branch}'de konuşma `
      + `pratiği yetersiz.`,
    rows: rows.map(r => ({
      label: r.branch, sub: `${r.n} öğrenci`,
      right: `konuşma ${r.sp.toFixed(0)} · diğerleri ${r.ot.toFixed(0)}`
    })),
    source: "Kaynak: şube bazında beceri puanı ortalamaları"
  };
}
