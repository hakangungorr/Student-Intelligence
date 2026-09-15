import { describe, it, expect } from "vitest";
import { criterionTrends, type Assessment } from "@/lib/learning";
import { draftFor, needsOf } from "@/lib/plan";
import { RUBRIC_VERSION, addDays, weekStartOf } from "@/lib/rubric";
import { steps, taskKey } from "@/lib/narrative";
import type { Resource, Session } from "@/lib/learning";

const assessment = (o: Partial<Assessment> & {
  assessedOn: string; skill: Assessment["skill"]; scores: Assessment["scores"];
}): Assessment => ({
  id: `${o.assessedOn}:${o.skill}`, studentId: "s1", objectiveId: null,
  taskLabel: "Kısa anlatım görevi", rubricVersion: RUBRIC_VERSION, scaleMax: 4,
  source: "teacher", note: null, ...o
});
const score = (code: string, value: number) => ({ code, label: code, score: value });

const resource = (skill: Resource["skill"], level: string | null): Resource => ({
  id: `r:${skill}`, title: `${skill} çalışması`, kind: "art", level, skill,
  objectiveId: null, minutes: 15, reference: null, isSample: false
});
const session = (skill: Session["skill"], startsAt: string, over: Partial<Session> = {}): Session => ({
  id: `x:${skill}:${startsAt}`, branchId: "b1", title: "Guided Practice", kind: "guided_practice",
  level: "B1", skill, startsAt, minutes: 30, capacity: 6, isSample: false, taken: 0, ...over
});

const WEEK = "2026-09-14";                       // bir pazartesi
const base = {
  studentId: "s1", studentName: "Deniz", branchId: "b1", level: "B1",
  weekStart: WEEK, availability: { weeklyMinutes: 120, days: [], recorded: true },
  sourcePeriodEnd: "2026-09-08", dimensions: {}, attendanceRate: null,
  attendanceFloor: 75, resources: [], sessions: []
};

describe("hafta hesabı", () => {
  it("hangi gün verilirse verilsin o haftanın pazartesisine yuvarlar", () => {
    expect(weekStartOf("2026-09-14")).toBe("2026-09-14");
    expect(weekStartOf("2026-09-18")).toBe("2026-09-14");
    expect(weekStartOf("2026-09-20")).toBe("2026-09-14");   // pazar, aynı haftanın sonu
    expect(weekStartOf("2026-09-21")).toBe("2026-09-21");
  });
  it("gün ekleme ay sınırını geçer", () => {
    expect(addDays("2026-09-29", 5)).toBe("2026-10-04");
  });
});

describe("ölçüt geçmişi", () => {
  it("ölçülmeyen ölçüt sıfır değil, boş kalır", () => {
    const t = criterionTrends([], "speaking");
    expect(t.every(c => c.latest === null && c.readings === 0)).toBe(true);
  });

  it("en yeni ölçümü ve karşılaştırılabilir bir öncekini bulur", () => {
    const all = [
      assessment({ assessedOn: "2026-09-12", skill: "speaking", scores: [score("akicilik", 3)] }),
      assessment({ assessedOn: "2026-09-05", skill: "speaking", scores: [score("akicilik", 2)] })
    ];
    const t = criterionTrends(all, "speaking").find(c => c.code === "akicilik")!;
    expect(t.latest).toBe(3);
    expect(t.previous).toBe(2);
    expect(t.comparable).toBe(true);
    expect(t.readings).toBe(2);
  });

  // Two numbers from two rulers are two numbers. The screens draw no arrow when
  // this is false, and the report makes no claim.
  it("farklı ölçüt sürümündeki puanı karşılaştırmaz", () => {
    const all = [
      assessment({ assessedOn: "2026-09-12", skill: "speaking", scores: [score("akicilik", 3)] }),
      assessment({
        assessedOn: "2026-09-05", skill: "speaking", scores: [score("akicilik", 2)],
        rubricVersion: "eski-surum"
      })
    ];
    const t = criterionTrends(all, "speaking").find(c => c.code === "akicilik")!;
    expect(t.latest).toBe(3);
    expect(t.previous).toBeNull();
    expect(t.comparable).toBe(false);
    expect(t.readings).toBe(2);
  });
});

describe("ihtiyaç tespiti", () => {
  it("ölçülmemiş beceriyi eksiklik değil, tanılama ihtiyacı sayar", () => {
    const needs = needsOf([], {}, null, 75);
    expect(needs.every(n => n.kind === "unmeasured")).toBe(true);
    expect(needs).toHaveLength(4);
    expect(needs[0].evidence).toContain("zayıflık kaydı değil");
  });

  it("tek ölçümden kesin eksiklik çıkarmaz", () => {
    const needs = needsOf(
      [assessment({ assessedOn: "2026-09-12", skill: "speaking", scores: [score("akicilik", 1)] })],
      {}, null, 75);
    const thin = needs.find(n => n.criterion === "akicilik")!;
    expect(thin.kind).toBe("thin");
    expect(thin.evidence).toContain("ikinci ölçüm");
  });

  it("iki ölçümde geride kalan ölçütü ihtiyaç sayar ve önce sıralar", () => {
    const all = [
      assessment({ assessedOn: "2026-09-12", skill: "speaking", scores: [score("akicilik", 1)] }),
      assessment({ assessedOn: "2026-09-05", skill: "speaking", scores: [score("akicilik", 2)] })
    ];
    const needs = needsOf(all, {}, null, 75);
    expect(needs[0].kind).toBe("measured");
    expect(needs[0].criterion).toBe("akicilik");
    expect(needs[0].evidence).toContain("2026-09-12");
  });

  it("devam sınırın altındaysa ayrı bir ihtiyaç üretir", () => {
    const needs = needsOf([], {}, 60, 75);
    expect(needs[0].kind).toBe("attendance");
    expect(needs[0].skill).toBeNull();
  });
});

