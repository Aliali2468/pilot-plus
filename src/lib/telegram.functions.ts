import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Link state, bot handle and the latest media message the bot received. */
export const getTelegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32])
      .join("");
    const { error } = await supabaseAdmin
      .from("telegram_link_codes")
      .insert({ code, user_id: context.userId });
    if (error) throw new Error(error.message);
    const { telegramBotUsername } = await import("./telegram.server");
    let botUsername: string | null = null;
    try {
      botUsername = await telegramBotUsername();
    } catch {
      botUsername = null;
    }
    return { code, botUsername };
  });

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("telegram_links").delete().eq("user_id", context.userId);
    return { ok: true as const };
  });

/** Live server-side transfer state for the progress UI (no simulated values). */
export const getJobProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job, error } = await supabaseAdmin
      .from("upload_jobs")
      .select("id, status, transfer_phase, bytes_transferred, total_bytes, video_id, error_message, updated_at")
      .eq("id", data.jobId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Upload job not found");
    return job;
  });

/**
 * Telegram -> TubePilot server -> YouTube. The file never touches the browser:
 * the response body from Telegram is piped straight into YouTube's resumable
 * upload URL while byte counts are written to the job row for real progress.
 */
export const importFromTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .handler(async ({ data, context }) => {
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

    const patch = (fields: Record<string, unknown>) =>
      supabaseAdmin.from("upload_jobs").update(fields).eq("id", jobId);

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
