import { requireUser } from "@/lib/auth";
const roles: Record<string,string> = {org_admin:"Kurum yöneticisi",branch_manager:"Şube yöneticisi",teacher:"Eğitmen",viewer:"Görüntüleyici"};
export default async function Access() {
  const {client} = await requireUser();
  const {data,error} = await client.from("memberships").select("id,role,organization_id,branch_id");
  if(error) throw new Error("Erişim bilgileri yüklenemedi.");
  const [{data:orgs,error:orgError},{data:branches,error:branchError}] = await Promise.all([
    client.from("organizations").select("id,name"), client.from("branches").select("id,name")
  ]);
  if(orgError || branchError) throw new Error("Kurum bilgileri yüklenemedi.");
  return <><p className="eyebrow">HESABIM</p><h1>Erişim bilgilerim</h1><p className="intro">Yetki değişiklikleri kurum yöneticiniz tarafından yapılır.</p>
    <section className="panel"><div className="table-scroll"><table><thead><tr><th>Kurum</th><th>Kapsam</th><th>Rol</th></tr></thead><tbody>
      {data.map(m=><tr key={m.id}><td>{orgs.find(o=>o.id===m.organization_id)?.name}</td><td>{m.branch_id ? branches.find(b=>b.id===m.branch_id)?.name : "Kurum geneli"}</td><td>{roles[m.role] ?? m.role}</td></tr>)}
    </tbody></table></div>{!data.length && <p className="empty">Henüz bir kuruma atanmadınız.</p>}</section></>;
}
