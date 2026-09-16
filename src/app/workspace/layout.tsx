import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { Nav, type NavItem } from "./nav";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { client, user } = await requireUser();
  // Offering a link that answers "you may not" is worse than not offering it.
  const me = await client.from("memberships").select("role").limit(1).maybeSingle();
  const isAdmin = me.data?.role === "org_admin";
  const items: NavItem[] = [
    { href: "/workspace", icon: "▦", label: "Öğrenci gündemi" },
    { href: "/workspace/students", icon: "☰", label: "Öğrenci listesi" },
    { href: "/workspace/entry", icon: "✎", label: "Veri girişi" },
    { href: "/workspace/library", icon: "❑", label: "Kütüphane" },
    { href: "/workspace/ask", icon: "✦", label: "Soru sor" },
    ...(isAdmin ? [
      { href: "/workspace/team", icon: "◍", label: "Ekip ve sınıflar" },
      { href: "/workspace/settings", icon: "⚙", label: "Kurum ayarları" }
    ] : []),
    { href: "/workspace/access", icon: "◉", label: "Erişim bilgilerim" }
  ];
  return <><a className="skip-link" href="#content">İçeriğe geç</a><aside className="sidebar">
    <div className="life-brand"><span className="glyph" aria-hidden="true">✦</span><span>american<strong>LIFE</strong></span></div>
    <p className="eyebrow">AKADEMİK YÖNETİM</p>
    <Nav items={items} />
    <div className="sidebar-bottom"><h2>Her öğrencinin<br/>gelişimi görünür.</h2><p>Doğru zamanda, doğru destek.</p><small>Student Intelligence · American LIFE</small></div>
  </aside><div className="workspace"><header className="topbar"><span>Öğrenci yönetimi</span><div className="account"><span>{user.email}</span><form action={signOut}><button>Çıkış yap</button></form></div></header>
    <main id="content" className="content">{children}</main></div></>;
}
