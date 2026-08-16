import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

function deriveSecret(apiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${apiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Picks the downloadable media (video, animation, or a video document) out of a message. */
function pickMedia(message: any) {
  const video = message?.video ?? message?.animation;
  if (video?.file_id) {
    return {
      file_id: video.file_id as string,
      file_name: (video.file_name as string) ?? `telegram-${message.message_id}.mp4`,
      file_size: (video.file_size as number) ?? null,
      mime_type: (video.mime_type as string) ?? "video/mp4",
    };
  }
  const doc = message?.document;
  if (doc?.file_id && typeof doc.mime_type === "string" && doc.mime_type.startsWith("video/")) {
    return {
      file_id: doc.file_id as string,
      file_name: (doc.file_name as string) ?? `telegram-${message.message_id}.mp4`,
      file_size: (doc.file_size as number) ?? null,
      mime_type: doc.mime_type as string,
    };
  }
  return null;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["TELEGRAM_API_KEY"];
        if (!apiKey) return new Response("Not configured", { status: 503 });

        const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(provided, deriveSecret(apiKey))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as any;
        const message = update.message ?? update.edited_message ?? update.channel_post;
        if (!message?.chat?.id || typeof update.update_id !== "number") {
          return Response.json({ ok: true, ignored: true });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const chatId = message.chat.id as number;

        // "/start <code>" links this Telegram chat to a TubePilot account.
        const startCode = /^\/start\s+([A-Za-z0-9]{6,32})$/.exec(String(message.text ?? ""))?.[1];
        if (startCode) {
          const { data: codeRow } = await supabaseAdmin
            .from("telegram_link_codes")
            .select("code, user_id, used_at")
            .eq("code", startCode)
            .maybeSingle();
          if (codeRow && !codeRow.used_at) {
            await supabaseAdmin.from("telegram_links").upsert(
              {
                user_id: codeRow.user_id,
                chat_id: chatId,
                username: message.from?.username ?? null,
                first_name: message.from?.first_name ?? null,
              },
              { onConflict: "user_id" },
            );
            await supabaseAdmin
              .from("telegram_link_codes")
              .update({ used_at: new Date().toISOString() })
              .eq("code", startCode);
          }
          return Response.json({ ok: true });
        }

        const { data: link } = await supabaseAdmin
          .from("telegram_links")
          .select("user_id")
          .eq("chat_id", chatId)
          .maybeSingle();

        const media = pickMedia(message);
        const { error } = await supabaseAdmin.from("telegram_messages").upsert(
          {
            update_id: update.update_id,
            chat_id: chatId,
            user_id: link?.user_id ?? null,
            message_id: message.message_id ?? null,
            file_id: media?.file_id ?? null,
            file_name: media?.file_name ?? null,
            file_size: media?.file_size ?? null,
            mime_type: media?.mime_type ?? null,
            caption: message.caption ?? message.text ?? null,
            has_video: Boolean(media),
            raw_update: update,
          },
          { onConflict: "update_id" },
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ ok: true });
      },
    },
  },
});
