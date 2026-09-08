-- Importing a roster is a write, and the foundation has no write path for one:
-- students, enrollments and measurements are readable under RLS but nothing may
-- insert them, which is why the demo seed had to run as the database owner. The
-- alternative — a service_role key on the server — would hand the application a
-- credential that bypasses every policy in this file, for a job that only ever
-- touches one institution's own rows. These policies keep the import inside the
-- same rules as every other query.

-- Roster changes belong to whoever administers the institution or the branch.
-- Teachers observe students; they do not create or reassign them.
create function private.can_import_branch(org uuid, branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.user_id = (select auth.uid())
    and m.organization_id = org
    and (m.role = 'org_admin' or (m.role = 'branch_manager' and m.branch_id = branch)));
$$;
revoke all on function private.can_import_branch(uuid,uuid) from public;
grant execute on function private.can_import_branch(uuid,uuid) to authenticated;

create policy import_students on public.students for insert to authenticated
  with check(private.can_import_branch(organization_id, branch_id));
create policy amend_students on public.students for update to authenticated
  using(private.can_import_branch(organization_id, branch_id))
  with check(private.can_import_branch(organization_id, branch_id));

create policy import_enrollments on public.enrollments for insert to authenticated
  with check(private.can_import_branch(organization_id, branch_id));
create policy amend_enrollments on public.enrollments for update to authenticated
  using(private.can_import_branch(organization_id, branch_id))
  with check(private.can_import_branch(organization_id, branch_id));

create policy import_measurements on public.student_measurements for insert to authenticated
  with check(private.can_import_branch(organization_id, branch_id));
create policy amend_measurements on public.student_measurements for update to authenticated
  using(private.can_import_branch(organization_id, branch_id))
  with check(private.can_import_branch(organization_id, branch_id));

-- Re-uploading the same file must correct rows, not duplicate them. Measurements
-- and students already have keys to conflict on; observations had none, so a
-- second upload would silently double every classroom record.
alter table public.classroom_observations
  add constraint classroom_observations_one_per_day unique(organization_id, student_id, observed_on);
create policy amend_observations on public.classroom_observations for update to authenticated
  using(private.can_import_branch(organization_id, branch_id))
  with check(private.can_import_branch(organization_id, branch_id));

-- An import changes a lot of rows at once and needs to be answerable afterwards:
-- who loaded what, when, and how much of it landed. No branch column — one file
-- routinely covers every branch the importer administers.
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_id uuid not null default auth.uid() references auth.users(id),
  filename text not null check(length(trim(filename)) between 1 and 400),
  row_count integer not null check(row_count >= 0),
  created_count integer not null check(created_count >= 0),
  updated_count integer not null check(updated_count >= 0),
  skipped_count integer not null default 0 check(skipped_count >= 0),
  created_at timestamptz not null default now()
);
create index import_batches_recent on public.import_batches(organization_id, created_at desc);
alter table public.import_batches enable row level security;

create policy read_imports on public.import_batches for select to authenticated using(
  exists(select 1 from public.memberships m where m.user_id = (select auth.uid())
    and m.organization_id = import_batches.organization_id
    and m.role in ('org_admin','branch_manager')));
create policy record_imports on public.import_batches for insert to authenticated with check(
  actor_id = (select auth.uid()) and exists(
    select 1 from public.memberships m where m.user_id = (select auth.uid())
      and m.organization_id = import_batches.organization_id
      and m.role in ('org_admin','branch_manager')));

-- Column-level, matching how actions were already granted: an import corrects
-- the roster's contents, never which institution a row belongs to. organization_id
-- and the identity columns stay unwritable even for an institution admin.
grant insert on public.students, public.enrollments, public.student_measurements to authenticated;
grant update(name, branch_id, satisfaction_score, active) on public.students to authenticated;
grant update(level, teacher_name, teacher_id, active, ends_on) on public.enrollments to authenticated;
grant update(value, measured_on) on public.student_measurements to authenticated;
grant update(participation, homework_completion, teacher_concern) on public.classroom_observations to authenticated;
grant select, insert on public.import_batches to authenticated;
