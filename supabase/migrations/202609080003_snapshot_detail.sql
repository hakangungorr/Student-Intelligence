-- The engine emits per-dimension evidence alongside the four scores: which exam
-- fell, which skill is weakest and by how much, the attendance drop. The approved
-- screens build their explanation sentences from it, so the snapshot has to carry
-- it or the "why" is lost. Nullable: earlier snapshots may predate the engine
-- version that produces it.
alter table public.risk_snapshots
  add column dimension_detail jsonb
  check (dimension_detail is null or jsonb_typeof(dimension_detail) = 'object');
