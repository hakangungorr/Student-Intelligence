"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createStudent, numberTaken, type NewStudentState } from "./actions";
import { EntryFields, type Group } from "../../entry-fields";

export function NewStudentForm({ branches, levels, groups, today }: {
  branches: { id: string; name: string }[]; levels: string[];
  groups: Group[]; today: string;
}) {
  const [state, submit, saving] = useActionState(createStudent, {} as NewStudentState);
  const form = useRef<HTMLFormElement>(null);
  const number = useRef<HTMLInputElement>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const [, check] = useTransition();

  /** After "kaydet ve yenisini ekle": clear what belongs to the student who was
   *  just saved, keep what the next one almost certainly shares — the same
   *  branch, the same level, the same teacher. */
  useEffect(() => {
    if (!state.saved || !form.current) return;
    for (const el of form.current.querySelectorAll<HTMLInputElement>(
      "input[name='externalId'], input[name='name'], input[name^='v:']")) {
      if (el.type === "checkbox") el.checked = false; else el.value = "";
    }
    setTaken(null);
    number.current?.focus();
  }, [state.saved]);

  return <form ref={form} className="panel pad form-stack" action={submit}>
    {state.error && <p className="form-error">{state.error}</p>}
    {state.saved && <p className="form-ok"><b>{state.saved.name}</b> kaydedildi.
      {state.saved.note && <> {state.saved.note}</>}{" "}
      <Link href={`/workspace/students/${state.saved.id}`}>Kartını aç</Link> · sıradaki
      öğrenciyi girebilirsiniz.</p>}

    <label>Öğrenci numarası
      <input ref={number} name="externalId" required maxLength={200} autoComplete="off"
        placeholder="Kurumunuzun kendi numarası"
        onChange={() => setTaken(null)}
        onBlur={e => {
          const value = e.target.value.trim();
          if (!value) return;
          check(async () => setTaken(await numberTaken(value) ? value : null));
        }} />
      {taken && <span className="field-warn">{taken} numarası zaten kayıtlı — başka bir
        numara girin.</span>}</label>
    <label>Ad soyad<input name="name" required maxLength={200} autoComplete="off" /></label>
    <label>Şube<select name="branchId" required defaultValue="">
      <option value="" disabled>Seçin</option>
      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Kur<select name="level" required defaultValue="">
      <option value="" disabled>Seçin</option>
      {levels.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
    <label>Eğitmen <span className="note">isteğe bağlı</span>
      <input name="teacher" maxLength={200} autoComplete="off" /></label>

    <details className="entry-inline">
      <summary><span><b>Notlarını da şimdi gireyim</b>
        <span className="note">İsteğe bağlı — sonradan kartından da girilebilir</span></span>
        <span className="chev" aria-hidden="true">▾</span></summary>
      <EntryFields studentId="new" name="Yeni öğrenci" values={{}} groups={groups} />
      <label className="entry-when">Ölçüm tarihi
        <input type="date" name="on" defaultValue={today} /></label>
    </details>

    <div className="form-actions">
      <button type="submit" name="then" value="card" className="primary" disabled={saving}>
        {saving ? "Kaydediliyor…" : "Kaydet ve kartını aç"}</button>
      <button type="submit" name="then" value="again" disabled={saving}>
        Kaydet ve yenisini ekle</button>
    </div>
  </form>;
}
