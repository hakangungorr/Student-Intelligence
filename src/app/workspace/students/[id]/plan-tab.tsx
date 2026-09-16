import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planContext } from "@/lib/plan-context";
import { loadPlanEvents, type Plan, type Suggestion } from "@/lib/plan";
import {
  dayText, ownerLabel, programLabel, statusLabel, statusTone, todayIso
} from "@/lib/rubric";
import {
  AddSuggestion, ClosePlanForm, OpenPlanForm, OwnTaskForm, PlanSettingsForm,
  PrintButton, TaskButtons, type SuggestionView
} from "./plan-forms";

const clock = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });
const view = (s: Suggestion): SuggestionView => ({
  key: s.key, title: s.title, why: s.why, owner: s.owner,
  minutes: s.minutes, note: s.note, full: s.full, kind: s.kind
});
const EVENT_WORD: Record<string, string> = {
  opened: "Plan açıldı", closed: "Plan kapatıldı", added: "Eklendi", removed: "Çıkarıldı",
  done: "Yapıldı", stuck: "Takıldı", reopened: "Geri alındı"
};

/** Plan sekmesi: açık plan varsa listesi, yoksa açma formu.
 *
 *  Everything a person does with a plan happens here. There is no queue to go
 *  to and no draft to approve: adding a task is the decision.
 */
