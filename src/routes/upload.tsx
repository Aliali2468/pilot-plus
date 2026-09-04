import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ConnectChannel } from "@/components/connect-channel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useYoutubeStatus } from "@/hooks/useYoutube";
import {
  fileToBase64,
  loadImageMeta,
  probeVideoFile,
  shortsIssues,
  validateThumbnailFile,
  type VideoMeta,
} from "@/lib/media";
import { completeUpload, createUploadSession, reconcileUpload, setThumbnail } from "@/lib/youtube.functions";
import { getJobProgress, importFromTelegram } from "@/lib/telegram.functions";
import { useTelegramStatus } from "@/hooks/useTelegram";


export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload — TubePilot" },
      { name: "description", content: "Upload a video to YouTube with metadata, visibility and scheduling." },
      { property: "og:title", content: "Upload — TubePilot" },
      { property: "og:description", content: "Send a new video to your channel from TubePilot." },
    ],
  }),
  component: UploadPage,
});

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "verifying" }
  | { kind: "thumbnail"; videoId: string }
  | { kind: "processing"; videoId: string }
  | { kind: "done"; videoId: string };

function UploadPage() {
  const status = useYoutubeStatus();
  const navigate = useNavigate();
  const startSession = useServerFn(createUploadSession);
  const finish = useServerFn(completeUpload);
  const reconcile = useServerFn(reconcileUpload);
  const putThumbnail = useServerFn(setThumbnail);

  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [videoType, setVideoType] = useState<"long" | "short">("long");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("private");
  const [publishAt, setPublishAt] = useState("");
  const [thumbnail, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [thumbnailNote, setThumbnailNote] = useState<string | null>(null);
  const [source, setSource] = useState<"device" | "telegram">("device");
  const [transfer, setTransfer] = useState<{
    phase: string;
    sent: number;
    total: number;
    bytesPerSecond: number;
  } | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Stable per-file key so a retry after an uncertain result never uploads twice.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const busy =
    phase.kind === "uploading" || phase.kind === "verifying" || phase.kind === "thumbnail";
  const typeIssues = source === "device" && videoType === "short" ? shortsIssues(meta) : [];
  const telegram = useTelegramStatus();
  const startImport = useServerFn(importFromTelegram);
  const readProgress = useServerFn(getJobProgress);

  const pickFile = async (next: File | null) => {
    setFile(next);
    setIdempotencyKey(
      next ? `${next.name}:${next.size}:${next.lastModified}:${crypto.randomUUID()}` : null,
    );
    setPhase({ kind: "idle" });
    setMeta(next ? await probeVideoFile(next) : null);
  };

  const pickThumbnail = async (next: File | null) => {
    if (!next) {
      setThumbnailFile(null);
      setThumbnailPreview(null);
      setThumbnailNote(null);
      return;
    }
    const error = validateThumbnailFile(next);
    if (error) {
      setThumbnailFile(null);
      setThumbnailPreview(null);
      setThumbnailNote(error);
      toast.error(error);
      return;
    }
    const size = await loadImageMeta(next);
    setThumbnailFile(next);
    setThumbnailPreview(URL.createObjectURL(next));
    setThumbnailNote(
      size && size.width < 1280
        ? `${size.width}×${size.height} — YouTube recommends at least 1280×720.`
        : size
          ? `${size.width}×${size.height} · ${(next.size / 1024).toFixed(0)} KB`
          : null,
    );
  };

  /** Thumbnails can only be set once the video exists on YouTube. */
  const applyThumbnail = async (videoId: string) => {
    if (!thumbnail) return;
    setPhase({ kind: "thumbnail", videoId });
    try {
      const base64 = await fileToBase64(thumbnail);
      await putThumbnail({ data: { videoId, base64, mimeType: thumbnail.type } });
      toast.success("Custom thumbnail applied");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Video uploaded, but the thumbnail failed: ${error.message}`
          : "Video uploaded, but the thumbnail failed",
      );
    }
  };


  const settle = async (jobId: string, result: Awaited<ReturnType<typeof reconcile>>) => {
    if (result.state === "completed" && result.videoId) {
      await applyThumbnail(result.videoId);
      if (result.processing) {
        setPhase({ kind: "processing", videoId: result.videoId });
        toast.success("Upload complete — YouTube is still processing the video");
      } else {
        setPhase({ kind: "done", videoId: result.videoId });
        toast.success("Video uploaded to YouTube");
      }
      setTimeout(() => navigate({ to: "/videos" }), 1200);
      return true;
    }
    if (result.state === "incomplete") {
      setPhase({ kind: "idle" });
      toast.error("The connection dropped before YouTube received the whole file. Try again.");
      return false;
    }
    setPhase({ kind: "idle" });
    void finish({ data: { jobId, videoId: null, status: "failed", errorMessage: "Upload failed" } });
    toast.error("Upload failed — YouTube did not receive the video");
    return false;
  };


  /** Polls the real server-side byte counters while the import runs. */
  const watchJob = (idempotencyKey: string) => {
    let previous = { bytes: 0, at: Date.now() };
    const timer = setInterval(async () => {
      try {
        const job = await readProgress({ data: { idempotencyKey } });
        if (!job) return;
        const now = Date.now();
        const bytes = Number(job.bytes_transferred ?? 0);
        const seconds = Math.max((now - previous.at) / 1000, 0.001);
        const speed = Math.max(bytes - previous.bytes, 0) / seconds;
        previous = { bytes, at: now };
        setTransfer({
          phase: job.transfer_phase ?? job.status,
          sent: bytes,
          total: Number(job.total_bytes ?? 0),
          bytesPerSecond: speed,
        });
      } catch {
        /* transient poll failure — keep watching */
      }
    }, 1500);
    return () => clearInterval(timer);
  };

  const submitTelegram = async () => {
    const key = idempotencyKey ?? `telegram:${crypto.randomUUID()}`;
    setIdempotencyKey(key);
    setPhase({ kind: "uploading", progress: 0 });
    setTransfer({ phase: "finding", sent: 0, total: 0, bytesPerSecond: 0 });
    const stop = watchJob(key);
    try {
      const started = startImport({
        data: {
          title,
          description,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          privacyStatus: privacy,
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
          videoType,
          idempotencyKey: key,
        },
      });
      const result = await started;
      let videoId = result.videoId;

      // Queued to the Local Bot API worker: wait for the server-side transfer.
      if (!videoId) {
        while (!videoId) {
          await new Promise((r) => setTimeout(r, 2000));
          const job = await readProgress({ data: { idempotencyKey: key } });
          if (job?.video_id) videoId = job.video_id;
          else if (job?.status === "failed")
            throw new Error(job.error_message ?? "The Telegram transfer failed");
        }
      }

      stop();
      await applyThumbnail(videoId);
      setPhase({ kind: "done", videoId });
      setTransfer(null);
      toast.success("Telegram video uploaded to YouTube");
      setTimeout(() => navigate({ to: "/videos" }), 1200);

    } catch (error) {
      stop();
      setTransfer(null);
      setPhase({ kind: "idle" });
      toast.error(error instanceof Error ? error.message : "Telegram import failed");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (source === "telegram") {
      await submitTelegram();
      return;
    }
    if (!file || !idempotencyKey) {
      toast.error("Choose a video file first");
      return;
    }
    if (typeIssues.length > 0) {
      toast.error(`This file cannot become a Short: ${typeIssues.join(" and ")}.`);
      return;
    }
    setPhase({ kind: "uploading", progress: 0 });

    let jobId: string | null = null;
    try {
      const session = await startSession({
        data: {
          title,
          description,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          privacyStatus: privacy,
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "video/*",
          videoType,
          idempotencyKey,
          origin: window.location.origin,
        },
      });
      jobId = session.jobId;

      // The file already reached YouTube on an earlier attempt — never re-upload.
      if (session.alreadyUploaded || !session.uploadUrl) {
        setPhase({ kind: "verifying" });
        await settle(jobId, await reconcile({ data: { jobId } }));
        return;
      }
      const uploadUrl = session.uploadUrl;

      const outcome = await new Promise<
        { ok: true; videoId: string } | { ok: false; uncertain: boolean }
      >((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "video/*");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setPhase({ kind: "uploading", progress: Math.round((e.loaded / e.total) * 100) });
        };
        xhr.upload.onload = () => setPhase({ kind: "verifying" });
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve({ ok: true, videoId: JSON.parse(xhr.responseText).id as string });
            } catch {
              resolve({ ok: false, uncertain: true });
            }
          } else {
            resolve({ ok: false, uncertain: xhr.status === 0 || xhr.status >= 500 });
          }
        };
        // A blocked/dropped response is NOT proof of failure — verify with YouTube.
        xhr.onerror = () => resolve({ ok: false, uncertain: true });
        xhr.ontimeout = () => resolve({ ok: false, uncertain: true });
        xhr.onabort = () => resolve({ ok: false, uncertain: true });
        xhr.send(file);
      });

      if (outcome.ok) {
        await finish({ data: { jobId, videoId: outcome.videoId, status: "completed" } });
        await applyThumbnail(outcome.videoId);
        setPhase({ kind: "done", videoId: outcome.videoId });
        toast.success("Video uploaded to YouTube");
        setTimeout(() => navigate({ to: "/videos" }), 1000);
        return;
      }

      setPhase({ kind: "verifying" });
      await settle(jobId, await reconcile({ data: { jobId } }));
    } catch (error) {
      if (jobId) {
        try {
          setPhase({ kind: "verifying" });
          if (await settle(jobId, await reconcile({ data: { jobId } }))) return;
          return;
        } catch {
          /* fall through to the error toast */
        }
      }
      setPhase({ kind: "idle" });
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  };

  if (!status.isLoading && !status.data?.connected) {
    return (
      <AppShell title="Upload">
        <ConnectChannel />
      </AppShell>
    );
  }


  return (
    <AppShell title="Upload video" description="Metadata, visibility and scheduling">
      <Card className="glass-panel mx-auto max-w-2xl">
        <CardContent className="p-6">
          <form className="space-y-5" onSubmit={submit}>
            <div className="space-y-2">
              <Label>Video source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as "device" | "telegram")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="device">Upload from device</SelectItem>
                  <SelectItem value="telegram">Import from Telegram</SelectItem>
                </SelectContent>
              </Select>
              {source === "telegram" ? (
                <div className="rounded-xl border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                  {telegram.data?.connected ? (
                    <>
                      <p>
                        Connected{telegram.data.botUsername ? ` via ${telegram.data.botUsername}` : ""}.
                        TubePilot takes the <strong>latest</strong> message the bot received and
                        transfers it Telegram → server → YouTube. Your device only shows progress.
                      </p>
                      <p className="mt-2">
                        Latest message:{" "}
                        {telegram.data.latestMessage?.has_video
                          ? `${telegram.data.latestMessage.file_name} · ${(
                              (telegram.data.latestMessage.file_size ?? 0) /
                              1024 /
                              1024
                            ).toFixed(1)} MB`
                          : "no video yet — forward the video to the bot, then reload."}
                      </p>
                    </>
                  ) : (
                    <p>
                      Telegram is not linked yet. Open Settings → Telegram import to connect your
                      chat with the TubePilot bot.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Video type</Label>
              <Select value={videoType} onValueChange={(v) => setVideoType(v as "long" | "short")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="long">Long Video</SelectItem>
                  <SelectItem value="short">YouTube Short</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {videoType === "short"
                  ? "YouTube classifies a Short by the file itself: vertical (9:16 or narrower) and 3 minutes or less. TubePilot adds a #Shorts tag to the description to reinforce it."
                  : "Standard upload — any aspect ratio or length."}
              </p>
            </div>
            {source === "device" ? (
            <div className="space-y-2">
              <Label>Video file</Label>
              <Input
                type="file"
                accept="video/*"
                required
                onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
              />
              {meta ? (
                <p className="text-xs text-muted-foreground">
                  {meta.width}×{meta.height} · {Math.round(meta.durationSeconds)}s ·{" "}
                  {meta.height >= meta.width ? "vertical/square" : "horizontal"}
                </p>
              ) : null}
              {typeIssues.length > 0 ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  YouTube will not treat this file as a Short: {typeIssues.join(" and ")}. Choose a
                  vertical clip of 3 minutes or less, or switch to Long Video.
                </p>
              ) : null}
            </div>
            ) : null}
            <div className="space-y-2">
              <Label>Custom thumbnail (optional)</Label>
              <Input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => void pickThumbnail(e.target.files?.[0] ?? null)}
              />
              {thumbnailPreview ? (
                <img
                  src={thumbnailPreview}
                  alt="Thumbnail preview"
                  className="aspect-video w-48 rounded-lg border border-border object-cover"
                />
              ) : null}
              <p className="text-xs text-muted-foreground">
                {thumbnailNote ?? "JPG or PNG, up to 2 MB, 1280×720 recommended. Applied right after the video reaches YouTube."}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                maxLength={100}
                required
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Visibility</Label>
                <Select value={privacy} onValueChange={(v) => setPrivacy(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="unlisted">Unlisted</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Schedule (optional)</Label>
                <Input
                  type="datetime-local"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                />
              </div>
            </div>

            {transfer ? (
              <div className="space-y-2">
                <Progress
                  value={transfer.total ? Math.round((transfer.sent / transfer.total) * 100) : 0}
                />
                <p className="text-xs text-muted-foreground">
                  {transfer.phase === "finding"
                    ? "Finding the latest Telegram message…"
                    : transfer.phase === "downloading"
                      ? "Starting the download from Telegram…"
                      : transfer.phase === "transferring"
                        ? "Telegram → TubePilot server → YouTube"
                        : transfer.phase === "completed"
                          ? "Transfer complete"
                          : transfer.phase}
                  {transfer.total
                    ? ` · ${(transfer.sent / 1024 / 1024).toFixed(1)} / ${(
                        transfer.total /
                        1024 /
                        1024
                      ).toFixed(1)} MB · ${Math.round((transfer.sent / transfer.total) * 100)}%`
                    : ""}
                  {transfer.bytesPerSecond > 0
                    ? ` · ${(transfer.bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s · ~${Math.max(
                        Math.round(
                          (transfer.total - transfer.sent) / Math.max(transfer.bytesPerSecond, 1),
                        ),
                        0,
                      )}s left`
                    : ""}
                </p>
              </div>
            ) : null}
            {phase.kind === "uploading" && source === "device" ? (
              <div className="space-y-2">
                <Progress value={phase.progress} />
                <p className="text-xs text-muted-foreground">Uploading… {phase.progress}%</p>
              </div>
            ) : null}
            {phase.kind === "verifying" ? (
              <div className="space-y-2">
                <Progress value={100} />
                <p className="text-xs text-muted-foreground">
                  Confirming the upload with YouTube…
                </p>
              </div>
            ) : null}
            {phase.kind === "thumbnail" ? (
              <div className="space-y-2">
                <Progress value={100} />
                <p className="text-xs text-muted-foreground">Applying your custom thumbnail…</p>
              </div>
            ) : null}
            {phase.kind === "processing" || phase.kind === "done" ? (
              <p className="rounded-xl border border-border bg-card/60 p-3 text-sm">
                {phase.kind === "processing"
                  ? "Uploaded successfully. YouTube is processing the video."
                  : "Uploaded and published successfully."}{" "}
                <a
                  className="text-primary underline"
                  href={`https://www.youtube.com/watch?v=${phase.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on YouTube
                </a>
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {phase.kind === "uploading"
                ? "Uploading…"
                : phase.kind === "verifying"
                  ? "Verifying…"
                  : phase.kind === "thumbnail"
                    ? "Applying thumbnail…"
                    : "Upload to YouTube"}
            </Button>

          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
