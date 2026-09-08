-- Foundation only. No real or synthetic student rows are seeded automatically.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.member_role as enum ('org_admin','branch_manager','teacher','viewer');
create type public.risk_level as enum ('HIGH','MEDIUM','LOW');
create type public.action_status as enum ('open','in_progress','completed','cancelled');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) between 1 and 200),
  unique(organization_id,id), unique(organization_id,name)
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  branch_id uuid,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,branch_id) references public.branches(organization_id,id),
  check ((role = 'org_admin' and branch_id is null) or (role <> 'org_admin' and branch_id is not null)),
  unique nulls not distinct (user_id,organization_id,branch_id)
);
create index memberships_user_idx on public.memberships(user_id,organization_id,branch_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid not null,
  external_id text not null check(length(external_id) between 1 and 200),
  name text not null check(length(trim(name)) between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id,branch_id) references public.branches(organization_id,id),
  unique(organization_id,external_id), unique(organization_id,branch_id,id)
);
create index students_scope_idx on public.students(organization_id,branch_id);
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  level text not null check(level in ('A1','A2','B1','B2','C1')),
  teacher_id uuid references auth.users(id),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  check(ends_on is null or ends_on >= starts_on),
  foreign key(organization_id,branch_id,student_id) references public.students(organization_id,branch_id,id)
);
create index enrollments_teacher_idx on public.enrollments(teacher_id,student_id) where active;
create unique index one_active_enrollment on public.enrollments(student_id) where active;

-- All checks use auth.uid(), never client-supplied role metadata.
-- Fixed search_path and fully-qualified names prevent object shadowing.
create function private.can_access_branch(org uuid, branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.user_id = (select auth.uid())
    and m.organization_id = org and (m.role = 'org_admin' or m.branch_id = branch));
$$;
create function private.can_access_student(org uuid, branch uuid, student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.user_id = (select auth.uid())
    and m.organization_id = org and (m.role = 'org_admin' or (m.branch_id = branch and
      (m.role in ('branch_manager','viewer') or (m.role = 'teacher' and exists(
        select 1 from public.enrollments e where e.organization_id = org and e.branch_id = branch
          and e.student_id = student and e.teacher_id = (select auth.uid()) and e.active))))));
$$;
create function private.can_manage_student(org uuid, branch uuid, student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_access_student(org,branch,student) and exists(
    select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.organization_id = org
    and (m.role = 'org_admin' or (m.branch_id = branch and m.role in ('branch_manager','teacher'))));
$$;
revoke all on function private.can_access_branch(uuid,uuid) from public;
revoke all on function private.can_access_student(uuid,uuid,uuid) from public;
revoke all on function private.can_manage_student(uuid,uuid,uuid) from public;
grant execute on function private.can_access_branch(uuid,uuid), private.can_access_student(uuid,uuid,uuid), private.can_manage_student(uuid,uuid,uuid) to authenticated;

create table public.student_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  measured_on date not null,
  kind text not null check(kind in ('exam','speaking','writing','listening','reading','attendance')),
  value numeric not null check(value between 0 and 100),
  source_reference text not null,
  created_at timestamptz not null default now(),
  foreign key(organization_id,branch_id,student_id) references public.students(organization_id,branch_id,id),
  unique(organization_id,student_id,kind,source_reference)
);
create table public.classroom_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  observed_on date not null,
  participation smallint check(participation between 1 and 10),
  homework_completion numeric check(homework_completion between 0 and 100),
  teacher_concern boolean,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check(participation is not null or homework_completion is not null or teacher_concern is not null),
  foreign key(organization_id,branch_id,student_id) references public.students(organization_id,branch_id,id)
);
create table public.risk_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  calculated_at timestamptz not null default now(),
  period_end date not null,
  engine_version text not null,
  risk_score numeric not null check(risk_score between 0 and 100),
  risk_score_raw numeric not null check(risk_score_raw >= 0),
  risk_level public.risk_level not null,
  dimensions jsonb not null check(jsonb_typeof(dimensions) = 'object'),
  reasons jsonb not null check(jsonb_typeof(reasons) = 'array'),
  recommended_action text not null,
  foreign key(organization_id,branch_id,student_id) references public.students(organization_id,branch_id,id),
  unique(student_id,period_end,engine_version)
);
create index risk_history_idx on public.risk_snapshots(student_id,period_end desc);
create table public.actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  title text not null check(length(trim(title)) between 1 and 1000),
  status public.action_status not null default 'open',
  due_on date,
  note text check(length(note) <= 5000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,branch_id,student_id) references public.students(organization_id,branch_id,id)
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  branch_id uuid not null,
  actor_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  created_at timestamptz not null default now(),
  foreign key(organization_id,branch_id) references public.branches(organization_id,id)
);
create function private.record_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then NEW.updated_at = now(); end if;
  insert into public.audit_events(organization_id,branch_id,actor_id,entity_type,entity_id,operation)
  values(NEW.organization_id,NEW.branch_id,auth.uid(),TG_TABLE_NAME,NEW.id,TG_OP);
  return NEW;
