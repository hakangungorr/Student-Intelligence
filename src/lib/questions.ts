import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAgenda, type Agenda, type AgendaStudent, type HeatRow } from "@/lib/agenda";
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
  { key: "konusma", q: "Hangi şubede konuşma zayıf?" },
  { key: "plan", q: "Kimin haftalık planı onay bekliyor?" },
  { key: "yeniden", q: "Kimler yeniden değerlendirilmeli?" }
] as const;
export type QuestionKey = (typeof QUESTIONS)[number]["key"];

/** Which words mean the question, and which merely go with it.
 *
 *  Matching on any known word answered questions nobody asked. "Bu hafta kaç
 *  deneme yapıldı?" hit `hafta`, scored one point for the priority list, and
 *  came back with ten students ranked by risk — a confident answer to a
 *  different question, which is the worst thing this screen can do, because the
 *  whole claim of the assistant is that its numbers are the dashboard's numbers.
 *
 *  So a question is only recognised by a word that could not belong to another
 *  one. `hafta`, `not` and `şube` are context: they sharpen a match that an
 *  anchor already made, and on their own they mean nothing.
 */
const ANCHORS: Record<QuestionKey, string[]> = {
  oncelik: ["kimlerle", "kiminle", "öncelik", "ilgilen", "acil", "kimler riskte"],
  // Suffixed forms rather than the bare stem: "kur" alone also sits inside
  // "kurum", and matching the institution's own name to a question about levels
  // is the kind of near-miss this list exists to stop.
  kur: ["hangi kur", "kurda", "kurun", "kur hangisi", "sorunlu kur", "seviye"],
  birlikte: ["devamsız", "devamı düşen", "hem devam"],
  konusma: ["konuşma", "speaking"],
  plan: ["plan", "taslak", "onay bekle"],
  yeniden: ["yeniden değerlendir", "yeniden ölç", "tekrar ölç", "yeniden ölçüm"]
};
const SUPPORT: Record<QuestionKey, string[]> = {
  oncelik: ["hafta", "kim", "öğrenci", "liste"],
  kur: ["sorunlu", "problem", "kötü", "zayıf", "b1", "b2", "a2"],
  birlikte: ["not", "düşen", "artan", "hem", "birlikte"],
  konusma: ["şube", "beceri", "zayıf", "pratik"],
  plan: ["onay", "kim", "bekliyor", "haftalık"],
  yeniden: ["ölçüt", "beceri", "kim", "gerek"]
};

/** Free text is matched by counting known words, never by guessing. A question
 *  with no anchor returns nothing rather than the closest answer: "bunu henüz
 *  cevaplayamıyorum" is a true sentence, and the alternative is not. */
export function match(text: string): QuestionKey | null {
  const t = text.toLocaleLowerCase("tr");
  let best: QuestionKey | null = null, score = 0;
  for (const key of Object.keys(ANCHORS) as QuestionKey[]) {
    const anchors = ANCHORS[key].filter(w => t.includes(w)).length;
    if (!anchors) continue;
    const total = anchors * 2 + SUPPORT[key].filter(w => t.includes(w)).length;
    if (total > score) { score = total; best = key; }
  }
  return best;
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
  if (key === "plan") return planQueue(agenda);
  if (key === "yeniden") return reassessmentDue(agenda);
  return weakestSpeaking(client, agenda);
}

/** Onay bekleyen taslaklar — risk sırasına göre değil, karar sırasına göre. */
function planQueue(a: Agenda): Answer {
  const waiting = a.students.filter(s => s.plan.state === "draft");
  if (!waiting.length) return {
    lead: a.planMissing
      ? `Onay bekleyen taslak yok. Aksiyon önerilen **${a.planMissing} öğrenci** için ise henüz `
        + "plan hazırlanmamış."
      : "Onay bekleyen taslak yok.",
    rows: [], source: `Kaynak: ${a.weekStart} haftasının çalışma planları`
  };
  return {
    lead: `**${waiting.length} taslak** onay bekliyor. Taslak, öğretmen onaylayana kadar `
      + "öğrenciye gösterilmez ve hiçbir oturumda yer ayırmaz.",
    rows: waiting.map(s => ({
      label: s.name, sub: `${s.branch} · ${s.level} — ${s.plan.tasks} görev`,
      right: "Taslak", tone: "warn", href: `/workspace/plans/${s.plan.id}`
    })),
    source: `Kaynak: ${a.weekStart} haftasının onaylanmamış planları`
  };
}

/** Planı onaylanmış ama aynı ölçütle yeniden ölçülmemiş öğrenciler.
 *
 *  The question the pilot is measured on: work without a second measurement
 *  produces activity and no evidence, and this is the list of students where
 *  that is currently true. */
