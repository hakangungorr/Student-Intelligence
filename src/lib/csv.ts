/** Parsing and validating a roster file.
 *
 *  The column contract follows demo_dataset.json because the institution's own
 *  export has not been seen yet. Everything except the four identity columns is
 *  optional: a school that does not record homework should still be able to load
 *  its students rather than being turned away by a column it cannot produce.
 *
 *  Branches and levels are checked against what the institution has defined, not
 *  against a list in here — an upload that fails because the school calls its
 *  levels something else is a setting we got wrong, not a bad file.
 */
import { DEFAULTS, matchLevel } from "@/lib/settings";

export const REQUIRED = ["student_id", "name", "branch", "level"] as const;
export const OPTIONAL = [
  "teacher", "attendance_rate", "attendance_recent",
  "exam_1", "exam_2", "exam_3", "exam_4",
  "speaking_score", "writing_score", "listening_score", "reading_score",
  "participation_score", "homework_completion", "teacher_concern", "satisfaction_score"
] as const;

/** Column names as the institution is likely to have written them.
 *
 *  The canonical names come from demo_dataset.json and are English, because the
 *  reference engine was. A school exporting its own roster writes "Öğrenci No"
 *  and "Ad Soyad", and telling somebody to rename sixteen columns before their
 *  first upload is how a pilot stalls in week one. Headers are normalised —
 *  case, spacing, punctuation and Turkish diacritics folded away — so
 *  "Öğrenci No", "ogrenci_no" and "OGRENCI NO" are the same column.
 */
const ALIASES: Record<string, string[]> = {
  student_id: ["ogrenci no", "ogrenci numarasi", "ogrenci kodu", "no", "numara", "ogrenci id"],
  name: ["ad soyad", "adi soyadi", "isim", "ogrenci", "ogrenci adi", "ad"],
  branch: ["sube", "merkez"],
  level: ["kur", "seviye", "sinif"],
  teacher: ["egitmen", "ogretmen", "hoca"],
  attendance_rate: ["devam orani", "devam", "devamlilik"],
  attendance_recent: ["son 4 hafta devam", "son devam", "son dort hafta"],
  exam_1: ["sinav 1", "1 sinav", "1 sinav notu"],
  exam_2: ["sinav 2", "2 sinav", "2 sinav notu"],
  exam_3: ["sinav 3", "3 sinav", "3 sinav notu"],
  exam_4: ["sinav 4", "4 sinav", "4 sinav notu", "son sinav"],
  speaking_score: ["konusma", "speaking"],
  writing_score: ["yazma", "writing"],
  listening_score: ["dinleme", "listening"],
  reading_score: ["okuma", "reading"],
  participation_score: ["katilim", "derse katilim", "katilim puani"],
  homework_completion: ["odev", "odev tamamlama", "odev orani"],
  teacher_concern: ["egitmen endisesi", "endise", "ogretmen endisesi"],
  satisfaction_score: ["memnuniyet", "memnuniyet puani"]
};
const FOLD: Record<string, string> = {
  "ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ğ": "g", "Ğ": "g",
  "ü": "u", "Ü": "u", "ö": "o", "Ö": "o", "ç": "c", "Ç": "c"
};
const normalise = (h: string) => h.toLocaleLowerCase("tr")
  .replace(/[ıİşŞğĞüÜöÖçÇ]/g, c => FOLD[c] ?? c)
  .replace(/[^a-z0-9]+/g, " ").trim();

const CANONICAL = new Map<string, string>();
for (const column of [...REQUIRED, ...OPTIONAL]) {
  CANONICAL.set(normalise(column), column);
  for (const alias of ALIASES[column] ?? []) CANONICAL.set(alias, column);
}
/** The column this header means, or the header itself when nothing matches. */
export const columnOf = (header: string) => CANONICAL.get(normalise(header)) ?? header.trim();

export type Row = {
  line: number;
  externalId: string; name: string; branch: string; level: string; teacher: string | null;
  numbers: Map<string, number>;          // column -> value, absent when the cell is blank
  concern: boolean | null;
};
export type Issue = { line: number; column: string; message: string };
export type Parsed = {
  rows: Row[]; issues: Issue[];
  headers: string[]; unknown: string[]; missing: string[];
};

/** Splits one CSV line, honouring quotes and doubled quotes inside them. */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(v => v.trim());
}

/** Turkish exports commonly use ";" because the comma is the decimal separator.
 *  Guessing from the header line is more reliable than asking the user. */
function separatorOf(headerLine: string) {
  const semis = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  if (tabs > semis && tabs > commas) return "\t";
  return semis > commas ? ";" : ",";
}

