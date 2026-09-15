-- Ölçümden aksiyona: kanıt, plan, görev ve yeniden değerlendirme.
--
-- The risk engine answers "who first". It cannot answer "what should this
-- student do on Tuesday, and what changed afterwards", and no amount of
-- re-weighting the four dimensions will make it: a speaking score of 22 is a
-- summary, and you cannot plan a week against a summary. What is missing is the
-- layer underneath — which sub-skill, measured on which task, against which
-- criteria, on which date.
--
-- Everything here is additive. The agenda, the snapshots and the four dimensions
-- keep working exactly as they did; a school that never opens the plan screens
-- loses nothing.
--
-- The sub-skills, rubrics and resources this migration can hold are the
-- institution's to define. The pilot catalogue seeded from the application is
-- marked as a sample and says so on screen, because claiming ART content the
-- product has never seen would be the one lie that ends a pilot.

create function private.is_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m
    where m.user_id = (select auth.uid()) and m.organization_id = org);
$$;
revoke all on function private.is_member(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated;


-- Bir becerinin altındaki, öğretilebilir ve ölçülebilir birim.
--
-- "Konuşma" is not something a week's work can move; "geçmiş olayları anlatırken
-- hedef yapıyı tutarlı kullanmak" is. Carrying a curriculum version means a
-- re-assessment can be required to use the same wording the first one used —
-- comparing a student against a rewritten objective is not a comparison.
create table public.learning_objectives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  language text not null default 'İngilizce' check(length(trim(language)) between 1 and 60),
  level text not null check(length(trim(level)) between 1 and 20),
  skill text not null check(skill in ('speaking','writing','listening','reading')),
  code text not null check(length(trim(code)) between 1 and 60),
  label text not null check(length(trim(label)) between 1 and 300),
  curriculum_version text not null default 'pilot-taslak'
    check(length(trim(curriculum_version)) between 1 and 60),
  -- False until the institution confirms this is theirs. Every screen that shows
  -- an objective shows this with it.
  confirmed boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id, curriculum_version, code)
);
create index learning_objectives_scope on public.learning_objectives(organization_id, level, skill) where active;

-- Tarihli değerlendirme olayı. Yeni ölçüm eskisini ezmez.
--
-- student_measurements keys on (student, kind, source_reference) and an import
-- updates the row in place, so the skill profile is a single current number with
-- no history: the second measurement of speaking destroys the evidence the first
-- plan was built on, and "did the support work" becomes unanswerable. Here every
-- assessment is its own row with its own date, and nothing overwrites anything.
--
-- The summary numbers on student_measurements stay where they are. They are not
-- back-filled into sub-skill history — inventing a per-criterion breakdown for a
-- score that was recorded as one number would be fabricating evidence.
create table public.skill_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  assessed_on date not null,
  skill text not null check(skill in ('speaking','writing','listening','reading')),
  objective_id uuid references public.learning_objectives(id),
  -- Which task produced this. "Konuşma 2/4" with no task behind it is a number
  -- somebody remembers, not an observation somebody can repeat.
  task_label text not null check(length(trim(task_label)) between 1 and 300),
  rubric_version text not null check(length(trim(rubric_version)) between 1 and 60),
  -- Scores are only comparable inside one scale and one rubric version, so both
  -- travel with every result and the screens refuse to compare across them.
  scale_max smallint not null default 4 check(scale_max between 2 and 100),
  source text not null default 'teacher' check(source in ('teacher','import','sample')),
  note text check(length(note) <= 2000),
  assessed_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(organization_id,branch_id,student_id)
    references public.students(organization_id,branch_id,id)
);
create index skill_assessments_student_idx on public.skill_assessments(student_id, assessed_on desc);

create table public.skill_assessment_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.skill_assessments(id) on delete cascade,
  -- Denormalised so the row can be judged by the same student policy as every
  -- other table here, without a join inside the policy.
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  criterion_code text not null check(length(trim(criterion_code)) between 1 and 60),
  criterion_label text not null check(length(trim(criterion_label)) between 1 and 200),
  score numeric not null check(score >= 0),
  unique(assessment_id, criterion_code),
  foreign key(organization_id,branch_id,student_id)
    references public.students(organization_id,branch_id,id)
);
create index skill_assessment_scores_lookup on public.skill_assessment_scores(student_id, criterion_code);


