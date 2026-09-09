"use client";
import { useActionState } from "react";
import { createStudent, type NewStudentState } from "./actions";

export function NewStudentForm({ branches, levels }: {
  branches: { id: string; name: string }[]; levels: string[];
}) {
  const [state, submit, saving] = useActionState(createStudent, {} as NewStudentState);
  return <form className="panel pad form-stack" action={submit}>
    {state.error && <p className="form-error">{state.error}</p>}
    <label>Öğrenci numarası
      <input name="externalId" required maxLength={200} autoComplete="off"
        placeholder="Kurumunuzun kendi numarası" /></label>
    <label>Ad soyad<input name="name" required maxLength={200} autoComplete="off" /></label>
    <label>Şube<select name="branchId" required defaultValue="">
      <option value="" disabled>Seçin</option>
      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Kur<select name="level" required defaultValue="">
      <option value="" disabled>Seçin</option>
      {levels.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
    <label>Eğitmen <span className="note">isteğe bağlı</span>
      <input name="teacher" maxLength={200} autoComplete="off" /></label>
    <button type="submit" className="primary" disabled={saving}>
      {saving ? "Kaydediliyor…" : "Öğrenciyi kaydet"}</button>
  </form>;
}
