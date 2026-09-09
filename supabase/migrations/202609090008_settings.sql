-- What the institution decides, as opposed to what the engine assumes.
--
-- Three numbers were baked into the code because nobody had asked the school
-- yet: the passing mark (60), the attendance line below which a student is
-- called critical (75%), and the level names (A1–C1). Every one of them is a
-- policy the institution owns, and every one of them changes who appears on the
-- agenda. Left hard-coded, the first meeting where an answer differs from the
-- guess turns into a code change; here it is a field, and the defaults are the
-- guesses we would have made anyway.
--
-- Written by institution administrators only, and the reason is the same one
-- that restricts scoring: these values recalibrate every student at once, so a
-- branch cannot be allowed to set them for the institution.
create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id),
  pass_mark smallint not null default 60 check (pass_mark between 0 and 100),
  attendance_floor smallint not null default 75 check (attendance_floor between 0 and 100),
  levels text[] not null default array['A1','A2','B1','B2','C1'],
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  -- A check constraint cannot contain a subquery, so element-wise rules are
  -- written as array operators.
  constraint levels_are_named check (
    cardinality(levels) between 1 and 24
    and array_position(levels, null) is null
    and '' <> all(levels))
);

-- The level list is now the institution's to choose, so the column can no
-- longer enumerate the five the demo happened to use.
alter table public.enrollments drop constraint enrollments_level_check;
alter table public.enrollments add constraint enrollments_level_check
  check (length(trim(level)) between 1 and 20);

alter table public.organization_settings enable row level security;

create policy member_settings on public.organization_settings for select to authenticated
  using(exists(select 1 from public.memberships m
    where m.organization_id = organization_settings.organization_id
      and m.user_id = (select auth.uid())));
create policy admin_sets_settings on public.organization_settings for insert to authenticated
  with check(private.can_score(organization_id));
create policy admin_amends_settings on public.organization_settings for update to authenticated
  using(private.can_score(organization_id)) with check(private.can_score(organization_id));

grant select, insert on public.organization_settings to authenticated;
grant update(pass_mark, attendance_floor, levels, updated_at, updated_by)
  on public.organization_settings to authenticated;
