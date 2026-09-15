import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadPlans, thisWeek } from "@/lib/plan";
import { ownerLabel, participationLabel, taskStateLabel, taskStateTone } from "@/lib/rubric";
import { TaskStatusButtons } from "../../plans/forms";

const dayName = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(y, m - 1, d));
};
const clock = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" });

/** Öğrencinin haftası: bugün ne var, neden, ne kadar sürer.
 *
 *  The plan screens are built for whoever approves plans. This one is built for
 *  whoever does them — one week, today first, each task carrying its reason and
 *  its length, and a way to say "I am stuck" that does not require finding
 *  anybody.
 *
 *  Opened by staff, because student and guardian logins are a decision the
 *  institution has not made and inventing an access path for them would be the
 *  product claiming a capability it does not have. The page says so rather than
 *  implying the student is looking at it.
 */
export default async function StudentWeek({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await requireUser();
  const student = await client.from("students").select("id,name").eq("id", id).maybeSingle();
  if (student.error || !student.data) notFound();

  const plans = await loadPlans(client, { studentId: id });
  const week = thisWeek();
  const plan = plans.find(p => p.weekStart === week && p.status === "approved")
    ?? plans.find(p => p.status === "approved") ?? null;
  const today = new Date().toISOString().slice(0, 10);

  if (!plan) return <>
    <Link className="backlink" href={`/workspace/students/${id}`}>← Öğrenci kartına dön</Link>
    <section className="panel empty">
      <h1>{student.data.name} için onaylı bir hafta yok.</h1>
      <p>Taslak plan öğrencinin haftası değildir; bu ekran yalnızca onaylanmış planı gösterir.
        Onay <Link href="/workspace/plans">plan kuyruğundan</Link> verilir.</p>
    </section>
  </>;

  const live = plan.tasks.filter(t => t.status !== "cancelled");
  const mine = live.filter(t => t.owner === "student");
  const todays = live.filter(t => t.scheduledOn === today);
  const remaining = mine.filter(t => t.status === "open")
    .reduce((t, x) => t + x.minutes, 0);

  return <>
    <Link className="backlink no-print" href={`/workspace/students/${id}`}>← Öğrenci kartına dön</Link>
    <p className="eyebrow">BU HAFTA · {dayName(plan.weekStart)}</p>
    <h1>{student.data.name}</h1>
    <p className="intro">{live.length} görev · haftada toplam{" "}
      {live.reduce((t, x) => t + x.minutes, 0)} dakika. Öğrencinin kendi yapacağı{" "}
      {mine.length} görevden kalan süre <b>{remaining} dakika</b>.
      {todays.length > 0 && <> Bugün {todays.length} görev var.</>}</p>
    <p className="note no-print">Bu ekran öğrenciye gösterilmek üzere hazırlanmıştır ve kurum
      personeli tarafından açılır. Öğrenci ve veli girişi henüz tanımlı değil; tanımlanana
      kadar bu sayfa yazdırılıp verilebilir.</p>

    <div className="week">{live.map(t => <article key={t.id}
      className={`week-card${t.scheduledOn === today ? " is-today" : ""}`}>
      <div className="week-hd">
        <span className="note">{dayName(t.scheduledOn)}{t.scheduledOn === today && " · bugün"}</span>
        <span className={`state ${taskStateTone(t.status)}`}><i className="dot" />
          {taskStateLabel(t.status)}</span>
      </div>
      <h2>{t.title}</h2>
      <p className="note">{t.minutes} dakika · {ownerLabel(t.owner)}</p>
      <p className="week-why">{t.why}</p>
      <dl className="task-meta">
        <dt>Ne çıkmalı</dt><dd>{t.expectedOutput}</dd>
        {t.resourceTitle && <><dt>Kaynak</dt><dd>{t.resourceTitle}
          {t.resourceIsSample && <small>Örnek kayıt — kurumun doğrulanmış içeriği değil</small>}</dd></>}
        {t.sessionTitle && <><dt>Oturum</dt><dd>{t.sessionTitle}
          {t.sessionStartsAt && <> · {clock.format(new Date(t.sessionStartsAt))}</>}
          <small>{t.participation
            ? participationLabel(t.participation)
            : "Henüz yer ayrılmadı"}{t.sessionIsSample && " · örnek kayıt"}</small></dd></>}
      </dl>
      <div className="no-print">
        <TaskStatusButtons taskId={t.id} studentId={id} status={t.status} />
      </div>
    </article>)}</div>

    <p className="pad-note note">&ldquo;Öğrenci tamamladı&rdquo; ile &ldquo;eğitmen kontrol
      etti&rdquo; ayrı işaretlenir; ikisi de becerinin geliştiğini göstermez. Onu yalnızca
      haftanın sonundaki yeniden değerlendirme gösterir.</p>
  </>;
}
