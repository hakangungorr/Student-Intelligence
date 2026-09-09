import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/paginate";

/** Entering results for a class, as opposed to importing a term.
 *
 *  A teacher marking an exam has one number for each of twenty-four students,
 *  and wants one column, not twenty-four forms. So the unit of work here is a
 *  single kind of measurement across a whole class — pick what you are entering,
 *  then go down the list. Everything else about the student stays out of the way.
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
};
const SCORE = { min: 0, max: 100, kind: "number" as const };

/** Which inputs one entry kind puts on a row. */
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

export type EntryRow = {
  id: string; externalId: string; name: string; branch: string; level: string;
  values: Record<string, number | boolean | null>;
};
export type EntrySheet = {
  rows: EntryRow[]; branches: string[]; levels: string[]; observedOn: string | null;
};

const MEASURED: Record<string, { kind: string; source: string }> = {
  exam_1: { kind: "exam", source: "exam_1" }, exam_2: { kind: "exam", source: "exam_2" },
  exam_3: { kind: "exam", source: "exam_3" }, exam_4: { kind: "exam", source: "exam_4" },
  speaking: { kind: "speaking", source: "skill_profile" },
  writing: { kind: "writing", source: "skill_profile" },
  listening: { kind: "listening", source: "skill_profile" },
  reading: { kind: "reading", source: "skill_profile" },
  term_rate: { kind: "attendance", source: "term_rate" },
  last_four_weeks: { kind: "attendance", source: "last_four_weeks" }
};
const OBSERVED = new Set(["participation", "homework", "concern"]);

