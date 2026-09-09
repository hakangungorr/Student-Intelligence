"use client";
import { useActionState } from "react";
import { preview, commit, score, type PreviewState, type ScoreState } from "./actions";

const empty: PreviewState = { status: "empty" };
const idle: ScoreState = { status: "idle" };

export function ImportForm({ today, columns }: { today: string; columns: string[] }) {
  const [state, choose, choosing] = useActionState(preview, empty);
  return <>
    <form className="panel pad upload" action={choose}>
      <div className="filters">
        <label>CSV dosyası
          <input type="file" name="file" accept=".csv,text/csv" required /></label>
        <label>Dönem sonu tarihi
          <input type="date" name="periodEnd" defaultValue={today} required /></label>
        <span className="filter-actions">
          <button type="submit" className="primary" disabled={choosing}>
            {choosing ? "Okunuyor…" : "Önizle"}</button></span>
      </div>
      <p className="note">Dosya önce okunur ve doğrulanır. Onaylamadan hiçbir şey yazılmaz.
        Beklenen sütunlar: {columns.join(", ")}.</p>
    </form>

    {state.status === "error" && <section className="panel pad">
      <h2>Dosya aktarılamadı</h2>
      <p>{state.message}</p>
      {state.issues && state.issues.length > 0 && <IssueList issues={state.issues} />}
    </section>}

    {state.status === "ready" && <Confirm key={state.token} state={state} />}
  </>;
}

function Confirm({ state }: { state: PreviewState }) {
  const [done, send, sending] = useActionState(commit, empty);

  if (done.status === "done") return <section className="panel pad">
    <h2>Aktarım tamamlandı</h2>
    <p className="lead">{done.result!.created} yeni öğrenci, {done.result!.updated} güncelleme.
      {" "}{done.result!.measurements} ölçüm ve {done.result!.observations} sınıf içi gözlem yazıldı.</p>
    {done.message && <p className="note">{done.message}</p>}
    {done.issues && done.issues.length > 0 && <>
      <p className="note">{done.issues.length} satır atlandı:</p>
      <IssueList issues={done.issues} /></>}
    <p className="note">{done.scored === null
      ? "Risk skorları kurum yöneticisi hesaplamayı çalıştırınca güncellenecek."
      : `Risk skorları yeniden hesaplandı — ${done.scored} öğrenci.`}</p>
  </section>;

  if (done.status === "error") return <section className="panel pad">
    <h2>Yazılamadı</h2><p>{done.message}</p></section>;

  return <section className="panel pad">
    <h2>{state.accepted} satır aktarılmaya hazır</h2>
    <p className="note">{state.filename} · dönem sonu {state.periodEnd}</p>

    {state.unknown && state.unknown.length > 0 && <p className="note">
      Tanınmayan sütunlar yok sayılacak: {state.unknown.join(", ")}.</p>}

    <div className="table-scroll"><table>
      <thead><tr><th>Satır</th><th>Numara</th><th>İsim</th><th>Şube</th><th>Kur</th></tr></thead>
      <tbody>{state.sample!.map(r => <tr key={r.line}>
        <td>{r.line}</td><th scope="row">{r.externalId}</th>
        <td>{r.name}</td><td>{r.branch}</td><td>{r.level}</td></tr>)}</tbody>
    </table></div>
    {state.accepted! > state.sample!.length &&
      <p className="note">İlk {state.sample!.length} satır gösteriliyor.</p>}

    {state.issues && state.issues.length > 0 && <>
      <p className="note">{state.issues.length} satır atlanacak:</p>
      <IssueList issues={state.issues} /></>}

    <form action={send} className="confirm">
      <input type="hidden" name="text" value={state.text} />
      <input type="hidden" name="filename" value={state.filename} />
      <input type="hidden" name="periodEnd" value={state.periodEnd} />
      <button type="submit" className="primary" disabled={sending}>
        {sending ? "Yazılıyor…" : `${state.accepted} satırı aktar`}</button>
    </form>
  </section>;
}

function IssueList({ issues }: { issues: { line: number; column: string; message: string }[] }) {
  const shown = issues.slice(0, 20);
  return <><ul className="issues">{shown.map((i, n) =>
    <li key={n}><b>Satır {i.line}</b> · {i.column} — {i.message}</li>)}</ul>
    {issues.length > shown.length &&
      <p className="note">…ve {issues.length - shown.length} sorun daha.</p>}</>;
}

/** Scoring is a separate button because it is a separate decision: an
 *  administrator may load several branches' files before recalculating once. */
export function ScoreForm({ today }: { today: string }) {
  const [state, run, running] = useActionState(score, idle);
  return <section className="panel pad">
    <div className="card-hd"><h2>Risk skorlarını hesapla</h2></div>
    <p className="note">Motor v0.4 · kurumdaki bütün öğrenciler yeniden puanlanır. Kur
      benchmark&apos;ı her kurun kendi en iyi %25&apos;inden üretildiği için hesap kurum
      genelinde yapılır; bir şubeyi tek başına puanlamak öğrenciyi kendi şubesiyle
      kıyaslardı.</p>
    <p className="note">Buradaki tarih bir <b>değerlendirme kesiti</b> açar. Var olan bir kesiti
      seçmek onu günceller; yeni bir tarih seçmek yeni kesit açar ve gündemdeki
      &ldquo;önceki ölçüme göre&rdquo; karşılaştırması bundan sonra o kesitle yapılır. Veri
      girişi kesit açmaz, mevcut kesiti tazeler.</p>

    <form action={run} className="filters">
      <label>Değerlendirme kesiti
        <input type="date" name="periodEnd" defaultValue={today} required /></label>
      <span className="filter-actions">
        <button type="submit" className="primary" disabled={running}>
          {running ? "Hesaplanıyor…" : "Hesapla"}</button></span>
    </form>

    {state.status === "done" && <>
      <p className="lead">{state.scored} öğrenci puanlandı — {state.created} yeni kayıt,
        {" "}{state.updated} güncelleme.</p>
      {state.skipped && state.skipped.length > 0 && <>
        <p className="note">{state.skipped.length} öğrenci atlandı:</p>
        <ul className="issues">{state.skipped.slice(0, 20).map(s =>
          <li key={s.externalId}><b>{s.externalId}</b> — {s.reason}</li>)}</ul>
        {state.skipped.length > 20 &&
          <p className="note">…ve {state.skipped.length - 20} öğrenci daha.</p>}</>}
    </>}
    {state.status === "error" && <>
      <p className="lead">{state.message}</p>
      {state.skipped && state.skipped.length > 0 && <ul className="issues">
        {state.skipped.slice(0, 10).map(s =>
          <li key={s.externalId}><b>{s.externalId}</b> — {s.reason}</li>)}</ul>}
    </>}
  </section>;
}
