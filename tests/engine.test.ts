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
      const got = scores[i].detail.skill!;
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

/** Partial data.
 *
 *  An institution that does not record homework, or runs three exams instead of
 *  four, still has students at risk. The rule is that a dimension nobody measured
 *  must be absent from the result — never a zero, which every screen would draw
 *  as a clean bill of health — and that a student is skipped only when there is
 *  nothing at all to measure.
 */
describe("scoring what the institution actually has", () => {
  const bm = { exam: 80, skill: 80, cohortSize: 20 };

  it("scores a student who only has an attendance rate", () => {
    const s = scoreStudent({ level: "B1", exams: [], attendanceRate: 62 }, bm);
    expect(s.available).toEqual(["attendance"]);
    expect(Object.keys(s.dimensions)).toEqual(["attendance"]);
    expect(s.dimensions.attendance).toBe(60);
    expect(s.riskScore).toBe(60);              // renormalised onto the one dimension
    expect(s.riskLevel).toBe("MEDIUM");
  });

  it("leaves no key behind for a dimension it could not measure", () => {
    const s = scoreStudent({ level: "B1", exams: [70, 55], attendanceRate: 90 }, bm);
    expect(s.available).toEqual(["test", "attendance"]);
    expect("skill" in s.dimensions).toBe(false);
    expect("classroom" in s.dimensions).toBe(false);
    expect(s.detail.skill).toBeUndefined();
    expect(s.detail.classroom).toBeUndefined();
  });

  it("reads one skill score as a skill observation, with no imbalance to find", () => {
    const s = scoreStudent(
      { level: "B1", exams: [70, 68, 61, 55], speaking: 40 }, bm);
    expect(s.available).toEqual(["test", "skill"]);
    expect(s.detail.skill!.weakest).toBe("speaking");
    expect(s.detail.skill!.spread).toBe(0);    // a profile of one cannot be lopsided
  });

  it("treats a single exam as no trend at all", () => {
    const s = scoreStudent({ level: "B1", exams: [30], attendanceRate: 95 }, bm);
    expect(s.available).toEqual(["attendance"]);
  });

  it("refuses to invent a score for a student with nothing on file", () => {
    expect(() => scoreStudent({ level: "B1", exams: [] }, bm)).toThrow();
  });
});

/** Exam runs other than four.
 *
 *  The trend is the same question at every length — where did this student start,
 *  where are they now — so the run is split in half rather than indexed at fixed
 *  positions. At four exams the split is the two-against-two the reference engine
 *  used, which is why the hundred reference students above still agree.
 */
describe("however many exams the course runs", () => {
  const bm = { exam: 80, skill: 80, cohortSize: 20 };
  const withExams = (exams: number[]) =>
    scoreStudent({ level: "B1", exams, attendanceRate: 95 }, bm);

  it("compares the pair when there are two", () => {
    expect(withExams([80, 60]).detail.test!.delta).toBe(-20);
  });

  it("ignores the middle one when there are three", () => {
    const d = withExams([80, 70, 62].slice()).detail.test!;
    expect(d.delta).toBe(-18);                 // last against first, middle skipped
    expect(d.exam_count).toBe(3);
  });

  it("splits five into the first two against the last two", () => {
    const d = withExams([90, 86, 70, 60, 50]).detail.test!;
    expect(d.delta).toBe(-33);                 // (60+50)/2 - (90+86)/2
    expect(d.exam_count).toBe(5);
  });

  it("still splits four two against two", () => {
    const d = withExams([88, 84, 70, 62]).detail.test!;
    expect(d.delta).toBe(-20);                 // (70+62)/2 - (88+84)/2
  });

  it("names the run length in the reason it writes", () => {
    const s = withExams([80, 70, 62]);
    expect(s.reasons.some(r => r.includes("Son 3 sınavın her biri"))).toBe(true);
  });
});
