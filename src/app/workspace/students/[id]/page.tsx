import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadStudent, type StudentCard, type StudentRisk } from "@/lib/student";
import { FIELD_GROUPS } from "@/lib/entry";
import { loadStudentEntry } from "@/lib/entry-read";
import { AREA, DIMENSIONS, MISSING, STATE, band } from "@/lib/narrative";
import { MarkDone } from "../../mark-button";
import { EntryPanel } from "./entry-panel";
import { Progress, SkillProfile, StudyHistory, WeeklyPlan } from "./tabs";

/** Kart beş soruyu ayrı ayrı yanıtlar.
 *
 *  They were one page, and the page could only answer the first: where the
 *  problem is. What the student should do about it, what was done, and whether
 *  anything measurably changed are different questions with different evidence,
 *  and stacking them under one heading was what let "risk skoru düştü" pass for
 *  "öğrenci ilerledi". Plain links rather than client-side state: each tab is
 *  its own server render and its own set of queries. */
const TABS = [
  { key: "ozet", label: "Özet" },
  { key: "beceri", label: "Beceri profili" },
  { key: "plan", label: "Haftalık plan" },
  { key: "gecmis", label: "Çalışma geçmişi" },
  { key: "gelisim", label: "Gelişim" }
] as const;
type TabKey = (typeof TABS)[number]["key"];

const areaWord = (v: number | undefined) =>
  v === undefined ? "Veri yok" : v >= 60 ? "Ciddi sorun" : v >= 30 ? "Dikkat" : "İyi";

