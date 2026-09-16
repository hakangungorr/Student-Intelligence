import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ENTRY_KINDS, SHEET_CAP, fieldsOf, isEntryKind, type EntryKind } from "@/lib/entry";
import { loadSheet } from "@/lib/entry-read";
import { currentMembership } from "@/lib/membership";
import { Sheet } from "./form";
import { Filters } from "./filters";
import { ImportPanel } from "../import/panel";

type Query = {
  yol?: string; tur?: string; sube?: string; kur?: string; tarih?: string; ara?: string; hepsi?: string;
};

/** Veri: bir sınıfın notunu elle girmek ya da kurumun dosyasını yüklemek.
 *
 *  They were two menu entries that wrote the same numbers, and the first
 *  question anybody asked was which one to use. The answer is a matter of size —
 *  a column of marks you type, a term's roster you upload — so they are two tabs
 *  of one screen. Uploading stays with the roles that may create students; a
 *  teacher sees only the tab they can use, without a tab bar at all. */
export default async function Entry({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const { client } = await requireUser();
  const me = await currentMembership(client);
  const canImport = me?.role === "org_admin" || me?.role === "branch_manager";
  const upload = canImport && q.yol === "dosya";

  const head = <>
    <p className="eyebrow">VERİ GİRİŞİ</p>
    <h1>{upload ? "Dosyadan yükle" : "Elle gir"}</h1>
    {canImport && <nav className="tabs" aria-label="Veri girişi yolu">
      <Link className={`tab${upload ? "" : " on"}`} href="/workspace/entry"
        aria-current={upload ? undefined : "page"}>Elle gir</Link>
      <Link className={`tab${upload ? " on" : ""}`} href="/workspace/entry?yol=dosya"
        aria-current={upload ? "page" : undefined}>Dosyadan yükle</Link>
    </nav>}
    <p className="note">{upload
      ? "Dönem başında ya da kurumun kendi sistemindeki listeyi toplu almak için. Yeni öğrencileri de kaydeder."
      : "Bir sınıfın tek tür verisini — dünkü sınavı, bu haftanın devamını — elle girmek için. Kayıtlı öğrencilere yazar."}</p>
  </>;

  if (upload) return <>{head}<ImportPanel client={client} canScore={me?.role === "org_admin"} /></>;

  const kind: EntryKind = isEntryKind(q.tur ?? "") ? (q.tur as EntryKind) : "exam_1";
  const branch = q.sube || null;
  const level = q.kur || null;
  const on = /^\d{4}-\d{2}-\d{2}$/.test(q.tarih ?? "")
    ? q.tarih! : new Date().toISOString().slice(0, 10);

  const search = q.ara?.trim() || null;
  const sheet = await loadSheet(client, kind, branch, level, search, q.hepsi === "1");
  const fields = fieldsOf(kind);
  const chosen = ENTRY_KINDS.find(k => k.key === kind)!;

  const keep = new URLSearchParams({ tur: kind, tarih: on, hepsi: "1" });

  return <>
    {head}
    <p className="intro"><b>{chosen.label}{!sheet.capped && <> · {sheet.rows.length} öğrenci</>}.</b>
      {" "}Bir seferde tek tür veri girilir: ne gireceğinizi seçin, listede aşağı
      inin. Enter tuşu bir alt satıra geçer. Boş bıraktığınız hücreye dokunulmaz.
      {" "}Tek bir öğrencinin bütün bilgilerini girecekseniz{" "}
      <Link href="/workspace/students">öğrenci kartı</Link> daha kısa yoldur.</p>

    <Filters>
      <label>Öğrenci ara<input type="search" name="ara" defaultValue={search ?? ""}
        placeholder="İsim ya da numara" autoComplete="off" /></label>
      <label>Ne giriyorsunuz<select name="tur" defaultValue={kind}>
        {ENTRY_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
      <label>Şube<select name="sube" defaultValue={branch ?? ""}>
        <option value="">Bütün şubeler</option>
        {sheet.branches.map(b => <option key={b} value={b}>{b}</option>)}</select></label>
      <label>Kur<select name="kur" defaultValue={level ?? ""}>
        <option value="">Bütün kurlar</option>
        {sheet.levels.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
      <label>Tarih<input type="date" name="tarih" defaultValue={on} /></label>
      <span className="filter-actions"><button type="submit" className="primary">Listeyi getir</button></span>
    </Filters>

    {sheet.capped
      ? <section className="panel empty"><h2>Önce bir sınıf seçin.</h2>
        <p>Kurumda {sheet.total} aktif öğrenci var; hepsini tek çizelgeye koymak girişi
          kolaylaştırmıyor. Yukarıdan şube ya da kur seçin, veya bir isim arayın —
          liste kendiliğinden gelir.</p>
        <p className="note"><Link href={`/workspace/entry?${keep}`}>Yine de {sheet.total} öğrencinin
          hepsini göster</Link></p></section>
      : sheet.rows.length === 0
        ? <section className="panel empty"><h2>Bu seçimde öğrenci yok.</h2>
          <p>Arama ya da süzgeçleri gevşetin. Yeni bir öğrenci eklemek için{" "}
            <Link href="/workspace/students/new">öğrenci kaydı</Link> sayfasını kullanın.</p></section>
        : <Sheet rows={sheet.rows} fields={fields} kind={kind} on={on} />}

    {!sheet.capped && sheet.rows.length > SHEET_CAP && <p className="note">
      {sheet.rows.length} öğrenci listeleniyor.</p>}
  </>;
}
