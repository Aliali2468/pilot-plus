
CREATE TABLE public.telegram_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL UNIQUE,
  username text,
  first_name text,
  linked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.telegram_links TO authenticated;
GRANT ALL ON public.telegram_links TO service_role;
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own telegram link read" ON public.telegram_links FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own telegram link delete" ON public.telegram_links FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.telegram_link_codes (
  code text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
GRANT SELECT ON public.telegram_link_codes TO authenticated;
GRANT ALL ON public.telegram_link_codes TO service_role;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own link codes" ON public.telegram_link_codes FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.telegram_messages (
  update_id bigint PRIMARY KEY,
  chat_id bigint NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id bigint,
  file_id text,
  file_name text,
  file_size bigint,
  mime_type text,
  caption text,
  has_video boolean NOT NULL DEFAULT false,
  raw_update jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_telegram_messages_user ON public.telegram_messages (user_id, created_at DESC);
GRANT SELECT ON public.telegram_messages TO authenticated;
GRANT ALL ON public.telegram_messages TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own telegram messages" ON public.telegram_messages FOR SELECT TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.upload_jobs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'device',
  ADD COLUMN IF NOT EXISTS transfer_phase text,
  ADD COLUMN IF NOT EXISTS bytes_transferred bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_bytes bigint;
