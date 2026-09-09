"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { loadSettings, matchLevel } from "@/lib/settings";

export type NewStudentState = { error?: string };

const form = z.object({
  externalId: z.string().trim().min(1, "Öğrenci numarası boş olamaz.").max(200),
  name: z.string().trim().min(1, "İsim boş olamaz.").max(200),
  branchId: z.uuid("Bir şube seçin."),
  level: z.string().trim().min(1, "Bir kur seçin."),
  teacher: z.string().trim().max(200).optional()
});

/** One student at a time: a registration desk enrolling somebody today should not
 *  have to build a file for it. The bulk path stays for moving a term's records. */
export async function createStudent(_prev: NewStudentState, data: FormData): Promise<NewStudentState> {
  const parsed = form.safeParse({
    externalId: data.get("externalId"), name: data.get("name"),
    branchId: data.get("branchId"), level: data.get("level"),
    teacher: data.get("teacher") ?? undefined
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { externalId, name, branchId, teacher } = parsed.data;

  const { client } = await requireUser();
  const settings = await loadSettings(client);
  const level = matchLevel(parsed.data.level, settings.levels);
  if (!level) return { error: `"${parsed.data.level}" tanımlı bir kur değil.` };
  const membership = await client.from("memberships").select("organization_id").limit(1).maybeSingle();
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

  revalidatePath("/workspace/students");
  revalidatePath("/workspace/entry");
  redirect(`/workspace/students/${created.data.id}`);
}
