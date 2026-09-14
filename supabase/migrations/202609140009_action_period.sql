-- An action answers one checkpoint's recommendation, not the student forever.
--
-- "Tamamlandı" was recorded against the student with no period attached, so the
-- agenda read it as "this student has been handled at some point". A student
-- marked done in September stayed struck through in October — under a completely
-- different recommendation, produced by a completely different set of marks —
-- and the progress bar counted them as closed. That bar is the only answer the
-- product gives to "did acting on this list change anything", so it is the one
-- number that must not be able to drift into meaninglessness.
--
-- Tying the row to a checkpoint makes the reset automatic: open a new evaluation
-- period and everyone is outstanding again, while the previous period's rows stay
-- exactly as they were. Closing a case is a fact about a moment, and the audit
-- trail keeps it.
--
-- Nullable on purpose. Rows written before this column existed cannot be assigned
-- to a checkpoint after the fact without guessing, so they are counted in none —
-- an old row that quietly reappears as this week's completed work would be the
-- same defect in a new disguise.
alter table public.actions add column period_end date;
comment on column public.actions.period_end is
  'Değerlendirme kesiti; kesit değişince aksiyon yeniden açılır. Null: bu sütundan önce yazılmış kayıt.';

-- The agenda asks "what is completed for this student in this period" on every
-- page load, for every student it can see.
create index actions_period_idx on public.actions(student_id, period_end);

-- Insert was already granted at table level, so the new column is writable by
-- the same people under the same policies. It is deliberately left out of the
-- update grant: which checkpoint a row belongs to is decided when it is written
-- and is not something a later edit may move.
