-- Writing risk scores, restricted to institution administrators.
--
-- Not branch managers, and the reason is calibration rather than trust. Each
-- level's benchmark is the mean of that level's strongest quarter, so scoring a
-- single branch would measure its students against their own branch instead of
-- the institution — the same student would score differently depending on who
-- pressed the button. Scoring is an institution-wide operation or it is wrong.
create function private.can_score(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.user_id = (select auth.uid())
    and m.organization_id = org and m.role = 'org_admin');
$$;
revoke all on function private.can_score(uuid) from public;
grant execute on function private.can_score(uuid) to authenticated;

create policy write_risk on public.risk_snapshots for insert to authenticated
  with check(private.can_score(organization_id));
-- Re-running for a period corrects that period rather than accumulating copies;
-- the unique key is (student, period, engine version).
create policy amend_risk on public.risk_snapshots for update to authenticated
  using(private.can_score(organization_id))
  with check(private.can_score(organization_id));

grant insert on public.risk_snapshots to authenticated;
grant update(risk_score, risk_score_raw, risk_level, dimensions, dimension_detail,
  reasons, recommended_action, calculated_at) on public.risk_snapshots to authenticated;
