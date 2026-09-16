-- Tek yol: ölç → plan → yap → kontrol ölçümü.
--
-- The first version of the plan layer grew two parallel answers to "what should
-- happen with this student": the agenda's recommendation with its own "yapıldı"
-- buttons, and a weekly study plan with drafts, an approval queue, versions,
-- five task states and four booking states. In use it produced 28 identical
-- drafts, each telling a teacher to measure four skills, because nobody had
-- been measured yet — the planner ran before there was anything to plan from.
--
-- This replaces it with one thing a person can hold in their head:
--
--   * a student has at most one open plan;
--   * a plan is a list of tasks, each with who does it — staff and student
--     work in the same list;
--   * the system suggests tasks, and adding one is the approval;
--   * a task is to do, done, or stuck;
--   * the library is one list of studies and dated events; adding an event to
--     a plan takes a seat, and a full event cannot be added.
--
-- What the first version guaranteed is kept, in fewer moving parts: nothing a
-- student did is edited away (done tasks cannot be removed, and every change is
-- written to plan_events by trigger), evidence is still dated and versioned
-- (skill_assessments is untouched apart from a column that pointed at a table
-- this removes), and a seat is still a database fact rather than a screen's
-- promise.
--
-- The rows dropped here are the 28 untouched test drafts and the pilot's sample
-- catalogue. The catalogue is carried into the library first; the drafts are
-- not, by decision. Their audit_events rows stay — they carry no foreign key.


-- Kütüphane: çalışmalar ve tarihli etkinlikler, tek liste.
--
-- A "session" was only ever a study with a time and a capacity. Two tables, two
-- screens and a separate booking vocabulary were the price of pretending
-- otherwise.
create table public.library_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  -- Null for studies, which the whole institution can use. Required for events,
  -- which happen somewhere.
  branch_id uuid,
  kind text not null check(kind in ('study','event')),
  -- Which of the institution's programmes this belongs to. A label, not an
  -- integration: nothing here talks to ART.
  program text not null default 'other' check(program in ('art','guided_practice','more','other')),
  title text not null check(length(trim(title)) between 1 and 300),
  skill text check(skill is null or skill in ('speaking','writing','listening','reading')),
  level text check(level is null or length(trim(level)) between 1 and 20),
  minutes smallint not null check(minutes between 5 and 240),
  reference text check(reference is null or length(trim(reference)) between 1 and 500),
  starts_at timestamptz,
  capacity smallint check(capacity is null or capacity between 1 and 200),
  -- True until somebody at the institution says the item is theirs. Every
  -- screen that shows one says so.
  is_sample boolean not null default true,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(organization_id, branch_id) references public.branches(organization_id, id),
  constraint event_has_time_place_and_room check(
    kind = 'study' or (starts_at is not null and capacity is not null and branch_id is not null)),
  constraint study_is_not_scheduled check(
    kind = 'event' or (starts_at is null and capacity is null))
);
create index library_items_match on public.library_items(organization_id, kind, skill, level) where active;

insert into public.library_items(organization_id, branch_id, kind, program, title, skill, level,
  minutes, reference, is_sample, active, created_by, created_at)
select organization_id, null, 'study', kind, title, skill, level,
  minutes, reference, is_sample, active, created_by, created_at
from public.learning_resources;

insert into public.library_items(organization_id, branch_id, kind, program, title, skill, level,
  minutes, starts_at, capacity, is_sample, active, created_by, created_at)
select organization_id, branch_id, 'event', kind, title, skill, level,
  minutes, starts_at, capacity, is_sample, active, created_by, created_at
from public.support_sessions;


-- Eskisi. Order follows the foreign keys.
drop table public.session_participations;
drop function private.session_has_room();
drop table public.task_events;
drop table public.study_tasks;
drop table public.study_plans;
drop table public.support_sessions;
drop table public.learning_resources;
-- The rubric criteria already are the sub-skills a week can move; a second
-- catalogue of them was a list nobody could keep in step with the first.
alter table public.skill_assessments drop column objective_id;
drop table public.learning_objectives;
-- Moved onto the plan: how much time a student has is a fact about this stretch
-- of work, and a teacher who plans it has to be able to set it.
drop table public.student_availability;


