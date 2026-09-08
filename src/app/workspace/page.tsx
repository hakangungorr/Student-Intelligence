import { requireUser } from "@/lib/auth";

export default async function Workspace() {
  const {client} = await requireUser();
  // Exact counts are database-side; never derive institution totals from a limited page.
  const [members, students, branches] = await Promise.all([
    client.from("memberships").select("id", {count:"exact", head:true}),
    client.from("students").select("id", {count:"exact", head:true}).eq("active", true),
    client.from("branches").select("id,name").order("name")
  ]);
  if (members.error || students.error || branches.error) throw new Error("Çalışma alanı yüklenemedi.");
  if (!members.count) return <section className="panel empty"><h1>Kurum erişiminiz bekleniyor.</h1><p>Hesabınız açık, ancak henüz bir kurum veya şubeye atanmadınız. Kurum yöneticinizden erişim isteyin.</p></section>;
  return <><p className="eyebrow">AKADEMİK GÜNDEM</p><h1>Öğrencileriniz için ortak bir çalışma alanı.</h1>
    <p className="intro">Yalnızca yetkili olduğunuz şubelerin bilgileri burada görünür.</p>
    <div className="metrics"><section className="panel metric"><strong>{students.count ?? 0}</strong><span>Aktif öğrenci</span></section>
      <section className="panel metric"><strong>{branches.data.length}</strong><span>Erişebildiğiniz şube</span></section></div>
    <section className="panel"><div className="panel-heading"><h2>Şubeleriniz</h2></div>
      {branches.data.length ? <ul className="branch-list">{branches.data.map(b=><li key={b.id}>{b.name}</li>)}</ul> : <p className="empty">Henüz şube tanımlanmadı. Kurum yöneticinizle görüşün.</p>}</section>
    <section className="panel empty"><h2>Öğrenci analizine hazırlanıyoruz.</h2><p>Gerçek veriye bağlı risk panosu ve dosya aktarımı sonraki aşamada bağlanacak. Bu ekrandaki sayılar kurum kayıtlarından gelir.</p></section>
  </>;
}
