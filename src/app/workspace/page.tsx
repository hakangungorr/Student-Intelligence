import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadAgenda, type AgendaStudent, type HeatRow, type Finding } from "@/lib/agenda";
import { AREA, DIMENSIONS, MISSING, STATE, band } from "@/lib/narrative";
import { Quad } from "./quad";

const PRIORITY = 10;

/** Periods are whatever dates somebody recorded on, not necessarily weeks apart:
 *  saving a class sheet scores that day. Naming the date keeps the comparison
 *  honest where "geçen hafta" would quietly stop being true. */
function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" })
    .format(new Date(y, m - 1, d));
}

export default async function Workspace() {
  const { client } = await requireUser();
  const [a, me] = await Promise.all([
    loadAgenda(client),
    client.from("memberships").select("role").limit(1).maybeSingle()
  ]);

  // A teacher's access runs through enrollments.teacher_id, and a roster import
  // only writes teacher_name — so an unassigned teacher sees an empty institution
  // and is told the students do not exist. They do; nobody has connected them.
  if (!a.total && me.data?.role === "teacher") return <section className="panel empty">
    <h1>Size henüz sınıf atanmadı.</h1>
    <p>Kurumda öğrenci var, ancak hiçbiri size bağlanmamış. Kurum yöneticiniz
      <b> Ekip ve sınıflar</b> ekranından şube ve kur seçerek sınıfınızı atayabilir.
      Atama yapıldığı anda gündeminiz burada oluşur.</p></section>;

  if (!a.total) return <section className="panel empty">
    <h1>Henüz öğrenci kaydı yok.</h1>
    <p>Erişebildiğiniz şubelerde kayıtlı öğrenci bulunmuyor. Öğrenci verisi aktarıldığında
      gündem burada oluşur.</p></section>;

  return <>
    <p className="eyebrow">KURUM GENELİ · {a.total} ÖĞRENCİ</p>
    <h1>{a.urgent
      ? `${a.urgent} öğrenci acil ilgi bekliyor.`
      : "Acil ilgi bekleyen öğrenci yok."}</h1>
    <p className="intro">Aksiyon önerilen {a.studentsWithAction} öğrencinin <b>{a.withPlan} tanesinin
      açık planı var</b>{a.tasks > 0 && <>; planlardaki {a.tasks} görevin {a.tasksDone} tanesi yapıldı</>}
      {a.periodEnd && <> · {shortDate(a.periodEnd)} ölçümü</>}
      {a.comparedTo && <>, {shortDate(a.comparedTo)} ile karşılaştırılıyor</>}.
      {a.awaitingScore > 0 && <> Kayıtlı {a.registered} öğrencinin {a.awaitingScore} tanesi
        bu kesitte puanlanmadı; veri bekledikleri için listede yoklar.</>}</p>
    {a.tasks > 0 && <div className="progress" role="img"
      aria-label={`${a.tasks} görevin ${a.tasksDone} tanesi yapıldı`}>
      <i style={{ width: `${Math.round(a.tasksDone / a.tasks * 100)}%` }} /></div>}

    <div className="metrics kpis">
      <Kpi value={a.urgent} label="Acil ilgi bekliyor" was={a.previousUrgent}
        when={a.comparedTo} worseIsUp />
      <Kpi value={a.watched} label="Yakın takipte" was={a.previousWatched}
        when={a.comparedTo} worseIsUp />
      <Kpi value={a.enteredUrgent} label="Bu hafta riske girenler" note="geçen hafta acil değildi" />
      <Kpi value={a.attendanceCritical} label="Devamsızlığı kritik"
        note={`devam oranı %${a.settings.attendanceFloor} sınırının altında`} />
    </div>

    <section className="panel">
      <div className="panel-heading"><h2>Planlar</h2>
        <span className="note">Bugün bakılması gerekenler</span></div>
      <div className="cycle">
        <Cycle n={a.planMissing} label="Planı yok" href="/workspace/ask?s=plan"
          note="aksiyon önerildi, kimse plan açmadı" />
        <Cycle n={a.stuck} label="Takılan var" href="/workspace/students"
          note="bir görevde takılan öğrenci" />
        <Cycle n={a.checkOverdue} label="Kontrol tarihi geçti" href="/workspace/ask?s=yeniden"
          note="plan açık, kontrol ölçümü bekleniyor" />
      </div>
    </section>

    <section className="panel">
      <div className="panel-heading">
        <h2>Önce bu {Math.min(PRIORITY, a.students.length)} öğrenci</h2>
        <span className="note">En acil olandan başlayarak · ayrıntı için isme tıklayın</span>
      </div>
      <div className="quadkey">
        {DIMENSIONS.map((d, i) => <span key={d} className="qk"><i className="cell" />{i + 1}. {AREA[d]}</span>)}
        <span className="note">Her satırdaki dört hücre bu sırayla. Kırmızı ciddi sorun,
          sarı dikkat gerektiriyor, sorunsuz alan yanmaz.</span>
      </div>
      {a.students.slice(0, PRIORITY).map((s, i) => <Row key={s.id} s={s} rank={i + 1} />)}
    </section>

    {a.findings.length > 0 && <section className="panel">
      <div className="panel-heading"><h2>Şubelerde öne çıkanlar</h2>
        <span className="note">Bir şubede veya kurda herkesi etkileyen durumlar</span></div>
      <div className="findings">{a.findings.map((f, i) =>
        <Note key={i} finding={f} index={i + 1} />)}</div>
    </section>}

    <section className="panel">
      <div className="panel-heading"><h2>Risk skoru düşen öğrenciler</h2>
        <span className="note">Önceki kesitle karşılaştırma · öğrenme kanıtı değil</span></div>
      {!a.comparedTo
        ? <p className="empty">Bu panel önceki ölçümle karşılaştırma yapar. İlk ölçümde
          karşılaştırılacak bir kesit yok — ikincisinden itibaren durumu düzelen öğrenciler
          burada listelenir.</p>
        : a.recovered.length === 0
          ? <p className="empty">Bu kesitte durumu düzelen öğrenci yok.</p>
          : <><p className="pad-note note">Skorun düşmesi desteğin işe yaradığını göstermez:
            devam düzeldiğinde de, eksik bir boyut ilk kez ölçüldüğünde de skor düşer. Neyin
            öğrenildiği öğrenci kartındaki <b>Gelişim</b> sekmesinde, aynı ölçütle yapılmış
            ikinci ölçümden okunur.</p>
          <div className="recovered">{a.recovered.map(s => <Link key={s.id} className="recovered-card"
            href={`/workspace/students/${s.id}`}>
            <b>{s.name}</b><span className="note">{s.branch} · {s.level}</span>
            <span className="shift">
              <span className={`state ${STATE[s.previous!].cls} faded`}><i className="dot" />{STATE[s.previous!].word}</span>
              <span className="arrow">→</span>
              <span className={`state ${STATE[s.level_].cls}`}><i className="dot" />{STATE[s.level_].word}</span>
            </span>
          </Link>)}</div></>}
    </section>

    <Heat title="Şube risk haritası" rows={a.byBranch} unit="öğrenci" />
    <Heat title="Kur risk haritası" rows={a.byLevel} unit="öğrenci" />
  </>;
}

