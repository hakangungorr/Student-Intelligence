-- Day-to-day data entry, as opposed to a bulk import.
--
-- A file upload is the right shape for moving a term's records in once. It is
-- the wrong shape for "the exam was yesterday, here are 24 marks", which is the
-- thing that actually happens every week — and the classroom dimension depends
-- entirely on teachers doing it. The product decision to keep instructors off
-- the analysis axes was made precisely so that entering this data stays safe for
-- them; that only pays off if entering it is also easy.
--
-- can_manage_student already expresses the boundary: institution admins
-- anywhere, branch staff inside their branch, and a teacher only for students
-- actively enrolled with them. Reused rather than restated, so there is one
-- definition of "may act on this student" to keep correct.
create policy record_measurements on public.student_measurements for insert to authenticated
  with check(private.can_manage_student(organization_id, branch_id, student_id));
create policy correct_measurements on public.student_measurements for update to authenticated
  using(private.can_manage_student(organization_id, branch_id, student_id))
  with check(private.can_manage_student(organization_id, branch_id, student_id));

-- Observations could already be created this way but never corrected, so a
-- mistyped participation score was permanent for whoever entered it.
create policy correct_observations on public.classroom_observations for update to authenticated
  using(private.can_manage_student(organization_id, branch_id, student_id))
  with check(private.can_manage_student(organization_id, branch_id, student_id));
