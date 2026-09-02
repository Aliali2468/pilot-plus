# TubePilot Telegram large-file service

Runs the official [`telegram-bot-api`](https://github.com/tdlib/telegram-bot-api)
server in `--local` mode (no 20 MB download cap, files land on disk) next to a
small Node worker that streams those files directly into YouTube.

```
Telegram  ->  telegram-bot-api (--local, disk)  ->  Node worker  ->  YouTube
                                   ^                      |
                                   |            TubePilot control plane
                                   |     /api/public/telegram/worker (claim/progress/complete)
```

The browser never transfers video bytes. The worker never receives a Google or
Supabase credential — TubePilot opens the YouTube resumable session and hands
the worker only the short-lived upload URL.

## 1. Required environment variables (container)

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_API_ID` | from https://my.telegram.org → API development tools |
| `TELEGRAM_API_HASH` | same page |
| `TELEGRAM_BOT_TOKEN` | BotFather token for `@S_Q_O_M_Bot` |
| `TUBEPILOT_BASE_URL` | `https://project--1dfef0fb-80d6-4442-b55e-ad7942f0dd3f.lovable.app` |
| `TELEGRAM_WORKER_SECRET` | shared secret, identical to the TubePilot secret |
| `PORT` (optional) | health endpoint port, default `8080` |
| `POLL_INTERVAL_MS` / `PROGRESS_INTERVAL_MS` (optional) | tuning |

Copy `.env.example` to `.env` and fill it in.

## 2. Required TubePilot secret

`TELEGRAM_WORKER_SECRET` — stored in TubePilot's secret store. Its presence is
what switches Telegram imports to the large-file worker path; without it
TubePilot keeps the existing (20 MB) Bot API gateway path.

## 3. Deployment steps

1. **Free the bot from the cloud Bot API** (required once before `--local`
   works with an existing bot):
   `curl "https://api.telegram.org/bot<TOKEN>/logOut"`
2. Build and run:
   ```bash
   cd infra/telegram-worker
   cp .env.example .env    # fill in values
   docker compose up -d --build
   curl -fsS http://<host>:8080/healthz
   ```
   The first build compiles telegram-bot-api and takes ~10–20 minutes.
3. **Point the bot's webhook at TubePilot through the local server** so message
   detection and `/start <code>` linking keep working:
   ```bash
   curl -X POST "http://127.0.0.1:8081/bot<TOKEN>/setWebhook" \
     -H 'content-type: application/json' \
     -d '{"url":"https://project--1dfef0fb-80d6-4442-b55e-ad7942f0dd3f.lovable.app/api/public/telegram/webhook",
          "secret_token":"<the same secret token TubePilot derives>",
          "allowed_updates":["message","edited_message"]}'
   ```
   (Run this inside the container: `docker compose exec telegram-worker sh`.)
4. Give the container disk space for the largest videos you expect
   (`telegram-data` volume) — files are deleted right after each transfer.

## 4. Health

`GET /healthz` → `200` with `{ ok, botApiReady, currentJobId, completed, failed, lastError }`,
`503` while the local Bot API server is not answering.

## 5. Security

- Every worker → TubePilot call carries `x-worker-secret`; TubePilot compares it
  in constant time and rejects with `401` otherwise.
- Jobs are claimed atomically (status guard), retried up to 3 times, and are
  never uploaded twice thanks to the existing `idempotency_key` on `upload_jobs`.
- Temp files are deleted after success and after failure.
