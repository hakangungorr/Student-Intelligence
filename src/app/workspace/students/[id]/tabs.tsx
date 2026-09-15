import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criterionTrends, loadAssessments, loadAvailability, loadObjectives, availabilityOf } from "@/lib/learning";
import { loadPlans, loadTaskEvents, planProblems, thisWeek } from "@/lib/plan";
import {
  BAND_LABEL, RUBRIC_VERSION, SKILLS, SKILL_LABEL,
  ownerLabel, participationLabel, taskStateLabel, taskStateTone
} from "@/lib/rubric";
import { RUBRIC_WARNING } from "@/lib/catalog-seed";
import { AssessForm } from "./assess-form";
import { AvailabilityForm, TaskStatusButtons } from "../../plans/forms";

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" })
    .format(new Date(y, m - 1, d));
};
const weekday = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(y, m - 1, d));
};
const stamp = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

/** Beceri profili: puanın yanında kanıt, tarih ve ölçüt.
 *
 *  A number on its own invites the reader to treat it as a fact about the
 *  student. The date, the task and the criterion turn it back into what it is —
 *  one observation, under stated conditions, that somebody can repeat. An
 *  unmeasured criterion says so and is never shown as a low score.
 */
export async function SkillProfile({ client, studentId, today }: {
  client: SupabaseClient; studentId: string; today: string;
}) {
  const [byStudent, objectives] = await Promise.all([
    loadAssessments(client, [studentId]), loadObjectives(client)
  ]);
  const assessments = byStudent.get(studentId) ?? [];

  return <>
    <section className="panel pad">
      <div className="card-hd"><h2>Beceri profili</h2>
        <span className="note">{assessments.length} tarihli değerlendirme</span></div>
      <p className="note">{RUBRIC_WARNING} Bu tablo, kurumun özet beceri puanlarının yerine
        geçmez — onların yanına, hangi alt ölçütte ne gözlendiğini koyar.</p>

      {SKILLS.map(skill => {
        const trends = criterionTrends(assessments, skill);
        const measured = trends.filter(t => t.latest !== null);
        return <div key={skill} className="skill-block">
          <h3>{SKILL_LABEL[skill]}</h3>
          {measured.length === 0
            ? <p className="note">Bu becerinin hiçbir ölçütü ölçülmemiş. Sistem bunu zayıflık
              saymıyor; plan üretilirken karşılığı kısa bir tanılama görevidir.</p>
            : <div className="table-scroll"><table>
              <thead><tr><th>Ölçüt</th><th>Son</th><th>Önceki</th><th>Ne zaman</th>
                <th>Hangi görevde</th></tr></thead>
              <tbody>{trends.map(t => <tr key={t.code}>
                <th scope="row">{t.label}<small>{t.hint}</small></th>
                <td>{t.latest === null ? <span className="note">ölçülmedi</span>
                  : <>{t.latest}/{t.scaleMax} <small>{BAND_LABEL(t.latest, t.scaleMax)}</small></>}</td>
                <td>{t.previous === null
                  ? <span className="note">{t.readings > 1 ? "farklı ölçütle" : "—"}</span>
                  : <>{t.previous}/{t.scaleMax}{t.comparable && t.latest !== null && <small
                    className={t.latest > t.previous ? "good-ink" : t.latest < t.previous ? "crit-ink" : undefined}>
                    {t.latest > t.previous ? "▲" : t.latest < t.previous ? "▼" : "="}{" "}
                    {Math.abs(t.latest - t.previous)}</small>}</>}</td>
                <td>{t.latestOn ? day(t.latestOn) : "—"}</td>
                <td>{t.latestTask ?? "—"}</td>
              </tr>)}</tbody>
            </table></div>}
        </div>;
      })}
      <p className="note">İki puan yalnızca aynı ölçüt sürümünde ve aynı ölçekte alınmışsa
        karşılaştırılır. Farklı sürümde alınmış bir önceki değer &ldquo;farklı ölçütle&rdquo;
        diye işaretlenir, ok gösterilmez.</p>
    </section>

    <AssessForm studentId={studentId} today={today}
      objectives={objectives.map(o => ({ id: o.id, skill: o.skill, label: o.label }))} />

    {assessments.length > 0 && <section className="panel">
      <div className="panel-heading"><h2>Değerlendirme kayıtları</h2>
        <span className="note">En yeniden eskiye · hiçbiri silinmez</span></div>
      <div className="table-scroll"><table>
        <thead><tr><th>Tarih</th><th>Beceri</th><th>Görev</th><th>Puanlar</th>
          <th>Ölçüt sürümü</th></tr></thead>
        <tbody>{assessments.map(a => <tr key={a.id}>
          <td>{day(a.assessedOn)}</td>
          <td>{SKILL_LABEL[a.skill]}</td>
          <th scope="row">{a.taskLabel}{a.note && <small>{a.note}</small>}</th>
          <td>{a.scores.map(s => `${s.label} ${s.score}/${a.scaleMax}`).join(" · ")}</td>
          <td>{a.rubricVersion}{a.rubricVersion !== RUBRIC_VERSION &&
            <small>güncel sürüm değil</small>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </>;
}

/** Haftalık plan: kaynak, oturum ve durum. */
export async function WeeklyPlan({ client, studentId }: {
  client: SupabaseClient; studentId: string;
}) {
  const [plans, availability] = await Promise.all([
    loadPlans(client, { studentId }), loadAvailability(client, [studentId])
  ]);
  const capacity = availabilityOf(availability, studentId);
  const week = thisWeek();
  const current = plans.find(p => p.weekStart === week && p.status !== "archived")
    ?? plans.find(p => p.status !== "archived") ?? null;

  return <>
    <section className="panel pad">
      <div className="card-hd"><h2>Haftalık kapasite</h2></div>
      <AvailabilityForm studentId={studentId}
        weeklyMinutes={capacity.weeklyMinutes} recorded={capacity.recorded} />
    </section>

    {!current ? <section className="panel empty">
      <h2>Bu öğrencinin haftalık planı yok.</h2>
      <p>Plan, <Link href="/workspace/plans">onay kuyruğu</Link> ekranından kur seçilerek
        hazırlanır. Kanıta dayalı bir ihtiyaç bulunamazsa taslak üretilmez — boş bir plan
        üretmek yerine eksik olanı söylemeyi tercih ediyoruz.</p>
    </section> : <>
      <section className="panel pad">
        <div className="card-hd">
          <div><h2>{day(current.weekStart)} haftası</h2>
            <p className="note">Sürüm {current.version} ·{" "}
              {current.tasks.filter(t => t.status !== "cancelled")
                .reduce((t, x) => t + x.minutes, 0)} dakika / bütçe {current.minutesBudget} dakika</p></div>
          <span className={`state ${current.status === "approved" ? "good" : "warn"}`}>
            <i className="dot" />{current.status === "approved" ? "Onaylı" : "Taslak — onay bekliyor"}</span>
        </div>
        {planProblems(current).map((x, i) => <p key={i} className="note">• {x}</p>)}
        <p><Link className="backlink" href={`/workspace/plans/${current.id}`}>
          → Planı incele ve onayla</Link></p>
      </section>

      <section className="panel">
        <div className="panel-heading"><h2>Görevler</h2>
          <span className="note">&ldquo;Öğrenci tamamladı&rdquo; ile &ldquo;eğitmen kontrol
            etti&rdquo; ayrı durumlardır</span></div>
        <div className="plan-tasks">{current.tasks.map(t => <article key={t.id}
          className={`plan-task${t.status === "cancelled" ? " is-closed" : ""}`}>
          <div className="plan-hd">
            <b>{weekday(t.scheduledOn)} — {t.title}</b>
            <span className="note">{t.minutes} dk · {ownerLabel(t.owner)}</span>
            <span className={`state ${taskStateTone(t.status)}`}><i className="dot" />
              {taskStateLabel(t.status)}</span>
          </div>
          <p className="note">{t.why}</p>
          <dl className="task-meta">
            <dt>Beklenen çıktı</dt><dd>{t.expectedOutput}</dd>
            <dt>Kontrol</dt><dd>{t.checkMethod}</dd>
            {t.resourceTitle && <><dt>Kaynak</dt><dd>{t.resourceTitle}
              {t.resourceIsSample && <span className="state warn"><i className="dot" />Örnek</span>}</dd></>}
            {t.sessionTitle && <><dt>Oturum</dt><dd>{t.sessionTitle}
              {t.sessionIsSample && <span className="state warn"><i className="dot" />Örnek</span>}
              <small>{t.participation ? participationLabel(t.participation) : "kayıt yok"}</small></dd></>}
          </dl>
          {current.status === "approved" && t.status !== "cancelled" &&
            <TaskStatusButtons taskId={t.id} studentId={studentId} status={t.status} />}
        </article>)}</div>
        {current.status !== "approved" && <p className="pad-note note">Görev durumları plan
          onaylandıktan sonra işaretlenir. Onaylanmamış bir plan öğrencinin haftası değildir.</p>}
      </section>
    </>}
  </>;
}

/** Çalışma geçmişi: ne yapıldı, ne zaman, kim işaretledi. */
export async function StudyHistory({ client, studentId }: {
  client: SupabaseClient; studentId: string;
}) {
  const [plans, events] = await Promise.all([
    loadPlans(client, { studentId }), loadTaskEvents(client, studentId)
  ]);
  const titleOf = new Map(plans.flatMap(p => p.tasks.map(t => [t.id, t.title] as const)));
  const KIND: Record<string, string> = {
    student_done: "Öğrenci tamamladı", teacher_checked: "Eğitmen kontrol etti",
    help: "Yardım istendi", blocked: "Yardım istendi", reopened: "Yeniden açıldı"
  };

  return <>
    <section className="panel">
      <div className="panel-heading"><h2>Çalışma geçmişi</h2>
        <span className="note">{events.length} kayıt</span></div>
      {events.length === 0
        ? <p className="empty">Henüz işaretlenmiş görev yok.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Ne zaman</th><th>Görev</th><th>Ne oldu</th><th>Not</th></tr></thead>
          <tbody>{events.map((e, i) => <tr key={i}>
            <td>{stamp.format(new Date(e.createdAt))}</td>
            <th scope="row">{titleOf.get(e.taskId) ?? "—"}</th>
            <td>{KIND[e.kind] ?? e.kind}</td>
            <td>{e.note ?? "—"}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    <section className="panel">
      <div className="panel-heading"><h2>Plan sürümleri</h2>
        <span className="note">Onaylanan hiçbir sürüm silinmez</span></div>
      {plans.length === 0 ? <p className="empty">Bu öğrenci için plan hazırlanmamış.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Hafta</th><th>Sürüm</th><th>Durum</th><th>Görev</th>
            <th>Dakika</th><th></th></tr></thead>
          <tbody>{plans.map(p => <tr key={p.id}>
            <td>{day(p.weekStart)}</td><td>{p.version}</td>
            <td>{p.status === "approved" ? "Onaylı" : p.status === "draft" ? "Taslak" : "Arşiv"}</td>
            <td>{p.tasks.filter(t => t.status !== "cancelled").length}</td>
            <td>{p.tasks.reduce((t, x) => t + x.minutes, 0)}</td>
            <td><Link href={`/workspace/plans/${p.id}`}>Aç</Link></td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </>;
}

/** Gelişim: risk değişimi, görev gerçekleşmesi ve beceri değişimi — ayrı ayrı.
 *
 *  Three numbers that used to be one story. A falling risk score is not evidence
 *  that a plan worked, a finished task is not evidence that anything was learned,
 *  and only the third block — the same criterion, measured again under the same
 *  rubric — can speak to the question the institution actually cares about.
 */
export async function Progress({ client, studentId }: {
  client: SupabaseClient; studentId: string;
}) {
  const [snapshots, plans, byStudent] = await Promise.all([
    client.from("risk_snapshots").select("period_end,risk_score,risk_level")
      .eq("student_id", studentId).order("period_end", { ascending: false }).limit(6),
    loadPlans(client, { studentId }),
    loadAssessments(client, [studentId])
  ]);
  const history = snapshots.data ?? [];
  const assessments = byStudent.get(studentId) ?? [];
  const tasks = plans.filter(p => p.status !== "draft").flatMap(p => p.tasks)
    .filter(t => t.status !== "cancelled");
  const done = tasks.filter(t => t.status === "student_done" || t.status === "teacher_checked").length;
  const checked = tasks.filter(t => t.status === "teacher_checked").length;
  const moved = SKILLS.flatMap(s => criterionTrends(assessments, s)
    .filter(t => t.comparable && t.latest !== null && t.previous !== null)
    .map(t => ({ skill: s, ...t })));

  return <>
    <section className="panel pad">
      <div className="card-hd"><h2>1 · Risk skoru</h2>
        <span className="note">önceliklendirme için</span></div>
      {history.length < 2
        ? <p className="note">Karşılaştırılacak ikinci kesit yok.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Kesit</th><th>Skor</th><th>Durum</th></tr></thead>
          <tbody>{history.map(h => <tr key={h.period_end}>
            <th scope="row">{day(h.period_end)}</th>
            <td>{Number(h.risk_score)}</td><td>{h.risk_level}</td>
          </tr>)}</tbody>
        </table></div>}
      <p className="note">Risk skorunun düşmesi öğrenmenin kanıtı değildir: skor, devam
        düzeldiğinde de, eksik bir boyut ölçüldüğünde de hareket eder. Neyin öğrenildiği
        üçüncü bölümde okunur.</p>
    </section>

    <section className="panel pad">
      <div className="card-hd"><h2>2 · Görev gerçekleşmesi</h2>
        <span className="note">yapılan iş</span></div>
      <p className="big-line"><span className="big">{done}/{tasks.length}</span>
        <span className="note">onaylı planlardaki görevlerden tamamlandı</span></p>
      <p className="note">Bunların <b>{checked}</b> tanesini eğitmen kontrol etti. Tamamlanan
        alıştırma ve katılınan oturum, öğrenme kanıtı yerine geçmez.</p>
    </section>

    <section className="panel pad">
      <div className="card-hd"><h2>3 · Beceri değişimi</h2>
        <span className="note">aynı ölçüt, yeni ölçüm</span></div>
      {moved.length === 0
        ? <p className="note">Aynı ölçütle iki kez ölçülmüş bir alt beceri yok. Gelişim
          iddiası için yeniden değerlendirme gerekiyor; plan bunun için bir görev içerir.</p>
        : <ul className="facts">{moved.map(t => <li key={`${t.skill}:${t.code}`}
          className={t.latest! > t.previous! ? "good" : t.latest! < t.previous! ? "crit" : undefined}>
          {SKILL_LABEL[t.skill]} · {t.label}: {t.previous}/{t.scaleMax} → {t.latest}/{t.scaleMax}
          {" "}({day(t.previousOn!)} → {day(t.latestOn!)})
        </li>)}</ul>}
      <p className="note">Bir ölçütte 2/4&apos;ten 3/4&apos;e çıkış, o ölçütte gözlenen bir
        değişimdir; kur atlama veya genel dil seviyesinde artış anlamına gelmez.</p>
    </section>
  </>;
}
