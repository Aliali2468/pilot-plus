import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ConnectChannel } from "@/components/connect-channel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useVideos, useYoutubeStatus } from "@/hooks/useYoutube";
import { deleteVideo, setThumbnail, updateVideo } from "@/lib/youtube.functions";

export const Route = createFileRoute("/_authenticated/videos")({
  head: () => ({
    meta: [
      { title: "Videos — TubePilot" },
      { name: "description", content: "Edit metadata, thumbnails, visibility and schedules for your videos." },
      { property: "og:title", content: "Videos — TubePilot" },
      { property: "og:description", content: "Manage every video on your connected channel." },
    ],
  }),
  component: VideosPage,
});

type VideoItem = NonNullable<ReturnType<typeof useVideos>["data"]>["videos"][number];

function VideosPage() {
  const status = useYoutubeStatus();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const videos = useVideos(query);
  const [editing, setEditing] = useState<VideoItem | null>(null);
  const queryClient = useQueryClient();

  const update = useServerFn(updateVideo);
  const remove = useServerFn(deleteVideo);
  const thumb = useServerFn(setThumbnail);

  const removeMutation = useMutation({
    mutationFn: (videoId: string) => remove({ data: { videoId } }),
    onSuccess: () => {
      toast.success("Video deleted");
      queryClient.invalidateQueries({ queryKey: ["youtube", "videos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: async (form: {
      videoId: string;
      title: string;
      description: string;
      tags: string[];
      privacyStatus: "public" | "unlisted" | "private";
      publishAt: string | null;
      thumbnail: File | null;
    }) => {
      await update({
        data: {
          videoId: form.videoId,
          title: form.title,
          description: form.description,
          tags: form.tags,
          privacyStatus: form.privacyStatus,
          publishAt: form.publishAt,
        },
      });
      if (form.thumbnail) {
        const base64 = await fileToBase64(form.thumbnail);
        await thumb({
          data: { videoId: form.videoId, base64, mimeType: form.thumbnail.type },
        });
      }
    },
    onSuccess: () => {
      toast.success("Video updated");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["youtube", "videos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!status.isLoading && !status.data?.connected) {
    return (
      <AppShell title="Videos">
        <ConnectChannel />
      </AppShell>
    );
  }

  return (
    <AppShell title="Videos" description="Edit metadata, thumbnails and visibility">
      <form
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search);
        }}
      >
        <Input
          placeholder="Search your videos"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" />
        </Button>
      </form>

      {videos.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : videos.error ? (
        <p className="text-sm text-destructive">{(videos.error as Error).message}</p>
      ) : videos.data?.videos.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {videos.data.videos.map((v) => (
            <Card key={v.id} className="glass-panel overflow-hidden">
              {v.thumbnail ? (
                <img src={v.thumbnail} alt={v.title} className="h-40 w-full object-cover" />
              ) : null}
              <CardContent className="space-y-3 p-4">
                <p className="line-clamp-2 text-sm font-medium">{v.title}</p>
                <p className="text-xs text-muted-foreground">
                  {v.views.toLocaleString()} views · {v.likes.toLocaleString()} likes ·{" "}
                  {v.privacyStatus}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(v)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Delete this video from YouTube?")) removeMutation.mutate(v.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No videos found.</p>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit video</DialogTitle>
          </DialogHeader>
          {editing ? (
            <EditForm
              video={editing}
              busy={saveMutation.isPending}
              onSubmit={(values) => saveMutation.mutate({ videoId: editing.id, ...values })}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function EditForm({
  video,
  busy,
  onSubmit,
}: {
  video: VideoItem;
  busy: boolean;
  onSubmit: (values: {
    title: string;
    description: string;
    tags: string[];
    privacyStatus: "public" | "unlisted" | "private";
    publishAt: string | null;
    thumbnail: File | null;
  }) => void;
}) {
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description);
  const [tags, setTags] = useState(video.tags.join(", "));
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">(
    (video.privacyStatus as any) ?? "private",
  );
  const [publishAt, setPublishAt] = useState(
    video.publishAt ? new Date(video.publishAt).toISOString().slice(0, 16) : "",
  );
  const [thumbnail, setThumb] = useState<File | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          title,
          description,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          privacyStatus: privacy,
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
          thumbnail,
        });
      }}
    >
      <div className="space-y-2">
        <Label>Title</Label>
        <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} required />
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
          <Label>Scheduled publish (private only)</Label>
          <Input
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Replace thumbnail</Label>
        <Input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => setThumb(e.target.files?.[0] ?? null)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i] as number);
  return btoa(binary);
}
