import { requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { fetchAll } from "@/lib/paginate";
import { SettingsForm } from "./form";

/** What the institution would see if it answered differently.
 *
 *  The passing mark was assumed, and the assumption decides who is warned about.
 *  Rather than asking the school for the number and waiting, the screen shows
 *  what each candidate answer would mean for their own students right now — so
 *  the conversation is thirty seconds long and ends with the value saved. */
function ladder(values: number[], candidates: number[], current: number) {
  const rows = [...new Set([...candidates, current])].sort((a, b) => a - b);
  return rows.map(mark => ({
    mark, current: mark === current, count: values.filter(v => v < mark).length
  }));
}

export default async function SettingsPage() {
  const { client } = await requireUser();
  const me = await client.from("memberships").select("role").limit(1).maybeSingle();
  if (me.data?.role !== "org_admin") return <section className="panel empty">
    <h1>Bu sayfa kurum yöneticisine açık.</h1>
    <p>Buradaki değerler bütün şubelerdeki bütün öğrencilerin skorunu birden değiştirdiği için
      yalnızca kurum yöneticisi tarafından belirlenir.</p>
  </section>;

  const [settings, measurements] = await Promise.all([
    loadSettings(client),
    fetchAll<{ source_reference: string; value: number }>(
      () => client.from("student_measurements").select("source_reference,value")
        .in("source_reference", ["exam_4", "term_rate"]),
      "Ölçümler okunamadı")
  ]);

  const lastExams = measurements.filter(m => m.source_reference === "exam_4").map(m => Number(m.value));
  const rates = measurements.filter(m => m.source_reference === "term_rate").map(m => Number(m.value));
  const passLadder = ladder(lastExams, [50, 55, 60, 65, 70, 75], settings.passMark);
  const attendanceLadder = ladder(rates, [65, 70, 75, 80, 85], settings.attendanceFloor);

  return <>
    <p className="eyebrow">KURUM AYARLARI</p>
    <h1>Sistemin sizin adınıza varsaydığı üç şey.</h1>
    <p className="intro">Risk motorunun geri kalanı kurumun kendi verisinden kalibre olur: her
      kurun karşılaştırma değeri o kurun en iyi %25’inin ortalamasıdır. Aşağıdaki üç değer
      hesaplanamaz, çünkü bunlar kurumun kararıdır — bu yüzden makul bir varsayımla başlatıldı
      ve buradan değiştirilebilir. Kaydettiğinizde skorlar aynı anda yeniden hesaplanır.</p>

    <SettingsForm settings={settings} />

    <section className="panel">
      <div className="panel-heading"><h2>Geçme notunu değiştirirseniz</h2>
        <span className="note">Son sınavı bu notun altında kalan öğrenci sayısı</span></div>
      {lastExams.length === 0
        ? <p className="empty">Henüz sınav notu girilmemiş; sayılar veri geldikçe dolar.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Geçme notu</th><th>Etkilenen öğrenci</th><th>Oran</th></tr></thead>
          <tbody>{passLadder.map(r => <tr key={r.mark}>
            <th scope="row">{r.mark}{r.current && <small>şu anki değer</small>}</th>
            <td>{r.count}</td>
            <td>%{Math.round(r.count / lastExams.length * 100)}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    <section className="panel">
      <div className="panel-heading"><h2>Devam sınırını değiştirirseniz</h2>
        <span className="note">Devam oranı bu sınırın altında kalan öğrenci sayısı</span></div>
      {rates.length === 0
        ? <p className="empty">Henüz devam oranı girilmemiş; sayılar veri geldikçe dolar.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Devam sınırı</th><th>Kritik sayılan öğrenci</th><th>Oran</th></tr></thead>
          <tbody>{attendanceLadder.map(r => <tr key={r.mark}>
            <th scope="row">%{r.mark}{r.current && <small>şu anki değer</small>}</th>
            <td>{r.count}</td>
            <td>%{Math.round(r.count / rates.length * 100)}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    <section className="panel pad">
      <h2>Neden yalnızca bu üçü?</h2>
      <p className="note">Ağırlıklar, eşikler ve karşılaştırma değerleri kasten burada değil.
        Bunlar yüz öğrencilik veri üzerinde kalibre edildi ve ekrandan değiştirilmeleri, aynı
        öğrencinin kimin baktığına göre farklı skor almasına yol açar. Kurumun kendi kararı olan
        üç değer ayrıldı; gerisi motorun içinde kalır.</p>
    </section>
  </>;
}
