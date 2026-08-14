import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, RefreshCw, ThumbsUp, Users, Video } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ConnectChannel } from "@/components/connect-channel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalytics, useSyncChannel, useVideos, useYoutubeStatus } from "@/hooks/useYoutube";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — TubePilot" },
      { name: "description", content: "Channel health, recent uploads and performance at a glance." },
      { property: "og:title", content: "Dashboard — TubePilot" },
      { property: "og:description", content: "Your YouTube channel overview inside TubePilot." },
    ],
  }),
  component: Dashboard,
});

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="glass-panel">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <p className="mt-3 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

const JOB_LABEL: Record<string, string> = {
  pending: "Queued",
  uploading: "Uploading",
  completed: "Published on YouTube",
  failed: "Failed",
};

function UploadQueue() {
  const jobs = useUploadJobs();
  const reconcile = useReconcileUpload();
  const list = jobs.data?.jobs ?? [];
  if (!list.length) return null;

  return (
    <Card className="glass-panel mt-6">
      <CardHeader>
        <CardTitle className="text-base">Upload queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.slice(0, 5).map((job: any) => (
          <div
            key={job.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {(job.metadata?.title as string) || job.file_name || "Untitled"}
              </p>
              <p className="text-xs text-muted-foreground">
                {job.video_type === "short" ? "YouTube Short" : "Long Video"} ·{" "}
                {JOB_LABEL[job.status] ?? job.status}
                {job.error_message ? ` · ${job.error_message}` : ""}
              </p>
            </div>
            {job.video_id ? (
              <a
                className="text-xs text-primary underline"
                href={`https://www.youtube.com/watch?v=${job.video_id}`}
                target="_blank"
                rel="noreferrer"
              >
                View
              </a>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={reconcile.isPending}
                onClick={() => reconcile.mutate(job.id)}
              >
                Check with YouTube
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Dashboard() {

  const status = useYoutubeStatus();
  const sync = useSyncChannel();
  const channel = status.data?.channels?.[0];
  const videos = useVideos("");
  const analytics = useAnalytics(28);

  if (status.isLoading) {
    return (
      <AppShell title="Dashboard">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (!channel) {
    return (
      <AppShell title="Dashboard" description="Connect a channel to get started">
        <ConnectChannel />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Dashboard"
      description={channel.title}
      actions={
        <Button variant="secondary" onClick={() => sync.mutate()} disabled={sync.isPending}>
          <RefreshCw className={sync.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          <span className="ml-2 hidden sm:inline">Refresh</span>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Subscribers" value={Number(channel.subscriber_count ?? 0).toLocaleString()} />
        <Stat icon={Eye} label="Total views" value={Number(channel.view_count ?? 0).toLocaleString()} />
        <Stat icon={Video} label="Videos" value={Number(channel.video_count ?? 0).toLocaleString()} />
        <Stat
          icon={ThumbsUp}
          label="Views (28 days)"
          value={analytics.data ? analytics.data.totals.views.toLocaleString() : "—"}
        />
      </div>

      <Card className="glass-panel mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Recent uploads</CardTitle>
          <Button asChild size="sm" variant="secondary">
            <Link to="/videos">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {videos.isLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)
          ) : videos.data?.videos.length ? (
            videos.data.videos.slice(0, 5).map((v: any) => (
              <div key={v.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt={v.title} className="h-12 w-20 rounded object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{v.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.views.toLocaleString()} views · {v.privacyStatus}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No videos found yet.</p>
          )}
        </CardContent>
      </Card>

      <UploadQueue />
    </AppShell>

  );
}