-- Plan: bir öğrencinin yapılacaklar listesi. En fazla bir açık plan.
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  status text not null default 'open' check(status in ('open','closed')),
  -- The day somebody should look again. Not a deadline for the student; the
  -- control measurement is due by then.
  check_on date not null,
  weekly_minutes smallint not null default 120 check(weekly_minutes between 15 and 1200),
  -- Which risk checkpoint the plan was opened against, so it can be read next to
  -- the picture that prompted it rather than today's.
  source_period_end date,
  opened_by uuid not null default auth.uid() references auth.users(id),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  close_note text check(close_note is null or length(close_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closed_plan_says_when check(status = 'open' or (closed_at is not null and closed_by is not null)),
  foreign key(organization_id, branch_id, student_id)
    references public.students(organization_id, branch_id, id)
);
-- The one rule the whole design rests on.
create unique index plans_one_open on public.plans(student_id) where status = 'open';
create index plans_scope on public.plans(organization_id, status, check_on);

create table public.plan_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  -- work: the student's own study · staff: somebody at the institution acts ·
  -- measure: an assessment is missing · check: the control measurement that
  -- alone may say something changed.
  kind text not null default 'work' check(kind in ('work','staff','measure','check')),
  title text not null check(length(trim(title)) between 1 and 300),
  -- Neden. A task whose reason cannot be written down does not belong here.
  why text not null check(length(trim(why)) between 1 and 600),
  owner text not null default 'student'
    check(owner in ('student','teacher','student_relations','coordinator')),
  minutes smallint check(minutes is null or minutes between 5 and 240),
  due_on date,
  library_item_id uuid references public.library_items(id),
  expected_output text check(expected_output is null or length(trim(expected_output)) between 1 and 300),
  -- Which suggestion this came from, so the same suggestion cannot be added to a
  -- plan twice and disappears from the list once it is in.
  source_key text check(source_key is null or length(source_key) between 1 and 200),
  -- Yapılacak · yapıldı · takıldı. "Done" is the work, never the learning; only a
  -- control measurement speaks to that.
  status text not null default 'todo' check(status in ('todo','done','stuck')),
  -- Why it is stuck, or anything said when it was closed.
  note text check(note is null or length(note) <= 1000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id, branch_id, student_id)
    references public.students(organization_id, branch_id, id)
);
create index plan_tasks_plan on public.plan_tasks(plan_id, created_at);
create unique index plan_tasks_once on public.plan_tasks(plan_id, source_key) where source_key is not null;

-- Etkinlikte ayrılan yer. Satırın varlığı yerin kendisidir.
--
-- One row per student per event, created when the event is added to a plan and
-- removed with the task. There is no status column: a suggestion is not saved,
-- a booking is this row, and attendance is the task being done. Three facts,
-- three places, and none of them a word the screen has to explain.
create table public.library_bookings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.library_items(id) on delete cascade,
  task_id uuid not null unique references public.plan_tasks(id) on delete cascade,
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique(item_id, student_id),
  foreign key(organization_id, branch_id, student_id)
    references public.students(organization_id, branch_id, id)
);

