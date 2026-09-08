import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const {user} = await requireUser();
  return <><a className="skip-link" href="#content">İçeriğe geç</a><aside className="sidebar">
    <div className="life-brand"><span className="glyph" aria-hidden="true">✦</span><span>american<strong>LIFE</strong></span></div>
    <p className="eyebrow">AKADEMİK YÖNETİM</p><nav><Link href="/workspace">▦ Öğrenci gündemi</Link><Link href="/workspace/students">☰ Öğrenci listesi</Link><Link href="/workspace/ask">✦ Soru sor</Link><Link href="/workspace/import">⇪ Veri aktarımı</Link><Link href="/workspace/access">◉ Erişim bilgilerim</Link></nav>
    <div className="sidebar-bottom"><h2>Her öğrencinin<br/>gelişimi görünür.</h2><p>Doğru zamanda, doğru destek.</p><small>Student Intelligence · American LIFE</small></div>
  </aside><div className="workspace"><header className="topbar"><span>Öğrenci yönetimi</span><div className="account"><span>{user.email}</span><form action={signOut}><button>Çıkış yap</button></form></div></header>
    <main id="content" className="content">{children}</main></div></>;
}