export async function PlanTab({ client, studentId, canPlan }: {
  client: SupabaseClient; studentId: string; canPlan: boolean;
}) {
  const ctx = await planContext(client, studentId);
  if (!ctx) return null;
  const { open, suggestions, plans, assessments } = ctx;
  const past = plans.filter(p => p.status === "closed");
  const today = todayIso();

  return <>
    {!open ? <section className="panel pad">
      <div className="card-hd"><h2>Açık plan yok</h2></div>
      {assessments.length === 0 && <div className="callout">
        <b>Önce ölçüm.</b> Bu öğrencinin tarihli bir beceri ölçümü yok, o yüzden plan neyin
        çalışılacağını henüz söyleyemez. <Link href={`/workspace/students/${studentId}?g=olcum`}>
        Ölçümler</Link> sekmesinden bir ölçüm girin — öneriler ona göre gelir. Personel işleri
        (görüşme, arama) için planı şimdi de açabilirsiniz.</div>}
      {canPlan
        ? <OpenPlanForm studentId={studentId} suggestions={suggestions.items.map(view)}
          checkOn={ctx.checkOn} today={today} />
        : <p className="note">Plan açma yetkiniz yok.</p>}
    </section> : <OpenPlan plan={open} studentId={studentId} canPlan={canPlan}
      suggestions={suggestions.items} needs={suggestions.needs.length} />}

    <PlanHistory client={client} studentId={studentId} />

    {past.length > 0 && <section className="panel">
      <div className="panel-heading"><h2>Önceki planlar</h2>
        <span className="note">Kapatılan planlar değiştirilmez</span></div>
      <div className="table-scroll"><table>
        <thead><tr><th>Açıldı</th><th>Kapandı</th><th>Görev</th><th>Yapıldı</th>
          <th>Kontrol ölçümü</th><th>Not</th></tr></thead>
        <tbody>{past.map(p => {
          const check = p.tasks.find(t => t.kind === "check");
          return <tr key={p.id}>
            <td>{dayText(p.openedAt.slice(0, 10))}</td>
            <td>{p.closedAt ? dayText(p.closedAt.slice(0, 10)) : "—"}</td>
            <td>{p.tasks.length}</td>
            <td>{p.tasks.filter(t => t.status === "done").length}</td>
            <td>{check?.status === "done" ? "Yapıldı" : "Yapılmadı"}</td>
            <td>{p.closeNote ?? "—"}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>}
  </>;
}

function OpenPlan({ plan, studentId, canPlan, suggestions, needs }: {
  plan: Plan; studentId: string; canPlan: boolean; suggestions: Suggestion[]; needs: number;
}) {
  const done = plan.tasks.filter(t => t.status === "done").length;
  const stuck = plan.tasks.filter(t => t.status === "stuck").length;
  const minutes = plan.tasks.filter(t => t.owner === "student")
    .reduce((sum, t) => sum + (t.minutes ?? 0), 0);
  const overdue = plan.checkOn < todayIso();
  const checkDone = plan.tasks.some(t => t.kind === "check" && t.status === "done");

  return <>
    <section className="panel pad plan-sheet">
      <div className="card-hd">
        <div><h2>Açık plan</h2>
          <p className="note">{dayText(plan.openedAt.slice(0, 10))} tarihinde açıldı ·
            kontrol <b className={overdue ? "crit-ink" : undefined}>{dayText(plan.checkOn)}</b>
            {overdue && " (geçti)"}</p></div>
        <PrintButton />
      </div>
      <div className="plan-stats">
        <span><b>{done}/{plan.tasks.length}</b> görev yapıldı</span>
        {stuck > 0 && <span className="crit-ink"><b>{stuck}</b> görevde takıldı</span>}
        <span className={minutes > plan.weeklyMinutes ? "crit-ink" : undefined}>
          Öğrencinin işi <b>{minutes} dk</b> / haftalık {plan.weeklyMinutes} dk</span>
      </div>

      {plan.tasks.length === 0
        ? <p className="note">Planda görev yok. Aşağıdaki önerilerden ekleyin ya da kendi
          görevinizi yazın.</p>
        : <ul className="plan-list">{plan.tasks.map(t => <li key={t.id} className={`ptask is-${t.status}`}>
          <div className="ptask-hd">
            <span className={`state ${statusTone(t.status)}`}><i className="dot" />{statusLabel(t.status)}</span>
            <b>{t.title}</b>
          </div>
          <p className="note">{ownerLabel(t.owner)}
            {t.minutes && ` · ${t.minutes} dk`}
            {t.dueOn && ` · ${dayText(t.dueOn, true)}`}
            {t.item?.kind === "event" && t.item.startsAt && ` · ${clock.format(new Date(t.item.startsAt))}`}
            {t.item && ` · ${programLabel(t.item.program)}`}
            {t.item?.isSample && " · örnek kayıt"}
            {t.item?.kind === "event" && " · yer ayrıldı"}</p>
          <p className="why">{t.why}</p>
          {t.expectedOutput && <p className="note">Ne çıkmalı: {t.expectedOutput}</p>}
          {t.status === "stuck" && t.note && <p className="note crit-ink">Takıldığı yer: {t.note}</p>}
          {canPlan && <div className="no-print">
            <TaskButtons studentId={studentId} taskId={t.id} status={t.status} />
          </div>}
        </li>)}</ul>}
      <p className="note">“Yapıldı” işin yapıldığını söyler; becerinin geliştiğini değil. Onu
        yalnızca kontrol ölçümü gösterir.</p>
    </section>

    {canPlan && <section className="panel pad no-print">
      <div className="card-hd"><h2>Öneriler</h2>
        <span className="note">Güncel ölçüme ve risk değerlendirmesine göre</span></div>
      {suggestions.length === 0
        ? <p className="note">{needs === 0
          ? "Şu an eklenecek bir öneri yok. Ölçülen ölçütlerde geride kalan görünmüyor."
          : "Önerilerin hepsi planda."}</p>
        : <div className="sugg-list">{suggestions.map(s =>
          <AddSuggestion key={s.key} studentId={studentId} s={view(s)} />)}</div>}
      <OwnTaskForm studentId={studentId} planId={plan.id} />
      <PlanSettingsForm studentId={studentId} planId={plan.id}
        checkOn={plan.checkOn} weeklyMinutes={plan.weeklyMinutes} />
      <ClosePlanForm studentId={studentId} planId={plan.id} checkDone={checkDone} />
    </section>}
  </>;
}

async function PlanHistory({ client, studentId }: { client: SupabaseClient; studentId: string }) {
  const events = await loadPlanEvents(client, studentId);
  if (!events.length) return null;
  return <details className="panel pad no-print">
    <summary><b>Plan geçmişi</b> <span className="note">— {events.length} kayıt · veritabanı yazar,
      silinmez</span></summary>
    <ul className="history">{events.slice(0, 40).map((e, i) => <li key={i}>
      <span className="note">{clock.format(new Date(e.createdAt))}</span>
      <b>{EVENT_WORD[e.kind] ?? e.kind}</b>{e.note && <span> — {e.note}</span>}
    </li>)}</ul>
  </details>;
}