-- Kurumun içeriği ve destek oturumları.
--
-- is_sample is the honest default: anything this application put in the
-- catalogue is an example until somebody at the institution says otherwise. A
-- plan that points a student at sample content says so on the student's own
-- screen, so nobody walks to a Guided Practice session that does not exist.
create table public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null check(length(trim(title)) between 1 and 300),
  kind text not null check(kind in ('art','guided_practice','more','other')),
  level text check(level is null or length(trim(level)) between 1 and 20),
  skill text check(skill is null or skill in ('speaking','writing','listening','reading')),
  objective_id uuid references public.learning_objectives(id),
  minutes smallint not null check(minutes between 5 and 240),
  reference text check(reference is null or length(trim(reference)) between 1 and 500),
  is_sample boolean not null default true,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index learning_resources_match on public.learning_resources(organization_id, skill, level) where active;

create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  title text not null check(length(trim(title)) between 1 and 300),
  kind text not null check(kind in ('guided_practice','more','other')),
  level text check(level is null or length(trim(level)) between 1 and 20),
  skill text check(skill is null or skill in ('speaking','writing','listening','reading')),
  starts_at timestamptz not null,
  minutes smallint not null check(minutes between 10 and 240),
  capacity smallint not null check(capacity between 1 and 200),
  resource_id uuid references public.learning_resources(id),
  is_sample boolean not null default true,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(organization_id,branch_id) references public.branches(organization_id,id)
);
create index support_sessions_upcoming on public.support_sessions(organization_id, starts_at) where active;

-- Öneri, rezervasyon ve gerçek katılım ayrı durumlardır.
--
-- Collapsing them is how a product ends up reporting attendance at a session the
-- student was only ever suggested for. 'proposed' is the draft plan's guess,
-- 'reserved' means a seat was actually held, and the last two are what happened.
create table public.session_participations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.support_sessions(id) on delete cascade,
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  status text not null default 'proposed'
    check(status in ('proposed','reserved','attended','absent')),
  note text check(length(note) <= 1000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, student_id),
  foreign key(organization_id,branch_id,student_id)
    references public.students(organization_id,branch_id,id)
);

-- Kapasite dolu bir oturuma rezervasyon yazılamaz.
--
-- Checked in the database rather than in the planner, because the planner is not
-- the only writer: a teacher confirming a seat from the plan screen and a draft
-- generated for another student can reach the same session at the same moment.
-- A capacity that only holds when one process is running is not a capacity.
-- 'proposed' is deliberately free: proposing is not taking a seat.
create function private.session_has_room() returns trigger
language plpgsql security definer set search_path = '' as $$
declare taken integer; room integer;
begin
  if NEW.status not in ('reserved','attended') then return NEW; end if;
  select s.capacity into room from public.support_sessions s where s.id = NEW.session_id;
  if room is null then return NEW; end if;
  select count(*) into taken from public.session_participations p
    where p.session_id = NEW.session_id and p.status in ('reserved','attended') and p.id <> NEW.id;
  if taken >= room then
    raise exception 'Bu oturumda yer kalmadı (kapasite %).', room using errcode = '23514';
  end if;
  return NEW;
end;
$$;
revoke all on function private.session_has_room() from public;
create trigger session_capacity before insert or update on public.session_participations
  for each row execute function private.session_has_room();


-- Öğretmen onaylı haftalık plan, sürümüyle birlikte.
--
-- A plan is a proposal until a teacher approves it, and an approved plan is not
-- edited in place: revising it archives the old version and writes a new one, so
-- "what was approved on Monday" stays answerable after Thursday's change. The
-- partial unique index is what enforces that only one version of a week is live.
--
-- basis carries the evidence the draft was built from — which assessment, which
-- criterion, which date. Without it the plan is an instruction with no reason,
-- and a teacher reviewing forty of them has no way to tell a good one from a
-- confident one.
create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  week_start date not null,
  version smallint not null default 1 check(version between 1 and 200),
  status text not null default 'draft' check(status in ('draft','approved','archived')),
  minutes_budget smallint not null check(minutes_budget between 15 and 1200),
  -- Which evaluation checkpoint's picture this plan answers, so a plan can be
  -- read next to the scores it was built from rather than next to today's.
  source_period_end date,
  basis jsonb not null default '[]'::jsonb check(jsonb_typeof(basis) = 'array'),
  note text check(length(note) <= 4000),
  created_by uuid not null default auth.uid() references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status <> 'approved' or (approved_by is not null and approved_at is not null)),
  unique(student_id, week_start, version),
  foreign key(organization_id,branch_id,student_id)
    references public.students(organization_id,branch_id,id)
);
create unique index study_plans_one_live on public.study_plans(student_id, week_start)
  where status <> 'archived';
create index study_plans_queue on public.study_plans(organization_id, status, week_start);

