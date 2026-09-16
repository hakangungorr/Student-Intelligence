import { describe, it, expect } from "vitest";
import { QUESTIONS, match } from "@/lib/questions";

describe("soru eşleştirme", () => {
  it("desteklenen soruları tanır", () => {
    expect(match("Bu hafta kimlerle ilgilenmeliyiz?")).toBe("oncelik");
    expect(match("En sorunlu kur hangisi?")).toBe("kur");
    expect(match("Hem devamsızlığı artan hem notu düşen kimler var?")).toBe("birlikte");
    expect(match("Hangi şubede konuşma zayıf?")).toBe("konusma");
    expect(match("Hangi öğrencilerin planı yok?")).toBe("plan");
    expect(match("Kimlerin kontrol ölçümü gecikti?")).toBe("yeniden");
    expect(match("Kimler yeniden ölçülmeli?")).toBe("yeniden");
  });

  // The regression this whole matcher was rewritten for: the question hit
  // "hafta", scored a point for the priority list and came back with a ranked
  // list of students, which is a confident answer to a question nobody asked.
  it("desteklenmeyen soruya cevap uydurmaz", () => {
    expect(match("Bu hafta kaç deneme yapıldı?")).toBeNull();
    expect(match("Bu ay kaç yeni kayıt geldi?")).toBeNull();
    expect(match("Eğitmenlerin performansı nasıl?")).toBeNull();
    expect(match("Merhaba")).toBeNull();
    expect(match("")).toBeNull();
  });

  it("kurum sözcüğünü kur sorusu sanmaz", () => {
    expect(match("Kurumda kaç şube var?")).toBeNull();
  });

  it("her tanımlı soru kendi metniyle kendine eşleşir", () => {
    for (const q of QUESTIONS) expect(match(q.q)).toBe(q.key);
  });
});
