"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseRoster, type Issue } from "@/lib/csv";
import { writeRoster } from "@/lib/import";

const MAX_BYTES = 2_000_000;   // a term's roster is tens of KB; this is a wide margin

export type PreviewState = {
  status: "empty" | "ready" | "error" | "done";
  message?: string;
  filename?: string;
  text?: string;
  periodEnd?: string;
  sample?: { line: number; externalId: string; name: string; branch: string; level: string }[];
  accepted?: number;
  issues?: Issue[];
  unknown?: string[];
  result?: { created: number; updated: number; measurements: number; observations: number };
};

const period = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı.");

async function scope() {
  const { client } = await requireUser();
  const membership = await client.from("memberships").select("organization_id").limit(1).maybeSingle();
  if (membership.error || !membership.data) throw new Error("Kurum erişiminiz bulunamadı.");
  const branches = await client.from("branches").select("id,name").order("name");
  if (branches.error) throw new Error("Şubeler okunamadı.");
  return {
    client, organizationId: membership.data.organization_id as string,
    branchIds: new Map(branches.data.map(b => [b.name as string, b.id as string])),
    branchNames: branches.data.map(b => b.name as string)
  };
}

export async function preview(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  const file = form.get("file");
  const when = period.safeParse(String(form.get("periodEnd") ?? ""));
  if (!when.success) return { status: "error", message: when.error.issues[0].message };
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Bir CSV dosyası seçin." };
  if (file.size > MAX_BYTES) return { status: "error", message: "Dosya 2 MB sınırını aşıyor." };

  const { branchNames } = await scope();
  const text = await file.text();
  const parsed = parseRoster(text, branchNames);

  if (parsed.missing.length) return {
    status: "error", filename: file.name,
    message: `Zorunlu sütun eksik: ${parsed.missing.join(", ")}. Başlık satırı bulunan sütunlar: ${parsed.headers.join(", ") || "yok"}.`
  };
  if (!parsed.rows.length) return {
    status: "error", filename: file.name, issues: parsed.issues,
    message: "Aktarılabilecek satır yok."
  };

  return {
    status: "ready", filename: file.name, text, periodEnd: when.data,
    accepted: parsed.rows.length, issues: parsed.issues, unknown: parsed.unknown,
    sample: parsed.rows.slice(0, 8).map(r =>
      ({ line: r.line, externalId: r.externalId, name: r.name, branch: r.branch, level: r.level }))
  };
}

export async function commit(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  const text = String(form.get("text") ?? "");
  const filename = String(form.get("filename") ?? "roster.csv");
  const when = period.safeParse(String(form.get("periodEnd") ?? ""));
  if (!when.success) return { status: "error", message: when.error.issues[0].message };
  if (!text) return { status: "error", message: "Önizlenen dosya kayboldu, yeniden yükleyin." };

  const { client, organizationId, branchIds, branchNames } = await scope();
  const parsed = parseRoster(text, branchNames);
  if (!parsed.rows.length) return { status: "error", message: "Aktarılabilecek satır yok." };

  const { data: session } = await client.auth.getUser();
  if (!session.user) return { status: "error", message: "Oturum bulunamadı." };

  let result;
  try {
    result = await writeRoster(client, organizationId, branchIds, parsed.rows, when.data, session.user.id);
  } catch (e) {
    return { status: "error", message: `Aktarım yazılamadı: ${(e as Error).message}` };
  }

  // Recorded after the write, so the history never claims an import that failed.
  const recorded = await client.from("import_batches").insert({
    organization_id: organizationId, filename, row_count: parsed.rows.length,
    created_count: result.created, updated_count: result.updated,
    skipped_count: parsed.issues.length
  });

  revalidatePath("/workspace");
  revalidatePath("/workspace/students");
  return {
    status: "done", filename, result, accepted: parsed.rows.length, issues: parsed.issues,
    message: recorded.error ? "Veriler yazıldı, ancak aktarım geçmişine kaydedilemedi." : undefined
  };
}