create table public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.study_plans(id) on delete cascade,
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  position smallint not null check(position between 1 and 50),
  scheduled_on date not null,
  title text not null check(length(trim(title)) between 1 and 300),
  -- Neden seçildi. A task whose reason cannot be written down should not be on
  -- the plan; requiring the column is how that stays true.
  why text not null check(length(trim(why)) between 1 and 600),
  objective_id uuid references public.learning_objectives(id),
  resource_id uuid references public.learning_resources(id),
  session_id uuid references public.support_sessions(id),
  minutes smallint not null check(minutes between 5 and 240),
  owner text not null default 'student'
    check(owner in ('student','teacher','student_relations','coordinator')),
  expected_output text not null check(length(trim(expected_output)) between 1 and 300),
  check_method text not null check(length(trim(check_method)) between 1 and 300),
  -- "Öğrenci tamamladı", "öğretmen kontrol etti" ve "yeniden ölçüldü" ayrı
  -- durumlar: doing the work is not evidence of learning, and a status that
  -- conflates them would let the report claim the second from the first.
  status text not null default 'open'
    check(status in ('open','student_done','teacher_checked','blocked','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, position),
  foreign key(organization_id,branch_id,student_id)
    references public.students(organization_id,branch_id,id)
);
create index study_tasks_plan on public.study_tasks(plan_id, position);
create index study_tasks_student on public.study_tasks(student_id, scheduled_on);

-- Görevde ne olduğu: yapıldı, yardım istendi, kontrol edildi, yeniden açıldı.
create table public.task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.study_tasks(id) on delete cascade,
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  kind text not null check(kind in ('student_done','help','teacher_checked','reopened','blocked','cancelled')),
  note text check(length(note) <= 2000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(organization_id,branch_id,student_id)
    references public.students(organization_id,branch_id,id)
);
create index task_events_task on public.task_events(task_id, created_at desc);

-- Öğrencinin haftalık kapasitesi. Plan buna sığmak zorunda.
create table public.student_availability (
  student_id uuid primary key,
  organization_id uuid not null,
  branch_id uuid not null,
  weekly_minutes smallint not null default 120 check(weekly_minutes between 15 and 1200),
  days text[] not null default array['Pazartesi','Salı','Çarşamba','Perşembe','Cuma'],
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint availability_days_named check(
    cardinality(days) between 0 and 7 and array_position(days, null) is null and '' <> all(days)),
  foreign key(organization_id,branch_id,student_id)
    references public.students(organization_id,branch_id,id)
);

-- Yetişkin öğrencinin raporu kendisinindir.
--
-- Treating every student as a child with a parent behind them is wrong for most
-- of this institution's roster, and it is the kind of wrong that shows up in a
-- printed report addressed to somebody's mother. The audience is a property of
-- the student, it defaults to the student themselves, and a report never
-- promotes itself to a guardian report.
--
-- Guardian *access* is a separate question and is not answered here: no login
-- role, no student_guardians table. Adding an access path the institution has
-- not defined would be schema that lies about what the product can do.
alter table public.students add column report_audience text not null default 'student'
  check(report_audience in ('student','guardian'));


alter table public.learning_objectives enable row level security;
alter table public.skill_assessments enable row level security;
alter table public.skill_assessment_scores enable row level security;
alter table public.learning_resources enable row level security;
alter table public.support_sessions enable row level security;
alter table public.session_participations enable row level security;
alter table public.study_plans enable row level security;
alter table public.study_tasks enable row level security;
alter table public.task_events enable row level security;
alter table public.student_availability enable row level security;

-- The catalogue is institution-wide and read by everyone who works there;
-- writing it recalibrates what every plan may propose, so it follows the same
-- rule as scoring and settings.
create policy read_objectives on public.learning_objectives for select to authenticated
  using(private.is_member(organization_id));
create policy admin_writes_objectives on public.learning_objectives for insert to authenticated
  with check(private.can_score(organization_id));
create policy admin_amends_objectives on public.learning_objectives for update to authenticated
  using(private.can_score(organization_id)) with check(private.can_score(organization_id));

create policy read_resources on public.learning_resources for select to authenticated
  using(private.is_member(organization_id));
create policy admin_writes_resources on public.learning_resources for insert to authenticated
  with check(private.can_score(organization_id) and created_by = (select auth.uid()));
create policy admin_amends_resources on public.learning_resources for update to authenticated
  using(private.can_score(organization_id)) with check(private.can_score(organization_id));

-- A session belongs to a branch and is scheduled by whoever runs that branch.
create policy read_sessions on public.support_sessions for select to authenticated
  using(private.can_access_branch(organization_id, branch_id));
create policy manager_writes_sessions on public.support_sessions for insert to authenticated
  with check(private.can_import_branch(organization_id, branch_id) and created_by = (select auth.uid()));
create policy manager_amends_sessions on public.support_sessions for update to authenticated
  using(private.can_import_branch(organization_id, branch_id))
  with check(private.can_import_branch(organization_id, branch_id));

create policy read_participations on public.session_participations for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));
create policy write_participations on public.session_participations for insert to authenticated
  with check(created_by = (select auth.uid())
    and private.can_manage_student(organization_id, branch_id, student_id));
