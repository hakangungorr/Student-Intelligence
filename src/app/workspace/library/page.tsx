import { requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { canManageCatalogue, canScheduleSessions, currentMembership } from "@/lib/membership";
import { loadLibrary, seatsLeft } from "@/lib/library";
import { RUBRIC_WARNING, SAMPLE_WARNING } from "@/lib/library-seed";
import { RUBRICS, RUBRIC_SCALE, RUBRIC_VERSION, SKILLS, SKILL_LABEL, programLabel } from "@/lib/rubric";
import { AddItemForm, RowActions, SeedForm } from "./forms";

const when = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

/** Kütüphane: planın önerebileceği her şey, tek listede.
 *
 *  A plan only suggests what is in here. An empty library does not stop a plan
 *  from being made — the suggestion says the library has nothing for that skill
 *  instead of inventing an item.
 */
export default async function Library() {
  const { client } = await requireUser();
  const [me, settings, branches, items] = await Promise.all([
    currentMembership(client), loadSettings(client),
    client.from("branches").select("id,name").order("name"),
    loadLibrary(client)
  ]);
  const branchList = (branches.data ?? []).map(b => ({ id: b.id as string, name: b.name as string }));
  const branchName = new Map(branchList.map(b => [b.id, b.name]));
  const studies = items.filter(i => i.kind === "study");
  const events = items.filter(i => i.kind === "event");
  const samples = items.filter(i => i.isSample).length;
  const canStudy = canManageCatalogue(me), canEvent = canScheduleSessions(me);

  return <>
    <p className="eyebrow">KÜTÜPHANE</p>
    <h1>Plan neyi önerebilir?</h1>
    <p className="intro">İki tür kayıt var. <b>Çalışma</b>, öğrencinin kendi zamanında yaptığı
      iştir. <b>Etkinlik</b>, tarihi ve kontenjanı olan bir oturumdur — plana eklendiği anda
      öğrenciye yer ayrılır, dolduğunda eklenemez.
      {samples > 0 && <> Şu an <b>{samples} kayıt örnek</b>; kurumun gerçek listesi geldiğinde
        değiştirilmeli.</>}</p>

    {canStudy && items.length === 0 && <SeedForm branches={branchList} levels={settings.levels} />}

    <section className="panel">
      <div className="panel-heading"><h2>Çalışmalar</h2>
        <span className="note">{studies.length} kayıt</span></div>
      {studies.length === 0
        ? <p className="empty">Çalışma yok. Plan önerisi “kütüphanede bu beceri için içerik yok”
          diyecek.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Başlık</th><th>Beceri</th><th>Kur</th><th>Süre</th><th>Durum</th><th></th></tr></thead>
          <tbody>{studies.map(i => <tr key={i.id}>
            <th scope="row">{i.title}<small>{programLabel(i.program)}{i.reference && ` · ${i.reference}`}</small></th>
            <td>{i.skill ? SKILL_LABEL[i.skill] : "—"}</td>
            <td>{i.level ?? "Her kur"}</td><td>{i.minutes} dk</td>
            <td><Origin sample={i.isSample} /></td>
            <td>{canStudy && <RowActions id={i.id} sample={i.isSample} />}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    <section className="panel">
      <div className="panel-heading"><h2>Etkinlikler</h2>
        <span className="note">Bugünden sonrası · boş yer gerçek kayıtlardan</span></div>
      {events.length === 0
        ? <p className="empty">Yaklaşan etkinlik yok.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Etkinlik</th><th>Şube</th><th>Beceri</th><th>Ne zaman</th>
            <th>Boş yer</th><th>Durum</th><th></th></tr></thead>
          <tbody>{events.map(i => <tr key={i.id}>
            <th scope="row">{i.title}<small>{programLabel(i.program)} · {i.minutes} dk
              {i.level && ` · ${i.level}`}</small></th>
            <td>{i.branchId ? branchName.get(i.branchId) ?? "—" : "—"}</td>
            <td>{i.skill ? SKILL_LABEL[i.skill] : "—"}</td>
            <td>{when.format(new Date(i.startsAt!))}</td>
            <td className={seatsLeft(i) === 0 ? "crit-ink" : undefined}>
              {seatsLeft(i) === 0 ? "Dolu" : `${seatsLeft(i)} / ${i.capacity}`}</td>
            <td><Origin sample={i.isSample} /></td>
            <td>{canEvent && <RowActions id={i.id} sample={i.isSample} />}</td>
          </tr>)}</tbody>
        </table></div>}
      <p className="pad-note note">{SAMPLE_WARNING}</p>
    </section>

    {(canStudy || canEvent) && <AddItemForm branches={branchList} levels={settings.levels}
      canStudy={canStudy} canEvent={canEvent} />}

    <details className="panel pad">
      <summary><b>Ölçütler</b> <span className="note">— ölçümlerde kullanılan alt beceriler ·
        {" "}{RUBRIC_VERSION} · 0–{RUBRIC_SCALE}</span></summary>
      <p className="note">{RUBRIC_WARNING} Farklı sürümde alınmış iki puan birbiriyle
        karşılaştırılmaz.</p>
      <div className="cards2">{SKILLS.map(s => <div key={s}>
        <h3 className="sub-hd">{SKILL_LABEL[s]}</h3>
        <ul className="plain-list">{RUBRICS[s].map(c =>
          <li key={c.code}><b>{c.label}</b><small>{c.hint}</small></li>)}</ul>
      </div>)}</div>
    </details>
  </>;
}

function Origin({ sample }: { sample: boolean }) {
  return sample
    ? <span className="state warn"><i className="dot" />Örnek</span>
    : <span className="state good"><i className="dot" />Kurumun</span>;
}
