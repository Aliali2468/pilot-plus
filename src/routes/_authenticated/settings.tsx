import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ConnectChannel } from "@/components/connect-channel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
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

function ProfileCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  useEffect(() => {
    if (profile.data?.display_name) setDisplayName(profile.data.display_name);
  }, [profile.data?.display_name]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("user_id", user.id);
    setSavingProfile(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) toast.error(error.message);
    else {
      setPassword("");
      toast.success("Password changed");
    }
  };

  return (
    <Card className="glass-panel">
      <CardContent className="space-y-6 p-5">
        <div>
          <h2 className="text-base font-semibold">Account</h2>
          <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
        </div>

        <form className="grid gap-3 sm:max-w-sm" onSubmit={saveProfile}>
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save profile"}
          </Button>
        </form>

        <form className="grid gap-3 sm:max-w-sm" onSubmit={changePassword}>
          <div className="space-y-2">
            <Label htmlFor="change-password">New password</Label>
            <Input
              id="change-password"
              type="password"
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={savingPassword}>
            {savingPassword ? "Updating…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SettingsPage() {
  const status = useYoutubeStatus();
  const sync = useSyncChannel();
  const disconnect = useDisconnectChannel();

  return (
    <AppShell title="Settings" description="Account and channel connection">
      <div className="grid max-w-3xl gap-6">
        <ProfileCard />


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
