"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { canManageCatalogue, canScheduleSessions, currentMembership } from "@/lib/membership";
import { seedSampleLibrary } from "@/lib/library-seed";
import { PROGRAMS, SKILLS } from "@/lib/rubric";

export type LibraryState = { status: "idle" | "done" | "error"; message?: string };

const program = z.enum(PROGRAMS.map(p => p.key) as [string, ...string[]]);
const skill = z.union([z.enum(SKILLS), z.literal("")]);

export async function seedLibrary(_prev: LibraryState, form: FormData): Promise<LibraryState> {
  const input = z.object({ branchId: z.uuid(), level: z.string().trim().min(1).max(20) })
    .safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: "Şube ve kur seçin." };

  const { client } = await requireUser();
  const me = await currentMembership(client);
  if (!canManageCatalogue(me)) return {
    status: "error", message: "Örnek kütüphaneyi yalnızca kurum yöneticisi oluşturur."
  };
  try {
    const r = await seedSampleLibrary(client, me!.organizationId, input.data.branchId, input.data.level);
    revalidatePath("/workspace/library");
    return {
      status: "done",
      message: `${r.studies} çalışma ve ${r.events} etkinlik eklendi. Hepsi “örnek” işaretli.`
    };
  } catch (e) {
    return { status: "error", message: (e as Error).message };
  }
}

/** Tek form, iki tür: tarih ve kontenjan girilirse etkinlik, girilmezse çalışma. */
export async function addItem(_prev: LibraryState, form: FormData): Promise<LibraryState> {
  const input = z.object({
    title: z.string().trim().min(1, "Başlık yazın.").max(300),
    program, skill, level: z.string().trim().max(20),
    minutes: z.coerce.number().int().min(5).max(240),
    reference: z.string().trim().max(500),
    branchId: z.union([z.uuid(), z.literal("")]),
    startsAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), z.literal("")]),
    capacity: z.union([z.coerce.number().int().min(1).max(200), z.literal("")]),
    confirmed: z.literal("1").optional()
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return { status: "error", message: input.error.issues[0].message };
  const d = input.data;
  const isEvent = d.startsAt !== "";
  if (isEvent && (d.capacity === "" || d.branchId === "")) return {
    status: "error", message: "Etkinlik için şube ve kontenjan gerekli."
  };

  const { client } = await requireUser();
  const me = await currentMembership(client);
  if (isEvent ? !canScheduleSessions(me) : !canManageCatalogue(me)) return {
    status: "error", message: isEvent
      ? "Etkinliği kurum ya da şube yöneticisi ekler."
      : "Çalışmayı kurum yöneticisi ekler."
  };

  const written = await client.from("library_items").insert({
    organization_id: me!.organizationId, kind: isEvent ? "event" : "study",
    program: d.program, title: d.title, skill: d.skill || null, level: d.level || null,
    minutes: d.minutes, reference: d.reference || null,
    branch_id: isEvent ? d.branchId : null,
    starts_at: isEvent ? new Date(d.startsAt).toISOString() : null,
    capacity: isEvent ? d.capacity : null,
    // Only somebody saying so makes an item the institution's own.
    is_sample: d.confirmed !== "1"
  });
  if (written.error) return { status: "error", message: `Eklenemedi: ${written.error.message}` };
  revalidatePath("/workspace/library");
  return { status: "done", message: isEvent ? "Etkinlik eklendi." : "Çalışma eklendi." };
}

export async function confirmItem(_prev: LibraryState, form: FormData): Promise<LibraryState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { status: "error", message: "Geçersiz istek." };
  const { client } = await requireUser();
  const written = await client.from("library_items").update({ is_sample: false })
    .eq("id", id.data).select("id");
  if (written.error) return { status: "error", message: written.error.message };
  if (!written.data?.length) return { status: "error", message: "Bu kaydı onaylama yetkiniz yok." };
  revalidatePath("/workspace/library");
  return { status: "done" };
}

export async function retireItem(_prev: LibraryState, form: FormData): Promise<LibraryState> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { status: "error", message: "Geçersiz istek." };
  const { client } = await requireUser();
  // Retired, not deleted: plans that used it still point at it.
  const written = await client.from("library_items").update({ active: false })
    .eq("id", id.data).select("id");
  if (written.error) return { status: "error", message: written.error.message };
  if (!written.data?.length) return { status: "error", message: "Bu kaydı kaldırma yetkiniz yok." };
  revalidatePath("/workspace/library");
  return { status: "done" };
}