export default async function Student({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ g?: string }>;
}) {
  const { id } = await params;
  const { g } = await searchParams;
  const tab: TabKey = TABS.find(t => t.key === g)?.key ?? "ozet";
  const { client } = await requireUser();
  const s = await loadStudent(client, id);
  if (!s) notFound();
  const entered = tab === "ozet" ? await loadStudentEntry(client, id) : null;
  const today = new Date().toISOString().slice(0, 10);

  const missed = s.attendanceRate === null ? null : Math.max(1, Math.round((100 - s.attendanceRate) / 10));
  const detail = s.risk?.detail ?? null;
  const scoreOf = (d: (typeof DIMENSIONS)[number]) => s.risk?.dimensions[d];

  return <>
    <Link className="backlink" href="/workspace">← Gündeme dön</Link>

    <section className="panel pad">
      <div className="card-hd">
        <div>
          <h1 className="dname">{s.name}</h1>
          <p className="note">{s.branch} şubesi · {s.level} kuru
            {s.teacher && <> · Eğitmeni {s.teacher}</>}</p>
        </div>
        {s.risk && <div className="stack-end">
          <span className={`state ${STATE[s.risk.riskLevel].cls}`}><i className="dot" />{STATE[s.risk.riskLevel].word}</span>
          {s.risk.change !== null && <span className="note">{s.risk.change === 0 ? "önceki ölçümle aynı"
            : s.risk.change > 0 ? "önceki ölçüme göre kötüleşti" : "önceki ölçüme göre düzeldi"}</span>}
        </div>}
      </div>

      {s.risk ? <Assessment risk={s.risk} studentId={s.id} /> : <>
        <p className="srow-head lead">Bu öğrenci henüz puanlanmadı.</p>
        <p className="note">Kayıt oluşturuldu, ancak risk skoru için ölçüm gerekiyor. Sınav,
          beceri, devam ve sınıf içi bilgilerini aşağıdaki formdan girin — kaydettiğinizde
          skor hesaplanır.</p>
      </>}
      {/* A card showing an older checkpoint's verdict has to say so, or it reads
          as today's reading of a student nobody has measured this time round. */}
      {s.risk && s.snapshotPeriod && s.currentPeriod && s.snapshotPeriod !== s.currentPeriod &&
        <p className="note">Bu değerlendirme {s.snapshotPeriod} kesitine ait. Kurumun güncel
          kesiti {s.currentPeriod}; bu öğrenci o kesitte puanlanmadı.</p>}
    </section>

    <nav className="tabs" aria-label="Öğrenci kartı bölümleri">{TABS.map(t =>
      <Link key={t.key} className={`tab${tab === t.key ? " on" : ""}`}
        href={`/workspace/students/${s.id}?g=${t.key}`}
        aria-current={tab === t.key ? "page" : undefined}>{t.label}</Link>)}
      <Link className="tab" href={`/workspace/week/${s.id}`}>Öğrencinin haftası ↗</Link>
      <Link className="tab" href={`/workspace/students/${s.id}/report`}>Gelişim raporu ↗</Link>
    </nav>

    {tab === "beceri" && <SkillProfile client={client} studentId={s.id} today={today} />}
    {tab === "plan" && <WeeklyPlan client={client} studentId={s.id} />}
    {tab === "gecmis" && <StudyHistory client={client} studentId={s.id} />}
    {tab === "gelisim" && <Progress client={client} studentId={s.id} />}

    {tab === "ozet" && <>
    <EntryPanel studentId={s.id} name={s.name} values={entered!} today={today}
      groups={FIELD_GROUPS} open={!s.risk} />

    {s.risk && <section className="panel pad">
      <p className="eyebrow">SORUN NEREDE</p>
      <div className="map">{DIMENSIONS.map(d => {
        const v = s.risk!.dimensions[d];
        return <div key={d} className="mapcell">
          <span className="lab">{AREA[d]}</span>
          <span className={`st ${band(v)}`}>{areaWord(v)}</span>
          <span className="mapbar"><i className={band(v)} style={{ width: `${v ?? 0}%` }} /></span>
          {v === undefined && <span className="note">{MISSING[d]}</span>}
        </div>;
      })}</div>
    </section>}

    <div className="cards2">
      <section className="panel pad">
        <Head title="Devamsızlık" score={scoreOf("attendance")} scored={!!s.risk} />
        {s.attendanceRate === null ? <p className="note">Devam verisi yok.</p> : <>
          <p className="big-line"><span className={`big ${band(scoreOf("attendance"))}`}>%{s.attendanceRate}</span>
            <span className="note">dönem geneli devam oranı</span></p>
          <p className="note">Her 10 dersin yaklaşık <b>{missed}</b> tanesine gelmiyor.</p>
          {s.attendanceRecent !== null && <Kv k="Son 4 hafta"
            v={`%${s.attendanceRecent}`}
            alert={(detail?.attendance?.drop ?? 0) >= 5}
            suffix={(detail?.attendance?.drop ?? 0) >= 5 ? `▼ ${detail!.attendance!.drop} puan` : undefined} />}
          <Kv k="Kurumun kritik sınırı" v={`%${s.attendanceFloor}`} />
        </>}
      </section>

      <section className="panel pad">
        <Head title="Sınav notları" score={scoreOf("test")} scored={!!s.risk} />
        <Spark exams={s.exams} passMark={s.passMark}
          falling={!!detail?.test && (detail.test.monotonic_decline || detail.test.delta <= -4)} />
        {s.exams.length > 1 && s.exams[s.exams.length - 1].value < s.exams[0].value &&
          <p className="note">İlk sınavdan bu yana <b className="crit-ink">
            {s.exams[0].value - s.exams[s.exams.length - 1].value} puan</b> kaybetti.</p>}
        {detail?.test && <Kv k="Son sınav" v={String(detail.test.last_exam)}
          alert={detail.test.last_exam < s.passMark}
          suffix={detail.test.last_exam < s.passMark ? "· geçme notu altında" : undefined} />}
        {s.benchmark?.exam != null &&
          <Kv k={`${s.level} kurunun iyi öğrencileri`} v={s.benchmark.exam.toFixed(0)} />}
      </section>

      <section className="panel pad">
        <Head title="Dil becerileri" score={scoreOf("skill")} scored={!!s.risk} />
        {s.skills.length === 0 ? <p className="note">Beceri puanı girilmemiş.</p> : s.skills.map(k => {
          const mark = s.benchmark?.skill ?? 100;
          const showTick = s.benchmark?.skill != null;
          const tone = k.value < s.passMark ? "crit" : k.value < mark * .85 ? "warn" : "good";
          const weakest = detail?.skill?.weakest === k.key;
          return <div key={k.key} className="bar">
            <span className={`nm${weakest ? " is-weakest" : ""}`}>{k.label}</span>
            <span className="track">
              <i className={`fill ${tone}`} style={{ width: `${k.value}%` }} />
              {showTick && <i className="tick" style={{ left: `${mark}%` }} />}
            </span>
            <span className="val">{k.value}</span>
          </div>;
        })}
        {s.benchmark?.skill != null && s.skills.length > 0 && <p className="legend"><i className="tick-key" />
          {s.level} kurunun iyi öğrencileri: {s.benchmark.skill.toFixed(0)}</p>}
      </section>

      <section className="panel pad">
        <Head title="Derse katılım" score={scoreOf("classroom")} scored={!!s.risk} />
        {detail?.classroom ? <>
          {detail.classroom.participation !== undefined &&
            <Kv k="Derse katılımı" v={`${detail.classroom.participation} / 10`}
              alert={detail.classroom.participation <= 5} />}
          {detail.classroom.homework !== undefined &&
            <Kv k="Ödevlerini yapma oranı" v={`%${detail.classroom.homework}`}
              alert={detail.classroom.homework < 60} />}
          <div className="kv"><span className="k">Öğretmeni endişeli mi</span>
            <span className={`state ${detail.classroom.teacher_concern ? "crit" : "good"}`}>
              <i className="dot" />{detail.classroom.teacher_concern ? "Evet" : "Hayır"}</span></div>
        </> : <p className="note">Sınıf içi gözlem kaydı yok.</p>}
        {s.satisfaction !== null && <>
          <Kv k="Memnuniyet anketi" v={`${s.satisfaction} / 10`} />
          <p className="note">Memnuniyet puanı bilgi olarak gösterilir; risk hesabına katılmaz.</p>
        </>}
      </section>
    </div>
    </>}
  </>;
}

