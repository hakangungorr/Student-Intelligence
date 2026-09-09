import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ENTRY_KINDS, fieldsOf, isEntryKind, loadSheet, type EntryKind } from "@/lib/entry";
import { Sheet } from "./form";

type Query = { tur?: string; sube?: string; kur?: string; tarih?: string };

export default async function Entry({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const { client } = await requireUser();

  const kind: EntryKind = isEntryKind(q.tur ?? "") ? (q.tur as EntryKind) : "exam_1";
  const branch = q.sube || null;
  const level = q.kur || null;
  const on = /^\d{4}-\d{2}-\d{2}$/.test(q.tarih ?? "")
    ? q.tarih! : new Date().toISOString().slice(0, 10);

  const sheet = await loadSheet(client, kind, branch, level);
  const fields = fieldsOf(kind);
  const chosen = ENTRY_KINDS.find(k => k.key === kind)!;

  return <>
    <p className="eyebrow">VERİ GİRİŞİ</p>
    <h1>{chosen.label} · {sheet.rows.length} öğrenci</h1>
    <p className="intro">Bir seferde tek tür veri girilir: ne gireceğinizi seçin, listede aşağı
      inin. Boş bıraktığınız hücreye dokunulmaz.</p>

    <form className="panel filters" method="get">
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
    </form>

    {sheet.rows.length === 0
      ? <section className="panel empty"><h2>Bu seçimde öğrenci yok.</h2>
        <p>Şube veya kur süzgecini gevşetin. Yeni bir öğrenci eklemek için{" "}
          <Link href="/workspace/students/new">öğrenci kaydı</Link> sayfasını kullanın.</p></section>
      : <Sheet rows={sheet.rows} fields={fields} kind={kind} on={on} />}
  </>;
}
