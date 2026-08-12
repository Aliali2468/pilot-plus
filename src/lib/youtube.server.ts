// Server-only YouTube/Google helpers. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const YOUTUBE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

const PROJECT_ID = "1dfef0fb-80d6-4442-b55e-ad7942f0dd3f";
const PROD_ORIGIN = `https://project--${PROJECT_ID}.lovable.app`;
const DEV_ORIGIN = `https://project--${PROJECT_ID}-dev.lovable.app`;

/** Google requires an exact redirect URI match, so we map any runtime origin
 * onto one of the three registered origins. */
export function resolveOAuthOrigin(origin: string | undefined): string {
  if (!origin) return DEV_ORIGIN;
  try {
    const { hostname, protocol, port } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
    }
    if (hostname === `project--${PROJECT_ID}.lovable.app`) return PROD_ORIGIN;
    return DEV_ORIGIN;
  } catch {
    return DEV_ORIGIN;
  }
}

export function redirectUriFor(origin: string | undefined): string {
  return `${resolveOAuthOrigin(origin)}/api/public/youtube/oauth/callback`;
}

export function googleClientCredentials() {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured (missing client id/secret).");
  }
  return { clientId, clientSecret };
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const { clientId, clientSecret } = googleClientCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as Record<string, any>;
  if (!res.ok) throw new Error(json['error_description'] || json['error'] || "Token exchange failed");
  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    id_token?: string;
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = googleClientCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as Record<string, any>;
  if (!res.ok) throw new Error(json['error_description'] || json['error'] || "Token refresh failed");
  return json as { access_token: string; expires_in: number; scope?: string };
}

export function decodeIdTokenEmail(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1] ?? "";
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return json.email ?? null;
  } catch {
    return null;
  }
}

export type ActiveConnection = {
  accessToken: string;
  channelRowId: string;
  channelId: string;
  channelTitle: string;
};

/** Returns a fresh access token for the user's active channel, refreshing if needed. */
export async function getActiveConnection(
  userId: string,
  channelRowId?: string,
): Promise<ActiveConnection> {
  let query = supabaseAdmin
    .from("youtube_channels")
    .select("id, channel_id, title")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (channelRowId) query = query.eq("id", channelRowId);

  const { data: channels, error: channelError } = await query.limit(1);
  if (channelError) throw new Error(channelError.message);
  const channel = channels?.[0];
  if (!channel) throw new Error("NO_CHANNEL");

  const { data: conn, error: connError } = await supabaseAdmin
    .from("youtube_connections")
    .select("id, access_token, refresh_token, token_expires_at, revoked")
    .eq("user_id", userId)
    .eq("channel_row_id", channel.id)
    .maybeSingle();
  if (connError) throw new Error(connError.message);
  if (!conn || conn.revoked) throw new Error("NO_CONNECTION");

  let accessToken: string = conn.access_token ?? "";
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (Date.now() > expiresAt - 60_000) {
    if (!conn.refresh_token) throw new Error("NO_REFRESH_TOKEN");
    const refreshed = await refreshAccessToken(conn.refresh_token);
    accessToken = refreshed.access_token;
    await supabaseAdmin
      .from("youtube_connections")
      .update({
        access_token: refreshed.access_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("id", conn.id);
  }

  return {
    accessToken,
    channelRowId: channel.id,
    channelId: channel.channel_id,
    channelTitle: channel.title,
  };
}

export async function youtubeApi<T = any>(
  accessToken: string,
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const url = new URL(
    path.startsWith("http") ? path : `https://www.googleapis.com/youtube/v3${path}`,
  );
  Object.entries(query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), {
    ...rest,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(rest.body ? { "content-type": "application/json" } : {}),
      ...(rest.headers as Record<string, string>),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = json?.error?.message || json?.error_description || `YouTube API error ${res.status}`;
    throw new Error(message);
  }
  return json as T;
}