function Cycle({ n, label, note, href }: {
  n: number; label: string; note: string; href: string;
}) {
  return <Link className="cycle-cell" href={href}>
    <strong>{n}</strong><span>{label}</span><small className="note">{note}</small></Link>;
}

function Kpi({ value, label, was, when, note, worseIsUp }: {
  value: number; label: string; was?: number | null; when?: string | null;
  note?: string; worseIsUp?: boolean;
}) {
  const delta = was === null || was === undefined ? null : value - was;
  const bad = delta !== null && delta !== 0 && (worseIsUp ? delta > 0 : delta < 0);
  return <section className="panel metric">
    <strong>{value}</strong><span>{label}</span>
    {delta !== null && delta !== 0 && <span className={`trend ${bad ? "up" : "down"}`}>
      {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} <em>· {when ? shortDate(when) : "önceki ölçüm"}: {was}</em></span>}
    {delta === 0 && <span className="trend flat">
      değişmedi · {when ? shortDate(when) : "önceki ölçüm"}: {was}</span>}
    {note && <span className="note">{note}</span>}
  </section>;
}

function Note({ finding, index }: { finding: Finding; index: number }) {
  return <div className="finding">
    <span className={`fmark ${finding.tone}`}>{finding.tone === "good" ? "✓" : index}</span>
    <span><b>{finding.title}</b><span className="note">{finding.text}</span></span>
  </div>;
}

function Row({ s, rank }: { s: AgendaStudent; rank: number }) {
  const whos = [...new Set(s.steps.map(x => x.who).filter(Boolean))];
  return <article className="srow">
    <div className="srow-hd">
      <span className="srank">{String(rank).padStart(2, "0")}</span>
      <Link href={`/workspace/students/${s.id}`}>{s.name}</Link>
      <span className={`state ${STATE[s.level_].cls}`}><i className="dot" />{STATE[s.level_].word}</span>
      <span className="note">{s.branch} · {s.level}</span>
    </div>
    <Quad dimensions={s.dimensions} />
    <p className="srow-head">{s.headline}</p>
    <ul className="facts">{s.found.slice(0, 2).map(f =>
      <li key={f.dim} className={band(f.score)}>{f.text}</li>)}</ul>
    <div className="todo">
      <div className="todo-hd">NE YAPMALI</div>
      <ul>{s.steps.map(x => <li key={x.key}><span className="ck">→</span><span>{x.text}</span></li>)}</ul>
      {whos.length > 0 && <p className="who">Kim: <b>{whos.join(" · ")}</b></p>}
      {/* The recommendation is a suggestion. Whether anybody acted on it is the
          plan's answer, and there is exactly one place to act: the Plan tab. */}
      {s.needsAction && <p className="plan-line">{s.plan
        ? <Link href={`/workspace/students/${s.id}?g=plan`}>
          Açık plan · {s.plan.done}/{s.plan.tasks} görev yapıldı
          {s.plan.stuck > 0 && <> · <span className="crit-ink">{s.plan.stuck} takıldı</span></>}
          {s.plan.overdue && <> · <span className="crit-ink">kontrol tarihi geçti</span></>} →</Link>
        : <Link className="markbtn" href={`/workspace/students/${s.id}?g=plan`}>Plan aç →</Link>}</p>}
    </div>
  </article>;
}

function Heat({ title, rows, unit }: { title: string; rows: HeatRow[]; unit: string }) {
  return <section className="panel">
    <div className="panel-heading"><h2>{title}</h2>
      <span className="note">0–100 · yüksek sayı = daha çok sorun</span></div>
    <div className="table-scroll"><table>
      <thead><tr><th>{title.split(" ")[0]}</th>
        {DIMENSIONS.map(d => <th key={d}>{AREA[d]}</th>)}<th>Acil öğrenci</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.label}>
        <th scope="row">{r.label}<small>{r.count} {unit}</small></th>
        {DIMENSIONS.map(d => <td key={d} className={`heat ${band(r.scores[d])}`}
          title={r.scores[d] === undefined ? MISSING[d] : undefined}>
          {r.scores[d] ?? "—"}</td>)}
        <td>{r.urgent}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
