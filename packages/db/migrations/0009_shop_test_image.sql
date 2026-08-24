-- Part 2: one designated test portrait per shop, used by the catalog editor's
-- test-before-saving generation.
-- Reversal: alter table shops drop column test_image_path;
alter table shops add column test_image_path text;
