"use server";
import { z } from "zod";
import { fieldsOf, isEntryKind, type EntryKind } from "@/lib/entry";
import { commitEntry, type EntrySaveState } from "@/lib/entry-write";

export type SaveState = EntrySaveState;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı.");

export async function save(_prev: SaveState, form: FormData): Promise<SaveState> {
  const kind = String(form.get("kind") ?? "");
  const on = day.safeParse(String(form.get("on") ?? ""));
  if (!isEntryKind(kind)) return { status: "error", message: "Geçersiz giriş türü." };
  if (!on.success) return { status: "error", message: on.error.issues[0].message };

  return commitEntry(form, fieldsOf(kind as EntryKind), on.data);
}
