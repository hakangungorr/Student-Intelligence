"""Build the staging seed from demo_dataset.json.

    python3 scripts/build_demo_seed.py > demo_seed.sql

The generated file is derived data, not source: regenerate it rather than
committing it. The SQL is re-runnable — it clears the demo rows it owns before
inserting, so the seed can be rebuilt as the dataset changes.

demo_dataset.json stores Turkish with the diacritics stripped ("Melis Dogan",
"sinavin altinda"); dashboard.html repairs it word-by-word at render time. That
belongs at the boundary, not in the product: the repair is applied here so the
database holds correct Turkish and the application never carries a
transliteration table.
"""
import json
import re
import sys

# Word repairs, lifted from dashboard.html's own display-time tables.
WORDS = {
    "ACIL": "ACİL", "Egitmen": "Eğitmen", "egitmen": "eğitmen", "Odev": "Ödev",
    "Sinav": "Sınav", "sinav": "sınav", "sinavda": "sınavda", "sinavin": "sınavın",
    "altinda": "altında", "aramasi": "araması", "degerlendirme": "değerlendirme",
    "degerlendirmesi": "değerlendirmesi", "devamsizlik": "devamsızlık",
    "dusuk": "düşük", "dusus": "düşüş", "endise": "endişe", "gecme": "geçme",
    "gorusmesi": "görüşmesi", "iliskileri": "ilişkileri", "katilim": "katılım",
    "ogrenci": "öğrenci", "oncekinden": "öncekinden", "orani": "oranı",
    "ortalamasi": "ortalaması", "ortalamasinin": "ortalamasının", "plani": "planı",
    "programi": "programı", "tekrari": "tekrarı", "toplantisi": "toplantısı",
    "yukselisde": "yükselişte", "Izmir": "İzmir", "Istanbul": "İstanbul",
}
NAMES = {
    "Aydin": "Aydın", "Ayse": "Ayşe", "Baris": "Barış", "Celik": "Çelik",
    "Cetin": "Çetin", "Dogan": "Doğan", "Erdogan": "Erdoğan", "Ipek": "İpek",
    "Irem": "İrem", "Koc": "Koç", "Ozdemir": "Özdemir", "Ozturk": "Öztürk",
    "Pinar": "Pınar", "Sahin": "Şahin", "Sila": "Sıla", "Simsek": "Şimşek",
    "Tas": "Taş", "Tunc": "Tunç", "Yalcin": "Yalçın", "Yigit": "Yiğit",
    "Yildiz": "Yıldız", "Yilmaz": "Yılmaz",
}


def fix_words(text):
    # Punctuation rides along with the word, so repair the alphabetic run only.
    return re.sub(r"[A-Za-z]+", lambda m: WORDS.get(m.group(), m.group()), text)


def fix_name(text):
    return re.sub(r"[A-Za-z]+", lambda m: NAMES.get(m.group(), m.group()), text)


BRANCH = {"Izmir": "İzmir", "Istanbul": "İstanbul", "Ankara": "Ankara", "Bursa": "Bursa"}
# The weakest skill is stored as the measurement kind it refers to, so the screens
# can join it to student_measurements instead of matching on a display label.
SKILL = {"Speaking": "speaking", "Writing": "writing", "Listening": "listening", "Reading": "reading"}

students = json.load(open("demo_dataset.json"))["students"]

payload = []
for s in students:
    detail = json.loads(json.dumps(s["dimension_detail"]))
    if "weakest" in detail.get("skill", {}):
        detail["skill"]["weakest"] = SKILL.get(detail["skill"]["weakest"], detail["skill"]["weakest"])
    payload.append({
        "sid": s["student_id"], "name": fix_name(s["name"]),
        "branch": BRANCH[s["branch"]], "level": s["level"], "teacher": fix_name(s["teacher"]),
        "sat": s["satisfaction_score"],
        "exam_1": s["exam_1"], "exam_2": s["exam_2"], "exam_3": s["exam_3"], "exam_4": s["exam_4"],
        "speaking": s["speaking_score"], "writing": s["writing_score"],
        "listening": s["listening_score"], "reading": s["reading_score"],
        "att_rate": s["attendance_rate"], "att_recent": s["attendance_recent"],
        "part": s["participation_score"], "hw": s["homework_completion"],
        "concern": s["teacher_concern"],
        "rs": s["risk_score"], "rsr": s["risk_score_raw"], "rl": s["risk_level"],
        "dims": s["dimensions"], "detail": detail,
        "reasons": [fix_words(r) for r in s["risk_reasons"]],
        "action": fix_words(s["recommended_action"]),
        "prs": s["prev_risk_score"], "prl": s["prev_risk_level"],
    })

doc = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("'", "''")

