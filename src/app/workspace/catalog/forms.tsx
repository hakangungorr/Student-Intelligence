"use client";
import { useActionState } from "react";
import { addResource, addSession, confirmEntry, seedCatalogue, type CatalogState } from "./actions";
import { RESOURCE_KINDS, SKILLS, SKILL_LABEL } from "@/lib/rubric";

const idle: CatalogState = { status: "idle" };
const Result = ({ s }: { s: CatalogState }) => s.status === "idle" ? null
  : <p className={`note${s.status === "error" ? " error-note" : ""}`}>{s.message}</p>;

type Branch = { id: string; name: string };

export function SeedForm({ branches, levels }: { branches: Branch[]; levels: string[] }) {
  const [state, submit, saving] = useActionState(seedCatalogue, idle);
  return <form className="panel pad form-stack" action={submit}>
    <h2>Pilot için örnek katalog oluştur</h2>
    <p className="note">Kurumun kendi içerik listesi ve destek takvimi henüz elimizde yok. Plan
      ekranlarını çalışır görebilmek için tek bir şube ve tek bir kur için örnek alt beceri,
      içerik ve oturum üretir. Üretilen her kayıt <b>örnek</b> olarak işaretlenir ve bütün
      ekranlarda öyle görünür; hiçbir yerde ART&apos;a kayıt yapıldığı veya rezervasyon
      tamamlandığı söylenmez.</p>
    <Result s={state} />
    <label>Şube<select name="branchId" required defaultValue={branches[0]?.id ?? ""}>
      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Kur<select name="level" required defaultValue={levels[Math.floor(levels.length / 2)] ?? ""}>
      {levels.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
    <button type="submit" className="primary" disabled={saving || !branches.length}>
      {saving ? "Oluşturuluyor…" : "Örnek katalog oluştur"}</button>
  </form>;
}

export function ResourceForm({ levels }: { levels: string[] }) {
  const [state, submit, saving] = useActionState(addResource, idle);
  return <form className="panel pad form-stack" action={submit}>
    <h2>İçerik ekle</h2>
    <Result s={state} />
    <label>Başlık<input name="title" required maxLength={300} autoComplete="off" /></label>
    <label>Tür<select name="kind" defaultValue="art">
      {RESOURCE_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
    <label>Beceri<select name="skill" defaultValue="speaking">
      {SKILLS.map(s => <option key={s} value={s}>{SKILL_LABEL[s]}</option>)}</select></label>
    <label>Kur<select name="level" defaultValue="">
      <option value="">Her kur</option>
      {levels.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
    <label>Süre (dakika)
      <input type="number" name="minutes" min={5} max={240} defaultValue={15} required /></label>
    <label>Kurumun kendi kodu veya bağlantısı
      <input name="reference" maxLength={500} autoComplete="off" placeholder="isteğe bağlı" />
      <small className="note">ART veya başka bir sistemde bu içeriğin karşılığı varsa yazın.
        Otomatik atama yapılmaz; bağlantı yalnızca gösterilir.</small></label>
    <label className="entry-check"><input type="checkbox" name="confirmed" value="1" />
      <span>Bu kurumun doğrulanmış içeriği — örnek değil</span></label>
    <button type="submit" className="primary" disabled={saving}>
      {saving ? "Ekleniyor…" : "İçeriği ekle"}</button>
  </form>;
}

export function SessionForm({ branches, levels }: { branches: Branch[]; levels: string[] }) {
  const [state, submit, saving] = useActionState(addSession, idle);
  return <form className="panel pad form-stack" action={submit}>
    <h2>Destek oturumu ekle</h2>
    <Result s={state} />
    <label>Şube<select name="branchId" required defaultValue={branches[0]?.id ?? ""}>
      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Başlık<input name="title" required maxLength={300} autoComplete="off" /></label>
    <label>Tür<select name="kind" defaultValue="guided_practice">
      <option value="guided_practice">Guided Practice</option>
      <option value="more">+More etkinliği</option>
      <option value="other">Diğer</option></select></label>
    <label>Beceri<select name="skill" defaultValue="">
      <option value="">Beceri ayrımı yok</option>
      {SKILLS.map(s => <option key={s} value={s}>{SKILL_LABEL[s]}</option>)}</select></label>
    <label>Kur<select name="level" defaultValue="">
      <option value="">Her kur</option>
      {levels.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
    <label>Başlangıç<input type="datetime-local" name="startsAt" required /></label>
    <label>Süre (dakika)
      <input type="number" name="minutes" min={10} max={240} defaultValue={30} required /></label>
    <label>Kapasite
      <input type="number" name="capacity" min={1} max={200} defaultValue={8} required />
      <small className="note">Kapasite dolduğunda plan onayı reddedilir; öğrenci katılmış
        görünmez.</small></label>
    <label className="entry-check"><input type="checkbox" name="confirmed" value="1" />
      <span>Bu oturum kurumun takviminde gerçekten var — örnek değil</span></label>
    <button type="submit" className="primary" disabled={saving || !branches.length}>
      {saving ? "Ekleniyor…" : "Oturumu ekle"}</button>
  </form>;
}

export function ConfirmButton({ table, id }: {
  table: "learning_resources" | "support_sessions" | "learning_objectives"; id: string;
}) {
  const [state, submit, saving] = useActionState(confirmEntry, idle);
  return <form action={submit}>
    <input type="hidden" name="table" value={table} />
    <input type="hidden" name="id" value={id} />
    <button type="submit" disabled={saving}>{saving ? "…" : "Kurumun kaydı"}</button>
    {state.status === "error" && <small className="error-note">{state.message}</small>}
  </form>;
}
