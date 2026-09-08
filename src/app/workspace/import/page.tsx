import { requireUser } from "@/lib/auth";
import { REQUIRED, OPTIONAL } from "@/lib/csv";
import { ImportForm, ScoreForm } from "./form";

export default async function Import() {
  const { client } = await requireUser();
  const history = await client.from("import_batches")
    .select("id,filename,row_count,created_count,updated_count,skipped_count,created_at")
    .order("created_at", { ascending: false }).limit(10);

  const today = new Date().toISOString().slice(0, 10);
  const fmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

  return <>
    <p className="eyebrow">VERİ AKTARIMI</p>
    <h1>Öğrenci verinizi yükleyin.</h1>
    <p className="intro">Kurumunuzun kendi dışa aktarımını CSV olarak yükleyin. Dosya önce
      doğrulanır ve önizlenir; onaylamadan veritabanına hiçbir şey yazılmaz. Aynı dosyayı
      tekrar yüklemek satırları çoğaltmaz, günceller.</p>

    <ImportForm today={today} columns={[...REQUIRED]} />

    <ScoreForm today={today} />

    <section className="panel">
      <div className="panel-heading"><h2>Beklenen sütunlar</h2>
        <span className="note">İlk dördü zorunlu, gerisi varsa okunur</span></div>
      <div className="pad">
        <p><b>Zorunlu:</b> {REQUIRED.join(" · ")}</p>
        <p><b>İsteğe bağlı:</b> {OPTIONAL.join(" · ")}</p>
        <p className="note">Sütun adları demo veri setinden alındı; kurumun kendi dışa aktarımı
          görüldüğünde eşleme yeniden düzenlenecek. Ayırıcı olarak virgül, noktalı virgül ve
          sekme tanınır. Sınav tarihleri dosyada olmadığı için bütün ölçümler seçtiğiniz
          dönem sonu tarihine yazılır; sıralama sütun adında taşınır.</p>
      </div>
    </section>

    {!history.error && history.data.length > 0 && <section className="panel">
      <div className="panel-heading"><h2>Aktarım geçmişi</h2>
        <span className="note">Son {history.data.length} aktarım</span></div>
      <div className="table-scroll"><table>
        <thead><tr><th>Tarih</th><th>Dosya</th><th>Satır</th><th>Yeni</th><th>Güncellenen</th><th>Atlanan</th></tr></thead>
        <tbody>{history.data.map(b => <tr key={b.id}>
          <td>{fmt.format(new Date(b.created_at))}</td>
          <th scope="row">{b.filename}</th>
          <td>{b.row_count}</td><td>{b.created_count}</td>
          <td>{b.updated_count}</td><td>{b.skipped_count}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </>;
}