-- Planın geçmişi. Yalnızca tetikleyici yazar.
create table public.plan_events (
  id bigint generated always as identity primary key,
  plan_id uuid not null references public.plans(id) on delete cascade,
  -- No foreign key: the history of a removed task has to outlive the task.
  task_id uuid,
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  kind text not null check(kind in ('opened','closed','added','removed','done','stuck','reopened')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index plan_events_student on public.plan_events(student_id, created_at desc);


-- Kontenjan veritabanında tutulur.
--
-- The item row is locked first, so two teachers adding the last seat at the same
-- moment queue behind each other instead of both reading "one left".
create function private.booking_has_room() returns trigger
language plpgsql security definer set search_path = '' as $$
declare room integer; what text; taken integer;
begin
  select i.capacity, i.kind into room, what from public.library_items i
    where i.id = NEW.item_id for update;
  if what is distinct from 'event' then
    raise exception 'Yalnızca etkinliklerde yer ayrılır.' using errcode = '23514';
  end if;
  select count(*) into taken from public.library_bookings b where b.item_id = NEW.item_id;
  if taken >= room then
    raise exception 'Bu etkinlikte yer kalmadı (kontenjan %).', room using errcode = '23514';
  end if;
  return NEW;
end;
$$;
revoke all on function private.booking_has_room() from public;
create trigger booking_capacity before insert on public.library_bookings
  for each row execute function private.booking_has_room();

-- Geçmiş, uygulamanın hatırlamasına bırakılmaz.
create function private.log_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.plan_events(plan_id, organization_id, branch_id, student_id, kind, created_by)
    values (NEW.id, NEW.organization_id, NEW.branch_id, NEW.student_id, 'opened', (select auth.uid()));
  elsif NEW.status = 'closed' and OLD.status <> 'closed' then
    insert into public.plan_events(plan_id, organization_id, branch_id, student_id, kind, note, created_by)
    values (NEW.id, NEW.organization_id, NEW.branch_id, NEW.student_id, 'closed', NEW.close_note, (select auth.uid()));
  end if;
  return NEW;
end;
$$;
revoke all on function private.log_plan() from public;
create trigger plans_log after insert or update on public.plans
  for each row execute function private.log_plan();

create function private.log_plan_task() returns trigger
language plpgsql security definer set search_path = '' as $$
declare happened text;
begin
  if TG_OP = 'DELETE' then
    insert into public.plan_events(plan_id, task_id, organization_id, branch_id, student_id, kind, note, created_by)
    values (OLD.plan_id, OLD.id, OLD.organization_id, OLD.branch_id, OLD.student_id, 'removed', OLD.title, (select auth.uid()));
    return OLD;
  end if;
  if TG_OP = 'INSERT' then
    happened := 'added';
  elsif NEW.status is distinct from OLD.status then
    happened := case NEW.status when 'done' then 'done' when 'stuck' then 'stuck' else 'reopened' end;
  else
    return NEW;
  end if;
  insert into public.plan_events(plan_id, task_id, organization_id, branch_id, student_id, kind, note, created_by)
  values (NEW.plan_id, NEW.id, NEW.organization_id, NEW.branch_id, NEW.student_id, happened,
    case when happened = 'added' then NEW.title else NEW.note end, (select auth.uid()));
  return NEW;
end;
$$;
revoke all on function private.log_plan_task() from public;
create trigger plan_tasks_log after insert or update or delete on public.plan_tasks
  for each row execute function private.log_plan_task();

-- updated_at and the shared audit trail, as on every other table that changes.
create trigger plans_audit before insert or update on public.plans
  for each row execute function private.record_change();
create trigger plan_tasks_audit before insert or update on public.plan_tasks
  for each row execute function private.record_change();


-- Görev ekleme ve plan açma tek işlemde.
--
-- The first version wrote a plan, then its tasks, then its bookings, in three
-- requests; a failure in the second left a plan with nothing in it. These run as
-- the caller — security invoker — so every insert still passes the same row
-- policies it would pass on its own, and a full event rolls back the task that
-- asked for the seat.
create function public.add_plan_task(p_plan uuid, p_task jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare p record; task_id uuid; item uuid; item_kind text;
begin
  select pl.id, pl.organization_id, pl.branch_id, pl.student_id, pl.status into p
    from public.plans pl where pl.id = p_plan;
  if not found then raise exception 'Plan bulunamadı.'; end if;
  if p.status <> 'open' then raise exception 'Kapalı bir plana görev eklenemez.'; end if;

  item := nullif(p_task->>'library_item_id', '')::uuid;
  insert into public.plan_tasks(plan_id, organization_id, branch_id, student_id, kind, title, why,
    owner, minutes, due_on, library_item_id, expected_output, source_key)
  values (p.id, p.organization_id, p.branch_id, p.student_id,
    coalesce(p_task->>'kind', 'work'), p_task->>'title', p_task->>'why',
    coalesce(p_task->>'owner', 'student'),
    nullif(p_task->>'minutes', '')::smallint, nullif(p_task->>'due_on', '')::date,
    item, nullif(p_task->>'expected_output', ''), nullif(p_task->>'source_key', ''))
  returning id into task_id;

  if item is not null then
    select i.kind into item_kind from public.library_items i where i.id = item;
    if item_kind = 'event' then
      insert into public.library_bookings(item_id, task_id, organization_id, branch_id, student_id)
      values (item, task_id, p.organization_id, p.branch_id, p.student_id);
    end if;
  end if;
  return task_id;
end;
$$;

create function public.open_plan(p_student uuid, p_check_on date, p_weekly_minutes smallint,
  p_period date, p_tasks jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare s record; plan_id uuid; t jsonb;
begin
  select st.organization_id, st.branch_id into s from public.students st where st.id = p_student;
  if not found then raise exception 'Öğrenci bulunamadı.'; end if;
  insert into public.plans(organization_id, branch_id, student_id, check_on, weekly_minutes, source_period_end)
  values (s.organization_id, s.branch_id, p_student, p_check_on, p_weekly_minutes, p_period)
  returning id into plan_id;
  for t in select value from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) loop
    perform public.add_plan_task(plan_id, t);
  end loop;
  return plan_id;
end;
$$;
revoke all on function public.add_plan_task(uuid, jsonb) from public;
revoke all on function public.open_plan(uuid, date, smallint, date, jsonb) from public;
grant execute on function public.add_plan_task(uuid, jsonb) to authenticated;
grant execute on function public.open_plan(uuid, date, smallint, date, jsonb) to authenticated;


alter table public.library_items enable row level security;
alter table public.plans enable row level security;
alter table public.plan_tasks enable row level security;
alter table public.library_bookings enable row level security;
alter table public.plan_events enable row level security;

-- Studies are read institution-wide; an event only by those who can see its
-- branch. Writing a study changes what every plan may suggest, so it is an
-- administrator's; scheduling an event is the branch's.
create policy read_library on public.library_items for select to authenticated
  using(private.is_member(organization_id)
    and (branch_id is null or private.can_access_branch(organization_id, branch_id)));
create policy write_library on public.library_items for insert to authenticated
  with check(created_by = (select auth.uid()) and (
    (kind = 'study' and private.can_score(organization_id))
    or (kind = 'event' and private.can_import_branch(organization_id, branch_id))));
create policy amend_library on public.library_items for update to authenticated
  using((kind = 'study' and private.can_score(organization_id))
    or (kind = 'event' and private.can_import_branch(organization_id, branch_id)))
  with check((kind = 'study' and private.can_score(organization_id))
    or (kind = 'event' and private.can_import_branch(organization_id, branch_id)));

create policy read_plans on public.plans for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));
create policy open_plans on public.plans for insert to authenticated
  with check(opened_by = (select auth.uid())
    and private.can_manage_student(organization_id, branch_id, student_id));
create policy amend_plans on public.plans for update to authenticated
  using(private.can_manage_student(organization_id, branch_id, student_id))
  with check(private.can_manage_student(organization_id, branch_id, student_id));

create policy read_plan_tasks on public.plan_tasks for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));
create policy add_plan_tasks on public.plan_tasks for insert to authenticated
  with check(created_by = (select auth.uid())
    and private.can_manage_student(organization_id, branch_id, student_id));
