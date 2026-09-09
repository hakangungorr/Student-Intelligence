"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { latestPeriod, scoreInstitution } from "@/lib/scoring";
import { parseLevels, MAX_LEVELS, MAX_LEVEL_LENGTH } from "@/lib/settings";

export type SettingsState = { status: "idle" | "done" | "error"; message?: string };

const form = z.object({
  passMark: z.coerce.number().int("Geçme notu tam sayı olmalı.").min(0).max(100),
  attendanceFloor: z.coerce.number().int("Devam sınırı tam sayı olmalı.").min(0).max(100),
  levels: z.string()
});

/** Saving these values changes who is on the agenda, so the screens must not be
 *  left showing scores calculated with the old ones. The re-score runs here, in
 *  the same action, and its outcome is reported alongside the save — an
 *  administrator should never have to know that a second step exists. */
export async function saveSettings(_prev: SettingsState, data: FormData): Promise<SettingsState> {
  const parsed = form.safeParse({
    passMark: data.get("passMark"), attendanceFloor: data.get("attendanceFloor"),
    levels: data.get("levels") ?? ""
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };

  const levels = parseLevels(parsed.data.levels);
  if (!levels.length) return { status: "error", message: "En az bir kur adı yazın." };
  if (levels.length > MAX_LEVELS) return { status: "error", message: `En fazla ${MAX_LEVELS} kur tanımlanabilir.` };
  const tooLong = levels.find(l => l.length > MAX_LEVEL_LENGTH);
  if (tooLong) return { status: "error", message: `"${tooLong}" çok uzun — en fazla ${MAX_LEVEL_LENGTH} karakter.` };

  const { client, user } = await requireUser();
  const me = await client.from("memberships").select("organization_id,role").limit(1).maybeSingle();
  if (me.error || !me.data) return { status: "error", message: "Kurum erişiminiz bulunamadı." };
  if (me.data.role !== "org_admin") return { status: "error", message: "Bu ayarları yalnızca kurum yöneticisi değiştirebilir." };
  const organizationId = me.data.organization_id as string;

  // A level an enrolled student is registered under cannot simply disappear: the
  // student would drop off every filter that lists levels, and nothing on screen
  // would say why.
  const enrolled = await client.from("enrollments").select("level").eq("active", true);
  if (enrolled.error) return { status: "error", message: "Kur kayıtları okunamadı." };
  const inUse = [...new Set((enrolled.data ?? []).map(e => e.level as string))];
  const orphan = inUse.filter(l => !levels.some(v => v.toLocaleLowerCase("tr") === l.toLocaleLowerCase("tr")));
  if (orphan.length) return {
    status: "error",
    message: `${orphan.join(", ")} kurunda kayıtlı öğrenci var. Listeden çıkarmadan önce `
      + `bu öğrencilerin kurunu değiştirin.`
  };

  // Updated first and inserted only if nothing was there, rather than upserted:
  // PostgREST writes every column of an upsert payload, organization_id included,
  // and that column is deliberately not grantable to anybody. The same reasoning
  // as lib/import.ts.
  const values = {
    pass_mark: parsed.data.passMark, attendance_floor: parsed.data.attendanceFloor,
    levels, updated_at: new Date().toISOString(), updated_by: user.id
  };
  const amended = await client.from("organization_settings")
    .update(values, { count: "exact" }).eq("organization_id", organizationId);
  const { error } = amended.error || amended.count
    ? amended
    : await client.from("organization_settings")
      .insert({ organization_id: organizationId, ...values });
  if (error) return {
    status: "error",
    message: error.message.includes("row-level security")
      ? "Bu ayarları değiştirme yetkiniz yok."
      : `Ayarlar kaydedilemedi: ${error.message}`
  };

  for (const path of ["/workspace", "/workspace/students", "/workspace/ask",
    "/workspace/import", "/workspace/settings"]) revalidatePath(path);

  // Nothing to re-score before the first calculation, and saying so is better
  // than reporting zero students as though something had gone wrong.
  const period = await latestPeriod(client);
  if (!period) return { status: "done", message: "Ayarlar kaydedildi. Henüz hesaplanmış skor yok." };
  try {
    const result = await scoreInstitution(client, organizationId, period);
    return {
      status: "done",
      message: `Ayarlar kaydedildi ve ${result.scored} öğrencinin skoru yeni değerlerle `
        + `yeniden hesaplandı.`
    };
  } catch (e) {
    return {
      status: "error",
      message: `Ayarlar kaydedildi, ancak skorlar yeniden hesaplanamadı: ${(e as Error).message} `
        + `Veri aktarımı sayfasından hesaplamayı elle çalıştırın.`
    };
  }
}
