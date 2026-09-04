-- Single-owner private installation: remove the multi-user account layer.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.profiles;
DROP TABLE IF EXISTS public.notifications;

-- Detach remaining data from the removed account system.
ALTER TABLE public.telegram_links DROP CONSTRAINT IF EXISTS telegram_links_user_id_fkey;
ALTER TABLE public.telegram_link_codes DROP CONSTRAINT IF EXISTS telegram_link_codes_user_id_fkey;
ALTER TABLE public.telegram_messages DROP CONSTRAINT IF EXISTS telegram_messages_user_id_fkey;

-- Drop every per-account access rule; there are no signed-in users anymore.
DROP POLICY IF EXISTS playlists_own ON public.playlists;
DROP POLICY IF EXISTS upload_jobs_own ON public.upload_jobs;
DROP POLICY IF EXISTS videos_own ON public.videos;
DROP POLICY IF EXISTS channels_own ON public.youtube_channels;
DROP POLICY IF EXISTS "own link codes" ON public.telegram_link_codes;
DROP POLICY IF EXISTS "own telegram link delete" ON public.telegram_links;
DROP POLICY IF EXISTS "own telegram link read" ON public.telegram_links;
DROP POLICY IF EXISTS "own telegram messages" ON public.telegram_messages;
DROP POLICY IF EXISTS "Authenticated users can view worker status" ON public.worker_heartbeats;

-- Backend-only access: the browser can no longer reach any table directly.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;