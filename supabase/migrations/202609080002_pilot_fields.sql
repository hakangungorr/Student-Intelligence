-- Pilot import fields. Schema only; no data is seeded here.
-- Both columns are nullable so the foundation migration's guarantees are unchanged.

-- Instructors are named on the action ("eğitmen görüşmesi") but are not an analysis
-- axis and do not need an account. teacher_id stays the authorization link; this is
-- only a label carried over from the institution's own records.
alter table public.enrollments
  add column teacher_name text
  check (teacher_name is null or length(trim(teacher_name)) between 1 and 200);

-- Shown on the student detail screen, never scored. Kept off student_measurements
-- on purpose: that table is a 0-100 column and satisfaction is a 1-10 scale, so
-- storing it there would silently mix two scales in one numeric field.
alter table public.students
  add column satisfaction_score smallint
  check (satisfaction_score is null or satisfaction_score between 1 and 10);
