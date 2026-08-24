-- §9: "Send as album" delivers framed images as a Telegram media group,
-- executed by the worker via a new job type.
-- Reversal: drop constraint jobs_type_check; re-add without 'send_album'.
alter table jobs drop constraint jobs_type_check;
alter table jobs add constraint jobs_type_check
  check (type in ('generate', 'compose_sheet', 'deliver', 'retention_sweep', 'send_album'));
