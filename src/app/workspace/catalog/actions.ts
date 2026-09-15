"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { canManageCatalogue, canScheduleSessions, currentMembership } from "@/lib/membership";
import { seedSampleCatalogue } from "@/lib/catalog-seed";
import { RESOURCE_KINDS, SKILLS } from "@/lib/rubric";

export type CatalogState = { status: "idle" | "done" | "error"; message?: string };

const skill = z.enum(SKILLS);
const resourceKind = z.enum(RESOURCE_KINDS.map(k => k.key) as [string, ...string[]]);

export async function seedCatalogue(_prev: CatalogState, form: FormData): Promise<CatalogState> {
  const input = z.object({
    branchId: z.uuid(), level: z.string().trim().min(1).max(20)
  }).safeParse({ branchId: form.get("branchId"), level: form.get("level") });
  if (!input.success) return { status: "error", message: "Şube ve kur seçin." };

  const { client } = await requireUser();
  const me = await currentMembership(client);
  if (!canManageCatalogue(me)) return {
    status: "error", message: "Örnek katalog yalnızca kurum yöneticisi tarafından oluşturulur."
  };
  try {
    const result = await seedSampleCatalogue(
      client, me!.organizationId, input.data.branchId, input.data.level);
    revalidatePath("/workspace/catalog");
    return {
      status: "done",
      message: `${result.objectives} alt beceri, ${result.resources} içerik ve ${result.sessions} `
        + "oturum eklendi. Hepsi örnek olarak işaretli; kurumun kendi listesi geldiğinde değiştirin."
    };
  } catch (e) {
    return { status: "error", message: `Katalog oluşturulamadı: ${(e as Error).message}` };
  }
}

export async function addResource(_prev: CatalogState, form: FormData): Promise<CatalogState> {
  const input = z.object({
    title: z.string().trim().min(1).max(300),
    kind: resourceKind, skill, level: z.string().trim().max(20),
    minutes: z.coerce.number().int().min(5).max(240),
    reference: z.string().trim().max(500),
    confirmed: z.enum(["1", "0"]).optional()
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: input.error.issues[0].message };

  const { client } = await requireUser();
  const me = await currentMembership(client);
  if (!canManageCatalogue(me)) return { status: "error", message: "Bu işlem için yetkiniz yok." };

  const written = await client.from("learning_resources").insert({
    organization_id: me!.organizationId, title: input.data.title, kind: input.data.kind,
    level: input.data.level || null, skill: input.data.skill, minutes: input.data.minutes,
    reference: input.data.reference || null,
    // Marked as the institution's own only when somebody ticks the box saying so.
    is_sample: input.data.confirmed !== "1"
  });
  if (written.error) return { status: "error", message: `Eklenemedi: ${written.error.message}` };
  revalidatePath("/workspace/catalog");
  return { status: "done", message: "İçerik eklendi." };
}

export async function addSession(_prev: CatalogState, form: FormData): Promise<CatalogState> {
  const input = z.object({
    branchId: z.uuid(), title: z.string().trim().min(1).max(300),
    kind: z.enum(["guided_practice", "more", "other"]),
    skill: z.union([skill, z.literal("")]), level: z.string().trim().max(20),
    startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Tarih ve saat seçin."),
    minutes: z.coerce.number().int().min(10).max(240),
    capacity: z.coerce.number().int().min(1).max(200),
    confirmed: z.enum(["1", "0"]).optional()
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: input.error.issues[0].message };

  const { client } = await requireUser();
  const me = await currentMembership(client);
  if (!canScheduleSessions(me)) return { status: "error", message: "Bu işlem için yetkiniz yok." };

  const written = await client.from("support_sessions").insert({
    organization_id: me!.organizationId, branch_id: input.data.branchId,
    title: input.data.title, kind: input.data.kind,
    skill: input.data.skill || null, level: input.data.level || null,
    starts_at: new Date(input.data.startsAt).toISOString(),
    minutes: input.data.minutes, capacity: input.data.capacity,
    is_sample: input.data.confirmed !== "1"
  });
  if (written.error) return { status: "error", message: `Eklenemedi: ${written.error.message}` };
  revalidatePath("/workspace/catalog");
  return { status: "done", message: "Oturum eklendi." };
}

/** Bir kaydın "örnek" etiketini kaldırmak, kurumun onu sahiplendiğini söylemektir. */
export async function confirmEntry(_prev: CatalogState, form: FormData): Promise<CatalogState> {
  const input = z.object({
    table: z.enum(["learning_resources", "support_sessions", "learning_objectives"]),
    id: z.uuid()
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: "Geçersiz istek." };

  const { client } = await requireUser();
  const patch = input.data.table === "learning_objectives"
    ? { confirmed: true } : { is_sample: false };
  const written = await client.from(input.data.table).update(patch).eq("id", input.data.id).select("id");
  if (written.error) return { status: "error", message: written.error.message };
  if (!written.data?.length) return { status: "error", message: "Bu kaydı onaylama yetkiniz yok." };
  revalidatePath("/workspace/catalog");
  return { status: "done", message: "Kurumun kaydı olarak işaretlendi." };
}
