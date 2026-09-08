import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadStudent, PASS_MARK } from "@/lib/student";
import { AREA, DIMENSIONS, STATE, band } from "@/lib/narrative";

const areaWord = (v: number) => v >= 60 ? "Ciddi sorun" : v >= 30 ? "Dikkat" : "İyi";

export default async function Student({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await requireUser();
  const s = await loadStudent(client, id);
  if (!s) notFound();

  const whos = [...new Set(s.steps.map(x => x.who).filter(Boolean))];
  const missed = s.attendanceRate === null ? null : Math.max(1, Math.round((100 - s.attendanceRate) / 10));

  return <>
    <Link className="backlink" href="/workspace">← Gündeme dön</Link>

    <section className="panel pad">
      <div className="card-hd">
        <div>
          <h1 className="dname">{s.name}</h1>
          <p className="note">{s.branch} şubesi · {s.level} kuru
            {s.teacher && <> · Eğitmeni {s.teacher}</>}</p>
        </div>
        <div className="stack-end">
          <span className={`state ${STATE[s.riskLevel].cls}`}><i className="dot" />{STATE[s.riskLevel].word}</span>
          {s.change !== null && <span className="note">{s.change === 0 ? "geçen haftayla aynı"
            : s.change > 0 ? "geçen haftaya göre kötüleşti" : "geçen haftaya göre düzeldi"}</span>}
        </div>
      </div>
      <p className="srow-head lead">{s.headline}</p>
      <ul className="facts">
        {s.found.length
          ? s.found.map(f => <li key={f.dim} className={band(f.score)}>{f.text}</li>)
          : <li>Bu öğrencide belirgin bir risk sinyali yok.</li>}
      </ul>
      <div className="todo">
        <div className="todo-hd">NE YAPMALI</div>
        <ul>{s.steps.map((x, i) => <li key={i}><span className="ck">→</span><span>{x.text}</span></li>)}</ul>
        {whos.length > 0 && <p className="who">Kim: <b>{whos.join(" · ")}</b></p>}
      </div>
      {s.reasons.length > 0 && <details className="raw">
        <summary>Sistemin tespit ettiği ham sinyaller ({s.reasons.length})</summary>
        <ul>{s.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </details>}
    </section>

    <section className="panel pad">
      <p className="eyebrow">SORUN NEREDE</p>
      <div className="map">{DIMENSIONS.map(d => {
        const v = s.dimensions[d] ?? 0;
        return <div key={d} className="mapcell">
          <span className="lab">{AREA[d]}</span>
          <span className={`st ${band(v)}`}>{areaWord(v)}</span>
          <span className="mapbar"><i className={band(v)} style={{ width: `${v}%` }} /></span>
        </div>;
      })}</div>
    </section>

    <div className="cards2">
      <section className="panel pad">
        <Head title="Devamsızlık" score={s.dimensions.attendance ?? 0} />
        {s.attendanceRate === null ? <p className="note">Devam verisi yok.</p> : <>
          <p className="big-line"><span className={`big ${band(s.dimensions.attendance ?? 0)}`}>%{s.attendanceRate}</span>
            <span className="note">dönem geneli devam oranı</span></p>
          <p className="note">Her 10 dersin yaklaşık <b>{missed}</b> tanesine gelmiyor.</p>
          {s.attendanceRecent !== null && <Kv k="Son 4 hafta"
            v={`%${s.attendanceRecent}`}
            alert={s.detail ? s.detail.attendance.drop >= 5 : false}
            suffix={s.detail && s.detail.attendance.drop >= 5 ? `▼ ${s.detail.attendance.drop} puan` : undefined} />}
          <Kv k="Kurumun kritik sınırı" v="%75" />
        </>}
      </section>

      <section className="panel pad">
        <Head title="Sınav notları" score={s.dimensions.test ?? 0} />
        <Spark exams={s.exams} falling={!!s.detail && (s.detail.test.monotonic_decline || s.detail.test.delta <= -4)} />
        {s.exams.length > 1 && s.exams[s.exams.length - 1].value < s.exams[0].value &&
          <p className="note">İlk sınavdan bu yana <b className="crit-ink">
            {s.exams[0].value - s.exams[s.exams.length - 1].value} puan</b> kaybetti.</p>}
        {s.detail && <Kv k="Son sınav" v={String(s.detail.test.last_exam)}
          alert={s.detail.test.last_exam < PASS_MARK}
          suffix={s.detail.test.last_exam < PASS_MARK ? "· geçme notu altında" : undefined} />}
        {s.benchmark && <Kv k={`${s.level} kurunun iyi öğrencileri`} v={s.benchmark.exam.toFixed(0)} />}
      </section>

      <section className="panel pad">
        <Head title="Dil becerileri" score={s.dimensions.skill ?? 0} />
        {s.skills.map(k => {
          const mark = s.benchmark?.skill ?? 100;
          const tone = k.value < PASS_MARK ? "crit" : k.value < mark * .85 ? "warn" : "good";
          const weakest = s.detail?.skill.weakest === k.key;
          return <div key={k.key} className="bar">
            <span className={`nm${weakest ? " is-weakest" : ""}`}>{k.label}</span>
            <span className="track">
              <i className={`fill ${tone}`} style={{ width: `${k.value}%` }} />
              {s.benchmark && <i className="tick" style={{ left: `${mark}%` }} />}
            </span>
            <span className="val">{k.value}</span>
          </div>;
        })}
        {s.benchmark && <p className="legend"><i className="tick-key" />
          {s.level} kurunun iyi öğrencileri: {s.benchmark.skill.toFixed(0)}</p>}
      </section>

      <section className="panel pad">
        <Head title="Derse katılım" score={s.dimensions.classroom ?? 0} />
        {s.detail ? <>
          <Kv k="Derse katılımı" v={`${s.detail.classroom.participation} / 10`}
            alert={s.detail.classroom.participation <= 5} />
          <Kv k="Ödevlerini yapma oranı" v={`%${s.detail.classroom.homework}`}
            alert={s.detail.classroom.homework < 60} />
          <div className="kv"><span className="k">Öğretmeni endişeli mi</span>
            <span className={`state ${s.detail.classroom.teacher_concern ? "crit" : "good"}`}>
              <i className="dot" />{s.detail.classroom.teacher_concern ? "Evet" : "Hayır"}</span></div>
        </> : <p className="note">Sınıf içi gözlem kaydı yok.</p>}
        {s.satisfaction !== null && <>
          <Kv k="Memnuniyet anketi" v={`${s.satisfaction} / 10`} />
          <p className="note">Memnuniyet puanı bilgi olarak gösterilir; risk hesabına katılmaz.</p>
        </>}
      </section>
    </div>
  </>;
}

function Head({ title, score }: { title: string; score: number }) {
  return <div className="card-hd"><h2>{title}</h2>
    <span className={`state ${band(score)}`}><i className="dot" />{areaWord(score)}</span></div>;
}

function Kv({ k, v, alert, suffix }: { k: string; v: string; alert?: boolean; suffix?: string }) {
  return <div className="kv"><span className="k">{k}</span>
    <span className={`v${alert ? " crit-ink" : ""}`}>{v}{suffix && <> {suffix}</>}</span></div>;
}

/** Four exams is too few for a chart library and too many for a sentence.
 *  The pass mark is drawn because "is he failing?" is the question being asked. */
function Spark({ exams, falling }: { exams: { label: string; value: number }[]; falling: boolean }) {
  if (exams.length < 2) return <p className="note">Sınav geçmişi yok.</p>;
  const W = 330, H = 126, PL = 6, PR = 26, PT = 16, PB = 24;
  const values = exams.map(e => e.value);
  const lo = Math.min(35, Math.min(...values) - 8), hi = Math.max(100, Math.max(...values) + 5);
  const x = (i: number) => PL + i * (W - PL - PR) / (exams.length - 1);
  const y = (v: number) => PT + (hi - v) * (H - PT - PB) / (hi - lo);
  const tone = falling ? "crit" : "good";
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" className={`spark ${tone}`} role="img"
    aria-label={`Sınav notları: ${values.join(", ")}`}>
    <line x1={PL} x2={W - PR} y1={y(PASS_MARK)} y2={y(PASS_MARK)} className="passline" strokeDasharray="3 3" />
    <text x={W - PR + 4} y={y(PASS_MARK) + 3.5} className="passlabel">{PASS_MARK}</text>
    <path d={`${line} L${x(exams.length - 1).toFixed(1)} ${H - PB} L${x(0).toFixed(1)} ${H - PB} Z`} className="area" />
    <path d={line} className="line" />
    {values.map((v, i) => <g key={i}>
      <circle cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 5 : 3.5}
        className={i === values.length - 1 ? "dot-last" : "dot-mid"} />
      <text x={x(i)} y={H - 6} textAnchor="middle" className="tickval">{v}</text>
    </g>)}
  </svg>;
}
