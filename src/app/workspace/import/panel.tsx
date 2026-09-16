import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REQUIRED, OPTIONAL } from "@/lib/csv";
import { loadSettings } from "@/lib/settings";
import { ImportForm, ScoreForm } from "./form";

/** Dosyadan yükle: kurumun kendi listesini toplu almak.
 *
 *  Rendered inside the data screen rather than on a page of its own: entering a
 *  class's marks and loading a term's file are the same job at two sizes, and
 *  two menu entries made people ask which one they were supposed to use.
 *
 *  `canScore` is decided by the caller. Scoring recalibrates the whole
 *  institution against itself, which is why the database only lets an
 *  institution admin do it; rendering the form to anybody else offers a button
 *  whose only possible answer is "you may not". */
export async function ImportPanel({ client, canScore }: { client: SupabaseClient; canScore: boolean }) {
  const settings = await loadSettings(client);
  const history = await client.from("import_batches")
    .select("id,filename,row_count,created_count,updated_count,skipped_count,rejected_count,issue_count,created_at")
    .order("created_at", { ascending: false }).limit(10);

  const today = new Date().toISOString().slice(0, 10);
  const fmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

  return <>
    <p className="intro">Kurumunuzun kendi dışa aktarımını CSV olarak yükleyin. Yeni öğrenciler
      kaydedilir, var olanlar güncellenir. Dosya önce
      doğrulanır ve önizlenir; onaylamadan veritabanına hiçbir şey yazılmaz. Aynı dosyayı
      tekrar yüklemek satırları çoğaltmaz, günceller. Elinizde hazır bir dışa aktarım yoksa{" "}
      <Link href="/workspace/import/template">boş şablonu indirin</Link> — şubeleriniz ve
      kurlarınız içinde yazılı gelir.</p>

    <ImportForm today={today} columns={[...REQUIRED]} />

    {canScore
      ? <ScoreForm today={today} />
      : <section className="panel pad">
        <div className="card-hd"><h2>Risk skorları</h2></div>
        <p className="note">Aktarımınız yazıldıktan sonra skorların güncellenmesi için kurum
          yöneticinizin hesaplamayı çalıştırması gerekiyor. Hesaplama kurum genelinde yapılır —
          her kurun karşılaştırma ölçütü kendi en iyi %25&apos;inden üretildiği için tek şubeyi
          ayrı puanlamak öğrenciyi yalnız kendi şubesiyle kıyaslardı.</p>
      </section>}

    <section className="panel">
      <div className="panel-heading"><h2>Beklenen sütunlar</h2>
        <span className="note">İlk dördü zorunlu, gerisi varsa okunur</span></div>
      <div className="pad">
        <p><b>Zorunlu:</b> {REQUIRED.join(" · ")}</p>
        <p><b>İsteğe bağlı:</b> {OPTIONAL.join(" · ")}</p>
        <p>Başlıkları çevirmeniz gerekmiyor: <i>Öğrenci No · Ad Soyad · Şube · Kur ·
          Eğitmen · Devam Oranı · Sınav 1–4 · Konuşma · Yazma · Dinleme · Okuma · Katılım ·
          Ödev · Eğitmen Endişesi · Memnuniyet</i> gibi Türkçe başlıklar da tanınır; büyük
          harf, boşluk ve noktalama farkı önemsizdir. Tanınmayan sütunlar atlanır, dosya
          yine de okunur.</p>
        <p><b>Tanımlı kurlar:</b> {settings.levels.join(" · ")} — <Link
          href="/workspace/settings">kurum ayarlarından</Link> değiştirilir. Dosyadaki kur
          adları bunlarla eşleşmeli; büyük/küçük harf farkı önemsizdir.</p>
        <p className="note">Sütun adları demo veri setinden alındı; kurumun kendi dışa aktarımı
          görüldüğünde eşleme yeniden düzenlenecek. Ayırıcı olarak virgül, noktalı virgül ve
          sekme tanınır. Sınav tarihleri dosyada olmadığı için bütün ölçümler seçtiğiniz
          ölçüm tarihine yazılır; sıralama sütun adında taşınır.</p>
      </div>
    </section>

    {!history.error && history.data.length > 0 && <section className="panel">
      <div className="panel-heading"><h2>Aktarım geçmişi</h2>
        <span className="note">Son {history.data.length} aktarım · bir satırda birden fazla hata
          olabilir</span></div>
      <div className="table-scroll"><table>
        <thead><tr><th>Tarih</th><th>Dosya</th><th>Kabul edilen</th><th>Yeni</th>
          <th>Güncellenen</th><th>Reddedilen satır</th><th>Bulunan hata</th></tr></thead>
        <tbody>{history.data.map(b => <tr key={b.id}>
          <td>{fmt.format(new Date(b.created_at))}</td>
          <th scope="row">{b.filename}</th>
          <td>{b.row_count}</td><td>{b.created_count}</td>
          <td>{b.updated_count}</td>
          {/* Rows written before the two were separated carry only one number,
              and it was the issue count. Showing it under "reddedilen" would
              restate the mistake, so those cells say we do not know. */}
          <td>{b.rejected_count ?? "—"}</td>
          <td>{b.issue_count ?? b.skipped_count}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </>;
}
