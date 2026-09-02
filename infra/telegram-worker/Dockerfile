# TubePilot large-file Telegram service.
# Stage 1: build the official telegram-bot-api server (used in --local mode).
FROM alpine:3.20 AS botapi

RUN apk add --no-cache \
      alpine-sdk linux-headers git zlib-dev openssl-dev gperf cmake ccache

RUN git clone --recursive --depth 1 https://github.com/tdlib/telegram-bot-api.git /src \
 && mkdir -p /src/build && cd /src/build \
 && cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX:PATH=/usr/local .. \
 && cmake --build . --target install -j"$(nproc)" \
 && strip /usr/local/bin/telegram-bot-api

# Stage 2: runtime with the bot API server + the Node transfer worker.
FROM node:22-alpine

RUN apk add --no-cache libstdc++ openssl zlib tini curl

COPY --from=botapi /usr/local/bin/telegram-bot-api /usr/local/bin/telegram-bot-api

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /var/lib/telegram-bot-api

ENV TELEGRAM_LOCAL_API_URL=http://127.0.0.1:8081 \
    TELEGRAM_API_DIR=/var/lib/telegram-bot-api \
    PORT=8080

EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
