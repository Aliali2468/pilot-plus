import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getYoutubeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("youtube_channels")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { channels: data ?? [], connected: (data ?? []).length > 0 };
  });

export const startYoutubeOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ origin: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { YOUTUBE_SCOPES, redirectUriFor, googleClientCredentials } = await import(
      "./youtube.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clientId } = googleClientCredentials();
    const state = crypto.randomUUID();
    const { error } = await supabaseAdmin
      .from("oauth_states")
      .insert({ state, user_id: context.userId });
    if (error) throw new Error(error.message);

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUriFor(data.origin));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    return { authUrl: url.toString() };
  });

export const syncChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getActiveConnection, youtubeApi } = await import("./youtube.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const conn = await getActiveConnection(context.userId);
    const res = await youtubeApi<any>(conn.accessToken, "/channels", {
      query: { part: "snippet,statistics,contentDetails", mine: "true" },
    });
    const item = res.items?.[0];
    if (!item) throw new Error("No channel found for this Google account.");
    const { error } = await supabaseAdmin
      .from("youtube_channels")
      .update({
        title: item.snippet?.title ?? "",
        handle: item.snippet?.customUrl ?? null,
        description: item.snippet?.description ?? null,
        thumbnail_url: item.snippet?.thumbnails?.medium?.url ?? null,
        subscriber_count: Number(item.statistics?.subscriberCount ?? 0),
        view_count: Number(item.statistics?.viewCount ?? 0),
        video_count: Number(item.statistics?.videoCount ?? 0),
        uploads_playlist_id: item.contentDetails?.relatedPlaylists?.uploads ?? null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", conn.channelRowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ channelRowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("youtube_channels")
      .delete()
      .eq("id", data.channelRowId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ pageToken: z.string().optional(), search: z.string().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { getActiveConnection, youtubeApi } = await import("./youtube.server");
    const conn = await getActiveConnection(context.userId);
    const search = await youtubeApi<any>(conn.accessToken, "/search", {
      query: {
        part: "id",
        forMine: "true",
        type: "video",
        maxResults: "24",
        order: "date",
        q: data.search || undefined,
        pageToken: data.pageToken || undefined,
      },
    });
    const ids = (search.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean);
    if (ids.length === 0) return { videos: [], nextPageToken: null };
    const details = await youtubeApi<any>(conn.accessToken, "/videos", {
      query: { part: "snippet,status,statistics,contentDetails", id: ids.join(",") },
    });
    const videos = (details.items ?? []).map((v: any) => ({
      id: v.id as string,
      title: v.snippet?.title ?? "",
      description: v.snippet?.description ?? "",
      thumbnail: v.snippet?.thumbnails?.medium?.url ?? null,
      publishedAt: v.snippet?.publishedAt ?? null,
      tags: (v.snippet?.tags ?? []) as string[],
      categoryId: v.snippet?.categoryId ?? null,
      privacyStatus: v.status?.privacyStatus ?? "private",
      publishAt: v.status?.publishAt ?? null,
      uploadStatus: v.status?.uploadStatus ?? null,
      views: Number(v.statistics?.viewCount ?? 0),
      likes: Number(v.statistics?.likeCount ?? 0),
      comments: Number(v.statistics?.commentCount ?? 0),
      duration: v.contentDetails?.duration ?? null,
    }));
    return { videos, nextPageToken: search.nextPageToken ?? null };
  });

export const updateVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        videoId: z.string().min(1),
        title: z.string().min(1).max(100),
        description: z.string().max(5000).optional().default(""),
        tags: z.array(z.string()).max(30).optional().default([]),
        categoryId: z.string().optional().default("22"),
        privacyStatus: z.enum(["public", "unlisted", "private"]),
        publishAt: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getActiveConnection, youtubeApi } = await import("./youtube.server");
    const conn = await getActiveConnection(context.userId);
    const status: Record<string, unknown> = { privacyStatus: data.privacyStatus };
    if (data.publishAt && data.privacyStatus === "private") {
      status["publishAt"] = new Date(data.publishAt).toISOString();
    }
    await youtubeApi(conn.accessToken, "/videos", {
      method: "PUT",
      query: { part: "snippet,status" },
      body: JSON.stringify({
        id: data.videoId,
        snippet: {
          title: data.title,
          description: data.description,
          tags: data.tags,
          categoryId: data.categoryId,
        },
        status,
      }),
    });
    return { ok: true };
  });

export const deleteVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ videoId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { getActiveConnection, youtubeApi } = await import("./youtube.server");
    const conn = await getActiveConnection(context.userId);
    await youtubeApi(conn.accessToken, "/videos", {
      method: "DELETE",
      query: { id: data.videoId },
    });
    return { ok: true };
  });

export const setThumbnail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        videoId: z.string().min(1),
        base64: z.string().min(1),
        mimeType: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getActiveConnection } = await import("./youtube.server");
    const conn = await getActiveConnection(context.userId);
    const bytes = Buffer.from(data.base64, "base64");
    const res = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(data.videoId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          "content-type": data.mimeType,
        },
        body: bytes,
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as any;
      throw new Error(body?.error?.message ?? "Thumbnail upload failed");
    }
    return { ok: true };
  });

