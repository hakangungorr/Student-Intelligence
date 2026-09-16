import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadStudent } from "@/lib/student";
import { criterionTrends, loadAssessments } from "@/lib/assessments";
import { loadPlans } from "@/lib/plan";
import { SKILLS, SKILL_LABEL, dayText, ownerLabel, todayIso } from "@/lib/rubric";
import { AudienceForm } from "./form";

/** Gelişim raporu — üretmek, göndermek değildir.
 *
 *  The page prints. It does not email, share or publish: a report about a named
 *  student leaving the institution is a decision a person makes.
 *
 *  Three sections, and they are kept apart on purpose — what was done, what was
 *  measured, what comes next. Written to the student by default; a guardian
 *  version exists for younger learners and has to be chosen.
 */
export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await requireUser();
  const s = await loadStudent(client, id);
  if (!s) notFound();
  const [audienceRow, byPlan, byStudent] = await Promise.all([
    client.from("students").select("report_audience").eq("id", id).maybeSingle(),
    loadPlans(client, [id]), loadAssessments(client, [id])
  ]);
  const audience = (audienceRow.data?.report_audience as "student" | "guardian") ?? "student";
  const plans = byPlan.get(id) ?? [];
  const assessments = byStudent.get(id) ?? [];

  const done = plans.flatMap(p => p.tasks).filter(t => t.status === "done" && t.kind !== "staff");
  const changes = SKILLS.flatMap(skill => criterionTrends(assessments, skill)
    .filter(t => t.comparable && t.latest !== null && t.previous !== null)
    .map(t => ({ skill, ...t })));
  const open = plans.find(p => p.status === "open") ?? null;
  const next = (open?.tasks ?? []).filter(t => t.status !== "done" && t.kind !== "staff");
  const guardian = audience === "guardian";

  return <>
    <Link className="backlink no-print" href={`/workspace/students/${id}`}>← Öğrenci kartına dön</Link>
    <div className="no-print">
      <AudienceForm studentId={id} audience={audience} />
      <p className="note">Bu ekran yalnızca rapor üretir; dışarıya göndermez. Yazdırıp elden ya da
        kurumun kendi kanalıyla iletin.</p>
    </div>

    <article className="panel pad report">
      <p className="eyebrow">GELİŞİM RAPORU · {dayText(todayIso())}</p>
      <h1>{s.name}</h1>
      <p className="note">{s.branch} şubesi · {s.level} kuru
        {s.teacher && <> · Eğitmen {s.teacher}</>} · {guardian ? "Veliye" : "Öğrenciye"} yazılmıştır</p>

      <h2>1 · Ne çalışıldı</h2>
      {done.length === 0
        ? <p>Henüz tamamlanmış bir çalışma yok.</p>
        : <>
          <p>{guardian ? "Öğrenci" : "Siz"} <b>{done.length} çalışma</b> tamamladı{guardian ? "" : "nız"}.</p>
          <ul className="plain-list">{done.slice(0, 10).map(t => <li key={t.id}>
            <b>{t.title}</b>
            <small>{t.minutes ? `${t.minutes} dk` : ""}{t.item?.kind === "event" ? " · etkinlik" : ""}</small>
          </li>)}</ul>
        </>}

      <h2>2 · Ne ölçüldü, ne değişti</h2>
      {changes.length === 0
        ? <p>Aynı ölçütle iki kez ölçülmüş bir beceri henüz yok, bu yüzden bu raporda bir gelişim
          iddiası yer almıyor.</p>
        : <ul className="plain-list">{changes.map(t => <li key={`${t.skill}:${t.code}`}>
          <b>{SKILL_LABEL[t.skill]} — {t.label}: {t.previous}/{t.scaleMax} → {t.latest}/{t.scaleMax}</b>
          <small>{dayText(t.previousOn!)} → {dayText(t.latestOn!)} · son ölçüm: {t.latestTask}</small>
        </li>)}</ul>}
      {changes.length > 0 && <p className="note">Bu değişim adı geçen ölçütte gözlenmiştir; kur
        atlama ya da genel seviye artışı anlamına gelmez. Kur kararı akademik değerlendirmeyle
        verilir.</p>}

      <h2>3 · Sırada ne var</h2>
      {!open || next.length === 0
        ? <p>Şu an açık bir çalışma yok.</p>
        : <>
          <p>Bir sonraki kontrol {dayText(open.checkOn)}. O zamana kadar:</p>
          <ul className="plain-list">{next.map(t => <li key={t.id}>
            <b>{t.title}</b>
            <small>{ownerLabel(t.owner)}{t.minutes ? ` · ${t.minutes} dk` : ""}
              {t.dueOn ? ` · ${dayText(t.dueOn, true)}` : ""}
              {t.expectedOutput ? ` · ${t.expectedOutput}` : ""}</small>
          </li>)}</ul>
        </>}

      <h2>Bu rapor neyi söylemez</h2>
      <ul className="plain-list">
        <li>Tamamlanan çalışma ve katılınan etkinlik, öğrenmenin kanıtı değildir.</li>
        <li>Risk skoru bu raporda yer almaz; o kurum içi bir önceliklendirme aracıdır.</li>
        <li>Ölçülmemiş bir beceri hakkında iyi ya da kötü bir şey söylenmez.</li>
        <li>Farklı ölçütlerle alınmış puanlar karşılaştırılmaz.</li>
      </ul>
    </article>
  </>;
}
