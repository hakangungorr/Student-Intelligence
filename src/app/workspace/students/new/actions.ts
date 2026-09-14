"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ALL_FIELDS, readEdits } from "@/lib/entry";
import { saveSheet } from "@/lib/entry-write";
import { latestPeriod, scoreInstitution } from "@/lib/scoring";
import { loadSettings, matchLevel } from "@/lib/settings";

export type NewStudentState = {
  error?: string;
  /** Set when the desk asked to keep going, so the form can report the last
   *  student without leaving the page it is being filled in on. */
  saved?: { id: string; name: string; externalId: string; note?: string };
};

const form = z.object({
  externalId: z.string().trim().min(1, "Öğrenci numarası boş olamaz.").max(200),
  name: z.string().trim().min(1, "İsim boş olamaz.").max(200),
  branchId: z.uuid("Bir şube seçin."),
  level: z.string().trim().min(1, "Bir kur seçin."),
  teacher: z.string().trim().max(200).optional()
});
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Whether a number is already taken, asked while the field still has focus.
 *  Learning about a clash after filling in the whole form is learning about it
 *  too late. */
export async function numberTaken(externalId: string): Promise<boolean> {
  const trimmed = externalId.trim();
  if (!trimmed) return false;
  const { client } = await requireUser();
  const clash = await client.from("students").select("id").eq("external_id", trimmed).maybeSingle();
  return Boolean(clash.data);
}

/** One student at a time: a registration desk enrolling somebody today should not
 *  have to build a file for it. The bulk path stays for moving a term's records.
 *
 *  Marks are optional and on the same form, because a desk that has the student's
 *  papers in front of it has the numbers too, and making it save, navigate and
 *  find the student again to type them is a round trip for nothing. */
export async function createStudent(_prev: NewStudentState, data: FormData): Promise<NewStudentState> {
  const parsed = form.safeParse({
    externalId: data.get("externalId"), name: data.get("name"),
    branchId: data.get("branchId"), level: data.get("level"),
    teacher: data.get("teacher") ?? undefined
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { externalId, name, branchId, teacher } = parsed.data;
  const again = data.get("then") === "again";

  const { client } = await requireUser();
  const settings = await loadSettings(client);
  const level = matchLevel(parsed.data.level, settings.levels);
  if (!level) return { error: `"${parsed.data.level}" tanımlı bir kur değil.` };
  const membership = await client.from("memberships").select("organization_id,role").limit(1).maybeSingle();
  if (membership.error || !membership.data) return { error: "Kurum erişiminiz bulunamadı." };
  const organizationId = membership.data.organization_id as string;

  const clash = await client.from("students").select("id").eq("external_id", externalId).maybeSingle();
  if (clash.data) return { error: `${externalId} numarası zaten kayıtlı.` };

  const created = await client.from("students")
    .insert({ organization_id: organizationId, branch_id: branchId, external_id: externalId, name })
    .select("id").single();
  if (created.error) return {
    error: created.error.message.includes("row-level security")
      ? "Bu şubeye öğrenci ekleme yetkiniz yok."
      : `Öğrenci kaydedilemedi: ${created.error.message}`
  };

  const enrolled = await client.from("enrollments").insert({
    organization_id: organizationId, branch_id: branchId, student_id: created.data.id,
    level, teacher_name: teacher || null,
    starts_on: new Date().toISOString().slice(0, 10), active: true
  });
  if (enrolled.error) return {
    // The student exists but has no level, so say so rather than reporting success.
    error: `Öğrenci kaydedildi ama kur bilgisi yazılamadı: ${enrolled.error.message}`
  };

  // The marks the desk chose to type in, written against the student that now
  // exists. A failure here does not undo the enrolment — it is reported instead,
  // because the student really was registered.
  let note: string | undefined;
  const on = day.safeParse(String(data.get("on") ?? ""));
  const { edits, problems } = readEdits(data, ALL_FIELDS);
  const values = edits[0]?.values ?? {};
  const any = Object.values(values).some(v => v !== null && v !== undefined);
  if (problems.length) {
    note = `${problems.length} değer aralık dışında olduğu için yazılmadı: ` +
      problems.map(p => `${p.label} "${p.text}"`).join(", ") + ".";
  } else if (any && on.success) {
    const { data: session } = await client.auth.getUser();
    try {
      const written = await saveSheet(client, organizationId, ALL_FIELDS, on.data,
        session.user!.id, [{ studentId: created.data.id, values }]);
      note = written.written > 0 ? `${written.written} değer de kaydedildi.` : undefined;
      if (written.written > 0 && membership.data.role === "org_admin") {
        const period = (await latestPeriod(client)) ?? on.data;
        await scoreInstitution(client, organizationId, period);
      }
    } catch (e) {
      note = `Öğrenci kaydedildi, ancak girdiğiniz değerler yazılamadı: ${(e as Error).message}`;
    }
  }

  revalidatePath("/workspace");
  revalidatePath("/workspace/students");
  revalidatePath("/workspace/entry");
  if (again) return { saved: { id: created.data.id, name, externalId, note } };
  redirect(`/workspace/students/${created.data.id}`);
}
