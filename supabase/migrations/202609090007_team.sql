-- Managing who works here, and which students they teach.
--
-- The application cannot create accounts: that needs the Auth admin API and a
-- service_role key, which this deployment does not use. It cannot read
-- auth.users either, so it cannot show an email beside a membership. Accounts
-- are therefore created in the Supabase dashboard and granted access here by
-- their user id — the same two-step the first administrator already goes
-- through. display_name exists so the screens can say "Ayşe Yılmaz" instead of
-- a uuid; it is a label the institution controls, not an identity claim.
alter table public.memberships
  add column display_name text
  check (display_name is null or length(trim(display_name)) between 1 and 200);

-- Administrators need to see the whole team, not just their own row.
create policy admin_reads_memberships on public.memberships for select to authenticated
  using(private.can_score(organization_id));
create policy admin_grants_membership on public.memberships for insert to authenticated
  with check(private.can_score(organization_id));
-- Editing your own row is allowed for the label, but not to step down: an
-- institution whose last administrator demoted themselves has nobody left who
-- can promote anyone, and the delete rule below exists for the same reason.
create policy admin_amends_membership on public.memberships for update to authenticated
  using(private.can_score(organization_id))
  with check(private.can_score(organization_id)
    and (user_id <> (select auth.uid()) or role = 'org_admin'));
-- Revoking your own access locks you out of the institution you administer, and
-- an institution with no administrator cannot grant anyone back in.
create policy admin_revokes_membership on public.memberships for delete to authenticated
  using(private.can_score(organization_id) and user_id <> (select auth.uid()));

grant insert, delete on public.memberships to authenticated;
grant update(role, branch_id, display_name) on public.memberships to authenticated;
