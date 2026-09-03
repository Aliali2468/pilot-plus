/**
 * TubePilot Telegram transfer worker.
 *
 * Loop: claim a queued job from TubePilot -> ask the local telegram-bot-api
 * server (running in --local mode, so there is no 20 MB cap) for the file ->
 * stream it from disk into the YouTube resumable upload URL that TubePilot
 * opened -> report byte progress -> report completion -> delete the temp file.
 *
 * The user's browser never transfers a byte, and this process never sees a
 * Google or Supabase credential: TubePilot hands it a short-lived upload URL.
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat, rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";

const env = (name, fallback) => process.env[name] ?? fallback;

const BOT_TOKEN = env("TELEGRAM_BOT_TOKEN");
const LOCAL_API = env("TELEGRAM_LOCAL_API_URL", "http://127.0.0.1:8081");
const BASE_URL = env("TUBEPILOT_BASE_URL");
const WORKER_SECRET = env("TELEGRAM_WORKER_SECRET");
const PORT = Number(env("PORT", "8080"));
const POLL_INTERVAL_MS = Number(env("POLL_INTERVAL_MS", "3000"));
const PROGRESS_INTERVAL_MS = Number(env("PROGRESS_INTERVAL_MS", "1500"));
const HEARTBEAT_INTERVAL_MS = Number(env("HEARTBEAT_INTERVAL_MS", "20000"));
const WORKER_VERSION = env("WORKER_VERSION", "1.1.0");
const WORKER_ID = env("WORKER_ID", `telegram-worker-${process.env.HOSTNAME ?? "default"}`);

for (const [name, value] of Object.entries({
  TELEGRAM_BOT_TOKEN: BOT_TOKEN,
  TUBEPILOT_BASE_URL: BASE_URL,
  TELEGRAM_WORKER_SECRET: WORKER_SECRET,
})) {
  if (!value) {
    console.error(`[worker] missing required env var ${name}`);
    process.exit(1);
  }
}

const CONTROL_URL = `${BASE_URL.replace(/\/$/, "")}/api/public/telegram/worker`;

const state = {
  startedAt: new Date().toISOString(),
  botApiReady: false,
  currentJobId: null,
  completed: 0,
  failed: 0,
  lastError: null,
  lastPollAt: null,
};

async function control(action, body) {
  const res = await fetch(`${CONTROL_URL}?action=${action}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-secret": WORKER_SECRET,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`TubePilot ${action} failed [${res.status}]: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function botApi(method, body) {
  const res = await fetch(`${LOCAL_API}/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok !== true) {
    throw new Error(json.description ?? `Local Bot API ${method} failed [${res.status}]`);
  }
  return json.result;
}

/** In --local mode getFile returns an absolute path on this container's disk. */
async function resolveLocalFile(fileId) {
  const file = await botApi("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram did not return a file path");
  const info = await stat(file.file_path);
  return { path: file.file_path, size: info.size };
}

async function uploadToYoutube(job, localFile) {
  const total = job.totalBytes || localFile.size;
  let sent = 0;
  let lastReport = 0;

  const counter = new Transform({
    transform(chunk, _enc, callback) {
      sent += chunk.length;
      const now = Date.now();
      if (now - lastReport > PROGRESS_INTERVAL_MS) {
        lastReport = now;
        control("progress", {
          jobId: job.jobId,
          phase: "transferring",
          bytesTransferred: sent,
          totalBytes: total,
        }).catch(() => {});
      }
      callback(null, chunk);
    },
  });

  const stream = createReadStream(localFile.path).pipe(counter);

  const res = await fetch(job.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": job.mimeType || "video/mp4",
      "Content-Length": String(total),
    },
    body: Readable.toWeb(stream),
    duplex: "half",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YouTube rejected the upload [${res.status}]: ${text.slice(0, 300)}`);
  }
  const result = await res.json();
  if (!result.id) throw new Error("YouTube did not return a video id");

  await control("progress", {
    jobId: job.jobId,
    phase: "cleanup",
    bytesTransferred: total,
    totalBytes: total,
  }).catch(() => {});

  return result.id;
}

async function cleanup(localFile) {
  if (!localFile) return;
  try {
    await rm(localFile.path, { force: true });
  } catch (error) {
    console.warn(`[worker] could not delete temp file: ${error.message}`);
  }
}

async function runJob(job) {
  state.currentJobId = job.jobId;
  let localFile = null;
  try {
    await control("progress", { jobId: job.jobId, phase: "downloading", bytesTransferred: 0 });
    localFile = await resolveLocalFile(job.fileId);
    console.log(`[worker] job ${job.jobId}: ${localFile.size} bytes ready on disk`);

    const videoId = await uploadToYoutube(job, localFile);
    await control("complete", { jobId: job.jobId, videoId });
    state.completed += 1;
    console.log(`[worker] job ${job.jobId} -> youtube ${videoId}`);
  } catch (error) {
    state.failed += 1;
    state.lastError = error.message;
    console.error(`[worker] job ${job.jobId} failed: ${error.message}`);
    // TubePilot decides whether to requeue (attempts < max) or fail the job.
    await control("complete", { jobId: job.jobId, error: error.message }).catch(() => {});
  } finally {
    // Temp files are always removed, on success and on safe failure alike.
    await cleanup(localFile);
    state.currentJobId = null;
  }
}

async function loop() {
  for (;;) {
    try {
      state.lastPollAt = new Date().toISOString();
      const { job } = await control("claim");
      if (job) {
        await runJob(job);
        continue;
      }
    } catch (error) {
      state.lastError = error.message;
      console.error(`[worker] poll error: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function heartbeat() {
  try {
    await control("heartbeat", {
      workerId: WORKER_ID,
      version: WORKER_VERSION,
      botApiReady: state.botApiReady,
      currentJobId: state.currentJobId,
      completed: state.completed,
      failed: state.failed,
      lastError: state.lastError,
      startedAt: state.startedAt,
      details: { lastPollAt: state.lastPollAt, localApi: LOCAL_API },
    });
  } catch (error) {
    console.error(`[worker] heartbeat failed: ${error.message}`);
  }
}

async function checkBotApi() {
  try {
    await botApi("getMe");
    state.botApiReady = true;
  } catch (error) {
    state.botApiReady = false;
    state.lastError = error.message;
  }
}

createServer((req, res) => {
  if (req.url?.startsWith("/healthz")) {
    const healthy = state.botApiReady;
    res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: healthy, ...state }));
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, () => console.log(`[worker] health endpoint on :${PORT}/healthz`));

await checkBotApi();
setInterval(checkBotApi, 30_000);
await heartbeat();
setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
console.log(`[worker] polling ${CONTROL_URL}`);
loop();
