/**
 * Server-only helpers shared by the Telegram import path and the Local Bot API
 * worker endpoints. Opening the YouTube resumable session here means the worker
 * never sees a Google token — it only receives a short-lived upload URL.
 */

export type ResumableSessionInput = {
  accessToken: string;
  totalBytes: number;
  mimeType: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: "public" | "unlisted" | "private";
  publishAt?: string | null;
  videoType: "long" | "short";
};

export async function startYoutubeResumableSession(input: ResumableSessionInput): Promise<string> {
  const description =
    input.videoType === "short" && !/#shorts/i.test(input.description)
      ? `${input.description}\n\n#Shorts`.trim()
      : input.description;

  const status: Record<string, unknown> = {
    privacyStatus: input.publishAt ? "private" : input.privacyStatus,
    selfDeclaredMadeForKids: false,
  };
  if (input.publishAt) status["publishAt"] = new Date(input.publishAt).toISOString();

  const res = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
        "X-Upload-Content-Length": String(input.totalBytes),
        "X-Upload-Content-Type": input.mimeType,
      },
      body: JSON.stringify({
        snippet: {
          title: input.title,
          description,
          tags: input.tags,
          categoryId: input.categoryId,
        },
        status,
      }),
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as any;
    throw new Error(err?.error?.message ?? "Could not start the YouTube upload session");
  }
  const uploadUrl = res.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return an upload URL");
  return uploadUrl;
}

/** Constant-time shared-secret check for worker -> TubePilot calls. */
export function workerAuthorized(request: Request): boolean {
  const expected = process.env["TELEGRAM_WORKER_SECRET"];
  if (!expected) return false;
  const provided = request.headers.get("x-worker-secret") ?? "";
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Jobs stuck in "uploading" for longer than this are handed out again. */
export const CLAIM_TIMEOUT_MS = 30 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
