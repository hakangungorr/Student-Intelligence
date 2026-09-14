/** Entering results by hand, in the two shapes the work actually arrives in.
 *
 *  A teacher marking an exam has one number for each of twenty-four students and
 *  wants one column, not twenty-four forms: that is the sheet, one kind of
 *  measurement down a whole class.
 *
 *  A registration desk looking at one student has the opposite problem — every
 *  number for one person — and sending them through the sheet six times, once
 *  per kind, is the long way round. So the same fields are also served as groups
 *  for a single student's card. Both write through `saveSheet`, which is why it
 *  takes the fields rather than the kind.
 */
export const ENTRY_KINDS = [
  { key: "exam_1", label: "1. sınav" }, { key: "exam_2", label: "2. sınav" },
  { key: "exam_3", label: "3. sınav" }, { key: "exam_4", label: "4. sınav" },
  { key: "skills", label: "Dil becerileri" },
  { key: "classroom", label: "Devam ve sınıf içi" }
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number]["key"];
export const isEntryKind = (v: string): v is EntryKind =>
  ENTRY_KINDS.some(k => k.key === v);

export type Field = {
  name: string; label: string; min: number; max: number; kind: "number" | "boolean";
  /** Shown under the input on the single-student form, where there is room for it
   *  and no column header to carry the unit. */
  hint?: string;
};
const SCORE = { min: 0, max: 100, kind: "number" as const };

/** Which inputs one entry kind puts on a sheet row. */
export function fieldsOf(kind: EntryKind): Field[] {
  if (kind === "skills") return [
    { name: "speaking", label: "Konuşma", ...SCORE },
    { name: "writing", label: "Yazma", ...SCORE },
    { name: "listening", label: "Dinleme", ...SCORE },
    { name: "reading", label: "Okuma", ...SCORE }
  ];
  if (kind === "classroom") return [
    { name: "term_rate", label: "Devam %", ...SCORE },
    { name: "last_four_weeks", label: "Son 4 hafta %", ...SCORE },
    { name: "participation", label: "Katılım /10", min: 1, max: 10, kind: "number" },
    { name: "homework", label: "Ödev %", ...SCORE },
    { name: "concern", label: "Endişeliyim", min: 0, max: 1, kind: "boolean" }
  ];
  return [{ name: kind, label: "Not", ...SCORE }];
}

/** The same fields laid out for one student, grouped the way somebody filling in
 *  a card reads them. Labels are longer here because there is no column header. */
export const FIELD_GROUPS: { label: string; note: string; fields: Field[] }[] = [
  {
    label: "Sınav notları", note: "100 üzerinden",
    fields: [1, 2, 3, 4].map(n => ({ name: `exam_${n}`, label: `${n}. sınav`, ...SCORE }))
  },
  {
    label: "Dil becerileri", note: "100 üzerinden",
    fields: fieldsOf("skills")
  },
  {
    label: "Devam", note: "yüzde olarak",
    fields: [
      { name: "term_rate", label: "Dönem geneli", ...SCORE, hint: "%" },
      { name: "last_four_weeks", label: "Son 4 hafta", ...SCORE, hint: "%" }
    ]
  },
  {
    label: "Sınıf içi", note: "eğitmenin gözlemi",
    fields: [
      { name: "participation", label: "Derse katılım", min: 1, max: 10, kind: "number", hint: "10 üzerinden" },
      { name: "homework", label: "Ödev tamamlama", ...SCORE, hint: "%" },
      { name: "concern", label: "Bu öğrenci için endişeliyim", min: 0, max: 1, kind: "boolean" }
    ]
  }
];
export const ALL_FIELDS: Field[] = FIELD_GROUPS.flatMap(g => g.fields);

export type EntryRow = {
  id: string; externalId: string; name: string; branch: string; level: string;
  values: Record<string, number | boolean | null>;
};
export type EntrySheet = {
  rows: EntryRow[]; branches: string[]; levels: string[];
  /** How many students the filters match, whether or not they were rendered. */
  total: number;
  /** True when the match was too wide to put on screen and the caller should ask
   *  for a class first. A small institution never sees this. */
  capped: boolean;
};

/** Above this, an unfiltered sheet stops being a sheet and becomes a scroll. */
export const SHEET_CAP = 60;

/** Which stored reading each field is, used by the read and write paths alike. */
export const MEASURED: Record<string, { kind: string; source: string }> = {
  exam_1: { kind: "exam", source: "exam_1" }, exam_2: { kind: "exam", source: "exam_2" },
  exam_3: { kind: "exam", source: "exam_3" }, exam_4: { kind: "exam", source: "exam_4" },
  speaking: { kind: "speaking", source: "skill_profile" },
  writing: { kind: "writing", source: "skill_profile" },
  listening: { kind: "listening", source: "skill_profile" },
  reading: { kind: "reading", source: "skill_profile" },
  term_rate: { kind: "attendance", source: "term_rate" },
  last_four_weeks: { kind: "attendance", source: "last_four_weeks" }
};
export const OBSERVED = new Set(["participation", "homework", "concern"]);


export type EntryProblem = { studentId: string; field: string; label: string; text: string };

/** Reads the `v:<student>:<field>` inputs both forms post.
 *
 *  A rejected value is reported with the student it belongs to, because "Katılım:
 *  '12' 1-10 aralığında olmalı" sends somebody hunting down a sheet of
 *  twenty-four rows for the one that is wrong.
 */
export function readEdits(form: FormData, fields: Field[]): {
  edits: { studentId: string; values: Record<string, number | boolean | null> }[];
  problems: EntryProblem[];
} {
  const byStudent = new Map<string, Record<string, number | boolean | null>>();
  const problems: EntryProblem[] = [];

  const bucket = (studentId: string) =>
    byStudent.get(studentId) ?? byStudent.set(studentId, {}).get(studentId)!;

  for (const [name, raw] of form.entries()) {
    // A row is present because the form said so, not because a value arrived:
    // a row whose only input is an unticked checkbox posts nothing under `v:`,
    // and clearing that box has to survive.
    const prior = /^p:([^:]+):/.exec(name);
    if (prior) { bucket(prior[1]); continue; }
    const match = /^v:([^:]+):(.+)$/.exec(name);
    if (!match) continue;
    const [, studentId, fieldName] = match;
    const field = fields.find(f => f.name === fieldName);
    if (!field) continue;
    const values = bucket(studentId);

    if (field.kind === "boolean") { values[fieldName] = true; continue; }
    const text = String(raw).trim();
    if (text === "") { values[fieldName] = null; continue; }
    const value = Number(text.replace(",", "."));
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      problems.push({ studentId, field: fieldName, label: field.label, text });
      continue;
    }
    values[fieldName] = value;
  }

  // An unticked checkbox sends nothing at all, and reading that as "no concern"
  // meant saving an untouched sheet wrote an empty observation for every student
  // on it. It is only an answer when the box was ticked before — which the form
  // states in a `p:` field — and otherwise a row nobody filled in.
  for (const [studentId, values] of byStudent)
    for (const f of fields) {
      if (f.kind !== "boolean" || values[f.name] !== undefined) continue;
      values[f.name] = form.get(`p:${studentId}:${f.name}`) === "1" ? false : null;
    }

  return { edits: [...byStudent].map(([studentId, values]) => ({ studentId, values })), problems };
}
