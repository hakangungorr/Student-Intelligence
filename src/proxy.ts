import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getMode, supabaseConfig } from "@/lib/config";

export async function proxy(request: NextRequest) {
  if (getMode() === "demo") return NextResponse.next();
  let config;
  try { config = supabaseConfig(); }
  catch { return NextResponse.next(); } // Protected page displays setup state, never student data.
  let response = NextResponse.next({ request });
  const client = createServerClient(config.url, config.key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (entries) => {
      entries.forEach(({name, value}) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      entries.forEach(({name, value, options}) => response.cookies.set(name, value, options));
    }
  } });
  await client.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/workspace/:path*", "/login", "/auth/:path*"] };
