-- BLACK ROOM initial schema.
-- Multi-tenant from the start: every table except shops and users carries shop_id.

create extension if not exists pgcrypto;

create table shops (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  slug                 text not null unique,
  logo_url             text,
  currency             text not null default 'EUR',
  monthly_budget_cents integer not null default 10000,
  timezone             text not null default 'Europe/Riga',
  created_at           timestamptz not null default now()
);

create table users (
  id           uuid primary key default gen_random_uuid(),
  telegram_id  bigint not null unique,
  username     text,
  first_name   text,
  -- Nullable until an owner approves the user into a shop.
  shop_id      uuid references shops(id),
  role         text not null default 'pending'
               check (role in ('pending','barber','owner','superadmin')),
  status       text not null default 'pending'
               check (status in ('pending','active','suspended')),
  created_at   timestamptz not null default now(),
  approved_by  uuid references users(id),
  approved_at  timestamptz
);

create table haircuts (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references shops(id),
  name_lv             text,
  name_ru             text,
  name_en             text not null,
  -- The haircut description interpolated into the code-side prompt template.
  prompt              text not null,
  reference_image_url text,
  price_cents         integer not null default 0,
  duration_minutes    integer not null default 30,
  sort_order          integer not null default 0,
  is_active           boolean not null default true
);

create index haircuts_shop_idx on haircuts (shop_id, sort_order);

create table sessions (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references shops(id),
  barber_id         uuid not null references users(id),
  source_image_path text,
  status            text not null default 'consented'
                    check (status in ('consented','uploaded','generating','complete','partial','failed','expired')),
  consent_given_at  timestamptz not null,
  sheet_image_path  text,
  cost_cents        integer not null default 0,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null
);

create index sessions_shop_created_idx on sessions (shop_id, created_at desc);
create index sessions_barber_created_idx on sessions (barber_id, created_at desc);
create index sessions_expiry_idx on sessions (expires_at) where status <> 'expired';

create table generations (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references sessions(id) on delete cascade,
  haircut_id        uuid not null references haircuts(id),
  status            text not null default 'queued'
                    check (status in ('queued','running','done','failed')),
  raw_image_path    text,
  framed_image_path text,
  cost_cents        integer not null default 0,
  error             text,
  attempt           integer not null default 0,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);

create index generations_session_idx on generations (session_id);

create table jobs (
  id         uuid primary key default gen_random_uuid(),
  type       text not null
             check (type in ('generate','compose_sheet','deliver','retention_sweep')),
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'queued'
             check (status in ('queued','running','done','failed','dead')),
  attempts   integer not null default 0,
  locked_at  timestamptz,
  locked_by  text,
  run_after  timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now()
);

-- The poller's hot path: SELECT ... FOR UPDATE SKIP LOCKED over queued jobs.
create index jobs_poll_idx on jobs (status, run_after) where status = 'queued';

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid references shops(id),
  actor_user_id uuid references users(id),
  action        text not null,
  target_type   text,
  target_id     uuid,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index audit_log_shop_idx on audit_log (shop_id, created_at desc);
