import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadAgenda, type AgendaStudent, type HeatRow } from "@/lib/agenda";
import { AREA, DIMENSIONS, STATE, band } from "@/lib/narrative";

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
  const a = await loadAgenda(client);

  if (!a.total) return <section className="panel empty">
    <h1>Henüz öğrenci kaydı yok.</h1>
    <p>Erişebildiğiniz şubelerde kayıtlı öğrenci bulunmuyor. Öğrenci verisi aktarıldığında
      gündem burada oluşur.</p></section>;

  return <>
    <p className="eyebrow">KURUM GENELİ · {a.total} ÖĞRENCİ</p>
    <h1>{a.urgent
      ? `${a.urgent} öğrenci acil ilgi bekliyor.`
      : "Acil ilgi bekleyen öğrenci yok."}</h1>
    <p className="intro">{a.students.filter(s => s.needsAction).length} öğrenci için önerilen bir
      aksiyon var{a.periodEnd && <> · {shortDate(a.periodEnd)} ölçümü</>}
      {a.comparedTo && <>, {shortDate(a.comparedTo)} ile karşılaştırılıyor</>}.</p>

    <div className="metrics kpis">
      <Kpi value={a.urgent} label="Acil ilgi bekliyor" was={a.previousUrgent}
        when={a.comparedTo} worseIsUp />
      <Kpi value={a.watched} label="Yakın takipte" was={a.previousWatched}
        when={a.comparedTo} worseIsUp />
      <Kpi value={a.enteredUrgent} label="Bu hafta riske girenler" note="geçen hafta acil değildi" />
      <Kpi value={a.attendanceCritical} label="Devamsızlığı kritik"
        note="derslerin dörtte birinden fazlasını kaçırdı" />
    </div>

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

    <Heat title="Şube risk haritası" rows={a.byBranch} unit="öğrenci" />
    <Heat title="Kur risk haritası" rows={a.byLevel} unit="öğrenci" />
  </>;
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
      {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} <em>{when ? shortDate(when) : "önceki ölçüm"}: {was}</em></span>}
    {delta === 0 && <span className="trend flat">
      değişmedi · {when ? shortDate(when) : "önceki ölçüm"}: {was}</span>}
    {note && <span className="note">{note}</span>}
  </section>;
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
    <div className="quad" role="img" aria-label={DIMENSIONS.map(d =>
      `${AREA[d]}: ${s.dimensions[d] >= 60 ? "ciddi sorun" : s.dimensions[d] >= 30 ? "dikkat" : "sorun yok"}`
    ).join(", ")}>
      {DIMENSIONS.map(d => <i key={d} className={`cell ${band(s.dimensions[d] ?? 0)}`} />)}
    </div>
    <p className="srow-head">{s.headline}</p>
    <ul className="facts">{s.found.slice(0, 2).map(f =>
      <li key={f.dim} className={band(f.score)}>{f.text}</li>)}</ul>
    <div className="todo">
      <div className="todo-hd">NE YAPMALI</div>
      <ul>{s.steps.map((x, i) => <li key={i}><span className="ck">→</span><span>{x.text}</span></li>)}</ul>
      {whos.length > 0 && <p className="who">Kim: <b>{whos.join(" · ")}</b></p>}
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
        {DIMENSIONS.map(d => <td key={d} className={`heat ${band(r.scores[d])}`}>{r.scores[d]}</td>)}
        <td>{r.urgent}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
