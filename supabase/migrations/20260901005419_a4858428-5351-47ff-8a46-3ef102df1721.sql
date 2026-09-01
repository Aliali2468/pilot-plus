ALTER TABLE public.telegram_link_codes
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  ADD COLUMN IF NOT EXISTS chat_id bigint;

CREATE INDEX IF NOT EXISTS telegram_link_codes_user_idx ON public.telegram_link_codes (user_id, created_at DESC);

ALTER TABLE public.upload_jobs
  ADD COLUMN IF NOT EXISTS telegram_file_id text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS upload_jobs_telegram_queue_idx
  ON public.upload_jobs (status, claimed_at)
  WHERE source = 'telegram';