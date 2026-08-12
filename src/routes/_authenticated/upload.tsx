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
import { completeUpload, createUploadSession } from "@/lib/youtube.functions";

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

function UploadPage() {
  const status = useYoutubeStatus();
  const navigate = useNavigate();
  const startSession = useServerFn(createUploadSession);
  const finish = useServerFn(completeUpload);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("private");
  const [publishAt, setPublishAt] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      toast.error("Choose a video file first");
      return;
    }
    setProgress(0);
    try {
      const { uploadUrl, jobId } = await startSession({
        data: {
          title,
          description,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          privacyStatus: privacy,
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "video/*",
        },
      });

      const videoId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "video/*");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText).id as string);
            } catch {
              reject(new Error("Upload finished but YouTube returned an unexpected response"));
            }
          } else {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      await finish({ data: { jobId, videoId, status: "completed" } });
      toast.success("Video uploaded to YouTube");
      setProgress(null);
      navigate({ to: "/videos" });
    } catch (error) {
      setProgress(null);
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
              <Label>Video file</Label>
              <Input
                type="file"
                accept="video/*"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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

            {progress !== null ? (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={progress !== null}>
              {progress !== null ? "Uploading…" : "Upload to YouTube"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
