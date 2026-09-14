"use client";

/** What a reader sees when a query on this page failed.
 *
 *  It used to tell them to check their own connection, which was the wrong
 *  advice most of the time: the usual cause is the database being briefly
 *  unreachable, and the fix is to try again. The digest is shown because it is
 *  the one string that finds this exact failure in the server log.
 */
export default function ErrorPage({ error, reset }: {
  error: Error & { digest?: string }; reset: () => void;
}) {
  return <section className="panel empty">
    <h1>Bilgiler yüklenemedi.</h1>
    <p>Genellikle geçici bir bağlantı sorunudur — tekrar denemek çoğu zaman yeterli olur.
      Sürüyorsa sistem yöneticinize bildirin.</p>
    <button className="primary" onClick={reset}>Tekrar dene</button>
    {error.digest && <p className="note">Hata kodu: {error.digest}</p>}
  </section>;
}
