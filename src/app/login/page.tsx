import Link from "next/link";
import { getMode } from "@/lib/config";
import { LoginForm } from "./form";
export const dynamic = "force-dynamic";
export default function Login() {
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">AMERICAN LIFE · AKADEMİK YÖNETİM</p>
    <h1>Her öğrencinin<br/>gelişimi görünür.</h1><p>Öğrenci gündeminize kurum hesabınızla giriş yapın.</p>
    <LoginForm/><p className="muted">Hesabınız için kurum yöneticinizle görüşün.</p>
    {getMode() === "demo" && <Link href="/demo">Örnek verilerle demoyu incele →</Link>}
  </section></main>;
}
