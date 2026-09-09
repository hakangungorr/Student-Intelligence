"use client";
import { useActionState } from "react";
import { grantAccess, revokeAccess, assign, type TeamState } from "./actions";
import { ROLES, type Member } from "@/lib/roles";

const idle: TeamState = { status: "idle" };
const Result = ({ s }: { s: TeamState }) => s.status === "idle" ? null
  : <p className={`note${s.status === "error" ? " error-note" : ""}`}>{s.message}</p>;

export function GrantForm({ branches }: { branches: { id: string; name: string }[] }) {
  const [state, submit, saving] = useActionState(grantAccess, idle);
  return <form className="panel pad form-stack" action={submit}>
    <h2>Kişi ekle</h2>
    <p className="note">Hesabı önce Supabase panelinden oluşturun, sonra oradaki
      <b> User UID</b> değerini buraya yapıştırın. Uygulama hesap oluşturamaz.</p>
    <Result s={state} />
    <label>Kullanıcı kimliği (UUID)
      <input name="userId" required autoComplete="off"
        placeholder="00000000-0000-0000-0000-000000000000" /></label>
    <label>Ad soyad<input name="name" required maxLength={200} autoComplete="off" /></label>
    <label>Rol<select name="role" defaultValue="teacher">
      {ROLES.map(r => <option key={r.key} value={r.key}>{r.label} — {r.scope}</option>)}</select></label>
    <label>Şube <span className="note">kurum yöneticisinde boş bırakın</span>
      <select name="branchId" defaultValue="">
        <option value="">Şube yok</option>
        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <button type="submit" className="primary" disabled={saving}>
      {saving ? "Ekleniyor…" : "Erişim tanımla"}</button>
  </form>;
}

export function RevokeButton({ member }: { member: Member }) {
  const [state, submit, saving] = useActionState(revokeAccess, idle);
  return <form action={submit}>
    <input type="hidden" name="membershipId" value={member.id} />
    <button type="submit" disabled={saving}>{saving ? "…" : "Kaldır"}</button>
    {state.status === "error" && <small className="error-note">{state.message}</small>}
  </form>;
}

export function AssignForm({ teachers, branches, levels }: {
  teachers: Member[]; branches: { id: string; name: string }[]; levels: string[];
}) {
  const [state, submit, saving] = useActionState(assign, idle);
  if (!teachers.length) return <section className="panel empty">
    <h2>Önce bir eğitmen ekleyin.</h2>
    <p>Sınıf ataması için eğitmen rolünde en az bir kişi gerekiyor.</p></section>;

  return <form className="panel pad" action={submit}>
    <h2>Sınıf ata</h2>
    <p className="note">Bir eğitmenin ne göreceğini bu atama belirler: yalnızca kendisine
      atanmış aktif öğrencileri görür ve yalnızca onlara veri girebilir. Atama yapılmadan
      eğitmen giriş yapar ama hiçbir öğrenci göremez.</p>
    <Result s={state} />
    <div className="filters">
      <label>Eğitmen<select name="userId" required defaultValue="">
        <option value="" disabled>Seçin</option>
        {teachers.map(t => <option key={t.id} value={t.userId}>
          {t.name ?? t.userId.slice(0, 8)}{t.branch ? ` · ${t.branch}` : ""}</option>)}</select></label>
      <label>Şube<select name="branchId" required defaultValue="">
        <option value="" disabled>Seçin</option>
        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>Kur<select name="level" required defaultValue="">
        <option value="" disabled>Seçin</option>
        {levels.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
      <span className="filter-actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "Atanıyor…" : "Sınıfı ata"}</button></span>
    </div>
  </form>;
}