end;
$$;
revoke all on function private.record_change() from public;
create trigger actions_audit before insert or update on public.actions for each row execute function private.record_change();
create trigger observations_audit before insert on public.classroom_observations for each row execute function private.record_change();

-- Explicit privileges: managed imports/provisioning/risk writes are server operations.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations,public.branches,public.memberships,public.students,public.enrollments,
  public.student_measurements,public.classroom_observations,public.risk_snapshots,public.actions,public.audit_events to authenticated;
grant insert on public.actions,public.classroom_observations to authenticated;
grant update(status,due_on,note) on public.actions to authenticated;

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.memberships enable row level security;
alter table public.students enable row level security;
alter table public.enrollments enable row level security;
alter table public.student_measurements enable row level security;
alter table public.classroom_observations enable row level security;
alter table public.risk_snapshots enable row level security;
alter table public.actions enable row level security;
alter table public.audit_events enable row level security;

create policy own_memberships on public.memberships for select to authenticated using(user_id = (select auth.uid()));
create policy member_organizations on public.organizations for select to authenticated using(
  exists(select 1 from public.memberships m where m.organization_id = organizations.id and m.user_id = (select auth.uid())));
create policy member_branches on public.branches for select to authenticated using(private.can_access_branch(organization_id,id));
create policy scoped_students on public.students for select to authenticated using(private.can_access_student(organization_id,branch_id,id));
create policy scoped_enrollments on public.enrollments for select to authenticated using(private.can_access_student(organization_id,branch_id,student_id));
create policy scoped_measurements on public.student_measurements for select to authenticated using(private.can_access_student(organization_id,branch_id,student_id));
create policy scoped_observations on public.classroom_observations for select to authenticated using(private.can_access_student(organization_id,branch_id,student_id));
create policy write_observations on public.classroom_observations for insert to authenticated with check(
  created_by = (select auth.uid()) and private.can_manage_student(organization_id,branch_id,student_id));
create policy scoped_risk on public.risk_snapshots for select to authenticated using(private.can_access_student(organization_id,branch_id,student_id));
create policy scoped_actions on public.actions for select to authenticated using(private.can_access_student(organization_id,branch_id,student_id));
create policy create_actions on public.actions for insert to authenticated with check(
  created_by = (select auth.uid()) and private.can_manage_student(organization_id,branch_id,student_id));
create policy update_actions on public.actions for update to authenticated
  using(private.can_manage_student(organization_id,branch_id,student_id))
  with check(private.can_manage_student(organization_id,branch_id,student_id));
create policy manager_audit on public.audit_events for select to authenticated using(
  exists(select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.organization_id = audit_events.organization_id
    and (m.role = 'org_admin' or (m.role = 'branch_manager' and m.branch_id = audit_events.branch_id))));

-- Defense for future tables. Every new application table still needs explicit RLS.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;
