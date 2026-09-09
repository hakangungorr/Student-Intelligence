import { requireUser } from "@/lib/auth";
import { loadTeam } from "@/lib/team";
import { roleLabel } from "@/lib/roles";
import { GrantForm, RevokeButton, AssignForm } from "./form";

export default async function TeamPage() {
  const { client } = await requireUser();
  const me = await client.from("memberships").select("role").limit(1).maybeSingle();
  if (me.data?.role !== "org_admin") return <section className="panel empty">
    <h1>Bu sayfa kurum yöneticisine açık.</h1>
    <p>Roller ve sınıf atamaları kurum genelini etkilediği için yalnızca kurum yöneticisi
      tarafından yönetilir. Erişiminizi görmek için “Erişim bilgilerim” sayfasını açın.</p>
  </section>;

  const team = await loadTeam(client);

  return <>
    <p className="eyebrow">EKİP VE SINIFLAR</p>
    <h1>Kim neye erişiyor?</h1>
    <p className="intro">Hesaplar Supabase panelinden açılır; roller ve sınıf atamaları buradan
      yapılır. Uygulama hesap oluşturamaz ve e-posta adreslerini okuyamaz — bu yüzden kişileri
      kimlikleriyle eklersiniz, ekranlarda ise buraya yazdığınız isim görünür.</p>

    <section className="panel">
      <div className="panel-heading"><h2>Ekip</h2>
        <span className="note">{team.members.length} kişi</span></div>
      <div className="table-scroll"><table>
        <thead><tr><th>Kişi</th><th>Rol</th><th>Şube</th><th>Atanmış öğrenci</th><th></th></tr></thead>
        <tbody>{team.members.map(m => <tr key={m.id}>
          <th scope="row">{m.name ?? "—"}<small>{m.userId.slice(0, 8)}…</small></th>
          <td>{roleLabel(m.role)}</td>
          <td>{m.branch ?? "Kurum geneli"}</td>
          <td>{m.role === "teacher" ? m.students : "—"}</td>
          <td><RevokeButton member={m} /></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <AssignForm teachers={team.teachers} branches={team.branches} levels={team.levels} />
    <GrantForm branches={team.branches} />
  </>;
}
