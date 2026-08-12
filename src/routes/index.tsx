import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, CalendarClock, ListVideo, PlaySquare, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TubePilot — Run your YouTube channel like a studio" },
      {
        name: "description",
        content:
          "Connect your YouTube channel and upload, schedule, edit metadata, manage playlists and track analytics from one premium dashboard.",
      },
      { property: "og:title", content: "TubePilot — Run your YouTube channel like a studio" },
      {
        property: "og:description",
        content: "Upload, schedule and analyse your YouTube channel from one premium dashboard.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Upload, title: "Resumable uploads", body: "Send large video files straight to YouTube with live progress." },
  { icon: CalendarClock, title: "Publish or schedule", body: "Go live now or queue a premiere at the perfect moment." },
  { icon: ListVideo, title: "Playlists & metadata", body: "Edit titles, descriptions, tags, thumbnails and playlists." },
  { icon: BarChart3, title: "Real analytics", body: "Views, watch time, likes and subscriber growth from YouTube." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <PlaySquare className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-bold">TubePilot</span>
        </div>
        <Button asChild variant="secondary">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="hero-glow">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            YouTube channel management
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-6xl">
            Run your channel like a studio
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
            Connect your channel with Google in one click, then upload, schedule, edit and analyse
            everything from a single console.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Get started free</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/dashboard">Open dashboard</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="glass-panel">
            <CardContent className="p-6">
              <Icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
