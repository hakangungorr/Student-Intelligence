import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { QUESTIONS, answer, match, type QuestionKey } from "@/lib/questions";

export default async function Ask({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const { client } = await requireUser();

  const asked = (s ?? "").trim();
  const known = QUESTIONS.find(q => q.key === asked)?.key
    ?? (asked ? match(asked) : null);
  const a = known ? await answer(client, known as QuestionKey) : null;
  const heading = QUESTIONS.find(q => q.key === known)?.q;
  // Arriving from a chip puts the question's key in the URL; show the question.
  const typed = QUESTIONS.find(q => q.key === asked)?.q ?? asked;

  return <>
    <p className="eyebrow">SORU SOR</p>
    <h1>Öğrenci verisine soru sorun.</h1>
    <p className="intro">Cevaplar doğrudan veritabanından hesaplanır — panodaki sayılarla
      aynı kaynaktan gelir, bir dil modeli tahmininden değil.</p>

    <form className="panel filters" method="get">
      <label className="grow">Sorunuz<input type="text" name="s" defaultValue={typed}
        placeholder="Bir soru yazın…" autoComplete="off" /></label>
      <span className="filter-actions"><button type="submit" className="primary">Sor</button></span>
    </form>

    <div className="chips">{QUESTIONS.map(q =>
      <Link key={q.key} className={`chip${known === q.key ? " on" : ""}`}
        href={`/workspace/ask?s=${q.key}`}>{q.q}</Link>)}</div>

    {asked && !known && <section className="panel empty">
      <h2>Bunu henüz cevaplayamıyorum.</h2>
      <p>Şu an dört soruyu cevaplayabiliyorum; yukarıdaki başlıklardan birini seçin.
        Uydurulmuş bir cevap vermektense cevaplayamadığımı söylemeyi tercih ediyorum.</p>
    </section>}

    {a && <section className="panel pad answer">
      {heading && <h2>{heading}</h2>}
      <p className="lead">{emphasise(a.lead)}</p>
      {a.rows.length > 0 && <ul className="alist">{a.rows.map((r, i) => <li key={i}>
        <span>{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}
          {r.sub && <small>{r.sub}</small>}</span>
        <span className={r.tone ? `state ${r.tone}` : "r"}>{r.tone && <i className="dot" />}{r.right}</span>
      </li>)}</ul>}
      {a.source && <p className="note">{a.source}</p>}
    </section>}
  </>;
}

/** The lead sentence carries one or two numbers that have to survive skim-reading. */
function emphasise(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}
