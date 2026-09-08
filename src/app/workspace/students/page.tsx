import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadAgenda, type AgendaStudent } from "@/lib/agenda";
import { AREA, DIMENSIONS, STATE, band, type Dimension } from "@/lib/narrative";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const RISKS: [string, string][] = [["HIGH", "Acil"], ["MEDIUM", "Takipte"], ["LOW", "Düşük risk"]];

type Query = { q?: string; kur?: string; risk?: string; alan?: string };

export default async function Students({ searchParams }: { searchParams: Promise<Query> }) {
  const f = await searchParams;
  const { client } = await requireUser();
  const a = await loadAgenda(client);

  const needle = (f.q ?? "").trim().toLocaleLowerCase("tr");
  const rows = a.students.filter(s =>
    (!needle || s.name.toLocaleLowerCase("tr").includes(needle)
      || s.externalId.toLocaleLowerCase("tr").includes(needle))
    && (!f.kur || s.level === f.kur)
    && (!f.risk || s.level_ === f.risk)
    && (!f.alan || (s.dimensions[f.alan as Dimension] ?? 0) >= 30));

  const filtered = Boolean(needle || f.kur || f.risk || f.alan);

  return <>
    <p className="eyebrow">ÖĞRENCİ LİSTESİ</p>
    <h1>{rows.length} öğrenci{filtered && <> · {a.total} içinden</>}</h1>
    <p className="intro">Şube, kur, risk ve sorun alanına göre süzün. Eğitmen kırılımı bilerek
      yok — şubenin kaynak sorununu bir öğretmenin performans sorunu gibi gösteriyordu.</p>

    <form className="panel filters" method="get">
      <label>Ara<input type="search" name="q" defaultValue={f.q ?? ""}
        placeholder="İsim ya da numara" autoComplete="off" /></label>
      <label>Kur<select name="kur" defaultValue={f.kur ?? ""}>
        <option value="">Bütün kurlar</option>
        {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
      <label>Risk<select name="risk" defaultValue={f.risk ?? ""}>
        <option value="">Hepsi</option>
        {RISKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Sorun alanı<select name="alan" defaultValue={f.alan ?? ""}>
        <option value="">Bütün sorun alanları</option>
        {DIMENSIONS.map(d => <option key={d} value={d}>{AREA[d]} sorunu olanlar</option>)}</select></label>
      <span className="filter-actions">
        <button type="submit" className="primary">Süz</button>
        {filtered && <Link href="/workspace/students">Temizle</Link>}
      </span>
    </form>

    {rows.length === 0
      ? <section className="panel empty"><h2>Bu süzgeçle eşleşen öğrenci yok.</h2>
        <p>Süzgeçleri gevşetin ya da temizleyin.</p></section>
      : <section className="panel"><div className="table-scroll"><table>
        <thead><tr>
          <th>Öğrenci</th><th>Şube</th><th>Kur</th><th>Risk</th>
          <th>Sorun alanları</th><th>En acil sebep</th><th>Önerilen aksiyon</th>
        </tr></thead>
        <tbody>{rows.map(s => <Row key={s.id} s={s} />)}</tbody>
      </table></div></section>}
  </>;
}

function Row({ s }: { s: AgendaStudent }) {
  return <tr>
    <th scope="row"><Link href={`/workspace/students/${s.id}`}>{s.name}</Link>
      <small>{s.externalId}</small></th>
    <td>{s.branch}</td><td>{s.level}</td>
    <td><span className={`state ${STATE[s.level_].cls}`}><i className="dot" />{STATE[s.level_].word}</span></td>
    <td><span className="quad">{DIMENSIONS.map(d =>
      <i key={d} className={`cell ${band(s.dimensions[d] ?? 0)}`} />)}</span></td>
    <td className="wrap">{s.found[0]?.text ?? "—"}</td>
    <td className="wrap">{s.steps[0]?.text ?? "—"}</td>
  </tr>;
}
