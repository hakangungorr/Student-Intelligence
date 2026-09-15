-- Bir öneri kapanmaz; içindeki görevler tek tek kapanır.
--
-- The engine writes one recommendation string and the screen splits it into the
-- two or three things somebody actually has to do. Marking it "yapıldı" wrote a
-- single row for the student, so closing the easy half of a recommendation
-- closed the hard half with it: "eğitmenle görüşme + öğrenci ilişkileri araması"
-- became done the moment anybody ticked the box, and nothing in the product
-- could say which of the two had happened.
--
-- The key is derived from the task's own text, and that is the point rather than
-- a convenience. When a new checkpoint produces a different recommendation the
-- task text changes, so the key changes, so the new task is open — a plan that
-- was rewritten cannot inherit the completion of the plan it replaced. A task
-- that survives the rewrite word for word keeps its key and stays closed,
-- because it is the same task.
alter table public.actions add column task_key text
  check (task_key is null or length(trim(task_key)) between 1 and 200);
comment on column public.actions.task_key is
  'Görevin metninden türetilen kimlik. Öneri değişince anahtar da değişir ve görev yeniden açılır. Null: bu sütundan önce yazılmış kayıt.';

-- Also the concurrency guard. Two clicks on the same button, or the same task
-- marked from the agenda and the student card at once, used to race each other
-- into two rows; now the second one conflicts and the write path updates instead.
create unique index actions_one_per_task on public.actions(student_id, period_end, task_key)
  where period_end is not null and task_key is not null;

-- Deliberately outside the update grant, like period_end: which task a row
-- answers is decided when it is written. Editing it would let a closed row be
-- re-pointed at a task nobody did.


-- "3 satır aktarıldı, 4 atlandı" — dosyada 7 satır yoktu.
--
-- skipped_count was filled with parsed.issues.length, and an issue is one bad
-- cell, not one rejected row: a single line with three out-of-range marks
-- counted as three skipped students. The history is the only record of what an
-- import did, so the two numbers are separated rather than reconciled.
--
-- Nullable on purpose. Rows written before this split cannot be decomposed after
-- the fact, and showing them as "0 reddedildi" would state something we do not
-- know. The screen shows them as unknown.
alter table public.import_batches
  add column rejected_count integer check (rejected_count is null or rejected_count >= 0),
  add column issue_count integer check (issue_count is null or issue_count >= 0);
comment on column public.import_batches.rejected_count is
  'Dosyadan okunamayan tekil satır sayısı.';
comment on column public.import_batches.issue_count is
  'Bulunan hata sayısı; bir satırda birden fazla olabilir.';


-- Yeni ölçüm eski kanıtı ezmesin.
--
-- student_measurements keys on (student, kind, source_reference), so "exam_3" is
-- one slot and the second time a mark lands in it the first one is gone. That is
-- the right shape for "what is this student's third exam mark" and the wrong
-- shape for every question that follows it: which reading the plan was built
-- from, whether the correction was a typo fix or a re-sit, what the score looked
-- like before somebody re-uploaded last term's file over this term's.
--
-- The current value stays exactly where every screen already reads it. What is
-- added is the row that used to be thrown away.
--
-- Written by a trigger rather than by the import, because the import is not the
-- only writer: the class sheet and the student card update the same rows, and a
-- history only three of four writers maintain is worse than none.
create table public.measurement_revisions (
  id bigint generated always as identity primary key,
  measurement_id uuid not null references public.student_measurements(id) on delete cascade,
  organization_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  kind text not null,
  source_reference text not null,
  previous_value numeric not null,
  previous_measured_on date not null,
  replaced_at timestamptz not null default now(),
  replaced_by uuid references auth.users(id),
  foreign key(organization_id,branch_id,student_id)
    references public.students(organization_id,branch_id,id)
);
create index measurement_revisions_lookup
  on public.measurement_revisions(student_id, kind, source_reference, replaced_at desc);

create function private.keep_measurement_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if NEW.value is distinct from OLD.value or NEW.measured_on is distinct from OLD.measured_on then
    insert into public.measurement_revisions(measurement_id, organization_id, branch_id,
      student_id, kind, source_reference, previous_value, previous_measured_on, replaced_by)
    values (OLD.id, OLD.organization_id, OLD.branch_id, OLD.student_id, OLD.kind,
      OLD.source_reference, OLD.value, OLD.measured_on, (select auth.uid()));
  end if;
  return NEW;
end;
$$;
revoke all on function private.keep_measurement_history() from public;
create trigger measurements_keep_history before update on public.student_measurements
  for each row execute function private.keep_measurement_history();

alter table public.measurement_revisions enable row level security;
create policy read_revisions on public.measurement_revisions for select to authenticated
  using(private.can_access_student(organization_id, branch_id, student_id));
-- Read-only to the application. The only writer is the trigger above, which runs
-- as the definer; granting insert here would let a client write a history that
-- never happened, which is the opposite of what the table is for.
grant select on public.measurement_revisions to authenticated;
