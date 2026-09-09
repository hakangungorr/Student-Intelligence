"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fieldsOf, isEntryKind, saveSheet, type EntryKind } from "@/lib/entry";

export type SaveState = { status: "idle" | "done" | "error"; message?: string; written?: number; unchanged?: number };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı.");

export async function save(_prev: SaveState, form: FormData): Promise<SaveState> {
  const kind = String(form.get("kind") ?? "");
  const on = day.safeParse(String(form.get("on") ?? ""));
  if (!isEntryKind(kind)) return { status: "error", message: "Geçersiz giriş türü." };
  if (!on.success) return { status: "error", message: on.error.issues[0].message };

  const { client } = await requireUser();
  const membership = await client.from("memberships").select("organization_id").limit(1).maybeSingle();
  if (membership.error || !membership.data) return { status: "error", message: "Kurum erişiminiz bulunamadı." };
  const { data: session } = await client.auth.getUser();
  if (!session.user) return { status: "error", message: "Oturum bulunamadı." };

  const fields = fieldsOf(kind as EntryKind);
  const byStudent = new Map<string, Record<string, number | boolean | null>>();
  const problems: string[] = [];

  for (const [name, raw] of form.entries()) {
    const match = /^v:([^:]+):(.+)$/.exec(name);
    if (!match) continue;
    const [, studentId, fieldName] = match;
    const field = fields.find(f => f.name === fieldName);
    if (!field) continue;
    const values = byStudent.get(studentId) ?? byStudent.set(studentId, {}).get(studentId)!;

    if (field.kind === "boolean") { values[fieldName] = true; continue; }
    const text = String(raw).trim();
    if (text === "") { values[fieldName] = null; continue; }
    const value = Number(text.replace(",", "."));
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      problems.push(`${field.label}: "${text}" ${field.min}–${field.max} aralığında bir sayı olmalı.`);
      continue;
    }
    values[fieldName] = value;
  }
  // An unticked checkbox sends nothing at all, which is how "no concern" arrives.
  for (const [, values] of byStudent)
    for (const f of fields) if (f.kind === "boolean" && values[f.name] === undefined) values[f.name] = false;

  if (problems.length) return { status: "error", message: problems.slice(0, 3).join(" ") };

  try {
    const result = await saveSheet(client, membership.data.organization_id as string,
      kind as EntryKind, on.data, session.user.id,
      [...byStudent].map(([studentId, values]) => ({ studentId, values })));
    revalidatePath("/workspace/entry");
    return { status: "done", written: result.written, unchanged: result.unchanged };
  } catch (e) {
    return { status: "error", message: `Kaydedilemedi: ${(e as Error).message}` };
  }
}