describe("haftalık taslak", () => {
  const measured = [
    assessment({ assessedOn: "2026-09-12", skill: "speaking", scores: [score("akicilik", 1)] }),
    assessment({ assessedOn: "2026-09-05", skill: "speaking", scores: [score("akicilik", 2)] })
  ];

  it("bütçeyi aşmaz", () => {
    const draft = draftFor({
      ...base, assessments: measured,
      resources: [resource("speaking", "B1"), resource("listening", "B1")],
      sessions: [session("speaking", `${addDays(WEEK, 1)}T18:00:00+03:00`)]
    });
    const total = draft.tasks.reduce((t, x) => t + x.minutes, 0);
    expect(total).toBeLessThanOrEqual(draft.minutesBudget);
    expect(draft.tasks.length).toBeGreaterThan(0);
  });

  it("her ölçülen ihtiyaç için aynı ölçütle yeniden değerlendirme görevi koyar", () => {
    const draft = draftFor({ ...base, assessments: measured, resources: [resource("speaking", "B1")] });
    const reassess = draft.tasks.filter(t => t.checkMethod.includes("ölçüt"));
    expect(reassess.length).toBeGreaterThan(0);
    expect(reassess[0].owner).toBe("teacher");
  });

  it("her görev neden seçildiğini ve nasıl kontrol edileceğini taşır", () => {
    const draft = draftFor({ ...base, assessments: measured, resources: [resource("speaking", "B1")] });
    for (const t of draft.tasks) {
      expect(t.why.length).toBeGreaterThan(0);
      expect(t.expectedOutput.length).toBeGreaterThan(0);
      expect(t.checkMethod.length).toBeGreaterThan(0);
      expect(t.scheduledOn >= WEEK).toBe(true);
    }
  });

  // Nothing invents a resource to fill a gap; the draft says the gap is there
  // and the approval queue leads with it.
  it("katalog boşsa uydurmaz, eksik olduğunu söyler", () => {
    const draft = draftFor({ ...base, assessments: measured });
    expect(draft.problems.some(p => p.includes("içerik katalogda yok"))).toBe(true);
    expect(draft.tasks.every(t => t.resourceId === null)).toBe(true);
  });

  it("dolu oturumu önermez", () => {
    const draft = draftFor({
      ...base, assessments: measured, resources: [resource("speaking", "B1")],
      sessions: [session("speaking", `${addDays(WEEK, 1)}T18:00:00+03:00`, { taken: 6, capacity: 6 })]
    });
    expect(draft.tasks.every(t => t.sessionId === null)).toBe(true);
    expect(draft.problems.some(p => p.includes("destek oturumu bulunamadı"))).toBe(true);
  });

  it("kapasite girilmemişse varsayıldığını söyler", () => {
    const draft = draftFor({
      ...base, assessments: measured,
      availability: { weeklyMinutes: 120, days: [], recorded: false }
    });
    expect(draft.problems.some(p => p.includes("varsayılan 120"))).toBe(true);
  });

  it("örnek içerik önerdiğinde bunu sorun olarak kaydeder", () => {
    const draft = draftFor({
      ...base, assessments: measured,
      resources: [{ ...resource("speaking", "B1"), isSample: true }]
    });
    expect(draft.problems.some(p => p.includes("örnek kayıt"))).toBe(true);
  });
});

describe("görev kimliği", () => {
  it("aynı metin aynı anahtarı üretir", () => {
    expect(taskKey("Eğitmenle görüşme ve telafi planı"))
      .toBe(taskKey("Eğitmenle görüşme ve telafi planı"));
  });

  // The reason the key is derived from the text at all: a rewritten
  // recommendation must not inherit the old one's ticks.
  it("öneri değişince anahtar da değişir", () => {
    const before = steps("eğitmen görüşmesi + telafi planı + öğrenci ilişkileri araması (devamsızlık nedeni)");
    const after = steps("seviye değerlendirmesi — kur tekrarı / telafi programı");
    expect(before.map(s => s.key)).not.toEqual(after.map(s => s.key));
  });

  it("bir önerideki görevler ayrı ayrı kimliklenir", () => {
    const two = steps("eğitmen görüşmesi + telafi planı + öğrenci ilişkileri araması (devamsızlık nedeni)");
    expect(two).toHaveLength(2);
    expect(new Set(two.map(s => s.key)).size).toBe(2);
  });
});