create policy amend_participations on public.session_participations for update to authenticated
  using(private.can_manage_student(organization_id, branch_id, student_id))
  with check(private.can_manage_student(organization_id, branch_id, student_id));

create policy read_assessments on public.skill_assessments for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));
create policy write_assessments on public.skill_assessments for insert to authenticated
  with check(assessed_by = (select auth.uid())
    and private.can_manage_student(organization_id, branch_id, student_id));
-- No update policy, and that is the design: an assessment is what somebody
-- observed on a day. Changing it later is not a correction, it is a rewrite of
-- the evidence a plan was approved against. A mistake is answered with a new
-- assessment, which is also what the institution would do on paper.
create policy read_assessment_scores on public.skill_assessment_scores for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));
create policy write_assessment_scores on public.skill_assessment_scores for insert to authenticated
  with check(private.can_manage_student(organization_id, branch_id, student_id));

create policy read_plans on public.study_plans for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));
create policy write_plans on public.study_plans for insert to authenticated
  with check(created_by = (select auth.uid())
    and private.can_manage_student(organization_id, branch_id, student_id));
create policy amend_plans on public.study_plans for update to authenticated
  using(private.can_manage_student(organization_id, branch_id, student_id))
  with check(private.can_manage_student(organization_id, branch_id, student_id));

create policy read_tasks on public.study_tasks for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));
create policy write_tasks on public.study_tasks for insert to authenticated
  with check(private.can_manage_student(organization_id, branch_id, student_id));
create policy amend_tasks on public.study_tasks for update to authenticated
  using(private.can_manage_student(organization_id, branch_id, student_id))
  with check(private.can_manage_student(organization_id, branch_id, student_id));

create policy read_task_events on public.task_events for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));
create policy write_task_events on public.task_events for insert to authenticated
  with check(created_by = (select auth.uid())
    and private.can_manage_student(organization_id, branch_id, student_id));

create policy read_availability on public.student_availability for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));
create policy write_availability on public.student_availability for insert to authenticated
  with check(private.can_manage_student(organization_id, branch_id, student_id));
create policy amend_availability on public.student_availability for update to authenticated
  using(private.can_manage_student(organization_id, branch_id, student_id))
  with check(private.can_manage_student(organization_id, branch_id, student_id));

-- Column-level, the same way the roster import was granted: what a row is about
-- may be corrected, which institution and which student it belongs to may not.
grant select, insert on public.learning_objectives, public.learning_resources,
  public.support_sessions, public.session_participations, public.skill_assessments,
  public.skill_assessment_scores, public.study_plans, public.study_tasks,
  public.task_events, public.student_availability to authenticated;
grant update(label, level, skill, active, confirmed) on public.learning_objectives to authenticated;
grant update(title, kind, level, skill, objective_id, minutes, reference, is_sample, active)
  on public.learning_resources to authenticated;
grant update(title, kind, level, skill, starts_at, minutes, capacity, resource_id, is_sample, active)
  on public.support_sessions to authenticated;
grant update(status, note, updated_at) on public.session_participations to authenticated;
grant update(status, note, minutes_budget, approved_by, approved_at, updated_at, basis)
  on public.study_plans to authenticated;
grant update(title, why, objective_id, resource_id, session_id, minutes, owner,
  expected_output, check_method, status, scheduled_on, position, updated_at)
  on public.study_tasks to authenticated;
grant update(weekly_minutes, days, updated_at, updated_by) on public.student_availability to authenticated;
grant update(report_audience) on public.students to authenticated;

-- Approving a plan and closing a task are the two facts this product will be
-- asked to prove later. They go through the same audit trigger the actions
-- table has used since the foundation.
create trigger plans_audit before insert or update on public.study_plans
  for each row execute function private.record_change();
create trigger tasks_audit before insert or update on public.study_tasks
  for each row execute function private.record_change();
create trigger participations_audit before insert or update on public.session_participations
  for each row execute function private.record_change();
