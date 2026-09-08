import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Row } from "@/lib/csv";

/** Writes a parsed roster.
 *
 *  Existing rows are found and updated rather than upserted. PostgREST's upsert
 *  updates every column in the payload, and the identity columns are deliberately
 *  not grantable — so an upsert would be refused for exactly the rows that already
 *  exist. Reading first also produces the created/updated split the import history
 *  records, which "how many rows changed?" needs an answer to.
 */
export type ImportResult = { created: number; updated: number; measurements: number; observations: number };

const SKILLS: Record<string, string> = {
  speaking_score: "speaking", writing_score: "writing",
  listening_score: "listening", reading_score: "reading"
};

type Reading = { kind: string; source: string; value: number };

function readingsOf(row: Row): Reading[] {
  const out: Reading[] = [];
  for (const n of [1, 2, 3, 4]) {
    const v = row.numbers.get(`exam_${n}`);
    if (v !== undefined) out.push({ kind: "exam", source: `exam_${n}`, value: v });
  }
  for (const [col, kind] of Object.entries(SKILLS)) {
    const v = row.numbers.get(col);
    if (v !== undefined) out.push({ kind, source: "skill_profile", value: v });
  }
  const term = row.numbers.get("attendance_rate");
  if (term !== undefined) out.push({ kind: "attendance", source: "term_rate", value: term });
  const recent = row.numbers.get("attendance_recent");
  if (recent !== undefined) out.push({ kind: "attendance", source: "last_four_weeks", value: recent });
  return out;
}

export async function writeRoster(
  client: SupabaseClient, organizationId: string, branchIds: Map<string, string>,
  rows: Row[], periodEnd: string, actorId: string
): Promise<ImportResult> {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

  const codes = rows.map(r => r.externalId);
  const existing = await client.from("students")
    .select("id,external_id,name,branch_id,satisfaction_score").in("external_id", codes);
  fail(existing.error);
  const byCode = new Map(existing.data!.map(s => [s.external_id as string, s]));

  const fresh = rows.filter(r => !byCode.has(r.externalId));
  if (fresh.length) {
    const inserted = await client.from("students").insert(fresh.map(r => ({
      organization_id: organizationId, branch_id: branchIds.get(r.branch)!,
      external_id: r.externalId, name: r.name,
      satisfaction_score: r.numbers.get("satisfaction_score") ?? null
    }))).select("id,external_id");
    fail(inserted.error);
    for (const s of inserted.data!) byCode.set(s.external_id as string, { ...s } as never);
  }

  // Only rows whose visible fields actually moved; an unchanged re-upload should
  // not look like a hundred edits in the history.
  let updated = 0;
  for (const r of rows) {
    const s = byCode.get(r.externalId)! as { id: string; name?: string; branch_id?: string; satisfaction_score?: number | null };
    if (s.name === undefined) continue;                        // just inserted
    const branchId = branchIds.get(r.branch)!;
    const satisfaction = r.numbers.get("satisfaction_score") ?? null;
    if (s.name === r.name && s.branch_id === branchId && (s.satisfaction_score ?? null) === satisfaction) continue;
    fail((await client.from("students")
      .update({ name: r.name, branch_id: branchId, satisfaction_score: satisfaction })
      .eq("id", s.id)).error);
    updated++;
  }

  const idOf = (code: string) => (byCode.get(code) as { id: string }).id;
  const studentIds = rows.map(r => idOf(r.externalId));
  const branchOf = new Map(rows.map(r => [idOf(r.externalId), branchIds.get(r.branch)!]));

  const enrolled = await client.from("enrollments")
    .select("id,student_id,level,teacher_name").in("student_id", studentIds).eq("active", true);
  fail(enrolled.error);
  const byStudent = new Map(enrolled.data!.map(e => [e.student_id as string, e]));
  const newEnrolments = rows.filter(r => !byStudent.has(idOf(r.externalId)));
  if (newEnrolments.length) fail((await client.from("enrollments").insert(newEnrolments.map(r => ({
    organization_id: organizationId, branch_id: branchIds.get(r.branch)!,
    student_id: idOf(r.externalId), level: r.level, teacher_name: r.teacher,
    starts_on: periodEnd, active: true
  })))).error);
  for (const r of rows) {
    const e = byStudent.get(idOf(r.externalId));
    if (!e || (e.level === r.level && (e.teacher_name ?? null) === r.teacher)) continue;
    fail((await client.from("enrollments")
      .update({ level: r.level, teacher_name: r.teacher }).eq("id", e.id)).error);
  }

  const priorReadings = await client.from("student_measurements")
    .select("id,student_id,kind,source_reference,value").in("student_id", studentIds);
  fail(priorReadings.error);
  const readingKey = (s: string, k: string, r: string) => `${s}|${k}|${r}`;
  const known = new Map(priorReadings.data!.map(m =>
    [readingKey(m.student_id, m.kind, m.source_reference), m]));

  const insertReadings: Record<string, unknown>[] = [];
  let touchedReadings = 0;
  for (const r of rows) {
    const sid = idOf(r.externalId);
    for (const reading of readingsOf(r)) {
      const prior = known.get(readingKey(sid, reading.kind, reading.source));
      if (!prior) {
        insertReadings.push({
          organization_id: organizationId, branch_id: branchOf.get(sid)!, student_id: sid,
          measured_on: periodEnd, kind: reading.kind, value: reading.value, source_reference: reading.source
        });
        touchedReadings++;
      } else if (Number(prior.value) !== reading.value) {
        fail((await client.from("student_measurements")
          .update({ value: reading.value, measured_on: periodEnd }).eq("id", prior.id)).error);
        touchedReadings++;
      }
    }
  }
  if (insertReadings.length) fail((await client.from("student_measurements").insert(insertReadings)).error);

  const priorObs = await client.from("classroom_observations")
    .select("id,student_id,participation,homework_completion,teacher_concern")
    .in("student_id", studentIds).eq("observed_on", periodEnd);
  fail(priorObs.error);
  const obsByStudent = new Map(priorObs.data!.map(o => [o.student_id as string, o]));

  const insertObs: Record<string, unknown>[] = [];
  let touchedObs = 0;
  for (const r of rows) {
    const participation = r.numbers.get("participation_score") ?? null;
    const homework = r.numbers.get("homework_completion") ?? null;
    const concern = r.concern;
    // The table requires at least one of the three; a row with none is not an
    // observation and inserting it would be refused by the check constraint.
    if (participation === null && homework === null && concern === null) continue;
    const sid = idOf(r.externalId);
    const prior = obsByStudent.get(sid);
    if (!prior) {
      insertObs.push({
        organization_id: organizationId, branch_id: branchOf.get(sid)!, student_id: sid,
        observed_on: periodEnd, participation, homework_completion: homework,
        teacher_concern: concern, created_by: actorId
      });
      touchedObs++;
    } else if (prior.participation !== participation
      || Number(prior.homework_completion ?? NaN) !== Number(homework ?? NaN)
      || prior.teacher_concern !== concern) {
      fail((await client.from("classroom_observations")
        .update({ participation, homework_completion: homework, teacher_concern: concern })
        .eq("id", prior.id)).error);
      touchedObs++;
    }
  }
  if (insertObs.length) fail((await client.from("classroom_observations").insert(insertObs)).error);

  return { created: fresh.length, updated, measurements: touchedReadings, observations: touchedObs };
}