create policy amend_plan_tasks on public.plan_tasks for update to authenticated
  using(private.can_manage_student(organization_id, branch_id, student_id))
  with check(private.can_manage_student(organization_id, branch_id, student_id));
-- Only work nobody has touched can be taken back. A done or stuck task is part
-- of what happened, and removing it would be editing the record.
create policy remove_plan_tasks on public.plan_tasks for delete to authenticated
  using(status = 'todo' and private.can_manage_student(organization_id, branch_id, student_id));

create policy read_bookings on public.library_bookings for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));
create policy write_bookings on public.library_bookings for insert to authenticated
  with check(created_by = (select auth.uid())
    and private.can_manage_student(organization_id, branch_id, student_id));

create policy read_plan_events on public.plan_events for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));

-- A booking goes with its task; there is no way to drop one on its own, so a
-- seat cannot be released while the plan still says the student is going.
grant select, insert on public.library_items, public.plans, public.plan_tasks,
  public.library_bookings to authenticated;
grant delete on public.plan_tasks to authenticated;
grant select on public.plan_events to authenticated;
grant update(title, program, skill, level, minutes, reference, starts_at, capacity, is_sample, active)
  on public.library_items to authenticated;
grant update(status, check_on, weekly_minutes, closed_at, closed_by, close_note) on public.plans to authenticated;
grant update(status, note) on public.plan_tasks to authenticated;
