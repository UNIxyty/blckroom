# BLACK ROOM — Haircut Preview System

Telegram-based haircut preview tool for a barbershop. A barber photographs a client,
the system generates nine images of that client with different haircuts (Google
Gemini), composites each into a branded frame (Playwright + imported design
templates), and returns a shareable 3×3 sheet — delivered in Telegram with a QR code
to a signed, expiring link.

## Layout

```
apps/
  bot/          grammY webhook + Fastify API (auth, sessions, admin) — one service
  miniapp/      React + Vite Telegram Mini App (capture, results, admin), served by nginx
  worker/       job poller: Gemini generation, compositing, sheet, delivery, retention
packages/
  db/           SQL migrations, typed queries (pg)
  renderer/     imported design templates + Playwright render functions
  shared/       zod config, cost table, prompt template, storage helper
infra/
  docker-compose.yml, Dockerfile.*, nginx.conf
```

Roles: `pending → barber → owner → superadmin`. Telegram is the only identity source
(initData HMAC for the Mini App, `secret_token` header for the webhook). Postgres and
Storage live in Supabase; there is no Redis — the job queue is a Postgres table with
`FOR UPDATE SKIP LOCKED`.

## Local development

```sh
corepack enable
pnpm install
cp .env.example .env        # fill in every value — boot fails loudly on missing vars
pnpm db:migrate
pnpm db:seed                # shop, superadmin (SUPERADMIN_TELEGRAM_ID), nine haircuts
pnpm dev:bot                # :3000 — API + webhook
pnpm dev:worker             # :3001 — needs `pnpm --filter @blackroom/renderer exec playwright install chromium` once
pnpm dev:miniapp            # :5173 — proxies /api to :3000
```

Render the design templates from fixture data (no external services touched):

```sh
pnpm render:sample          # → packages/renderer/out/{single-cut-card,loading-card,grid-sheet}.png
```

## Server deployment (Docker + Cloudflare tunnel)

Everything runs as four containers on one box: `bot`, `worker`, `miniapp` (nginx,
the single public origin), and `cloudflared`. Nothing listens on a public port —
the tunnel dials out to Cloudflare.

### 1. Prerequisites on the server

```sh
# Any Linux with Docker Engine + Compose v2
curl -fsSL https://get.docker.com | sh
```

### 2. Get the code and configuration

```sh
git clone https://github.com/UNIxyty/blckroom.git blackroom
cd blackroom
cp .env.example .env
nano .env                   # fill in every value (see table below)
```

| Variable | Where it comes from |
|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` |
| `TELEGRAM_WEBHOOK_SECRET` | any random 32+ chars — forged webhooks are rejected against it |
| `PUBLIC_APP_URL` | `https://blackroom.verxyl.com` |
| `GEMINI_API_KEY` / `GEMINI_IMAGE_MODEL` | Google AI Studio, **paid tier** (free tiers may train on client photos) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `SUPABASE_STORAGE_BUCKET` | a **private** bucket, e.g. `blackroom` |
| `DATABASE_URL` | Supabase → Database → session pooler URI (port 5432) |
| `JWT_SECRET` | any random 32+ chars |
| `SUPERADMIN_TELEGRAM_ID` | your numeric id (@userinfobot) |
| `CLOUDFLARE_TUNNEL_TOKEN` | step 3 below |

Then initialize the database (one-off, from any machine with the same `.env`):

```sh
corepack enable && pnpm install
pnpm db:migrate && pnpm db:seed
```

### 3. Cloudflare tunnel for blackroom.verxyl.com

The domain `verxyl.com` must be on Cloudflare (its nameservers point there).

1. Cloudflare dashboard → **Zero Trust** → **Networks → Tunnels** → **Create a tunnel**
   → type *Cloudflared* → name it `blackroom`.
2. On the connector screen, copy the **token** (the long string after
   `--token` in the install command) into `CLOUDFLARE_TUNNEL_TOKEN` in `.env`.
   Don't install cloudflared on the host — the compose file runs it as a container.
3. In the tunnel's **Public Hostname** tab, add:
   - **Subdomain**: `blackroom` · **Domain**: `verxyl.com`
   - **Service**: `HTTP` → `miniapp:80`
   (Container name resolution works because cloudflared runs on the same compose
   network.)

That one hostname serves everything: nginx inside the `miniapp` container serves the
Mini App bundle and proxies `/api/*`, `/webhook`, and `/s/*` to the bot container.

### 4. Start

```sh
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml logs -f bot
```

On boot the bot **registers the webhook itself** — it calls `setWebhook` with
`PUBLIC_APP_URL/webhook` and `TELEGRAM_WEBHOOK_SECRET` every start, so there is no
manual `setWebhook` step. The log line to look for:

```
webhook set to https://blackroom.verxyl.com/webhook
```

(If you ever need it manually:
`curl "https://api.telegram.org/bot$TOKEN/setWebhook?url=https://blackroom.verxyl.com/webhook&secret_token=$SECRET"`.)

### 5. Verify

```sh
curl https://blackroom.verxyl.com/                # Mini App HTML
curl https://blackroom.verxyl.com/api/health 2>/dev/null || true   # 404 is fine (no such route)
docker compose -f infra/docker-compose.yml ps    # all healthy
curl -X POST https://blackroom.verxyl.com/webhook -d '{}'          # → 401 (secret enforced)
```

Then in Telegram:

1. `/start` the bot from your own account → you're the seeded superadmin, so `/new`,
   `/stats`, `/users` all work immediately.
2. Have a barber `/start` → you get an approve/reject keyboard; approve them.
3. Barber taps `/new` → consent → camera → sheet arrives in their chat in ~15–45 s
   with a **Send to client** button.

### Updating

```sh
git pull
docker compose -f infra/docker-compose.yml up -d --build
```

Migrations don't run automatically — run `pnpm db:migrate` when a release adds one.

## Operations

- **Cost caps** — 20 sessions per barber per day; monthly shop budget
  (owner-editable in Admin → Settings). Both checked before anything is enqueued,
  with explicit error messages.
- **Spend** — every generation writes `cost_cents` (per-model table in
  `packages/shared/src/costs.ts`); Admin → Spend shows month totals vs budget.
- **Retention (GDPR)** — sessions expire after the shop's retention window (default
  24 h). The worker sweeps every 10 minutes: all Storage objects deleted, paths
  nulled, the row kept for stats. `/delete_my_data` (barber) and Admin session purge
  (owner) delete on demand. Consent is recorded per session before the camera opens.
- **Audit** — approvals, catalog edits, purges, deliveries, and expiries land in
  `audit_log`.

## Security notes

- Webhook requests without the `X-Telegram-Bot-Api-Secret-Token` header → 401.
- Mini App `initData` is HMAC-validated server-side (24 h max age); user identity is
  never read from a request body. A 15-minute JWT avoids re-validating every call.
- All API routes are deny-by-default; `pending`/`suspended` users can reach exactly
  one endpoint (`/api/me`).
- The Gemini key, service-role key, and DB credentials exist only server-side.
  **Never commit `.env`** — `.env.example` is the only env file in git.
