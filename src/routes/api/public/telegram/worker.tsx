import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  CLAIM_TIMEOUT_MS,
  MAX_ATTEMPTS,
  workerAuthorized,
} from "@/lib/telegram-queue.server";

/**
 * Secure control plane for the Local Bot API worker container.
 * The worker polls `?action=claim`, streams the file itself, and reports back
 * through `progress` / `complete`. Every call is authenticated with the shared
 * worker secret; no Google or Supabase credential ever leaves this server.
 */

const progressSchema = z.object({
  jobId: z.string().uuid(),
  phase: z.enum(["downloading", "transferring", "uploading", "cleanup"]).optional(),
  bytesTransferred: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative().optional(),
});

const completeSchema = z.object({
  jobId: z.string().uuid(),
  videoId: z.string().min(1).optional(),
  error: z.string().max(2000).optional(),
});

const heartbeatSchema = z.object({
  workerId: z.string().min(1).max(80),
  version: z.string().max(40).optional(),
  botApiReady: z.boolean(),
  currentJobId: z.string().uuid().nullish(),
  completed: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
  lastError: z.string().max(2000).nullish(),
  startedAt: z.string().max(40).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const Route = createFileRoute("/api/public/telegram/worker")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("action") === "health") {
          return Response.json({
            ok: true,
            configured: Boolean(process.env["TELEGRAM_WORKER_SECRET"]),
          });
        }
        return new Response("Not found", { status: 404 });
      },

      POST: async ({ request }) => {
        if (!workerAuthorized(request)) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const action = url.searchParams.get("action");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (action === "claim") {
          const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS).toISOString();
          const { data: candidates, error } = await supabaseAdmin
            .from("upload_jobs")
            .select(
              "id, status, attempts, claimed_at, telegram_file_id, upload_url, total_bytes, file_name, metadata, video_id",
            )
            .eq("source", "telegram")
            .in("status", ["queued", "uploading"])
            .is("video_id", null)
            .not("upload_url", "is", null)
            .not("telegram_file_id", "is", null)
            .order("created_at", { ascending: true })
            .limit(10);
          if (error) return Response.json({ error: error.message }, { status: 500 });

          const job = (candidates ?? []).find(
            (row) =>
              row.status === "queued" ||
              (row.claimed_at !== null && row.claimed_at < staleBefore),
          );
          if (!job) return Response.json({ job: null });

          if ((job.attempts ?? 0) >= MAX_ATTEMPTS) {
            await supabaseAdmin
              .from("upload_jobs")
              .update({
                status: "failed",
                transfer_phase: "failed",
                error_message: "Transfer failed after several attempts",
              })
              .eq("id", job.id);
            return Response.json({ job: null });
          }

          // Optimistic claim: the status guard keeps two workers off one job.
          const { data: claimed } = await supabaseAdmin
            .from("upload_jobs")
            .update({
              status: "uploading",
              transfer_phase: "downloading",
              claimed_at: new Date().toISOString(),
              attempts: (job.attempts ?? 0) + 1,
            })
            .eq("id", job.id)
            .eq("status", job.status)
            .select("id")
            .maybeSingle();
          if (!claimed) return Response.json({ job: null });

          const meta = (job.metadata ?? {}) as Record<string, unknown>;
          return Response.json({
            job: {
              jobId: job.id,
              fileId: job.telegram_file_id,
              uploadUrl: job.upload_url,
              totalBytes: job.total_bytes,
              fileName: job.file_name,
              mimeType: (meta["mimeType"] as string) ?? "video/mp4",
            },
          });
        }

        if (action === "heartbeat") {
          const body = heartbeatSchema.parse(await request.json());
          await supabaseAdmin.from("worker_heartbeats").upsert(
            {
              worker_id: body.workerId,
              version: body.version ?? null,
              bot_api_ready: body.botApiReady,
              current_job_id: body.currentJobId ?? null,
              completed: body.completed ?? 0,
              failed: body.failed ?? 0,
              last_error: body.lastError ?? null,
              started_at: body.startedAt ?? null,
              details: (body.details ?? {}) as Record<string, unknown>,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "worker_id" },
          );
          return Response.json({ ok: true });
        }

        if (action === "progress") {
          const body = progressSchema.parse(await request.json());
          const total = body.totalBytes ?? 0;
          await supabaseAdmin
            .from("upload_jobs")
            .update({
              transfer_phase: body.phase ?? "transferring",
              bytes_transferred: body.bytesTransferred,
              ...(total ? { total_bytes: total } : {}),
              ...(total
                ? { progress: Math.min(100, Math.round((body.bytesTransferred / total) * 100)) }
                : {}),
            })
            .eq("id", body.jobId);
          return Response.json({ ok: true });
        }

        if (action === "complete") {
          const body = completeSchema.parse(await request.json());

          if (body.videoId) {
            const { data: job } = await supabaseAdmin
              .from("upload_jobs")
              .select("total_bytes")
              .eq("id", body.jobId)
              .maybeSingle();
            await supabaseAdmin
              .from("upload_jobs")
              .update({
                status: "completed",
                transfer_phase: "completed",
                video_id: body.videoId,
                progress: 100,
                ...(job?.total_bytes ? { bytes_transferred: job.total_bytes } : {}),
                error_message: null,
              })
              .eq("id", body.jobId);
            return Response.json({ ok: true });
          }

          const { data: job } = await supabaseAdmin
            .from("upload_jobs")
            .select("attempts")
            .eq("id", body.jobId)
            .maybeSingle();
          const retry = (job?.attempts ?? MAX_ATTEMPTS) < MAX_ATTEMPTS;
          await supabaseAdmin
            .from("upload_jobs")
            .update({
              status: retry ? "queued" : "failed",
              transfer_phase: retry ? "queued" : "failed",
              claimed_at: null,
              error_message: body.error ?? "Telegram transfer failed",
            })
            .eq("id", body.jobId);
          return Response.json({ ok: true, retry });
        }

        return new Response("Unknown action", { status: 400 });
      },
    },
  },
});
