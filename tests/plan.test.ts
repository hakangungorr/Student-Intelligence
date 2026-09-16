import { describe, it, expect } from "vitest";
import { criterionTrends, type Assessment } from "@/lib/assessments";
import { friendly, needsFrom, suggest } from "@/lib/plan";
import type { LibraryItem } from "@/lib/library";
import { RUBRIC_VERSION, addDays } from "@/lib/rubric";
import { steps, taskKey } from "@/lib/narrative";

const assessment = (o: Partial<Assessment> & {
  assessedOn: string; skill: Assessment["skill"]; scores: Assessment["scores"];
}): Assessment => ({
  id: `${o.assessedOn}:${o.skill}`, studentId: "s1",
  taskLabel: "Kısa anlatım görevi", rubricVersion: RUBRIC_VERSION, scaleMax: 4,
  note: null, ...o
});
const score = (code: string, value: number) => ({ code, label: code, score: value });

const study = (skill: LibraryItem["skill"], over: Partial<LibraryItem> = {}): LibraryItem => ({
  id: `study:${skill}`, kind: "study", program: "art", title: `${skill} çalışması`,
  skill, level: "B1", minutes: 15, reference: null, branchId: null,
  startsAt: null, capacity: null, taken: 0, isSample: false, ...over
});
const event = (skill: LibraryItem["skill"], over: Partial<LibraryItem> = {}): LibraryItem => ({
  id: `event:${skill}`, kind: "event", program: "guided_practice", title: "Konuşma etkinliği",
  skill, level: "B1", minutes: 30, reference: null, branchId: "b1",
  startsAt: "2026-09-18T18:00:00+03:00", capacity: 6, taken: 0, isSample: false, ...over
});

const weak = [
  assessment({ assessedOn: "2026-09-12", skill: "speaking", scores: [score("akicilik", 1)] }),
  assessment({ assessedOn: "2026-09-05", skill: "speaking", scores: [score("akicilik", 2)] })
];
const base = {
  steps: [], because: "Sınav notları düşüyor.", assessments: weak,
  level: "B1", branchId: "b1", library: [] as LibraryItem[],
  checkOn: "2026-09-23", already: new Set<string>()
};

describe("ölçüt geçmişi", () => {
  it("ölçülmeyen ölçüt sıfır değil, boş kalır", () => {
    expect(criterionTrends([], "speaking").every(c => c.latest === null && c.readings === 0)).toBe(true);
  });
  it("en yeni ölçümü ve karşılaştırılabilir bir öncekini bulur", () => {
    const t = criterionTrends(weak, "speaking").find(c => c.code === "akicilik")!;
    expect([t.latest, t.previous, t.comparable, t.readings]).toEqual([1, 2, true, 2]);
  });
  // Two numbers from two rulers are two numbers.
  it("farklı ölçüt sürümündeki puanı karşılaştırmaz", () => {
    const t = criterionTrends([
      weak[0], { ...weak[1], rubricVersion: "eski-surum" }
    ], "speaking").find(c => c.code === "akicilik")!;
    expect([t.latest, t.previous, t.comparable]).toEqual([1, null, false]);
  });
});

describe("ihtiyaç", () => {
  it("ölçülmemiş beceri ihtiyaç değil, ölçülmemiş olarak kalır", () => {
    const { needs, unmeasured } = needsFrom([]);
    expect(needs).toHaveLength(0);
    expect(unmeasured).toEqual(["speaking", "writing", "listening", "reading"]);
  });
  it("tek ölçümden kesin eksiklik çıkarmaz", () => {
    const { needs } = needsFrom([weak[0]]);
    expect(needs[0].thin).toBe(true);
    expect(needs[0].evidence).toContain("Tek ölçüm");
  });
  it("tekrarlanan ölçümü tek ölçümden önce sıralar", () => {
    const { needs } = needsFrom([
      ...weak,
      assessment({ assessedOn: "2026-09-12", skill: "writing", scores: [score("duzen", 0)] })
    ]);
    expect(needs.map(n => [n.skill, n.thin])).toEqual([["speaking", false], ["writing", true]]);
  });
  it("eşiğin üstündeki ölçüt ihtiyaç sayılmaz", () => {
    const { needs } = needsFrom([
      assessment({ assessedOn: "2026-09-12", skill: "speaking", scores: [score("akicilik", 3)] })
    ]);
    expect(needs).toHaveLength(0);
  });
});

