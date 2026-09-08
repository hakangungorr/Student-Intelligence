import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMode, supabaseConfig } from "@/lib/config";

export async function requireUser() {
  if (getMode() === "demo") redirect("/demo");
  try { supabaseConfig(); } catch { redirect("/setup"); }
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { client, user: data.user };
}
