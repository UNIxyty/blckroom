# BLACK ROOM — Haircut Preview System

Telegram-based haircut preview tool for a barbershop. A barber photographs a client,
the system generates nine images of that client with different haircuts, composites
each into a branded frame, and returns a shareable 3×3 sheet.

## Layout

```
apps/
  bot/          grammY webhook handler + Fastify API (one service)
  miniapp/      React + Vite Telegram Mini App, served static
  worker/       job poller, generation + compositing
packages/
  db/           schema, migrations, typed queries
  renderer/     imported design templates + Playwright render fns
  shared/       types, zod config, cost table
infra/
  docker-compose.yml, Dockerfile.*
```

## Local setup

```sh
corepack enable
pnpm install
cp .env.example .env   # fill in every value — boot fails loudly on missing vars
pnpm db:migrate
pnpm db:seed
pnpm dev:bot           # :3000
pnpm dev:worker        # :3001
pnpm dev:miniapp       # :5173
```

Render a sample card + sheet from fixture data (no external services needed):

```sh
pnpm render:sample     # writes to ./out
```

## Docker

```sh
docker compose -f infra/docker-compose.yml up --build
```

## Cloudflare tunnel + setWebhook

_To be completed in the deploy commit — will cover `cloudflared tunnel` config
mapping `PUBLIC_APP_URL` → bot :3000 / miniapp :8080, and calling `setWebhook`
with `secret_token=$TELEGRAM_WEBHOOK_SECRET`._
