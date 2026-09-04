import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Link state, bot handle and the latest media message the bot received. */
export const getTelegramStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    const context = (await import("./owner.server")).ownerContext();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { telegramBotUsername } = await import("./telegram.server");

    const [{ data: link }, { data: latest }] = await Promise.all([
      supabaseAdmin
        .from("telegram_links")
        .select("chat_id, username, first_name, linked_at")
        .eq("user_id", context.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("telegram_messages")
        .select("update_id, file_name, file_size, mime_type, caption, has_video, created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    let botUsername: string | null = null;
    try {
      botUsername = await telegramBotUsername();
    } catch {
      botUsername = null;
    }

    return {
      connected: Boolean(link),
      botUsername,
      link: link ?? null,
      latestMessage: latest ?? null,
    };
  });

/** One-time code the user sends to the bot as "/start <code>" to link the chat. */
export const createTelegramLinkCode = createServerFn({ method: "POST" })
  .handler(async () => {
    const context = (await import("./owner.server")).ownerContext();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // A new attempt invalidates every previous unused code for this account.
    await supabaseAdmin
      .from("telegram_link_codes")
      .delete()
      .eq("user_id", context.userId)
      .is("used_at", null);

    const code = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32])
      .join("");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("telegram_link_codes")
      .insert({ code, user_id: context.userId, expires_at: expiresAt });
    if (error) throw new Error(error.message);
    const { telegramBotUsername } = await import("./telegram.server");
    let botUsername: string | null = null;
    try {
      botUsername = await telegramBotUsername();
    } catch {
      botUsername = null;
    }
    return { code, botUsername, expiresAt };
  });

export type VerifyState =
  | "connected"
  | "waiting"
  | "expired"
  | "invalid"
  | "already_used"
  | "bot_unreachable";

/**
 * Authoritative server-side check of the linking state. It never trusts the
 * browser: it reads the code row and the link row written by the webhook.
 */
export const verifyTelegramLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().min(4).max(64).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const context = (await import("./owner.server")).ownerContext();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { telegramBotUsername } = await import("./telegram.server");

    let botUsername: string | null = null;
    let botReachable = true;
    try {
      botUsername = await telegramBotUsername();
    } catch {
      botReachable = false;
    }

    const { data: link } = await supabaseAdmin
      .from("telegram_links")
      .select("chat_id, username, first_name, linked_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (link) {
      return { state: "connected" as VerifyState, botUsername, link, message: "Connected" };
    }

    if (data.code) {
      const { data: row } = await supabaseAdmin
        .from("telegram_link_codes")
        .select("code, user_id, used_at, expires_at")
        .eq("code", data.code)
        .maybeSingle();

      if (!row || row.user_id !== context.userId) {
        return {
          state: "invalid" as VerifyState,
          botUsername,
          link: null,
          message: "This code is not valid for your account — generate a new one",
        };
      }
      if (row.used_at) {
        return {
          state: "already_used" as VerifyState,
          botUsername,
          link: null,
          message: "This code was already used — generate a new one",
        };
      }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return {
          state: "expired" as VerifyState,
          botUsername,
          link: null,
          message: "This code expired — generate a new one",
        };
      }
    }

    if (!botReachable) {
      return {
        state: "bot_unreachable" as VerifyState,
        botUsername,
        link: null,
        message: "The Telegram bot is not reachable right now",
      };
    }

    return {
      state: "waiting" as VerifyState,
      botUsername,
      link: null,
      message: "Waiting for Telegram confirmation",
    };
  });

export const unlinkTelegram = createServerFn({ method: "POST" })
  .handler(async () => {
    const context = (await import("./owner.server")).ownerContext();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("telegram_links").delete().eq("user_id", context.userId);
    await supabaseAdmin.from("telegram_link_codes").delete().eq("user_id", context.userId);
    return { ok: true as const };
  });


/** Live server-side transfer state for the progress UI (no simulated values). */
export const getJobProgress = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid().optional(),
        idempotencyKey: z.string().min(8).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const context = (await import("./owner.server")).ownerContext();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("upload_jobs")
      .select("id, status, transfer_phase, bytes_transferred, total_bytes, video_id, error_message, updated_at")
      .eq("user_id", context.userId);
    if (data.jobId) query = query.eq("id", data.jobId);
    else if (data.idempotencyKey) query = query.eq("idempotency_key", data.idempotencyKey);
    else throw new Error("A job id or idempotency key is required");
    const { data: job, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    return job ?? null;
  });

