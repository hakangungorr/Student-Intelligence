import type { SupabaseClient } from "@supabase/supabase-js";
import { criterionTrends, loadAssessments } from "@/lib/assessments";
import { RUBRIC_WARNING } from "@/lib/library-seed";
import { RUBRIC_VERSION, SKILLS, SKILL_LABEL, bandLabel, dayText } from "@/lib/rubric";
import { AssessForm } from "./assess-form";

/** Ölçümler sekmesi: ne değişti, ne ölçüldü, yeni ölçüm.
 *
 *  "Ne değişti" comes first because it is the question the whole plan exists to
 *  answer, and it is the only place it is answered: the same criterion, measured
 *  twice, under the same rubric. A score next to its date and task reads as one
 *  observation somebody can repeat; an unmeasured criterion says so and is never
 *  drawn as a low score.
 */
export async function MeasureTab({ client, studentId, today, canMeasure }: {
  client: SupabaseClient; studentId: string; today: string; canMeasure: boolean;
}) {
  const assessments = (await loadAssessments(client, [studentId])).get(studentId) ?? [];
  const changes = SKILLS.flatMap(skill => criterionTrends(assessments, skill)
    .filter(t => t.comparable && t.latest !== null && t.previous !== null)
    .map(t => ({ skill, ...t })));

  return <>
    <section className="panel pad">
      <div className="card-hd"><h2>Ne değişti</h2>
        <span className="note">aynı ölçüt · iki ölçüm</span></div>
      {changes.length === 0
        ? <p className="note">{assessments.length === 0
          ? "Henüz ölçüm yok."
          : "Aynı ölçütle iki kez ölçülmüş bir alt beceri yok. Değişim, kontrol ölçümünden sonra burada görünür."}</p>
        : <ul className="facts">{changes.map(t => <li key={`${t.skill}:${t.code}`}
          className={t.latest! > t.previous! ? "good" : t.latest! < t.previous! ? "crit" : undefined}>
          <b>{SKILL_LABEL[t.skill]} · {t.label}</b>: {t.previous}/{t.scaleMax} → {t.latest}/{t.scaleMax}
          {" "}<span className="note">({dayText(t.previousOn!)} → {dayText(t.latestOn!)})</span>
        </li>)}</ul>}
      <p className="note">Bir ölçütte 2/4&apos;ten 3/4&apos;e çıkış, o ölçütte gözlenen bir
        değişimdir; kur atlama ya da genel seviye artışı anlamına gelmez. Risk skorunun düşmesi
        de, görevlerin yapılmış olması da bunun yerine geçmez.</p>
    </section>

    {canMeasure && <AssessForm studentId={studentId} today={today} open={assessments.length === 0} />}

    <section className="panel pad">
      <div className="card-hd"><h2>Ölçütlere göre son durum</h2>
        <span className="note">{assessments.length} ölçüm</span></div>
      {SKILLS.map(skill => {
        const trends = criterionTrends(assessments, skill);
        const measured = trends.some(t => t.latest !== null);
        return <div key={skill} className="skill-block">
          <h3 className="sub-hd">{SKILL_LABEL[skill]}</h3>
          {!measured
            ? <p className="note">Ölçülmedi. Bu bir zayıflık kaydı değil.</p>
            : <div className="table-scroll"><table>
              <thead><tr><th>Ölçüt</th><th>Son</th><th>Önceki</th><th>Ne zaman · hangi görevde</th></tr></thead>
              <tbody>{trends.map(t => <tr key={t.code}>
                <th scope="row">{t.label}<small>{t.hint}</small></th>
                <td>{t.latest === null ? <span className="note">ölçülmedi</span>
                  : <>{t.latest}/{t.scaleMax} <small>{bandLabel(t.latest, t.scaleMax)}</small></>}</td>
                <td>{t.previous !== null ? `${t.previous}/${t.scaleMax}`
                  : <span className="note">{t.readings > 1 ? "farklı ölçütle" : "—"}</span>}</td>
                <td>{t.latestOn ? `${dayText(t.latestOn)} · ${t.latestTask}` : "—"}</td>
              </tr>)}</tbody>
            </table></div>}
        </div>;
      })}
      <p className="note">{RUBRIC_WARNING}</p>
    </section>

    {assessments.length > 0 && <details className="panel pad">
      <summary><b>Bütün ölçümler</b> <span className="note">— hiçbiri silinmez</span></summary>
      <div className="table-scroll"><table>
        <thead><tr><th>Tarih</th><th>Beceri</th><th>Görev</th><th>Puanlar</th></tr></thead>
        <tbody>{assessments.map(a => <tr key={a.id}>
          <td>{dayText(a.assessedOn)}</td>
          <td>{SKILL_LABEL[a.skill]}</td>
          <th scope="row">{a.taskLabel}{a.note && <small>{a.note}</small>}
            {a.rubricVersion !== RUBRIC_VERSION && <small>eski ölçüt sürümü: {a.rubricVersion}</small>}</th>
          <td>{a.scores.map(s => `${s.label} ${s.score}/${a.scaleMax}`).join(" · ")}</td>
        </tr>)}</tbody>
      </table></div>
    </details>}
  </>;
}
