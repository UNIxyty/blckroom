-- §8: per-user language, persisted on the users row (not localStorage) so it
-- follows the barber across devices. NULL = not chosen yet → the Mini App
-- shows the language selector first; the bot falls back to Telegram's
-- language_code, then English.
-- Reversal: alter table users drop column language;
alter table users add column language text
  check (language in ('en', 'ru'));
