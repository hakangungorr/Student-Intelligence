"use client";
export default function ErrorPage({reset}:{reset:()=>void}) {
  return <section className="panel empty"><h1>Bilgiler yüklenemedi.</h1><p>Bağlantınızı kontrol edip tekrar deneyin. Sorun devam ederse sistem yöneticinize bildirin.</p><button className="primary" onClick={reset}>Tekrar dene</button></section>;
}