function reassessmentDue(a: Agenda): Answer {
  const due = a.students.filter(s => s.plan.reassessPending);
  if (!due.length) return {
    lead: "Yeniden değerlendirme bekleyen öğrenci yok.", rows: [],
    source: `Kaynak: ${a.weekStart} haftasının onaylı planları`
  };
  return {
    lead: `**${due.length} öğrencinin** planı onaylı ama aynı ölçütle yeni bir ölçüm yapılmamış. `
      + "Görevlerin tamamlanmış olması gelişme kanıtı değildir; ölçüm yapılmadan bu öğrenciler "
      + "için gelişim raporunda bir iddia yer almaz.",
    rows: due.map(s => ({
      label: s.name, sub: `${s.branch} · ${s.level} — ${s.plan.done}/${s.plan.tasks} görev tamamlandı`,
      right: "Ölçüm bekliyor", tone: "warn", href: `/workspace/students/${s.id}?g=beceri`
    })),
    source: "Kaynak: onaylı planlardaki yeniden değerlendirme görevleri"
  };
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
  // Only the dimensions the level actually has data for; a level nobody has
  // measured at all cannot be the worst one.
  const measured = (r: HeatRow) => DIMENSIONS
    .map(d => [d, r.scores[d]] as const)
    .filter((x): x is [Dimension, number] => x[1] !== undefined);
  const rows = a.byLevel.filter(r => r.count >= 5 && measured(r).length)
    .map(r => ({ r, peak: Math.max(...measured(r).map(([, v]) => v)) }))
    .sort((x, y) => y.peak - x.peak);
  if (!rows.length) return { lead: "Karşılaştırma yapacak kadar büyük bir kur yok.", rows: [], source: "" };
  const { r } = rows[0];
  const worst = [...measured(r)].sort((x, y) => y[1] - x[1])[0];
  const group = a.students.filter(s => s.level === r.label);
  const floor = a.settings.attendanceFloor;
  const below = group.filter(s => s.attendanceRate !== null && s.attendanceRate < floor).length;
  const extra = worst[0] === "attendance"
    ? ` ${r.count} öğrencinin **${below} tanesinde** devam oranı %${floor} sınırının altında. `
      + `Bu kurda önce öğrencileri derse getirmek gerekiyor; içerik desteği tek başına işe yaramaz.`
    : ` ${r.count} öğrencinin ${r.urgent} tanesi acil listede.`;
  return {
    lead: `**${r.label}.** En büyük sorunu ${AREA[worst[0]].toLocaleLowerCase("tr")}.` + extra,
    rows: measured(r).map(([d, v]) => ({ label: AREA[d], right: String(v) }))
      .sort((x, y) => Number(y.right) - Number(x.right)),
    source: `Kaynak: ${r.label} kurundaki ${r.count} öğrencinin ortalaması · 0–100, yüksek = kötü`
  };
}

/** Two signals that are unremarkable apart and serious together. */
function bothSignals(a: Agenda): Answer {
  const list = a.students
    // Both halves have to have been measured: the pairing is the point, and a
    // student missing one of the two is not evidence either way.
    .filter(s => s.detail?.attendance !== undefined && s.detail.test !== undefined
      && s.detail.attendance.drop >= 8 && s.detail.test.delta <= -4)
    .sort((x, y) => x.detail!.test!.delta - y.detail!.test!.delta);
  if (!list.length) return { lead: "İki sinyali birden veren öğrenci yok.", rows: [], source: "" };
  const urgent = list.filter(s => s.level_ === "HIGH").length;
  return {
    lead: `**${list.length} öğrenci.** Bunların hem devamı son bir ayda belirgin düşmüş, hem sınav `
      + `ortalaması gerilemiş. ${urgent} tanesi zaten acil listede. Bu ikisi bir arada görülüyorsa `
      + `öğrenci genelde okuldan kopuyor demektir — ayrı ayrı bakınca fark edilmez.`,
    rows: list.map(s => ({
      label: s.name, sub: `${s.branch} · ${s.level}`, href: link(s),
      right: `devam %${s.detail!.attendance!.rate}→%${s.detail!.attendance!.recent} · not ${s.detail!.test!.delta}`
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
  const gap = w.ot - w.sp;
  if (gap <= 0) return {
    lead: `Konuşmanın diğer becerilerin gerisinde kaldığı bir şube yok.`,
    rows: rows.map(branchRow), source: "Kaynak: şube bazında beceri puanı ortalamaları"
  };
  // With one branch there is nothing to compare against, and Math.max of an
  // empty list is -Infinity — which used to be printed as "en fazla -Infinity
  // puan". A comparison sentence needs a second group or it does not belong.
  const others = rows.slice(1).map(r => r.ot - r.sp);
  const comparison = others.length
    ? ` Diğer şubelerde bu fark en fazla ${Math.max(...others).toFixed(0)} puan.`
    : " Karşılaştırılacak ikinci bir şube yok, bu yüzden farkın şubeye özgü olup olmadığı söylenemez.";
  // What the numbers support, and not a word more. A low speaking average is a
  // measurement; "pratik yetersiz" is a cause, and the product has never looked
  // at how much practice this branch does or under what conditions it assessed.
  // Naming the checks instead of the cause is what makes the sentence actionable
  // rather than merely confident.
  const small = w.n < 5 ? ` ${w.n} öğrenciyle ölçülmüş; bir eğilim değil, bakılacak bir işaret.` : "";
  return {
    lead: `**${w.branch}.** ${w.branch}'de konuşma ortalaması **${w.sp.toFixed(0)}**, diğer üç beceri `
      + `ise **${w.ot.toFixed(0)}** — arada ${gap.toFixed(0)} puan var.` + comparison + small
      + ` Fark konuşma ölçümünde toplanıyor; nedeni pratik olanağı da olabilir, değerlendirme `
      + `koşulları veya grubun bileşimi de. Şubedeki konuşma görevlerinin ve ölçütlerinin `
      + `incelenmesi gerekiyor.`,
    rows: rows.map(branchRow),
    source: "Kaynak: şube bazında beceri puanı ortalamaları · neden değil, fark ölçülüyor"
  };
}

const branchRow = (r: { branch: string; n: number; sp: number; ot: number }): AnswerRow => ({
  label: r.branch, sub: `${r.n} öğrenci`,
  right: `konuşma ${r.sp.toFixed(0)} · diğerleri ${r.ot.toFixed(0)}`
});
