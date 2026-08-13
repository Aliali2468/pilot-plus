ALTER TABLE public.upload_jobs
  ADD COLUMN IF NOT EXISTS video_type text NOT NULL DEFAULT 'long',
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS video_type text NOT NULL DEFAULT 'long';

CREATE UNIQUE INDEX IF NOT EXISTS upload_jobs_user_idempotency_key
  ON public.upload_jobs (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS upload_jobs_user_created_idx
  ON public.upload_jobs (user_id, created_at DESC);