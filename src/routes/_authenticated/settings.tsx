import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ConnectChannel } from "@/components/connect-channel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useDisconnectChannel, useSyncChannel, useYoutubeStatus } from "@/hooks/useYoutube";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — TubePilot" },
      { name: "description", content: "Manage your TubePilot account and connected YouTube channel." },
      { property: "og:title", content: "Settings — TubePilot" },
      { property: "og:description", content: "Account and channel connection settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const status = useYoutubeStatus();
  const sync = useSyncChannel();
  const disconnect = useDisconnectChannel();

  return (
    <AppShell title="Settings" description="Account and channel connection">
      <div className="grid max-w-3xl gap-6">
        <Card className="glass-panel">
          <CardContent className="p-5">
            <h2 className="text-base font-semibold">Account</h2>
            <p className="mt-2 text-sm text-muted-foreground">{user?.email}</p>
          </CardContent>
        </Card>

        {status.data?.channels?.length ? (
          status.data.channels.map((channel) => (
            <Card key={channel.id} className="glass-panel">
              <CardContent className="flex flex-wrap items-center gap-4 p-5">
                {channel.thumbnail_url ? (
                  <img
                    src={channel.thumbnail_url}
                    alt={channel.title}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{channel.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {channel.google_email ?? channel.handle ?? channel.channel_id}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => sync.mutate()} disabled={sync.isPending}>
                  Refresh data
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Disconnect this channel from TubePilot?"))
                      disconnect.mutate(channel.id);
                  }}
                >
                  Disconnect
                </Button>
              </CardContent>
            </Card>
          ))
        ) : (
          <ConnectChannel compact />
        )}
      </div>
    </AppShell>
  );
}
