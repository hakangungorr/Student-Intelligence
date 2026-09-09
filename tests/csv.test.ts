import { describe, it, expect } from "vitest";
import { parseRoster } from "../src/lib/csv";

/** The file the institution sends is theirs, not ours: the parser has to accept
 *  the separator their Excel writes and the level names their catalogue uses. */
const header = "student_id;name;branch;level;exam_1";
const branches = ["İzmir", "Ankara"];

describe("roster file against the institution's own vocabulary", () => {
  it("accepts levels the institution defined, in whatever case they were typed", () => {
    const parsed = parseRoster(
      `${header}\nS1;Ali Vural;İzmir;starter;70`, branches, ["Starter", "Elementary"]);
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows[0].level).toBe("Starter");     // stored spelling wins
  });

  it("names the defined levels when a row does not match one", () => {
    const parsed = parseRoster(
      `${header}\nS1;Ali Vural;İzmir;B1;70`, branches, ["Starter", "Elementary"]);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.issues[0].message).toContain("Starter, Elementary");
  });

  it("falls back to the CEFR levels when none are configured", () => {
    const parsed = parseRoster(`${header}\nS1;Ali Vural;İzmir;b1;70`, branches);
    expect(parsed.rows[0].level).toBe("B1");
  });

  it("reads the institution's own Turkish column names", () => {
    const parsed = parseRoster(
      "Öğrenci No;Ad Soyad;Şube;Kur;Devam Oranı;Ödev Tamamlama;Eğitmen Endişesi\n"
      + "S1;Ali Vural;İzmir;B1;%84;72;evet", branches);
    expect(parsed.missing).toEqual([]);
    expect(parsed.issues).toEqual([]);
    const [row] = parsed.rows;
    expect(row.name).toBe("Ali Vural");
    expect(row.numbers.get("attendance_rate")).toBe(84);
    expect(row.numbers.get("homework_completion")).toBe(72);
    expect(row.concern).toBe(true);
  });

  it("names an unrecognised column the way the file spelled it", () => {
    const parsed = parseRoster(
      "Öğrenci No,Ad Soyad,Şube,Kur,Sınıf Kodu\nS1,Ali Vural,İzmir,B1,7A", branches);
    expect(parsed.unknown).toEqual(["Sınıf Kodu"]);
    expect(parsed.rows).toHaveLength(1);
  });

  it("still reads a comma-separated file with a byte-order mark", () => {
    const parsed = parseRoster(
      "﻿student_id,name,branch,level\nS1,Ali Vural,İzmir,A1", branches);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].name).toBe("Ali Vural");
  });
});
