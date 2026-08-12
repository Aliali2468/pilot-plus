CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name, avatar_url)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email,''),'@',1)), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.youtube_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id text NOT NULL,
  title text NOT NULL,
  handle text,
  description text,
  thumbnail_url text,
  subscriber_count bigint NOT NULL DEFAULT 0,
  view_count bigint NOT NULL DEFAULT 0,
  video_count bigint NOT NULL DEFAULT 0,
  uploads_playlist_id text,
  status text NOT NULL DEFAULT 'connected',
  google_email text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.youtube_channels TO authenticated;
GRANT ALL ON public.youtube_channels TO service_role;
ALTER TABLE public.youtube_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels_own" ON public.youtube_channels FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER channels_updated_at BEFORE UPDATE ON public.youtube_channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.youtube_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_row_id uuid REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
  google_email text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.youtube_connections TO service_role;
ALTER TABLE public.youtube_connections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER connections_updated_at BEFORE UPDATE ON public.youtube_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);
GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_row_id uuid NOT NULL REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text,
  thumbnail_url text,
  privacy_status text,
  upload_status text,
  published_at timestamptz,
  scheduled_at timestamptz,
  duration text,
  view_count bigint NOT NULL DEFAULT 0,
  like_count bigint NOT NULL DEFAULT 0,
  comment_count bigint NOT NULL DEFAULT 0,
  tags text[],
  category_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_row_id, video_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "videos_own" ON public.videos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER videos_updated_at BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.upload_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_row_id uuid NOT NULL REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
  file_name text,
  file_size bigint,
  status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  video_id text,
  upload_url text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upload_jobs TO authenticated;
GRANT ALL ON public.upload_jobs TO service_role;
ALTER TABLE public.upload_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "upload_jobs_own" ON public.upload_jobs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER upload_jobs_updated_at BEFORE UPDATE ON public.upload_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_row_id uuid NOT NULL REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
  playlist_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text,
  thumbnail_url text,
  privacy_status text,
  item_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_row_id, playlist_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;
GRANT ALL ON public.playlists TO service_role;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "playlists_own" ON public.playlists FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER playlists_updated_at BEFORE UPDATE ON public.playlists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);