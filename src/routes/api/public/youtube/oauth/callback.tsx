import { createFileRoute } from "@tanstack/react-router";

function resultPage(ok: boolean, message: string, appOrigin: string) {
  const payload = JSON.stringify({ source: "tubepilot-oauth", ok, message });
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${ok ? "Channel connected" : "Connection failed"}</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b0f;color:#fafafa;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{max-width:420px;text-align:center;padding:32px;border:1px solid #26262e;border-radius:16px;background:#141419}
h1{font-size:18px;margin:0 0 8px}p{color:#a1a1aa;font-size:14px;margin:0 0 20px}
a{display:inline-block;background:#e0243c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px}</style></head>
<body><div class="card"><h1>${ok ? "YouTube channel connected" : "Connection failed"}</h1><p>${message}</p>
<a href="${appOrigin}/dashboard">Back to TubePilot</a></div>
<script>
try { if (window.opener) { window.opener.postMessage(${payload}, "*"); setTimeout(function(){ window.close(); }, 800); } } catch (e) {}
</script></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/youtube/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const appOrigin = url.origin;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");

        if (oauthError) return resultPage(false, `Google returned: ${oauthError}`, appOrigin);
        if (!code || !state) return resultPage(false, "Missing authorization code.", appOrigin);

        try {
          const { exchangeCodeForTokens, redirectUriFor, decodeIdTokenEmail, youtubeApi } =
            await import("@/lib/youtube.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: stateRow } = await supabaseAdmin
            .from("oauth_states")
            .select("state, user_id, expires_at")
            .eq("state", state)
            .maybeSingle();
          if (!stateRow) return resultPage(false, "This connection link is invalid.", appOrigin);
          await supabaseAdmin.from("oauth_states").delete().eq("state", state);
          if (new Date(stateRow.expires_at).getTime() < Date.now()) {
            return resultPage(false, "This connection link expired. Please try again.", appOrigin);
          }

          const tokens = await exchangeCodeForTokens(code, redirectUriFor(appOrigin));
          const channelRes = await youtubeApi<any>(tokens.access_token, "/channels", {
            query: { part: "snippet,statistics,contentDetails", mine: "true" },
          });
          const item = channelRes.items?.[0];
          if (!item) {
            return resultPage(
              false,
              "That Google account has no YouTube channel. Create one, then try again.",
              appOrigin,
            );
          }

          const email = decodeIdTokenEmail(tokens.id_token);
          const { data: channel, error: channelError } = await supabaseAdmin
            .from("youtube_channels")
            .upsert(
              {
                user_id: stateRow.user_id,
                channel_id: item.id,
                title: item.snippet?.title ?? "Untitled channel",
                handle: item.snippet?.customUrl ?? null,
                description: item.snippet?.description ?? null,
                thumbnail_url: item.snippet?.thumbnails?.medium?.url ?? null,
                subscriber_count: Number(item.statistics?.subscriberCount ?? 0),
                view_count: Number(item.statistics?.viewCount ?? 0),
                video_count: Number(item.statistics?.videoCount ?? 0),
                uploads_playlist_id: item.contentDetails?.relatedPlaylists?.uploads ?? null,
                google_email: email,
                status: "active",
                last_synced_at: new Date().toISOString(),
              },
              { onConflict: "user_id,channel_id" },
            )
            .select("id")
            .single();
          if (channelError) throw new Error(channelError.message);

          const { data: existing } = await supabaseAdmin
            .from("youtube_connections")
            .select("id, refresh_token")
            .eq("user_id", stateRow.user_id)
            .eq("channel_row_id", channel.id)
            .maybeSingle();

          const row = {
            user_id: stateRow.user_id,
            channel_row_id: channel.id,
            google_email: email,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? existing?.refresh_token ?? null,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            scope: tokens.scope,
            revoked: false,
          };
          const { error: connError } = existing
            ? await supabaseAdmin.from("youtube_connections").update(row).eq("id", existing.id)
            : await supabaseAdmin.from("youtube_connections").insert(row);
          if (connError) throw new Error(connError.message);

          return resultPage(
            true,
            `${item.snippet?.title ?? "Your channel"} is now connected to TubePilot.`,
            appOrigin,
          );
        } catch (error) {
          console.error("[youtube-oauth]", error);
          return resultPage(
            false,
            error instanceof Error ? error.message : "Unexpected error.",
            appOrigin,
          );
        }
      },
    },
  },
});
