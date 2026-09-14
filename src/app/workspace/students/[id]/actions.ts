"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ALL_FIELDS } from "@/lib/entry";
import { commitEntry, type EntrySaveState } from "@/lib/entry-write";

export type StudentSaveState = EntrySaveState;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı.");

/** Every field of one student, written from their own card.
 *
 *  The class sheet asks for one kind of mark across a class; this asks for a
 *  whole card, which is the shape the work has when somebody is looking at one
 *  student — a new enrolment, a correction, a teacher catching up after a term.
 */
export async function saveStudent(_prev: StudentSaveState, form: FormData): Promise<StudentSaveState> {
  const on = day.safeParse(String(form.get("on") ?? ""));
  if (!on.success) return { status: "error", message: on.error.issues[0].message };

  const result = await commitEntry(form, ALL_FIELDS, on.data);
  if (result.status === "done") revalidatePath("/workspace/students/[id]", "page");
  return result;
}
