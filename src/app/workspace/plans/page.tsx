import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { canPlan, currentMembership } from "@/lib/membership";
import { loadPlans, planProblems, thisWeek } from "@/lib/plan";
import { GenerateForm } from "./forms";

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" })
    .format(new Date(y, m - 1, d));
};

/** Onay kuyruğu.
 *
 *  Ordered by what a teacher has to decide, not by how bad the student is:
 *  drafts with thin evidence, a missing resource, a sample session or minutes
 *  that do not fit come first, because those are the ones where approving
 *  without reading would be wrong. A clean draft further down can be opened and
 *  approved in two clicks.
 */
export default async function Plans() {
  const { client } = await requireUser();
  const [me, settings] = await Promise.all([currentMembership(client), loadSettings(client)]);
  const branches = await client.from("branches").select("id,name").order("name");
  const [drafts, approved] = await Promise.all([
    loadPlans(client, { status: "draft" }),
    loadPlans(client, { status: "approved" })
  ]);
  const week = thisWeek();

  const queue = drafts.map(p => ({ plan: p, problems: planProblems(p) }))
    .sort((a, b) => b.problems.length - a.problems.length
      || a.plan.studentName.localeCompare(b.plan.studentName, "tr"));
  const live = approved.filter(p => p.weekStart === week);
  const checked = live.reduce((t, p) =>
    t + p.tasks.filter(x => x.status === "teacher_checked").length, 0);
  const total = live.reduce((t, p) => t + p.tasks.filter(x => x.status !== "cancelled").length, 0);

  return <>
    <p className="eyebrow">PLAN ONAY KUYRUĞU</p>
    <h1>{queue.length
      ? `${queue.length} taslak onay bekliyor.`
      : "Onay bekleyen taslak yok."}</h1>
    <p className="intro">Taslaklar öğrenciye gösterilmez. Onaylanan plan sürümlenir; sonradan
      değiştirilirse eski sürüm arşivlenir ve ne zaman neyin onaylandığı kayıtta kalır.
      {live.length > 0 && <> Bu hafta onaylı {live.length} planda {total} görevin {checked} tanesi
        eğitmen tarafından kontrol edildi.</>}</p>

    {canPlan(me) && <GenerateForm levels={settings.levels}
      branches={(branches.data ?? []).map(b => ({ id: b.id, name: b.name }))}
      weekStart={week} lockedBranch={me?.branchId !== null && me?.branchId !== undefined} />}

    <section className="panel">
      <div className="panel-heading"><h2>Onay bekleyenler</h2>
        <span className="note">Önce karar gerektirenler</span></div>
      {queue.length === 0
        ? <p className="empty">Kuyruk boş. Yukarıdaki formla bir kur seçip taslak
          hazırlayabilirsiniz; kanıta dayalı ihtiyacı olmayan öğrenci için taslak
          üretilmez.</p>
        : <div className="plan-queue">{queue.map(({ plan, problems }) =>
          <article key={plan.id} className="plan-row">
            <div className="plan-hd">
              <Link href={`/workspace/plans/${plan.id}`}>{plan.studentName}</Link>
              <span className="note">{plan.branch} · {plan.level} · {day(plan.weekStart)} haftası
                · sürüm {plan.version}</span>
              <span className={`state ${problems.length ? "warn" : "good"}`}><i className="dot" />
                {problems.length ? `${problems.length} not` : "Sorun görünmüyor"}</span>
            </div>
            <p className="note">{plan.tasks.length} görev ·{" "}
              {plan.tasks.reduce((t, x) => t + x.minutes, 0)} dakika ·
              bütçe {plan.minutesBudget} dakika</p>
            {problems.length > 0 && <ul className="facts">{problems.map((x, i) =>
              <li key={i} className="warn">{x}</li>)}</ul>}
            <p className="note">{plan.needs.slice(0, 2).map(n => n.label).join(" · ")}</p>
          </article>)}</div>}
    </section>

    {live.length > 0 && <section className="panel">
      <div className="panel-heading"><h2>Bu hafta onaylı planlar</h2>
        <span className="note">{day(week)} haftası</span></div>
      <div className="table-scroll"><table>
        <thead><tr><th>Öğrenci</th><th>Şube · kur</th><th>Görev</th><th>Öğrenci tamamladı</th>
          <th>Eğitmen kontrol etti</th><th>Yardım istendi</th></tr></thead>
        <tbody>{live.map(p => {
          const open = p.tasks.filter(t => t.status !== "cancelled");
          const count = (s: string) => open.filter(t => t.status === s).length;
          return <tr key={p.id}>
            <th scope="row"><Link href={`/workspace/plans/${p.id}`}>{p.studentName}</Link></th>
            <td>{p.branch} · {p.level}</td>
            <td>{open.length}</td>
            <td>{count("student_done") + count("teacher_checked")}</td>
            <td>{count("teacher_checked")}</td>
            <td className={count("blocked") ? "crit-ink" : undefined}>{count("blocked")}</td>
          </tr>;
        })}</tbody>
      </table></div>
      <p className="pad-note note">Görevin yapılmış olması öğrenmenin kanıtı değildir; beceri
        değişimi yalnızca aynı ölçütlerle yapılan yeni değerlendirmeden okunur.</p>
    </section>}
  </>;
}