sys.stdout.write(f"""-- ÖRNEK VERİ · American LIFE pilot demosu
-- Kaynak: demo_dataset.json · 100 sentetik öğrenci. Gerçek kurum verisi DEĞİLDİR.
-- Yeniden çalıştırılabilir: kendi yazdığı satırları silip baştan yazar.

begin;

-- Tek kurum beklenir. Aksi hâlde hangi kuruma yazılacağı belirsizdir.
do $$
begin
  if (select count(*) from public.organizations) <> 1 then
    raise exception 'Tam olarak bir kurum bekleniyordu, % bulundu. Seed durduruldu.',
      (select count(*) from public.organizations);
  end if;
  if not exists (select 1 from public.memberships where role = 'org_admin') then
    raise exception 'org_admin uyeligi yok; gozlem kayitlarinin created_by degeri doldurulamaz.';
  end if;
end $$;

-- 0) Önceki seed'in satırlarını temizle. Yabancı anahtar sırasına uyulur.
--    Şubeler ve üyelikler korunur; kurum yapısı seed'in sahibi olduğu veri değil.
delete from public.risk_snapshots;
delete from public.classroom_observations;
delete from public.student_measurements;
delete from public.enrollments;
delete from public.students;

-- 1) Demo dört şubeli. Var olanlar korunur.
insert into public.branches(organization_id, name)
select o.id, v.name
from public.organizations o
cross join (values ('Ankara'), ('Bursa'), ('İstanbul'), ('İzmir')) as v(name)
on conflict (organization_id, name) do nothing;

-- 2) Veriyi tek bir jsonb belgesi olarak al, satırlara aç.
create temp table demo_payload(doc jsonb) on commit drop;
insert into demo_payload values ('{doc}'::jsonb);

create temp table demo_rows on commit drop as
select e.j as j,
       (select id from public.organizations) as org_id,
       (select user_id from public.memberships where role = 'org_admin' limit 1) as admin_id
from demo_payload d, lateral jsonb_array_elements(d.doc) as e(j);

-- 3) Öğrenciler
insert into public.students(organization_id, branch_id, external_id, name, satisfaction_score)
select r.org_id, b.id, r.j->>'sid', r.j->>'name', (r.j->>'sat')::smallint
from demo_rows r
join public.branches b on b.organization_id = r.org_id and b.name = r.j->>'branch';

-- 4) Kur kayıtları. teacher_id boş: eğitmenlerin Auth hesabı yok, isim etiket olarak taşınıyor.
insert into public.enrollments(organization_id, branch_id, student_id, level, teacher_name, starts_on, active)
select r.org_id, st.branch_id, st.id, r.j->>'level', r.j->>'teacher', date '2026-06-01', true
from demo_rows r
join public.students st on st.organization_id = r.org_id and st.external_id = r.j->>'sid';

-- 5) Ölçümler. Sınav tarihleri demo verisinde yok; iki hafta arayla üretildi.
insert into public.student_measurements(organization_id, branch_id, student_id, measured_on, kind, value, source_reference)
select r.org_id, st.branch_id, st.id, m.measured_on, m.kind, (r.j->>m.key)::numeric, m.src
from demo_rows r
join public.students st on st.organization_id = r.org_id and st.external_id = r.j->>'sid'
cross join (values
  ('exam',       'exam_1',          'exam_1',     date '2026-07-14'),
  ('exam',       'exam_2',          'exam_2',     date '2026-07-28'),
  ('exam',       'exam_3',          'exam_3',     date '2026-08-11'),
  ('exam',       'exam_4',          'exam_4',     date '2026-08-25'),
  ('speaking',   'skill_profile',   'speaking',   date '2026-09-01'),
  ('writing',    'skill_profile',   'writing',    date '2026-09-01'),
  ('listening',  'skill_profile',   'listening',  date '2026-09-01'),
  ('reading',    'skill_profile',   'reading',    date '2026-09-01'),
  ('attendance', 'term_rate',       'att_rate',   date '2026-09-08'),
  ('attendance', 'last_four_weeks', 'att_recent', date '2026-09-08')
) as m(kind, src, key, measured_on);

-- 6) Sınıf içi gözlemler. created_by açıkça veriliyor: sunucu tarafı aktarımda
--    auth.uid() bos doner ve varsayilan deger not null kisitina takilir.
insert into public.classroom_observations(organization_id, branch_id, student_id, observed_on, participation, homework_completion, teacher_concern, created_by)
select r.org_id, st.branch_id, st.id, date '2026-09-08',
       (r.j->>'part')::smallint, (r.j->>'hw')::numeric, (r.j->>'concern')::boolean, r.admin_id
from demo_rows r
join public.students st on st.organization_id = r.org_id and st.external_id = r.j->>'sid';

-- 7) Risk anlık görüntüleri. İki hafta: değişim KPI'ları ("geçen hafta 15, bu hafta 20")
--    tek zaman noktasıyla hesaplanamaz.
insert into public.risk_snapshots(organization_id, branch_id, student_id, period_end, engine_version, risk_score, risk_score_raw, risk_level, dimensions, dimension_detail, reasons, recommended_action)
select r.org_id, st.branch_id, st.id, date '2026-09-08', 'v0.4',
       (r.j->>'rs')::numeric, (r.j->>'rsr')::numeric, (r.j->>'rl')::public.risk_level,
       r.j->'dims', r.j->'detail', r.j->'reasons', r.j->>'action'
from demo_rows r
join public.students st on st.organization_id = r.org_id and st.external_id = r.j->>'sid';

-- Önceki hafta: demo verisinde yalnızca skor ve seviye var. Boyut kırılımı ve
-- nedenler taşınmadığı için boş bırakıldı; uydurulmuş değer yazılmadı.
insert into public.risk_snapshots(organization_id, branch_id, student_id, period_end, engine_version, risk_score, risk_score_raw, risk_level, dimensions, dimension_detail, reasons, recommended_action)
select r.org_id, st.branch_id, st.id, date '2026-09-01', 'v0.4',
       (r.j->>'prs')::numeric, (r.j->>'prs')::numeric, (r.j->>'prl')::public.risk_level,
       '{{}}'::jsonb, null, '[]'::jsonb,
       'Gecmis hafta anlik goruntusu: yalnizca skor ve seviye tasindi.'
from demo_rows r
join public.students st on st.organization_id = r.org_id and st.external_id = r.j->>'sid';

commit;
""")
