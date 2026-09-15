import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadPlans, planProblems } from "@/lib/plan";
import { loadSessions } from "@/lib/learning";
import { ownerLabel, participationLabel, taskStateLabel, taskStateTone } from "@/lib/rubric";
import { ApproveButton, TaskEdit, TaskStatusButtons } from "../forms";

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(y, m - 1, d));
};
const when = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

const NEED_WORD: Record<string, string> = {
  measured: "Ölçüldü", thin: "Tek ölçüm", unmeasured: "Ölçülmedi",
  attendance: "Devam", classroom: "Sınıf içi"
};

export default async function Plan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await requireUser();
  const [found] = await loadPlans(client, { id });
  if (!found) notFound();

  const problems = planProblems(found);
  const sessions = await loadSessions(client, found.weekStart);
  const swappable = sessions.map(s => ({
    id: s.id,
    label: `${s.title} · ${when.format(new Date(s.startsAt))} · ${s.capacity - s.taken} yer`,
    full: s.taken >= s.capacity
  }));
  const live = found.tasks.filter(t => t.status !== "cancelled");
  const minutes = live.reduce((t, x) => t + x.minutes, 0);

  return <>
    <Link className="backlink" href="/workspace/plans">← Onay kuyruğuna dön</Link>

    <section className="panel pad">
      <div className="card-hd">
        <div>
          <h1 className="dname">{found.studentName}</h1>
          <p className="note">{found.branch} şubesi · {found.level} kuru ·{" "}
            {day(found.weekStart)} haftası · sürüm {found.version}</p>
        </div>
        <div className="stack-end">
          <span className={`state ${found.status === "approved" ? "good" : "warn"}`}>
            <i className="dot" />{found.status === "approved" ? "Onaylı"
              : found.status === "draft" ? "Taslak" : "Arşiv"}</span>
          {found.approvedAt && <span className="note">{when.format(new Date(found.approvedAt))}</span>}
        </div>
      </div>
      <p className="note">{live.length} görev · {minutes} dakika · haftalık bütçe{" "}
        {found.minutesBudget} dakika
        {found.sourcePeriodEnd && <> · {found.sourcePeriodEnd} kesitinin verisiyle hazırlandı</>}</p>
      {problems.length > 0 && <ul className="facts">{problems.map((x, i) =>
        <li key={i} className="warn">{x}</li>)}</ul>}
      {found.status === "draft" && <ApproveButton planId={found.id} problems={problems.length} />}
      {found.status === "archived" && <p className="note">Bu sürüm arşivde. Öğrencinin bu
        haftasına ait güncel sürüm ayrı bir kayıttır; burada gördüğünüz, o tarihte onaylanmış
        olandır.</p>}
    </section>

    <section className="panel pad">
      <p className="eyebrow">PLAN NEYE DAYANIYOR</p>
      {found.needs.length === 0
        ? <p className="note">Kayıtlı bir gerekçe yok.</p>
        : <ul className="needs">{found.needs.map((n, i) => <li key={i}>
          <span className={`state ${n.kind === "measured" ? "crit"
            : n.kind === "unmeasured" ? "" : "warn"}`}><i className="dot" />{NEED_WORD[n.kind]}</span>
          <span><b>{n.label}</b><small>{n.evidence}</small></span>
        </li>)}</ul>}
      <p className="note">Ölçülmemiş bir beceri eksiklik olarak yazılmaz; karşılığı kısa bir
        tanılama görevidir. Tek ölçüme dayanan ihtiyaçta plan ikinci bir ölçüm içerir.</p>
    </section>

    <section className="panel">
      <div className="panel-heading"><h2>Haftanın görevleri</h2>
        <span className="note">Her görevin gerekçesi, çıktısı ve kontrol yöntemi ayrı</span></div>
      <div className="plan-tasks">{found.tasks.map(t => <article key={t.id}
        className={`plan-task${t.status === "cancelled" ? " is-closed" : ""}`}>
        <div className="plan-hd">
          <b>{t.position}. {t.title}</b>
          <span className="note">{day(t.scheduledOn)} · {t.minutes} dk · {ownerLabel(t.owner)}</span>
          <span className={`state ${taskStateTone(t.status)}`}><i className="dot" />
            {taskStateLabel(t.status)}</span>
        </div>
        <dl className="task-meta">
          <dt>Neden</dt><dd>{t.why}</dd>
          <dt>Beklenen çıktı</dt><dd>{t.expectedOutput}</dd>
          <dt>Nasıl kontrol edilir</dt><dd>{t.checkMethod}</dd>
          {t.resourceTitle && <><dt>Kaynak</dt><dd>{t.resourceTitle}
            {t.resourceIsSample && <span className="state warn"><i className="dot" />Örnek kayıt</span>}</dd></>}
          {t.sessionTitle && <><dt>Oturum</dt><dd>{t.sessionTitle}
            {t.sessionStartsAt && <> · {when.format(new Date(t.sessionStartsAt))}</>}
            {t.sessionIsSample && <span className="state warn"><i className="dot" />Örnek kayıt</span>}
            <small>{t.participation
              ? `Durum: ${participationLabel(t.participation)}`
              : "Henüz bir kayıt yok"}</small></dd></>}
        </dl>
        {t.status !== "cancelled" && <TaskStatusButtons taskId={t.id}
          studentId={found.studentId} status={t.status} />}
        {found.status !== "archived" && <TaskEdit sessions={swappable}
          task={{ id: t.id, title: t.title, minutes: t.minutes,
            scheduledOn: t.scheduledOn, sessionId: t.sessionId }} />}
      </article>)}</div>
      <p className="pad-note note">Rezervasyon ancak plan onaylandığında yapılır ve oturumda
        yer yoksa onay reddedilir — öğrenci hiçbir zaman katılmadığı bir oturuma katılmış
        görünmez.</p>
    </section>

    <p><Link className="backlink" href={`/workspace/students/${found.studentId}`}>
      → Öğrenci kartına git</Link></p>
  </>;
}