/**
 * Telegram -> TubePilot server -> YouTube. The file never touches the browser:
 * the response body from Telegram is piped straight into YouTube's resumable
 * upload URL while byte counts are written to the job row for real progress.
 */
export const importFromTelegram = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(1).max(100),
        description: z.string().max(5000).optional().default(""),
        tags: z.array(z.string()).max(30).optional().default([]),
        categoryId: z.string().optional().default("22"),
        privacyStatus: z.enum(["public", "unlisted", "private"]),
        publishAt: z.string().nullable().optional(),
        videoType: z.enum(["long", "short"]).default("long"),
        idempotencyKey: z.string().min(8).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const context = (await import("./owner.server")).ownerContext();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getActiveConnection } = await import("./youtube.server");
    const { telegramFileStream } = await import("./telegram.server");

    const conn = await getActiveConnection(context.userId);

    // Never import the same message twice, even after a dropped response.
    const { data: existing } = await supabaseAdmin
      .from("upload_jobs")
      .select("id, video_id, status")
      .eq("user_id", context.userId)
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existing?.video_id) {
      return { jobId: existing.id, videoId: existing.video_id, alreadyUploaded: true as const };
    }

    const { data: latest } = await supabaseAdmin
      .from("telegram_messages")
      .select("update_id, file_id, file_name, file_size, mime_type, has_video")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) throw new Error("No Telegram message found yet — send or forward the video to the bot first");
    if (!latest.has_video || !latest.file_id)
      throw new Error("The latest Telegram message does not contain a downloadable video");

    const jobId =
      existing?.id ??
      (
        await supabaseAdmin
          .from("upload_jobs")
          .insert({
            user_id: context.userId,
            channel_row_id: conn.channelRowId,
            file_name: latest.file_name ?? "telegram-video.mp4",
            file_size: latest.file_size ?? 0,
            status: "uploading",
            source: "telegram",
            transfer_phase: "finding",
            total_bytes: latest.file_size ?? null,
            video_type: data.videoType,
            idempotency_key: data.idempotencyKey,
            scheduled_at: data.publishAt ? new Date(data.publishAt).toISOString() : null,
            metadata: {
              title: data.title,
              tags: data.tags,
              privacyStatus: data.privacyStatus,
              videoType: data.videoType,
              source: "telegram",
            },
          })
          .select("id")
          .single()
      ).data!.id;

    const patch = (fields: Partial<{
      status: string;
      transfer_phase: string;
      bytes_transferred: number;
      total_bytes: number;
      progress: number;
      upload_url: string;
      video_id: string;
      error_message: string | null;
    }>) => supabaseAdmin.from("upload_jobs").update(fields).eq("id", jobId);

    // Large-file path: the Local Bot API worker performs the whole transfer.
    if (process.env["TELEGRAM_WORKER_SECRET"]) {
      const { startYoutubeResumableSession } = await import("./telegram-queue.server");
      const total = latest.file_size ?? 0;
      if (!total) throw new Error("Telegram did not report the file size");
      try {
        const uploadUrl = await startYoutubeResumableSession({
          accessToken: conn.accessToken,
          totalBytes: total,
          mimeType: latest.mime_type ?? "video/mp4",
          title: data.title,
          description: data.description,
          tags: data.tags,
          categoryId: data.categoryId,
          privacyStatus: data.privacyStatus,
          publishAt: data.publishAt ?? null,
          videoType: data.videoType,
        });
        await supabaseAdmin
          .from("upload_jobs")
          .update({
            status: "queued",
            transfer_phase: "queued",
            upload_url: uploadUrl,
            total_bytes: total,
            bytes_transferred: 0,
            telegram_file_id: latest.file_id,
            error_message: null,
          })
          .eq("id", jobId);
        return {
          jobId,
          videoId: null as string | null,
          queued: true as const,
          alreadyUploaded: false as const,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not queue the import";
        await patch({ status: "failed", transfer_phase: "failed", error_message: message });
        throw new Error(message);
      }
    }

    try {

      await patch({ transfer_phase: "downloading", bytes_transferred: 0 });
      const { body, size } = await telegramFileStream(latest.file_id);
      const total = latest.file_size ?? size;
      if (!total) throw new Error("Telegram did not report the file size");
      await patch({ transfer_phase: "transferring", total_bytes: total });

      const description =
        data.videoType === "short" && !/#shorts/i.test(data.description)
          ? `${data.description}\n\n#Shorts`.trim()
          : data.description;

      const status: Record<string, unknown> = {
        privacyStatus: data.publishAt ? "private" : data.privacyStatus,
        selfDeclaredMadeForKids: false,
      };
      if (data.publishAt) status["publishAt"] = new Date(data.publishAt).toISOString();

      const init = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${conn.accessToken}`,
            "content-type": "application/json",
            "X-Upload-Content-Length": String(total),
            "X-Upload-Content-Type": latest.mime_type ?? "video/mp4",
          },
          body: JSON.stringify({
            snippet: {
              title: data.title,
              description,
              tags: data.tags,
              categoryId: data.categoryId,
            },
            status,
          }),
        },
      );
      if (!init.ok) {
        const err = (await init.json().catch(() => ({}))) as any;
        throw new Error(err?.error?.message ?? "Could not start the YouTube upload session");
      }
      const uploadUrl = init.headers.get("location");
      if (!uploadUrl) throw new Error("YouTube did not return an upload URL");
      await patch({ upload_url: uploadUrl });

      // Count bytes as they flow through so the UI shows genuine progress.
      let sent = 0;
      let lastWrite = 0;
      const counting = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          sent += chunk.byteLength;
          const now = Date.now();
          if (now - lastWrite > 1000) {
            lastWrite = now;
            void patch({ bytes_transferred: sent, progress: Math.round((sent / total) * 100) });
          }
          controller.enqueue(chunk);
        },
      });

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": latest.mime_type ?? "video/mp4",
          "Content-Length": String(total),
        },
        body: body.pipeThrough(counting),
        // @ts-expect-error duplex is required for streaming request bodies
        duplex: "half",
      });

      if (!put.ok) {
        const text = await put.text().catch(() => "");
        throw new Error(`YouTube rejected the upload [${put.status}]: ${text.slice(0, 300)}`);
      }
      const result = (await put.json()) as { id?: string };
      if (!result.id) throw new Error("YouTube did not return a video id");

      await patch({
        status: "completed",
        transfer_phase: "completed",
        bytes_transferred: total,
        progress: 100,
        video_id: result.id,
        error_message: null,
      });

      return { jobId, videoId: result.id, alreadyUploaded: false as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Telegram import failed";
      await patch({ status: "failed", transfer_phase: "failed", error_message: message });
      throw new Error(message);
    }
  });

/** Infrastructure health for Settings → System status. */
export const getWorkerStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const configErrors: string[] = [];
    if (!process.env["TELEGRAM_WORKER_SECRET"]) {
      configErrors.push(
        "TELEGRAM_WORKER_SECRET is not set — the large-file worker cannot authenticate.",
      );
    }

    const [{ data: worker }, { data: jobs }] = await Promise.all([
      supabaseAdmin
        .from("worker_heartbeats")
        .select("worker_id, version, bot_api_ready, current_job_id, completed, failed, last_error, started_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("upload_jobs")
        .select("id, status, transfer_phase, file_name, progress, bytes_transferred, total_bytes")
        .eq("source", "telegram")
        .in("status", ["queued", "uploading"])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const lastHeartbeat = worker?.updated_at ?? null;
    const online = Boolean(lastHeartbeat && Date.now() - new Date(lastHeartbeat).getTime() < 90_000);
    if (!worker) {
      configErrors.push("No worker has ever reported in — deploy the Telegram transfer service.");
    } else if (!online) {
      configErrors.push("The worker stopped sending heartbeats (offline for more than 90 seconds).");
    } else if (!worker.bot_api_ready) {
      configErrors.push("The worker is running but the Local Bot API server is not answering.");
    }
    if (worker?.last_error) configErrors.push(`Last worker error: ${worker.last_error}`);

    return {
      online,
      localBotApi: Boolean(online && worker?.bot_api_ready),
      version: worker?.version ?? null,
      workerId: worker?.worker_id ?? null,
      lastHeartbeat,
      startedAt: worker?.started_at ?? null,
      completed: worker?.completed ?? 0,
      failed: worker?.failed ?? 0,
      currentJobId: worker?.current_job_id ?? null,
      jobs: jobs ?? [],
      fallbackActive: !online,
      configErrors,
    };
  });
