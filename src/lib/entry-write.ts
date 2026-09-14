import "server-only";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { fetchAll } from "@/lib/paginate";
import { MEASURED, OBSERVED, readEdits, type EntryProblem, type Field } from "@/lib/entry";
import { latestPeriod, scoreInstitution } from "@/lib/scoring";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SaveResult = { written: number; unchanged: number };

/** Writes only what changed, so re-saving a sheet nobody edited is a no-op and
 *  the audit trail does not fill with rewrites of the same numbers. */
export async function saveSheet(
  client: SupabaseClient, organizationId: string, fields: Field[], on: string, actorId: string,
  edits: { studentId: string; values: Record<string, number | boolean | null> }[]
): Promise<SaveResult> {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
  if (!edits.length) return { written: 0, unchanged: 0 };

  const ids = edits.map(e => e.studentId);
  const students = await fetchAll<{ id: string; branch_id: string }>(
    () => client.from("students").select("id,branch_id").in("id", ids), "Öğrenciler okunamadı");
  const branchOf = new Map(students.map(s => [s.id, s.branch_id]));

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


export type EntrySaveState = {
  status: "idle" | "done" | "error"; message?: string;
  written?: number; unchanged?: number;
  /** null when the signed-in user may not score, so the screen can say who will. */
  scored?: number | null;
  /** Rejected values, each naming the student it came from. */
  problems?: EntryProblem[];
};

/** One write path for both hand-entry forms.
 *
 *  The class sheet and a single student's card differ only in which fields they
 *  put on screen; what happens on save — validate, write what changed, rescore —
 *  is the same, and two copies of it would drift.
 */
export async function commitEntry(
  form: FormData, fields: Field[], on: string
): Promise<EntrySaveState> {
  const { client } = await requireUser();
  const membership = await client.from("memberships").select("organization_id,role").limit(1).maybeSingle();
  if (membership.error || !membership.data) return { status: "error", message: "Kurum erişiminiz bulunamadı." };
  const { data: session } = await client.auth.getUser();
  if (!session.user) return { status: "error", message: "Oturum bulunamadı." };

  const { edits, problems } = readEdits(form, fields);
  if (problems.length) return {
    status: "error", problems,
    message: `${problems.length} değer kaydedilmedi — aşağıdaki alanları düzeltin.`
  };

  try {
    const organizationId = membership.data.organization_id as string;
    const result = await saveSheet(client, organizationId, fields, on, session.user.id, edits);

    // Numbers that do not move the score are numbers nobody acts on, so scoring
    // runs with the save rather than waiting for somebody to remember a button.
    // It is institution-wide, which only an institution admin may do — anybody
    // else is told who has to run it, instead of being shown a stale agenda.
    let scored: number | null = null;
    if (membership.data.role === "org_admin") {
      if (result.written > 0) {
        // Into the current checkpoint, not the date on the form: entering a mark
        // records when it was measured, it does not declare a new reporting period.
        const period = (await latestPeriod(client)) ?? on;
        scored = (await scoreInstitution(client, organizationId, period)).scored;
      } else scored = 0;
    }

    revalidatePath("/workspace");
    revalidatePath("/workspace/students");
    revalidatePath("/workspace/entry");
    return { status: "done", written: result.written, unchanged: result.unchanged, scored };
  } catch (e) {
    return { status: "error", message: `Kaydedilemedi: ${(e as Error).message}` };
  }
}
