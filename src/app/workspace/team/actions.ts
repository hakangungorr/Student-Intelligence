"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assignClass } from "@/lib/team";
import { isRole } from "@/lib/roles";
import { loadSettings, matchLevel } from "@/lib/settings";

export type TeamState = { status: "idle" | "done" | "error"; message?: string };

async function admin() {
  const { client } = await requireUser();
  const me = await client.from("memberships").select("organization_id,role").limit(1).maybeSingle();
  if (me.error || !me.data) throw new Error("Kurum erişiminiz bulunamadı.");
  return { client, organizationId: me.data.organization_id as string, role: me.data.role as string };
}

const grantForm = z.object({
  userId: z.uuid("Kullanıcı kimliği Supabase panelindeki UUID olmalı."),
  name: z.string().trim().min(1, "İsim boş olamaz.").max(200),
  role: z.string().refine(isRole, "Geçersiz rol."),
  branchId: z.string()
});

export async function grantAccess(_prev: TeamState, form: FormData): Promise<TeamState> {
  const parsed = grantForm.safeParse({
    userId: form.get("userId"), name: form.get("name"),
    role: form.get("role"), branchId: form.get("branchId") ?? ""
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const { userId, name, role, branchId } = parsed.data;

  // The schema requires an institution admin to have no branch and everybody
  // else to have one; saying so here beats a constraint violation.
  if (role === "org_admin" && branchId) return { status: "error", message: "Kurum yöneticisine şube atanmaz." };
  if (role !== "org_admin" && !branchId) return { status: "error", message: "Bu rol için şube seçin." };

  const { client, organizationId } = await admin();
  const { error } = await client.from("memberships").insert({
    user_id: userId, organization_id: organizationId,
    branch_id: role === "org_admin" ? null : branchId, role, display_name: name
  });
  if (error) return {
    status: "error",
    message: error.message.includes("memberships_user_id_fkey")
      ? "Bu kimlikte bir hesap yok. Önce Supabase panelinden kullanıcıyı oluşturun."
      : error.message.includes("duplicate key")
        ? "Bu kişinin bu kapsamda zaten erişimi var."
        : error.message.includes("row-level security")
          ? "Erişim tanımlama yetkiniz yok."
          : `Erişim tanımlanamadı: ${error.message}`
  };
  revalidatePath("/workspace/team");
  return { status: "done", message: `${name} eklendi.` };
}

export async function revokeAccess(_prev: TeamState, form: FormData): Promise<TeamState> {
  const id = z.uuid().safeParse(form.get("membershipId"));
  if (!id.success) return { status: "error", message: "Geçersiz kayıt." };
  const { client } = await admin();
  const { error, count } = await client.from("memberships")
    .delete({ count: "exact" }).eq("id", id.data);
  if (error) return { status: "error", message: `Erişim kaldırılamadı: ${error.message}` };
  // A policy that filters the row away deletes nothing and reports no error.
  if (!count) return { status: "error", message: "Bu erişim kaldırılamadı. Kendi erişiminizi kaldıramazsınız." };
  revalidatePath("/workspace/team");
  return { status: "done", message: "Erişim kaldırıldı." };
}

const assignForm = z.object({
  userId: z.uuid("Bir eğitmen seçin."),
  name: z.string().trim().max(200).optional(),
  branchId: z.uuid("Bir şube seçin."),
  level: z.string().trim().min(1, "Bir kur seçin.")
});

export async function assign(_prev: TeamState, form: FormData): Promise<TeamState> {
  const parsed = assignForm.safeParse({
    userId: form.get("userId"), name: form.get("name") ?? undefined,
    branchId: form.get("branchId"), level: form.get("level")
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const { client } = await admin();
  const settings = await loadSettings(client);
  const level = matchLevel(parsed.data.level, settings.levels);
  if (!level) return { status: "error", message: `"${parsed.data.level}" tanımlı bir kur değil.` };
  try {
    const n = await assignClass(client, parsed.data.userId, parsed.data.name ?? null,
      parsed.data.branchId, level);
    revalidatePath("/workspace/team");
    revalidatePath("/workspace/students");
    return {
      status: "done",
      message: n === 0 ? "Bu şube ve kurda aktif öğrenci yok." : `${n} öğrenci atandı.`
    };
  } catch (e) {
    return { status: "error", message: `Atama yapılamadı: ${(e as Error).message}` };
  }
}
