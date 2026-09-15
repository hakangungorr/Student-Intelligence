import { requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { canManageCatalogue, canScheduleSessions, currentMembership } from "@/lib/membership";
import { loadObjectives, loadResources, loadSessions } from "@/lib/learning";
import { RUBRIC_WARNING, SAMPLE_WARNING } from "@/lib/catalog-seed";
import {
  RUBRICS, RUBRIC_SCALE, RUBRIC_VERSION, SKILLS, SKILL_LABEL, resourceKindLabel
} from "@/lib/rubric";
import { ConfirmButton, ResourceForm, SeedForm, SessionForm } from "./forms";

const when = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

/** Kurumun içeriği, oturumları ve ölçütleri.
 *
 *  The plan screens can only propose what is in here, which is the point: a
 *  product that invents a Guided Practice session to fill a gap in a timetable
 *  is worse than one that says the gap exists. Everything this application
 *  generated is labelled as an example on the row itself, not in a footnote.
 */
export default async function Catalog() {
  const { client } = await requireUser();
  const [me, settings] = await Promise.all([currentMembership(client), loadSettings(client)]);
  const branches = await client.from("branches").select("id,name").order("name");
  const today = new Date().toISOString().slice(0, 10);
  const [objectives, resources, sessions] = await Promise.all([
    loadObjectives(client), loadResources(client), loadSessions(client, today)
  ]);
  const branchName = new Map((branches.data ?? []).map(b => [b.id as string, b.name as string]));
  const samples = resources.filter(r => r.isSample).length + sessions.filter(s => s.isSample).length;

  return <>
    <p className="eyebrow">KAYNAKLAR VE OTURUMLAR</p>
    <h1>Plan neyi önerebilir?</h1>
    <p className="intro">Haftalık plan yalnızca burada kayıtlı içeriği ve oturumu önerir.
      Katalog boşsa plan taslağı üretilir ama içeriksiz kalır ve onay kuyruğunda
      “kaynak bulunamadı” uyarısıyla görünür — uydurulmuş bir ART bağlantısı yerine eksik
      olduğunu söyler.{samples > 0 && <> Şu an <b>{samples} kayıt örnek olarak işaretli</b>.</>}</p>

    <section className="panel pad">
      <div className="card-hd"><h2>Değerlendirme ölçütleri</h2>
        <span className="note">{RUBRIC_VERSION} · 0–{RUBRIC_SCALE}</span></div>
      <p className="note">{RUBRIC_WARNING} Ölçüt sürümü her değerlendirmeyle birlikte saklanır;
        farklı sürümde alınmış iki puan birbiriyle karşılaştırılmaz.</p>
      <div className="cards2">{SKILLS.map(s => <div key={s} className="crit-group">
        <h3>{SKILL_LABEL[s]}</h3>
        <ul className="crit-list">{RUBRICS[s].map(c =>
          <li key={c.code}><b>{c.label}</b><small>{c.hint}</small></li>)}</ul>
      </div>)}</div>
    </section>

    {canManageCatalogue(me) && <SeedForm
      branches={(branches.data ?? []).map(b => ({ id: b.id, name: b.name }))}
      levels={settings.levels} />}

    <section className="panel">
      <div className="panel-heading"><h2>Alt beceriler</h2>
        <span className="note">{objectives.length} kayıt · bir haftada ilerletilebilecek birim</span></div>
      {objectives.length === 0
        ? <p className="empty">Henüz alt beceri tanımlı değil. Kurumun öğretim planından
          seçilmeli; örnek bir liste oluşturmak için yukarıdaki formu kullanın.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Kur</th><th>Beceri</th><th>Alt beceri</th><th>Kaynak</th><th></th></tr></thead>
          <tbody>{objectives.map(o => <tr key={o.id}>
            <td>{o.level}</td><td>{SKILL_LABEL[o.skill]}</td>
            <th scope="row">{o.label}</th>
            <td>{o.confirmed
              ? <span className="state good"><i className="dot" />Kurumun</span>
              : <span className="state warn"><i className="dot" />Örnek · {o.curriculumVersion}</span>}</td>
            <td>{!o.confirmed && canManageCatalogue(me) &&
              <ConfirmButton table="learning_objectives" id={o.id} />}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    <section className="panel">
      <div className="panel-heading"><h2>İçerik</h2>
        <span className="note">{resources.length} kayıt</span></div>
      {resources.length === 0
        ? <p className="empty">İçerik kaydı yok. Plan, öğrenciye ne çalışacağını söyleyemez.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Başlık</th><th>Tür</th><th>Beceri</th><th>Kur</th><th>Süre</th>
            <th>Kaynak</th><th></th></tr></thead>
          <tbody>{resources.map(r => <tr key={r.id}>
            <th scope="row">{r.title}{r.reference && <small>{r.reference}</small>}</th>
            <td>{resourceKindLabel(r.kind)}</td>
            <td>{r.skill ? SKILL_LABEL[r.skill] : "—"}</td>
            <td>{r.level ?? "Her kur"}</td><td>{r.minutes} dk</td>
            <td>{r.isSample
              ? <span className="state warn"><i className="dot" />Örnek</span>
              : <span className="state good"><i className="dot" />Kurumun</span>}</td>
            <td>{r.isSample && canManageCatalogue(me) &&
              <ConfirmButton table="learning_resources" id={r.id} />}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    <section className="panel">
      <div className="panel-heading"><h2>Destek oturumları</h2>
        <span className="note">Bugünden sonrası · yer durumu gerçek kayıtlardan</span></div>
      {sessions.length === 0
        ? <p className="empty">Planlanmış oturum yok. Plan, oturum gerektiren bir ihtiyaç
          bulduğunda “uygun oturum bulunamadı” uyarısı verir.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Oturum</th><th>Şube</th><th>Beceri</th><th>Kur</th><th>Zaman</th>
            <th>Yer</th><th>Kaynak</th><th></th></tr></thead>
          <tbody>{sessions.map(s => <tr key={s.id}>
            <th scope="row">{s.title}<small>{resourceKindLabel(s.kind)} · {s.minutes} dk</small></th>
            <td>{branchName.get(s.branchId) ?? "—"}</td>
            <td>{s.skill ? SKILL_LABEL[s.skill] : "—"}</td>
            <td>{s.level ?? "Her kur"}</td>
            <td>{when.format(new Date(s.startsAt))}</td>
            <td className={s.taken >= s.capacity ? "crit-ink" : undefined}>
              {s.capacity - s.taken}/{s.capacity}</td>
            <td>{s.isSample
              ? <span className="state warn"><i className="dot" />Örnek</span>
              : <span className="state good"><i className="dot" />Kurumun</span>}</td>
            <td>{s.isSample && canScheduleSessions(me) &&
              <ConfirmButton table="support_sessions" id={s.id} />}</td>
          </tr>)}</tbody>
        </table></div>}
      <p className="pad-note note">{SAMPLE_WARNING}</p>
    </section>

    <div className="cards2">
      {canManageCatalogue(me) && <ResourceForm levels={settings.levels} />}
      {canScheduleSessions(me) && <SessionForm
        branches={(branches.data ?? []).map(b => ({ id: b.id, name: b.name }))}
        levels={settings.levels} />}
    </div>
  </>;
}
