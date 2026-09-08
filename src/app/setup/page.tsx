import Link from "next/link";
export default function Setup() {
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">AMERICAN LIFE</p>
    <h1>Çalışma alanı hazırlanıyor.</h1><p>Kurum bağlantısı henüz yapılandırılmadı. Kurulumu tamamlamak için sistem yöneticinizle görüşün.</p>
    <Link className="primary" href="/login">Giriş sayfasına dön</Link></section></main>;
}
