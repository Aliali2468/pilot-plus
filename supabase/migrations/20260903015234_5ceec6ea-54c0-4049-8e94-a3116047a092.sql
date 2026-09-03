CREATE TABLE IF NOT EXISTS public.worker_heartbeats (
  worker_id text PRIMARY KEY,
  version text,
  bot_api_ready boolean NOT NULL DEFAULT false,
  current_job_id uuid,
  completed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  last_error text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.worker_heartbeats TO authenticated;
GRANT ALL ON public.worker_heartbeats TO service_role;
ALTER TABLE public.worker_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view worker status" ON public.worker_heartbeats;
CREATE POLICY "Authenticated users can view worker status" ON public.worker_heartbeats FOR SELECT TO authenticated USING (true);