export async function loadSheet(
  client: SupabaseClient, kind: EntryKind,
  branch: string | null, level: string | null, search: string | null
): Promise<EntrySheet> {
  const oops = "Sınıf listesi yüklenemedi";
  const [students, branchRows, enrollments] = await Promise.all([
    fetchAll<{ id: string; external_id: string; name: string; branch_id: string }>(
      () => client.from("students").select("id,external_id,name,branch_id").eq("active", true), oops),
    fetchAll<{ id: string; name: string }>(() => client.from("branches").select("id,name"), oops),
    fetchAll<{ student_id: string; level: string }>(
      () => client.from("enrollments").select("student_id,level").eq("active", true), oops)
  ]);
  const branchName = new Map(branchRows.map(b => [b.id, b.name]));
  const levelOf = new Map(enrollments.map(e => [e.student_id, e.level]));

  // Looking somebody up by name is how a teacher finds one student in a term's
  // roster; the branch and level filters answer a different question.
  const needle = search?.trim().toLocaleLowerCase("tr") ?? "";
  const inScope = students.filter(s =>
    (!branch || branchName.get(s.branch_id) === branch)
    && (!level || levelOf.get(s.id) === level)
    && (!needle || s.name.toLocaleLowerCase("tr").includes(needle)
      || s.external_id.toLocaleLowerCase("tr").includes(needle)));
  const ids = inScope.map(s => s.id);

  const fields = fieldsOf(kind);
  const wantsMeasured = fields.some(f => MEASURED[f.name]);
  const wantsObserved = fields.some(f => OBSERVED.has(f.name));

  const readings = wantsMeasured && ids.length
    ? await fetchAll<{ student_id: string; kind: string; source_reference: string; value: number }>(
      () => client.from("student_measurements").select("student_id,kind,source_reference,value")
        .in("student_id", ids), oops)
    : [];
  const observations = wantsObserved && ids.length
    ? await fetchAll<{ student_id: string; observed_on: string; participation: number | null;
      homework_completion: number | null; teacher_concern: boolean | null }>(
      () => client.from("classroom_observations")
        .select("student_id,observed_on,participation,homework_completion,teacher_concern")
        .in("student_id", ids).order("observed_on", { ascending: false }), oops)
    : [];

  const readingAt = new Map<string, number>();
  for (const m of readings) readingAt.set(`${m.student_id}|${m.kind}|${m.source_reference}`, Number(m.value));
  const latest = new Map<string, (typeof observations)[number]>();
  for (const o of observations) if (!latest.has(o.student_id)) latest.set(o.student_id, o);

  const rows: EntryRow[] = inScope.map(s => {
    const values: EntryRow["values"] = {};
    for (const f of fields) {
      const measured = MEASURED[f.name];
      if (measured) {
        values[f.name] = readingAt.get(`${s.id}|${measured.kind}|${measured.source}`) ?? null;
      } else {
        const o = latest.get(s.id);
        values[f.name] = f.name === "participation" ? o?.participation ?? null
          : f.name === "homework" ? (o?.homework_completion === null || o?.homework_completion === undefined
            ? null : Number(o.homework_completion))
            : o?.teacher_concern ?? null;
      }
    }
    return {
      id: s.id, externalId: s.external_id, name: s.name,
      branch: branchName.get(s.branch_id) ?? "—", level: levelOf.get(s.id) ?? "—", values
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "tr"));

  return {
    rows, branches: [...new Set(branchRows.map(b => b.name))].sort((a, b) => a.localeCompare(b, "tr")),
    levels: [...new Set(enrollments.map(e => e.level))].sort(),
    observedOn: [...latest.values()][0]?.observed_on ?? null
  };
}

export type SaveResult = { written: number; unchanged: number };

/** Writes only what changed, so re-saving a sheet nobody edited is a no-op and
 *  the audit trail does not fill with rewrites of the same numbers. */
export async function saveSheet(
  client: SupabaseClient, organizationId: string, kind: EntryKind, on: string, actorId: string,
  edits: { studentId: string; values: Record<string, number | boolean | null> }[]
): Promise<SaveResult> {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
  if (!edits.length) return { written: 0, unchanged: 0 };

  const ids = edits.map(e => e.studentId);
  const students = await fetchAll<{ id: string; branch_id: string }>(
    () => client.from("students").select("id,branch_id").in("id", ids), "Öğrenciler okunamadı");
  const branchOf = new Map(students.map(s => [s.id, s.branch_id]));

  const fields = fieldsOf(kind);
  let written = 0, unchanged = 0;

  const measuredFields = fields.filter(f => MEASURED[f.name]);
  if (measuredFields.length) {
    const prior = await fetchAll<{ id: string; student_id: string; kind: string;
      source_reference: string; value: number }>(
      () => client.from("student_measurements").select("id,student_id,kind,source_reference,value")
        .in("student_id", ids), "Mevcut ölçümler okunamadı");
    const known = new Map(prior.map(m => [`${m.student_id}|${m.kind}|${m.source_reference}`, m]));
    const inserts: Record<string, unknown>[] = [];
    for (const edit of edits) {
      for (const f of measuredFields) {
        const value = edit.values[f.name];
        if (value === null || value === undefined) continue;
        const { kind: k, source } = MEASURED[f.name];
        const existing = known.get(`${edit.studentId}|${k}|${source}`);
        if (!existing) {
          inserts.push({
            organization_id: organizationId, branch_id: branchOf.get(edit.studentId),
            student_id: edit.studentId, measured_on: on, kind: k, value, source_reference: source
          });
          written++;
        } else if (Number(existing.value) !== value) {
          fail((await client.from("student_measurements")
            .update({ value, measured_on: on }).eq("id", existing.id)).error);
          written++;
        } else unchanged++;
      }
    }
    if (inserts.length) fail((await client.from("student_measurements").insert(inserts)).error);
  }

  if (fields.some(f => OBSERVED.has(f.name))) {
    const prior = await fetchAll<{ id: string; student_id: string; participation: number | null;
      homework_completion: number | null; teacher_concern: boolean | null }>(
      () => client.from("classroom_observations")
        .select("id,student_id,participation,homework_completion,teacher_concern")
        .in("student_id", ids).eq("observed_on", on), "Mevcut gözlemler okunamadı");
    const known = new Map(prior.map(o => [o.student_id, o]));
    const inserts: Record<string, unknown>[] = [];
    for (const edit of edits) {
      const participation = edit.values.participation as number | null ?? null;
      const homework = edit.values.homework as number | null ?? null;
      const concern = edit.values.concern as boolean | null ?? null;
      // The table requires at least one of the three to be present.
      if (participation === null && homework === null && concern === null) continue;
      const existing = known.get(edit.studentId);
      if (!existing) {
        inserts.push({
          organization_id: organizationId, branch_id: branchOf.get(edit.studentId),
          student_id: edit.studentId, observed_on: on, participation,
          homework_completion: homework, teacher_concern: concern, created_by: actorId
        });
        written++;
      } else if (existing.participation !== participation
        || Number(existing.homework_completion ?? NaN) !== Number(homework ?? NaN)
        || existing.teacher_concern !== concern) {
        fail((await client.from("classroom_observations").update({
          participation, homework_completion: homework, teacher_concern: concern
        }).eq("id", existing.id)).error);
        written++;
      } else unchanged++;
    }
    if (inserts.length) fail((await client.from("classroom_observations").insert(inserts)).error);
  }

  return { written, unchanged };
}
