import { redirect } from "next/navigation";
import { getMode } from "@/lib/config";
export const dynamic = "force-dynamic";
export default function Home() { redirect(getMode() === "demo" ? "/demo" : "/workspace"); }
