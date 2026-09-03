import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent } from "@/components/ui/card";
import { getWorkerStatus } from "@/lib/telegram.functions";

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : "bg-destructive"}`}
      aria-hidden
    />
  );
}

function ago(iso: string | null) {
  if (!iso) return "never";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return new Date(iso).toLocaleString();
}

/** Live health of the Telegram large-file transfer infrastructure. */
export function SystemStatus() {
  const fn = useServerFn(getWorkerStatus);
  const status = useQuery({
    queryKey: ["telegram", "worker-status"],
    queryFn: () => fn(),
    refetchInterval: 15_000,
    retry: false,
  });

  const data = status.data;

  return (
    <Card className="glass-panel">
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold">System status</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Health of the server-side Telegram → YouTube transfer service.
          </p>
        </div>

        {status.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : !data ? (
          <p className="text-sm text-destructive">Status unavailable.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="flex items-center gap-2">
                <Dot ok={data.online} /> Telegram worker:{" "}
                <span className="font-medium">{data.online ? "Online" : "Offline"}</span>
              </p>
              <p className="flex items-center gap-2">
                <Dot ok={data.localBotApi} /> Local Bot API:{" "}
                <span className="font-medium">
                  {data.localBotApi ? "Connected" : "Disconnected"}
                </span>
              </p>
              <p className="text-muted-foreground">
                Worker version: <span className="text-foreground">{data.version ?? "—"}</span>
              </p>
              <p className="text-muted-foreground">
                Last heartbeat: <span className="text-foreground">{ago(data.lastHeartbeat)}</span>
              </p>
              <p className="text-muted-foreground">
                Completed: <span className="text-foreground">{data.completed}</span> · Failed:{" "}
                <span className="text-foreground">{data.failed}</span>
              </p>
              <p className="text-muted-foreground">
                Active jobs: <span className="text-foreground">{data.jobs.length}</span>
              </p>
            </div>

            {data.jobs.length ? (
              <ul className="space-y-1 rounded-xl border border-border bg-card/60 p-3 text-xs">
                {data.jobs.map((job) => (
                  <li key={job.id} className="flex justify-between gap-3">
                    <span className="truncate">{job.file_name ?? job.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">
                      {job.transfer_phase ?? job.status} · {job.progress ?? 0}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {data.fallbackActive ? (
              <p className="rounded-xl border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                Large-file worker unavailable — imports fall back to the direct Bot API path
                (files up to 20 MB) so nothing breaks.
              </p>
            ) : null}

            {data.configErrors.length ? (
              <ul className="space-y-1 text-xs text-destructive">
                {data.configErrors.map((error) => (
                  <li key={error}>• {error}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-400">No configuration issues detected.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
