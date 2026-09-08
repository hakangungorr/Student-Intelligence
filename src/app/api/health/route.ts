import { getMode, supabaseConfig } from "@/lib/config";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (getMode() === "supabase") supabaseConfig();
    return Response.json({status:"ok"}, {headers:{"Cache-Control":"no-store"}});
  } catch { return Response.json({status:"not_configured"}, {status:503}); }
}
