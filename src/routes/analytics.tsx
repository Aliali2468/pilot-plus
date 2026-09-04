import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppShell } from "@/components/app-shell";
import { ConnectChannel } from "@/components/connect-channel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalytics, useYoutubeStatus } from "@/hooks/useYoutube";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — TubePilot" },
      { name: "description", content: "Views, watch time, likes and subscriber growth for your channel." },
      { property: "og:title", content: "Analytics — TubePilot" },
      { property: "og:description", content: "Track channel performance over time." },
    ],
  }),
  component: AnalyticsPage,
});

const RANGES = [7, 28, 90];

function AnalyticsPage() {
  const status = useYoutubeStatus();
  const [days, setDays] = useState(28);
  const analytics = useAnalytics(days);

  if (!status.isLoading && !status.data?.connected) {
    return (
      <AppShell title="Analytics">
        <ConnectChannel />
      </AppShell>
    );
  }

  const totals = analytics.data?.totals;

  return (
    <AppShell
      title="Analytics"
      description={`Last ${days} days`}
      actions={
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === days ? "default" : "secondary"}
              onClick={() => setDays(r)}
            >
              {r}d
            </Button>
          ))}
        </div>
      }
    >
      {analytics.isLoading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : analytics.error ? (
        <p className="text-sm text-destructive">{(analytics.error as Error).message}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Views", totals?.views ?? 0],
              ["Watch time (min)", totals?.minutes ?? 0],
              ["Likes", totals?.likes ?? 0],
              ["Subscribers gained", totals?.subscribers ?? 0],
            ].map(([label, value]) => (
              <Card key={label as string} className="glass-panel">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {Number(value).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="glass-panel mt-6">
            <CardHeader>
              <CardTitle className="text-base">Views over time</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.data?.series ?? []}>
                  <defs>
                    <linearGradient id="views" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke="var(--color-primary)"
                    fill="url(#views)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}
