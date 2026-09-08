import { z } from "zod";

// Configuration failure must never silently enable public demo access.
export function getMode(env: Record<string, string | undefined> = process.env): "demo" | "supabase" {
  const mode = env.APP_DATA_MODE ?? "supabase";
  if (mode !== "demo" && mode !== "supabase") throw new Error("Invalid APP_DATA_MODE");
  return mode;
}
export function supabaseConfig(env: Record<string, string | undefined> = process.env) {
  const value = z.object({ url: z.url(), key: z.string().min(10) }).safeParse({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  });
  if (!value.success) throw new Error("Supabase configuration missing");
  return value.data;
}
