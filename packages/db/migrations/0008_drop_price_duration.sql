-- Part 1: the product shows haircuts, it doesn't sell them. Nothing renders
-- price or duration since the v2 frames; the columns held only seed
-- placeholders. shop_id stays everywhere by design.
-- Reversal: alter table haircuts add column price_cents integer not null default 0;
--           alter table haircuts add column duration_minutes integer not null default 30;
alter table haircuts drop column price_cents;
alter table haircuts drop column duration_minutes;
