"use client";
import { useActionState, useState } from "react";
import { addItem, confirmItem, retireItem, seedLibrary, type LibraryState } from "./actions";
import { PROGRAMS, SKILLS, SKILL_LABEL } from "@/lib/rubric";

const idle: LibraryState = { status: "idle" };
const Result = ({ s }: { s: LibraryState }) => s.status === "idle" || !s.message ? null
  : <p className={`note${s.status === "error" ? " error-note" : ""}`}>{s.message}</p>;
type Branch = { id: string; name: string };

export function SeedForm({ branches, levels }: { branches: Branch[]; levels: string[] }) {
  const [state, submit, saving] = useActionState(seedLibrary, idle);
  return <form className="panel pad form-stack" action={submit}>
    <h2>Örnek kütüphane oluştur</h2>
    <p className="note">Kurumun kendi içerik listesi henüz yok. Planın öneri yapabilmesi için tek
      şube ve tek kur için birkaç örnek çalışma ve etkinlik ekler. Hepsi <b>örnek</b> olarak
      işaretlenir ve her yerde öyle görünür.</p>
    <Result s={state} />
    <label>Şube<select name="branchId" required defaultValue={branches[0]?.id ?? ""}>
      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Kur<select name="level" required defaultValue={levels[Math.floor(levels.length / 2)] ?? ""}>
      {levels.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
    <button type="submit" className="primary" disabled={saving || !branches.length}>
      {saving ? "Oluşturuluyor…" : "Örnek kütüphane oluştur"}</button>
  </form>;
}

/** Tarih girilirse etkinlik olur; girilmezse çalışma. Ayrı iki form yerine tek form. */
export function AddItemForm({ branches, levels, canStudy, canEvent }: {
  branches: Branch[]; levels: string[]; canStudy: boolean; canEvent: boolean;
}) {
  const [state, submit, saving] = useActionState(addItem, idle);
  const [event, setEvent] = useState(!canStudy);
  return <form className="panel pad form-stack" action={submit}>
    <h2>Kütüphaneye ekle</h2>
    <Result s={state} />
    {canStudy && canEvent && <div className="segmented" role="radiogroup" aria-label="Tür">
      <button type="button" className={event ? "" : "on"} onClick={() => setEvent(false)}
        aria-pressed={!event}>Çalışma</button>
      <button type="button" className={event ? "on" : ""} onClick={() => setEvent(true)}
        aria-pressed={event}>Etkinlik</button>
    </div>}
    <p className="note">{event
      ? "Etkinlik: tarihi, yeri ve kontenjanı olan bir oturum. Plana eklendiğinde öğrenciye yer ayrılır."
      : "Çalışma: öğrencinin kendi zamanında yapacağı bir iş."}</p>

    <label>Başlık<input name="title" required maxLength={300} autoComplete="off" /></label>
    <label>Program<select name="program" defaultValue={event ? "guided_practice" : "art"}>
      {PROGRAMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
    <label>Beceri<select name="skill" defaultValue="speaking">
      <option value="">Beceri ayrımı yok</option>
      {SKILLS.map(s => <option key={s} value={s}>{SKILL_LABEL[s]}</option>)}</select></label>
    <label>Kur<select name="level" defaultValue="">
      <option value="">Her kur</option>
      {levels.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
    <label>Süre (dakika)
      <input type="number" name="minutes" min={5} max={240} defaultValue={event ? 30 : 15} required /></label>

    {event ? <>
      <input type="hidden" name="reference" value="" />
      <label>Şube<select name="branchId" required defaultValue={branches[0]?.id ?? ""}>
        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>Ne zaman<input type="datetime-local" name="startsAt" required /></label>
      <label>Kontenjan<input type="number" name="capacity" min={1} max={200} defaultValue={8} required />
        <small className="note">Dolunca bu etkinlik plana eklenemez.</small></label>
    </> : <>
      <input type="hidden" name="branchId" value="" />
      <input type="hidden" name="startsAt" value="" />
      <input type="hidden" name="capacity" value="" />
      <label>Kurumdaki kodu ya da bağlantısı <span className="note">isteğe bağlı</span>
        <input name="reference" maxLength={500} autoComplete="off" />
        <small className="note">Yalnızca gösterilir; hiçbir sisteme otomatik atama yapılmaz.</small></label>
    </>}

    <label className="entry-check"><input type="checkbox" name="confirmed" value="1" />
      <span>Bu kurumun gerçek içeriği — örnek değil</span></label>
    <button type="submit" className="primary" disabled={saving}>
      {saving ? "Ekleniyor…" : event ? "Etkinliği ekle" : "Çalışmayı ekle"}</button>
  </form>;
}

export function RowActions({ id, sample }: { id: string; sample: boolean }) {
  const [c, confirm, confirming] = useActionState(confirmItem, idle);
  const [r, retire, retiring] = useActionState(retireItem, idle);
  return <span className="row-actions">
    {sample && <form action={confirm}><input type="hidden" name="id" value={id} />
      <button type="submit" disabled={confirming}>Kurumun kaydı</button></form>}
    <form action={retire}><input type="hidden" name="id" value={id} />
      <button type="submit" disabled={retiring}>Kaldır</button></form>
    {(c.status === "error" || r.status === "error") &&
      <small className="error-note">{c.message ?? r.message}</small>}
  </span>;
}