export const listPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getActiveConnection, youtubeApi } = await import("./youtube.server");
    const conn = await getActiveConnection(context.userId);
    const res = await youtubeApi<any>(conn.accessToken, "/playlists", {
      query: { part: "snippet,status,contentDetails", mine: "true", maxResults: "50" },
    });
    return {
      playlists: (res.items ?? []).map((p: any) => ({
        id: p.id as string,
        title: p.snippet?.title ?? "",
        description: p.snippet?.description ?? "",
        thumbnail: p.snippet?.thumbnails?.medium?.url ?? null,
        privacyStatus: p.status?.privacyStatus ?? "private",
        itemCount: Number(p.contentDetails?.itemCount ?? 0),
      })),
    };
  });

export const createPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(1).max(150),
        description: z.string().max(5000).optional().default(""),
        privacyStatus: z.enum(["public", "unlisted", "private"]).default("private"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getActiveConnection, youtubeApi } = await import("./youtube.server");
    const conn = await getActiveConnection(context.userId);
    await youtubeApi(conn.accessToken, "/playlists", {
      method: "POST",
      query: { part: "snippet,status" },
      body: JSON.stringify({
        snippet: { title: data.title, description: data.description },
        status: { privacyStatus: data.privacyStatus },
      }),
    });
    return { ok: true };
  });

export const deletePlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ playlistId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { getActiveConnection, youtubeApi } = await import("./youtube.server");
    const conn = await getActiveConnection(context.userId);
    await youtubeApi(conn.accessToken, "/playlists", {
      method: "DELETE",
      query: { id: data.playlistId },
    });
    return { ok: true };
  });

export const addVideoToPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ playlistId: z.string().min(1), videoId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getActiveConnection, youtubeApi } = await import("./youtube.server");
    const conn = await getActiveConnection(context.userId);
    await youtubeApi(conn.accessToken, "/playlistItems", {
      method: "POST",
      query: { part: "snippet" },
      body: JSON.stringify({
        snippet: {
          playlistId: data.playlistId,
          resourceId: { kind: "youtube#video", videoId: data.videoId },
        },
      }),
    });
    return { ok: true };
  });

export const createUploadSession = createServerFn({ method: "POST" })
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
        fileName: z.string(),
        fileSize: z.number().int().positive(),
        mimeType: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getActiveConnection } = await import("./youtube.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const conn = await getActiveConnection(context.userId);

    const status: Record<string, unknown> = {
      privacyStatus: data.publishAt ? "private" : data.privacyStatus,
      selfDeclaredMadeForKids: false,
    };
    if (data.publishAt) status["publishAt"] = new Date(data.publishAt).toISOString();

    const res = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          "content-type": "application/json",
          "X-Upload-Content-Length": String(data.fileSize),
          "X-Upload-Content-Type": data.mimeType,
        },
        body: JSON.stringify({
          snippet: {
            title: data.title,
            description: data.description,
            tags: data.tags,
            categoryId: data.categoryId,
          },
          status,
        }),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as any;
      throw new Error(body?.error?.message ?? "Could not start the upload session");
    }
    const uploadUrl = res.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube did not return an upload URL");

    const { data: job, error } = await supabaseAdmin
      .from("upload_jobs")
      .insert({
        user_id: context.userId,
        channel_row_id: conn.channelRowId,
        file_name: data.fileName,
        file_size: data.fileSize,
        status: "uploading",
        scheduled_at: data.publishAt ? new Date(data.publishAt).toISOString() : null,
        metadata: {
          title: data.title,
          description: data.description,
          tags: data.tags,
          privacyStatus: data.privacyStatus,
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { uploadUrl, jobId: job.id };
  });

export const completeUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        videoId: z.string().nullable().optional(),
        status: z.enum(["completed", "failed"]),
        errorMessage: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("upload_jobs")
      .update({
        video_id: data.videoId ?? null,
        status: data.status,
        progress: data.status === "completed" ? 100 : 0,
        error_message: data.errorMessage ?? null,
      })
      .eq("id", data.jobId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listUploadJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("upload_jobs")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { jobs: data ?? [] };
  });

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().default(28) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { getActiveConnection, youtubeApi } = await import("./youtube.server");
    const conn = await getActiveConnection(context.userId);
    const end = new Date();
    const start = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const res = await youtubeApi<any>(
      conn.accessToken,
      "https://youtubeanalytics.googleapis.com/v2/reports",
      {
        query: {
          ids: "channel==MINE",
          startDate: fmt(start),
          endDate: fmt(end),
          metrics: "views,estimatedMinutesWatched,subscribersGained,likes",
          dimensions: "day",
          sort: "day",
        },
      },
    );
    const rows: any[] = res.rows ?? [];
    const series = rows.map((r) => ({
      date: r[0] as string,
      views: Number(r[1] ?? 0),
      minutes: Number(r[2] ?? 0),
      subscribers: Number(r[3] ?? 0),
      likes: Number(r[4] ?? 0),
    }));
    const totals = series.reduce(
      (acc, r) => ({
        views: acc.views + r.views,
        minutes: acc.minutes + r.minutes,
        subscribers: acc.subscribers + r.subscribers,
        likes: acc.likes + r.likes,
      }),
      { views: 0, minutes: 0, subscribers: 0, likes: 0 },
    );
    return { series, totals };
  });