describe("öneriler", () => {
  // The regression that started the redesign: 28 plans, each with four identical
  // diagnostics, because nobody had been measured yet.
  it("hiç ölçüm yoksa tek bir 'önce ölç' önerir, dört tanılama değil", () => {
    const { items } = suggest({ ...base, assessments: [] });
    const measures = items.filter(i => i.kind === "measure");
    expect(measures).toHaveLength(1);
    expect(measures[0].title).toBe("İlk ölçümü yap");
    expect(items.some(i => i.kind === "work" || i.kind === "check")).toBe(false);
  });

  it("risk önerisini personel görevi olarak aynı listeye koyar", () => {
    const { items } = suggest({
      ...base, steps: steps("ACİL: eğitmen görüşmesi + telafi planı + öğrenci ilişkileri araması (devamsızlık nedeni)")
    });
    const staff = items.filter(i => i.kind === "staff");
    expect(staff.map(s => s.owner)).toEqual(["teacher", "student_relations"]);
    expect(staff[0].why).toContain("Sınav notları düşüyor");
  });

  it("kütüphanedeki uygun çalışmayı önerir ve kontrol ölçümünü ekler", () => {
    const { items } = suggest({ ...base, library: [study("speaking"), study("writing")] });
    expect(items.find(i => i.libraryItemId === "study:speaking")?.kind).toBe("work");
    expect(items.some(i => i.libraryItemId === "study:writing")).toBe(false);
    const check = items.find(i => i.kind === "check")!;
    expect(check.dueOn).toBe("2026-09-23");
    expect(check.title).toContain("konuşma");
  });

  it("başka kurun içeriğini önermez", () => {
    const { items } = suggest({ ...base, library: [study("speaking", { level: "A2" })] });
    expect(items.some(i => i.libraryItemId)).toBe(false);
  });

  // Nothing invents an item to fill a gap.
  it("kütüphane boşsa uydurmaz, eksik olduğunu söyler", () => {
    const { items } = suggest(base);
    const work = items.find(i => i.kind === "work")!;
    expect(work.libraryItemId).toBeNull();
    expect(work.note).toContain("Kütüphanede");
  });

  it("örnek içeriği öyle işaretler", () => {
    const { items } = suggest({ ...base, library: [study("speaking", { isSample: true })] });
    expect(items.find(i => i.libraryItemId)?.note).toContain("Örnek");
  });

  it("dolu etkinliği gösterir ama eklenemez olarak", () => {
    const { items } = suggest({ ...base, library: [event("speaking", { taken: 6 })] });
    const e = items.find(i => i.libraryItemId === "event:speaking")!;
    expect(e.full).toBe(true);
    expect(e.note).toContain("Dolu");
  });

  it("başka şubenin etkinliğini önermez", () => {
    const { items } = suggest({ ...base, library: [event("speaking", { branchId: "b2" })] });
    expect(items.some(i => i.libraryItemId)).toBe(false);
  });

  it("etkinliğin tarihini görevin tarihi yapar ve kalan yeri söyler", () => {
    const { items } = suggest({ ...base, library: [event("speaking", { taken: 4 })] });
    const e = items.find(i => i.libraryItemId === "event:speaking")!;
    expect(e.dueOn).toBe("2026-09-18");
    expect(e.note).toContain("2 yer kaldı");
  });

  it("planda olan öneriyi tekrar göstermez", () => {
    const { items } = suggest({ ...base, library: [study("speaking")], already: new Set(["check", "lib:study:speaking"]) });
    expect(items.some(i => i.key === "check" || i.key === "lib:study:speaking")).toBe(false);
  });

  it("bazı beceriler ölçülmemişse tek görevde hepsini sayar", () => {
    const { items } = suggest(base);
    const m = items.filter(i => i.kind === "measure");
    expect(m).toHaveLength(1);
    expect(m[0].title).toBe("Eksik becerileri ölç: yazma, dinleme, okuma");
  });
});

describe("görev kimliği", () => {
  it("aynı metin aynı anahtarı, farklı öneri farklı anahtarı üretir", () => {
    expect(taskKey("Eğitmenle görüşme")).toBe(taskKey("Eğitmenle görüşme"));
    const before = steps("eğitmen görüşmesi + telafi planı + öğrenci ilişkileri araması (devamsızlık nedeni)");
    const after = steps("seviye değerlendirmesi — kur tekrarı / telafi programı");
    expect(before.map(s => s.key)).not.toEqual(after.map(s => s.key));
  });
});

describe("veritabanı mesajları", () => {
  it("kısıt adlarını ekranın diline çevirir", () => {
    expect(friendly('duplicate key value violates unique constraint "plans_one_open"'))
      .toBe("Bu öğrencinin zaten açık bir planı var.");
    expect(friendly('duplicate key value violates unique constraint "plan_tasks_once"'))
      .toBe("Bu görev planda zaten var.");
    expect(friendly("Bu etkinlikte yer kalmadı (kontenjan 6).")).toContain("yer kalmadı");
  });
});

it("tarih ekleme ay sınırını geçer", () => {
  expect(addDays("2026-09-29", 5)).toBe("2026-10-04");
});
