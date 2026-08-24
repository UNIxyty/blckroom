-- §6: deleting a cut stops it generating for new clients while past sessions
-- keep their generations (FK from generations.haircut_id) — so deletion is a
-- soft delete.
-- Reversal: alter table haircuts drop column deleted_at;
alter table haircuts add column deleted_at timestamptz;
