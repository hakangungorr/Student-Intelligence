import { readFile } from "node:fs/promises";
import { describe, it, expect, beforeAll } from "vitest";
import { scoreAll, scoreStudent, type Measures, type Score } from "../src/lib/engine";

/** The Python engine is the reference implementation: it produced the dataset
 *  the approved screens were designed against. This scores all hundred of those
 *  students through the TypeScript port and requires the same answers. Anything
 *  that disagrees is a defect in the port. */

// demo_dataset.json stores Turkish with the diacritics stripped, and names the
// weakest skill in English. Both are artefacts of the reference script rather
// than decisions, so the reference text is repaired before comparing.
const WORDS: Record<string, string> = {
  ACIL: "ACİL", Egitmen: "Eğitmen", egitmen: "eğitmen", Odev: "Ödev", Sinav: "Sınav",
  sinav: "sınav", sinavda: "sınavda", sinavin: "sınavın", altinda: "altında",
  aramasi: "araması", degerlendirme: "değerlendirme", degerlendirmesi: "değerlendirmesi",
  devamsizlik: "devamsızlık", dusuk: "düşük", dusus: "düşüş", endise: "endişe",
  gecme: "geçme", gorusmesi: "görüşmesi", iliskileri: "ilişkileri", katilim: "katılım",
  ogrenci: "öğrenci", oncekinden: "öncekinden", orani: "oranı", ortalamasi: "ortalaması",
  ortalamasinin: "ortalamasının", plani: "planı", programi: "programı", tekrari: "tekrarı",
  toplantisi: "toplantısı", yukselisde: "yükselişte",
  Speaking: "Konuşma", Writing: "Yazma", Listening: "Dinleme", Reading: "Okuma"
};
const repair = (t: string) => t.replace(/[A-Za-z]+/g, w => WORDS[w] ?? w);

type Reference = Record<string, number | string | boolean | object>;
let reference: Reference[];
let scores: Score[];

beforeAll(async () => {
  const raw = await readFile(new URL("../demo_dataset.json", import.meta.url), "utf8");
  reference = JSON.parse(raw).students;
  const measures: Measures[] = reference.map(s => ({
    level: s.level as string,
    exams: [s.exam_1, s.exam_2, s.exam_3, s.exam_4] as number[],
    speaking: s.speaking_score as number, writing: s.writing_score as number,
    listening: s.listening_score as number, reading: s.reading_score as number,
    participation: s.participation_score as number, homework: s.homework_completion as number,
    concern: s.teacher_concern as boolean,
    attendanceRate: s.attendance_rate as number, attendanceRecent: s.attendance_recent as number
  }));
  scores = scoreAll(measures).scores;
});

describe("risk engine port matches the Python reference", () => {
  it("scores every reference student identically", () => {
    const wrong = reference.map((ref, i) => ({ ref, got: scores[i] }))
      .filter(({ ref, got }) => got.riskScore !== ref.risk_score || got.riskLevel !== ref.risk_level)
      .map(({ ref, got }) => `${ref.student_id}: ${ref.risk_score}/${ref.risk_level} → ${got.riskScore}/${got.riskLevel}`);
    expect(wrong).toEqual([]);
  });

  it("reproduces the ranking score, uncapped", () => {
    const wrong = reference.map((ref, i) => ({ ref, got: scores[i] }))
      .filter(({ ref, got }) => Math.abs(got.riskScoreRaw - (ref.risk_score_raw as number)) > 1e-9)
      .map(({ ref, got }) => `${ref.student_id}: ${ref.risk_score_raw} → ${got.riskScoreRaw}`);
    expect(wrong).toEqual([]);
  });

  it("reproduces all four dimensions", () => {
    const wrong: string[] = [];
    reference.forEach((ref, i) => {
      const expected = ref.dimensions as Record<string, number>;
      for (const k of ["test", "skill", "classroom", "attendance"] as const)
        if (scores[i].dimensions[k] !== expected[k])
          wrong.push(`${ref.student_id}.${k}: ${expected[k]} → ${scores[i].dimensions[k]}`);
    });
    expect(wrong).toEqual([]);
  });

  it("reproduces the skill diagnosis and the weakest skill", () => {
    const wrong: string[] = [];
    reference.forEach((ref, i) => {
      const expected = (ref.dimension_detail as { skill: { diagnosis: string; weakest: string } }).skill;
      const got = scores[i].detail.skill;
      if (got.diagnosis !== expected.diagnosis)
        wrong.push(`${ref.student_id}: ${expected.diagnosis} → ${got.diagnosis}`);
      if (got.weakest !== expected.weakest.toLowerCase())
        wrong.push(`${ref.student_id}: ${expected.weakest} → ${got.weakest}`);
    });
    expect(wrong).toEqual([]);
  });

  it("reproduces every reason, in order", () => {
    const wrong: string[] = [];
    reference.forEach((ref, i) => {
      const expected = (ref.risk_reasons as string[]).map(repair);
      const got = scores[i].reasons;
      if (JSON.stringify(expected) !== JSON.stringify(got))
        wrong.push(`${ref.student_id}:\n  beklenen ${JSON.stringify(expected)}\n  gelen    ${JSON.stringify(got)}`);
    });
    expect(wrong).toEqual([]);
  });

  it("reproduces the recommended action", () => {
    const wrong = reference.map((ref, i) => ({ ref, got: scores[i] }))
      .filter(({ ref, got }) => repair(ref.recommended_action as string) !== got.action)
      .map(({ ref, got }) => `${ref.student_id}: "${repair(ref.recommended_action as string)}" → "${got.action}"`);
    expect(wrong).toEqual([]);
  });
});

/** The passing mark is the one figure the engine does not derive from the
 *  institution's own data, so it is handed in. Everything above still has to
 *  hold at the default, which is what the reference dataset was scored with. */
describe("the institution's passing mark", () => {
  const benchmark = { exam: 80, skill: 80, cohortSize: 10 };
  const student: Measures = {
    level: "B1", exams: [70, 68, 66, 65],
    speaking: 65, writing: 65, listening: 65, reading: 65,
    participation: 8, homework: 90, concern: false,
    attendanceRate: 95, attendanceRecent: 95
  };

  it("treats 65 as a pass at 60 and a fail at 70", () => {
    const passing = scoreStudent(student, benchmark, 60);
    const failing = scoreStudent(student, benchmark, 70);
    expect(passing.reasons.some(r => r.includes("geçme notunun altında"))).toBe(false);
    expect(failing.reasons.some(r => r.includes("geçme notunun altında"))).toBe(true);
    expect(failing.riskScore).toBeGreaterThan(passing.riskScore);
  });

  it("defaults to 60, so an institution that never sets it is scored as before", () => {
    expect(scoreStudent(student, benchmark)).toEqual(scoreStudent(student, benchmark, 60));
  });
});
