import { createFileRoute, redirect } from "@tanstack/react-router";

// Private single-owner installation: the app opens straight on the dashboard.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "TubePilot — YouTube channel console" },
      {
        name: "description",
        content:
          "Private TubePilot console: upload, schedule, edit metadata, manage playlists and track analytics for your YouTube channel.",
      },
      { property: "og:title", content: "TubePilot — YouTube channel console" },
      {
        property: "og:description",
        content: "Upload, schedule and analyse your YouTube channel from one private dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => null,
});