function Assessment({ risk, studentId }: { risk: StudentRisk; studentId: string }) {
  return <>
    <p className="srow-head lead">{risk.headline}</p>
    <ul className="facts">
      {risk.found.length
        ? risk.found.map(f => <li key={f.dim} className={band(f.score)}>{f.text}</li>)
        : <li>Bu öğrencide belirgin bir risk sinyali yok.</li>}
    </ul>
    <div className="todo">
      <div className="todo-hd">NE YAPMALI{risk.tasks > 0 && <span> · {risk.tasksDone}/{risk.tasks}</span>}</div>
      <ul className="tasks">{risk.steps.map(x => <li key={x.key} className={x.done ? "task is-closed" : "task"}>
        <span className="ck">{x.done ? "✓" : "→"}</span>
        <span className="tk">{x.text}{x.who && <small>{x.who}</small>}</span>
        {risk.needsAction && <MarkDone studentId={studentId} taskKey={x.key} title={x.text} done={x.done} />}
      </li>)}</ul>
    </div>
    {risk.reasons.length > 0 && <details className="raw">
      <summary>Sistemin tespit ettiği ham sinyaller ({risk.reasons.length})</summary>
      <ul>{risk.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
    </details>}
  </>;
}

/** The card's own verdict. An area with no data says so in the same place the
 *  verdict would be, rather than leaving the reader to guess why it is blank. */
function Head({ title, score, scored }: { title: string; score?: number; scored: boolean }) {
  return <div className="card-hd"><h2>{title}</h2>
    {scored && <span className={`state ${band(score)}`}><i className="dot" />{areaWord(score)}</span>}</div>;
}

function Kv({ k, v, alert, suffix }: { k: string; v: string; alert?: boolean; suffix?: string }) {
  return <div className="kv"><span className="k">{k}</span>
    <span className={`v${alert ? " crit-ink" : ""}`}>{v}{suffix && <> {suffix}</>}</span></div>;
}

/** Four exams is too few for a chart library and too many for a sentence.
 *  The pass mark is drawn because "is he failing?" is the question being asked. */
function Spark({ exams, passMark, falling }: {
  exams: StudentCard["exams"]; passMark: number; falling: boolean;
}) {
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
    <line x1={PL} x2={W - PR} y1={y(passMark)} y2={y(passMark)} className="passline" strokeDasharray="3 3" />
    <text x={W - PR + 4} y={y(passMark) + 3.5} className="passlabel">{passMark}</text>
    <path d={`${line} L${x(exams.length - 1).toFixed(1)} ${H - PB} L${x(0).toFixed(1)} ${H - PB} Z`} className="area" />
    <path d={line} className="line" />
    {values.map((v, i) => <g key={i}>
      <circle cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 5 : 3.5}
        className={i === values.length - 1 ? "dot-last" : "dot-mid"} />
      <text x={x(i)} y={H - 6} textAnchor="middle" className="tickval">{v}</text>
    </g>)}
  </svg>;
}
