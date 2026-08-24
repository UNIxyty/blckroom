-- §7: the product has no Latvian market — drop the column entirely.
-- Reversal: alter table haircuts add column name_lv text; (data was never
-- populated in production — seed left it null.)
alter table haircuts drop column name_lv;
