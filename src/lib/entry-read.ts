import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/paginate";
import {
  ALL_FIELDS, MEASURED, OBSERVED, SHEET_CAP, fieldsOf,
  type EntryKind, type EntryRow, type EntrySheet, type Field
} from "@/lib/entry";

/** Reading back what has been entered, for both hand-entry forms: a class down
 *  one column, or one student across every field.
 *
 *  Pulls the stored value of every field for one set of students. */
async function valuesFor(
  client: SupabaseClient, ids: string[], fields: Field[]
): Promise<Map<string, EntryRow["values"]>> {
  const oops = "Girilmiş değerler okunamadı";
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

  const out = new Map<string, EntryRow["values"]>();
  for (const id of ids) {
    const values: EntryRow["values"] = {};
    for (const f of fields) {
      const measured = MEASURED[f.name];
      if (measured) {
        values[f.name] = readingAt.get(`${id}|${measured.kind}|${measured.source}`) ?? null;
      } else {
        const o = latest.get(id);
        values[f.name] = f.name === "participation" ? o?.participation ?? null
          : f.name === "homework" ? (o?.homework_completion === null || o?.homework_completion === undefined
            ? null : Number(o.homework_completion))
            : o?.teacher_concern ?? null;
      }
    }
    out.set(id, values);
  }
  return out;
}

export async function loadSheet(
  client: SupabaseClient, kind: EntryKind,
  branch: string | null, level: string | null, search: string | null, showAll = false
): Promise<EntrySheet> {
  const oops = "Sınıf listesi yüklenemedi";
  const branchRows = await fetchAll<{ id: string; name: string }>(
    () => client.from("branches").select("id,name"), oops);
  const branchId = branch ? branchRows.find(b => b.name === branch)?.id ?? null : null;

  const [students, enrollments] = await Promise.all([
    // Narrowed in the query when a branch is chosen: the sheet for one branch
    // should not carry the whole institution across the wire to throw it away.
    fetchAll<{ id: string; external_id: string; name: string; branch_id: string }>(
      () => {
        const q = client.from("students").select("id,external_id,name,branch_id").eq("active", true);
        return branchId ? q.eq("branch_id", branchId) : q;
      }, oops),
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
      || s.external_id.toLocaleLowerCase("tr").includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const lists = {
    branches: [...new Set(branchRows.map(b => b.name))].sort((a, b) => a.localeCompare(b, "tr")),
    levels: [...new Set(enrollments.map(e => e.level))].sort()
  };
  // Nothing was asked for and the institution is large: ask for a class rather
  // than answering with every student it has.
  const narrowed = Boolean(branch || level || needle);
  if (!narrowed && !showAll && inScope.length > SHEET_CAP)
    return { rows: [], ...lists, total: inScope.length, capped: true };

  const fields = fieldsOf(kind);
  const stored = await valuesFor(client, inScope.map(s => s.id), fields);
  const rows: EntryRow[] = inScope.map(s => ({
    id: s.id, externalId: s.external_id, name: s.name,
    branch: branchName.get(s.branch_id) ?? "—", level: levelOf.get(s.id) ?? "—",
    values: stored.get(s.id) ?? {}
  }));

  return { rows, ...lists, total: rows.length, capped: false };
}

/** Every field of one student, for the form on their card. */
export async function loadStudentEntry(
  client: SupabaseClient, studentId: string
): Promise<EntryRow["values"]> {
  const stored = await valuesFor(client, [studentId], ALL_FIELDS);
  return stored.get(studentId) ?? {};
}

