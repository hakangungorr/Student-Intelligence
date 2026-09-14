import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadAgenda, type AgendaStudent } from "@/lib/agenda";
import { AREA, DIMENSIONS, STATE, type Dimension } from "@/lib/narrative";
import { Quad } from "../quad";

const RISKS: [string, string][] = [["HIGH", "Acil"], ["MEDIUM", "Takipte"], ["LOW", "Düşük risk"]];
const matches = (v: number | undefined) => v !== undefined && v >= 30;

type Query = { q?: string; sube?: string; kur?: string; risk?: string; alan?: string };

export default async function Students({ searchParams }: { searchParams: Promise<Query> }) {
  const f = await searchParams;
  const { client } = await requireUser();
  const a = await loadAgenda(client);

  const needle = (f.q ?? "").trim().toLocaleLowerCase("tr");
  const rows = a.students.filter(s =>
    (!needle || s.name.toLocaleLowerCase("tr").includes(needle)
      || s.externalId.toLocaleLowerCase("tr").includes(needle))
    && (!f.sube || s.branch === f.sube)
    && (!f.kur || s.level === f.kur)
    && (!f.risk || s.level_ === f.risk)
    // A dimension with no data does not match a problem-area filter: "students
    // with a skill problem" must not answer with students nobody has scored for
    // skills.
    && (!f.alan || matches(s.dimensions[f.alan as Dimension])));

  const filtered = Boolean(needle || f.sube || f.kur || f.risk || f.alan);
  // A branch manager or a teacher only ever sees one branch, and a dropdown with
  // one option is a question with one answer.
  const branches = a.byBranch.map(b => b.label);

  return <>
    <p className="eyebrow">ÖĞRENCİ LİSTESİ</p>
    <h1>{rows.length} öğrenci{filtered && <> · {a.total} içinden</>}</h1>
    <p className="intro">{branches.length > 1 ? "Şube, kur" : "Kur"}, risk ve sorun alanına göre
      süzün. Eğitmen kırılımı bilerek yok — şubenin kaynak sorununu bir öğretmenin performans
      sorunu gibi gösteriyordu.</p>

    <p><Link className="primary" href="/workspace/students/new">Yeni öğrenci kaydet</Link></p>

    <form className="panel filters" method="get">
      <label>Ara<input type="search" name="q" defaultValue={f.q ?? ""}
        placeholder="İsim ya da numara" autoComplete="off" /></label>
      {branches.length > 1 && <label>Şube<select name="sube" defaultValue={f.sube ?? ""}>
        <option value="">Bütün şubeler</option>
        {branches.map(b => <option key={b} value={b}>{b}</option>)}</select></label>}
      <label>Kur<select name="kur" defaultValue={f.kur ?? ""}>
        <option value="">Bütün kurlar</option>
        {a.settings.levels.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
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
    <td><Quad dimensions={s.dimensions} /></td>
    <td className="wrap">{s.found[0]?.text ?? "—"}</td>
    <td className="wrap">{s.steps[0]?.text ?? "—"}</td>
  </tr>;
}
