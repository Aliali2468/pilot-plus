#!/bin/sh
set -eu

: "${TELEGRAM_API_ID:?TELEGRAM_API_ID is required}"
: "${TELEGRAM_API_HASH:?TELEGRAM_API_HASH is required}"
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is required}"
: "${TUBEPILOT_BASE_URL:?TUBEPILOT_BASE_URL is required}"
: "${TELEGRAM_WORKER_SECRET:?TELEGRAM_WORKER_SECRET is required}"

mkdir -p "${TELEGRAM_API_DIR:-/var/lib/telegram-bot-api}"

# Official Telegram Bot API server in --local mode: no 20 MB download cap,
# files are written to disk and served by absolute path.
telegram-bot-api \
  --local \
  --api-id="${TELEGRAM_API_ID}" \
  --api-hash="${TELEGRAM_API_HASH}" \
  --http-port=8081 \
  --dir="${TELEGRAM_API_DIR:-/var/lib/telegram-bot-api}" \
  --temp-dir="${TELEGRAM_API_DIR:-/var/lib/telegram-bot-api}/temp" \
  --log-verbosity-level=1 &

BOTAPI_PID=$!
trap 'kill -TERM "$BOTAPI_PID" 2>/dev/null || true' TERM INT

# Wait for the bot API server to accept connections before starting the worker.
i=0
while [ "$i" -lt 60 ]; do
  if curl -sf "http://127.0.0.1:8081/bot${TELEGRAM_BOT_TOKEN}/getMe" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

node /app/src/worker.mjs &
WORKER_PID=$!

wait -n "$BOTAPI_PID" "$WORKER_PID"
exit $?
