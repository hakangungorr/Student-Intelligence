import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadStudent } from "@/lib/student";
import { criterionTrends, loadAssessments } from "@/lib/learning";
import { loadPlans, thisWeek } from "@/lib/plan";
import { SKILLS, SKILL_LABEL, ownerLabel, taskStateLabel } from "@/lib/rubric";
import { AudienceForm } from "./form";

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(y, m - 1, d));
};

/** Gelişim raporu — üretmek, göndermek değildir.
 *
 *  The page prints. It does not email, share or publish, and that separation is
 *  deliberate: a report about a named student leaving the institution is a
 *  decision a person makes, not a side effect of opening a screen.
 *
 *  Written to the student by default. A guardian version exists for the
 *  children's and teenagers' programmes and has to be chosen; nothing promotes
 *  an adult's own report into a report about them.
 */
export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await requireUser();
  const s = await loadStudent(client, id);
  if (!s) notFound();
  const audienceRow = await client.from("students")
    .select("report_audience").eq("id", id).maybeSingle();
  const audience = (audienceRow.data?.report_audience as "student" | "guardian") ?? "student";

  const [plans, byStudent] = await Promise.all([
    loadPlans(client, { studentId: id }), loadAssessments(client, [id])
  ]);
  const assessments = byStudent.get(id) ?? [];
  const live = plans.filter(p => p.status === "approved");
  const tasks = live.flatMap(p => p.tasks).filter(t => t.status !== "cancelled");
  const done = tasks.filter(t => t.status === "student_done" || t.status === "teacher_checked");
  const checked = tasks.filter(t => t.status === "teacher_checked");
  const moved = SKILLS.flatMap(skill => criterionTrends(assessments, skill)
    .filter(t => t.comparable && t.latest !== null && t.previous !== null)
    .map(t => ({ skill, ...t })));
  const week = thisWeek();
  const next = plans.find(p => p.weekStart >= week && p.status === "approved")
    ?? plans.find(p => p.status === "approved") ?? null;

  const you = audience === "guardian" ? "Öğrencinin" : "Sizin";
  const subject = audience === "guardian" ? s.name : "Siz";

  return <>
    <Link className="backlink no-print" href={`/workspace/students/${id}`}>← Öğrenci kartına dön</Link>
    <div className="no-print">
      <AudienceForm studentId={id} audience={audience} />
      <p className="note">Bu ekran yalnızca rapor üretir. Dışarıya gönderme işlemi ayrıdır ve
        bu üründe yoktur; raporu yazdırıp elden veya kurumun kendi kanalıyla iletin.</p>
    </div>

    <article className="panel pad report">
      <p className="eyebrow">GELİŞİM RAPORU · {day(new Date().toISOString().slice(0, 10))}</p>
      <h1>{s.name}</h1>
      <p className="note">{s.branch} şubesi · {s.level} kuru
        {s.teacher && <> · Eğitmen {s.teacher}</>} ·{" "}
        {audience === "guardian" ? "Veliye yazılmıştır" : "Öğrenciye yazılmıştır"}</p>

      <h2>Bu dönemde ne çalışıldı</h2>
      {tasks.length === 0
        ? <p>Onaylanmış bir haftalık plan bulunmuyor.</p>
        : <>
          <p>{you} onaylı planında <b>{tasks.length} görev</b> vardı; bunların{" "}
            <b>{done.length} tanesi</b> tamamlandı, <b>{checked.length} tanesi</b> eğitmen
            tarafından kontrol edildi.</p>
          <ul className="report-list">{done.slice(0, 8).map(t => <li key={t.id}>
            <b>{t.title}</b><small>{day(t.scheduledOn)} · {t.minutes} dk ·{" "}
              {ownerLabel(t.owner)} · {taskStateLabel(t.status)}</small></li>)}</ul>
        </>}

      <h2>Ne ölçüldü, ne değişti</h2>
      {moved.length === 0
        ? <p>Aynı ölçütlerle iki kez ölçülmüş bir alt beceri henüz yok. Bu yüzden bu raporda
          bir gelişim iddiası yer almıyor — ölçülmeden söylenmemesi gereken tek şey budur.</p>
        : <ul className="report-list">{moved.map(t => <li key={`${t.skill}:${t.code}`}>
          <b>{SKILL_LABEL[t.skill]} — {t.label}</b>
          <small>{t.previousOn && day(t.previousOn)}: {t.previous}/{t.scaleMax} →{" "}
            {t.latestOn && day(t.latestOn)}: {t.latest}/{t.scaleMax}
            {t.latestTask && <> · {t.latestTask}</>}</small></li>)}</ul>}
      {moved.length > 0 && <p className="note">Bu değişim, adı geçen ölçütte ve o görevlerde
        gözlenmiştir. Kur atlama veya genel dil seviyesinde bir artış anlamına gelmez; kur
        kararı akademik değerlendirmeyle verilir.</p>}

      <h2>Sırada ne var</h2>
      {!next ? <p>Sonraki hafta için onaylanmış plan yok.</p> : <>
        <p>{subject} {day(next.weekStart)} haftasında {next.tasks.length} görev üzerinde
          çalışacak{audience === "guardian" ? "" : "sınız"}; toplam{" "}
          {next.tasks.reduce((t, x) => t + x.minutes, 0)} dakika.</p>
        <ul className="report-list">{next.tasks.map(t => <li key={t.id}>
          <b>{t.title}</b><small>{day(t.scheduledOn)} · {t.minutes} dk · {t.expectedOutput}</small>
        </li>)}</ul>
      </>}

      <h2>Bu rapor neyi söylemez</h2>
      <ul className="report-list">
        <li>Tamamlanan görev ve katılınan oturum, öğrenmenin kanıtı değildir.</li>
        <li>Risk skorundaki değişim bu raporda yer almaz; o bir önceliklendirme aracıdır.</li>
        <li>Ölçülmemiş bir beceri hakkında iyi ya da kötü bir şey söylenmez.</li>
        <li>Farklı ölçütlerle alınmış puanlar birbiriyle karşılaştırılmaz.</li>
      </ul>
    </article>
  </>;
}
