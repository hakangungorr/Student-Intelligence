import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getMode } from "@/lib/config";
export const dynamic = "force-dynamic";
export async function GET() {
  if (getMode() !== "demo") return new Response("Not found", { status: 404 });
  const html = await readFile(join(process.cwd(), "dashboard.html"), "utf8");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
