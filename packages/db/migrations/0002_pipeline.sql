-- Pipeline + settings additions.

-- Per-shop retention window (owner-editable; env DEFAULT_RETENTION_HOURS seeds new sessions
-- when the shop has no override).
alter table shops add column retention_hours integer not null default 24;

-- Delivery bookkeeping: where the "generating… n/9" progress message lives.
alter table sessions add column tg_chat_id bigint;
alter table sessions add column tg_progress_message_id bigint;

-- Exactly one compose_sheet job per session, however many generate jobs race to finish last.
create unique index jobs_compose_sheet_session_uq
  on jobs ((payload->>'session_id'))
  where type = 'compose_sheet';
