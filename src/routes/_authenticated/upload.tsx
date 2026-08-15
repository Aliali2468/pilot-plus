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


export const Route = createFileRoute("/_authenticated/upload")({
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
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Stable per-file key so a retry after an uncertain result never uploads twice.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const busy =
    phase.kind === "uploading" || phase.kind === "verifying" || phase.kind === "thumbnail";
  const typeIssues = videoType === "short" ? shortsIssues(meta) : [];

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


  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
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
            <div className="space-y-2">
              <Label>Video file</Label>
              <Input
                type="file"
                accept="video/*"
                required
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
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

            {phase.kind === "uploading" ? (
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
                  : "Upload to YouTube"}
            </Button>

          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
