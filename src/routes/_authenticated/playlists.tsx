import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ConnectChannel } from "@/components/connect-channel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { usePlaylists, useYoutubeStatus } from "@/hooks/useYoutube";
import { createPlaylist, deletePlaylist } from "@/lib/youtube.functions";

export const Route = createFileRoute("/_authenticated/playlists")({
  head: () => ({
    meta: [
      { title: "Playlists — TubePilot" },
      { name: "description", content: "Create, review and delete playlists on your YouTube channel." },
      { property: "og:title", content: "Playlists — TubePilot" },
      { property: "og:description", content: "Organise your channel with playlists." },
    ],
  }),
  component: PlaylistsPage,
});

function PlaylistsPage() {
  const status = useYoutubeStatus();
  const playlists = usePlaylists();
  const queryClient = useQueryClient();
  const create = useServerFn(createPlaylist);
  const remove = useServerFn(deletePlaylist);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");

  const createMutation = useMutation({
    mutationFn: () => create({ data: { title, description, privacyStatus: privacy } }),
    onSuccess: () => {
      toast.success("Playlist created");
      setTitle("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["youtube", "playlists"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (playlistId: string) => remove({ data: { playlistId } }),
    onSuccess: () => {
      toast.success("Playlist deleted");
      queryClient.invalidateQueries({ queryKey: ["youtube", "playlists"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!status.isLoading && !status.data?.connected) {
    return (
      <AppShell title="Playlists">
        <ConnectChannel />
      </AppShell>
    );
  }

  return (
    <AppShell title="Playlists" description="Organise your channel">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {playlists.isLoading ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)
          ) : playlists.error ? (
            <p className="text-sm text-destructive">{(playlists.error as Error).message}</p>
          ) : playlists.data?.playlists.length ? (
            playlists.data.playlists.map((p: any) => (
              <Card key={p.id} className="glass-panel overflow-hidden">
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt={p.title} className="h-32 w-full object-cover" />
                ) : null}
                <CardContent className="space-y-2 p-4">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.itemCount} videos · {p.privacyStatus}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Delete this playlist?")) removeMutation.mutate(p.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No playlists yet.</p>
          )}
        </div>

        <Card className="glass-panel h-fit">
          <CardContent className="space-y-4 p-5">
            <h2 className="text-base font-semibold">New playlist</h2>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
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
            <Button
              className="w-full"
              disabled={!title || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating…" : "Create playlist"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
