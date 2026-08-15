/** Browser-only media helpers (call from event handlers, never during render). */

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export type VideoMeta = { durationSeconds: number; width: number; height: number };

/** Reads real dimensions/duration from the chosen file so the Short/Long choice
 * can be validated against YouTube's actual Shorts rules. */
export function probeVideoFile(file: File): Promise<VideoMeta | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const meta = {
        durationSeconds: Number.isFinite(el.duration) ? el.duration : 0,
        width: el.videoWidth,
        height: el.videoHeight,
      };
      URL.revokeObjectURL(url);
      resolve(meta.width && meta.height ? meta : null);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    el.src = url;
  });
}

/** YouTube treats an upload as a Short when it is vertical/square and <= 3 min. */
export function shortsIssues(meta: VideoMeta | null): string[] {
  if (!meta) return [];
  const issues: string[] = [];
  if (meta.height < meta.width) issues.push("the video is horizontal — Shorts must be vertical (9:16) or square");
  if (meta.durationSeconds > 180) issues.push("the video is longer than 3 minutes");
  return issues;
}

export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

export function validateThumbnailFile(file: File): string | null {
  if (!["image/jpeg", "image/png"].includes(file.type)) return "Thumbnail must be a JPG or PNG image.";
  if (file.size > THUMBNAIL_MAX_BYTES) return "Thumbnail must be smaller than 2 MB.";
  return null;
}

export function loadImageMeta(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const meta = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
