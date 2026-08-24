-- §4: a per-tile retry that succeeds after the sheet was composed must be able
-- to re-compose and re-deliver. The v1 index allowed exactly one compose_sheet
-- job per session EVER; narrow it to one *in-flight* job per session.
-- Reversal: drop the new index, recreate the old one on (payload->>'session_id')
-- where type = 'compose_sheet'.
drop index jobs_compose_sheet_session_uq;
create unique index jobs_compose_sheet_session_uq
  on jobs ((payload->>'session_id'))
  where type = 'compose_sheet' and status in ('queued', 'running');