const RANGE: Record<string, [number, number]> = {
  attendance_rate: [0, 100], attendance_recent: [0, 100],
  exam_1: [0, 100], exam_2: [0, 100], exam_3: [0, 100], exam_4: [0, 100],
  speaking_score: [0, 100], writing_score: [0, 100], listening_score: [0, 100], reading_score: [0, 100],
  participation_score: [1, 10], homework_completion: [0, 100], satisfaction_score: [1, 10]
};

const YES = ["evet", "var", "true", "1", "e", "yes"];
const NO = ["hayır", "hayir", "yok", "false", "0", "h", "no", ""];

export function parseRoster(
  text: string, knownBranches: string[], knownLevels: string[] = DEFAULTS.levels
): Parsed {
  const issues: Issue[] = [];
  const clean = text.replace(/^﻿/, "");            // Excel writes a byte-order mark
  const lines = clean.split(/\r?\n/).filter(l => l.trim() !== "");
  if (!lines.length) return { rows: [], issues: [{ line: 0, column: "", message: "Dosya boş." }], headers: [], unknown: [], missing: [...REQUIRED] };

  const sep = separatorOf(lines[0]);
  const written = splitLine(lines[0], sep);
  const headers = written.map(columnOf);
  const allowed = new Set<string>([...REQUIRED, ...OPTIONAL]);
  const missing = REQUIRED.filter(c => !headers.includes(c));
  // Reported as the institution wrote them: "Sınıf Kodu" is what they have to
  // find in their file, not whatever this parser folded it into.
  const unknown = written.filter(h => h.trim() && !allowed.has(columnOf(h)));
  if (missing.length) return { rows: [], issues, headers, unknown, missing };

  const at = (cells: string[], col: string) => {
    const i = headers.indexOf(col);
    return i === -1 ? "" : (cells[i] ?? "");
  };
  const branches = new Map(knownBranches.map(b => [b.toLocaleLowerCase("tr"), b]));
  const seen = new Map<string, number>();
  const rows: Row[] = [];

  for (let n = 1; n < lines.length; n++) {
    const line = n + 1;                                  // 1-based, header is line 1
    const cells = splitLine(lines[n], sep);
    const externalId = at(cells, "student_id");
    const name = at(cells, "name");
    if (!externalId) { issues.push({ line, column: "student_id", message: "Öğrenci numarası boş." }); continue; }
    if (!name) { issues.push({ line, column: "name", message: "İsim boş." }); continue; }

    const first = seen.get(externalId);
    if (first !== undefined) {
      issues.push({ line, column: "student_id", message: `${externalId} bu dosyada ${first}. satırda da var.` });
      continue;
    }
    seen.set(externalId, line);

    const rawBranch = at(cells, "branch");
    const branch = branches.get(rawBranch.toLocaleLowerCase("tr"));
    if (!branch) {
      issues.push({ line, column: "branch", message: `"${rawBranch}" tanımlı bir şube değil. Tanımlılar: ${knownBranches.join(", ")}.` });
      continue;
    }
    // Matched against the institution's own level names rather than upper-cased:
    // a school whose levels are "Starter" and "Elementary" writes them that way.
    const level = matchLevel(at(cells, "level"), knownLevels);
    if (!level) {
      issues.push({ line, column: "level", message:
        `"${at(cells, "level")}" tanımlı bir kur değil. Tanımlılar: ${knownLevels.join(", ")}.` });
      continue;
    }

    const numbers = new Map<string, number>();
    let bad = false;
    for (const col of Object.keys(RANGE)) {
      const raw = at(cells, col);
      if (raw === "") continue;
      const value = Number(raw.replace("%", "").replace(",", "."));
      if (!Number.isFinite(value)) {
        issues.push({ line, column: col, message: `"${raw}" sayı değil.` }); bad = true; continue;
      }
      const [lo, hi] = RANGE[col];
      if (value < lo || value > hi) {
        issues.push({ line, column: col, message: `${value} aralık dışında (${lo}–${hi}).` }); bad = true; continue;
      }
      numbers.set(col, value);
    }
    const rawConcern = at(cells, "teacher_concern").toLocaleLowerCase("tr");
    let concern: boolean | null = null;
    if (headers.includes("teacher_concern")) {
      if (YES.includes(rawConcern)) concern = true;
      else if (NO.includes(rawConcern)) concern = rawConcern === "" ? null : false;
      else { issues.push({ line, column: "teacher_concern", message: `"${rawConcern}" evet/hayır olarak okunamadı.` }); bad = true; }
    }
    if (bad) continue;

    const teacher = at(cells, "teacher");
    rows.push({ line, externalId, name, branch, level, teacher: teacher || null, numbers, concern });
  }
  return { rows, issues, headers, unknown, missing };
}
