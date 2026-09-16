import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/paginate";
import type { Skill } from "@/lib/rubric";

/** Kütüphane: planın önerebileceği çalışmalar ve etkinlikler.
 *
 *  One list. A study is something a student does on their own time; an event
 *  is the same thing with a date, a branch and a number of seats. `taken` counts
 *  the seats already held, read from the bookings rather than guessed, so a
 *  suggestion never offers a full event.
 */
export type LibraryItem = {
  id: string; kind: "study" | "event"; program: string; title: string;
  skill: Skill | null; level: string | null; minutes: number; reference: string | null;
  branchId: string | null; startsAt: string | null; capacity: number | null; taken: number;
  isSample: boolean;
};

export async function loadLibrary(
  client: SupabaseClient, opts: { from?: string } = {}
): Promise<LibraryItem[]> {
  const oops = "Kütüphane okunamadı";
  const rows = await fetchAll<{ id: string; kind: string; program: string; title: string;
    skill: string | null; level: string | null; minutes: number; reference: string | null;
    branch_id: string | null; starts_at: string | null; capacity: number | null; is_sample: boolean }>(
    () => client.from("library_items")
      .select("id,kind,program,title,skill,level,minutes,reference,branch_id,starts_at,capacity,is_sample")
      .eq("active", true).order("kind").order("starts_at", { nullsFirst: true }).order("title"),
    oops);
  // Past events are history, not options.
  const from = opts.from ?? new Date().toISOString();
  const live = rows.filter(r => r.kind === "study" || (r.starts_at ?? "") >= from);

  const eventIds = live.filter(r => r.kind === "event").map(r => r.id);
  const bookings = eventIds.length
    ? await fetchAll<{ item_id: string }>(
      () => client.from("library_bookings").select("item_id").in("item_id", eventIds), oops)
    : [];
  const taken = new Map<string, number>();
  for (const b of bookings) taken.set(b.item_id, (taken.get(b.item_id) ?? 0) + 1);

  return live.map(r => ({
    id: r.id, kind: r.kind as LibraryItem["kind"], program: r.program, title: r.title,
    skill: r.skill as Skill | null, level: r.level, minutes: Number(r.minutes),
    reference: r.reference, branchId: r.branch_id, startsAt: r.starts_at,
    capacity: r.capacity === null ? null : Number(r.capacity),
    taken: taken.get(r.id) ?? 0, isSample: r.is_sample
  }));
}

export const hasRoom = (i: LibraryItem) =>
  i.kind === "study" || (i.capacity !== null && i.taken < i.capacity);
export const seatsLeft = (i: LibraryItem) =>
  i.capacity === null ? null : Math.max(0, i.capacity - i.taken);
