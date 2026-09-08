"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMode, supabaseConfig } from "@/lib/config";
export async function signIn(_previous: { error: string }, form: FormData) {
  if (getMode() === "demo") return { error: "Örnek veri modunda kurum hesabıyla giriş kapalıdır." };
  const parsed = z.object({ email: z.email(), password: z.string().min(1).max(256) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Geçerli e-posta adresinizi ve şifrenizi girin." };
  try { supabaseConfig(); } catch { return { error: "Kurum bağlantısı henüz hazır değil. Sistem yöneticinizle görüşün." }; }
  const client = await createClient();
  try {
    const { error } = await client.auth.signInWithPassword(parsed.data);
    if (error) return { error: "Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin." };
  } catch { return { error: "Bağlantı kurulamadı. Biraz sonra tekrar deneyin." }; }
  redirect("/workspace");
}
export async function signOut() {
  const client = await createClient();
  const { error } = await client.auth.signOut();
  if (error) throw new Error("Oturum kapatılamadı. Tekrar deneyin.");
  redirect("/login");
}
