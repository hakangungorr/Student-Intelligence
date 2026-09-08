import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "@/lib/config";

export async function createClient() {
  const store = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (entries) => {
        try { entries.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Server Components are read-only; proxy refreshes cookies. */ }
      }
    }
  });
}
