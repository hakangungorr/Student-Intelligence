/** The three institution decisions the engine used to guess at.
 *
 *  The defaults here are the guesses: a passing mark of 60, a quarter of the
 *  lessons missed as the attendance line, and the CEFR levels the demo data
 *  uses. They are deliberately the same numbers as the table's own defaults, so
 *  an institution that never opens the settings screen behaves exactly as before
 *  and one that does needs no code change.
 *
 *  Kept free of server-only imports: the settings form is a client component and
 *  needs the same defaults and limits the server validates against.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Settings = { passMark: number; attendanceFloor: number; levels: string[] };

export const DEFAULTS: Settings = {
  passMark: 60, attendanceFloor: 75, levels: ["A1", "A2", "B1", "B2", "C1"]
};
export const MAX_LEVELS = 24;
export const MAX_LEVEL_LENGTH = 20;

/** Levels are typed by hand, one per line or separated by commas. */
export function parseLevels(text: string): string[] {
  const seen = new Map<string, string>();
  for (const raw of text.split(/[\n,;]/)) {
    const level = raw.trim();
    if (!level) continue;
    const key = level.toLocaleLowerCase("tr");
    if (!seen.has(key)) seen.set(key, level);
  }
  return [...seen.values()];
}

/** Matches whatever the institution wrote in a file against the levels it
 *  configured, so "b1" and "B1" are the same level and the stored spelling wins. */
export function matchLevel(value: string, levels: string[]): string | undefined {
  const key = value.trim().toLocaleLowerCase("tr");
  return levels.find(l => l.toLocaleLowerCase("tr") === key);
}

/** An institution that has never opened the settings screen has no row, and a
 *  screen must not fail because of a table nobody has written to yet. A read
 *  that errors falls back the same way: the defaults are the values the column
 *  definitions would have supplied. */
export async function loadSettings(client: SupabaseClient): Promise<Settings> {
  const { data } = await client.from("organization_settings")
    .select("pass_mark,attendance_floor,levels").limit(1).maybeSingle();
  if (!data) return DEFAULTS;
  const levels = Array.isArray(data.levels) ? (data.levels as string[]).filter(Boolean) : [];
  return {
    passMark: Number(data.pass_mark ?? DEFAULTS.passMark),
    attendanceFloor: Number(data.attendance_floor ?? DEFAULTS.attendanceFloor),
    levels: levels.length ? levels : DEFAULTS.levels
  };
}
