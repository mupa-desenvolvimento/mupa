                                                                                                                                                                                                                                                                                                                                                                                                                                                              CREATE TABLE IF NOT EXISTS public.terminal_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.terminal_playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.terminal_playlists(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.terminal_media(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  duracao_segundos integer,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispositivo_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  parent_id uuid REFERENCES public.dispositivo_grupos(id) ON DELETE CASCADE,
  playlist_id uuid REFERENCES public.terminal_playlists(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dispositivos
ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.dispositivo_grupos(id) ON DELETE SET NULL;

ALTER TABLE public.terminal_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositivo_grupos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active terminal_playlists" ON public.terminal_playlists;
CREATE POLICY "Public read active terminal_playlists"
  ON public.terminal_playlists FOR SELECT TO PUBLIC
  USING (ativo = true);

DROP POLICY IF EXISTS "Authenticated write terminal_playlists" ON public.terminal_playlists;
CREATE POLICY "Authenticated write terminal_playlists"
  ON public.terminal_playlists FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read active terminal_playlist_items" ON public.terminal_playlist_items;
CREATE POLICY "Public read active terminal_playlist_items"
  ON public.terminal_playlist_items FOR SELECT TO PUBLIC
  USING (
    ativo = true
    AND EXISTS (
      SELECT 1 FROM public.terminal_playlists p
      WHERE p.id = terminal_playlist_items.playlist_id AND p.ativo = true
    )
  );

DROP POLICY IF EXISTS "Authenticated write terminal_playlist_items" ON public.terminal_playlist_items;
CREATE POLICY "Authenticated write terminal_playlist_items"
  ON public.terminal_playlist_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read dispositivo_grupos" ON public.dispositivo_grupos;
CREATE POLICY "Public read dispositivo_grupos"
  ON public.dispositivo_grupos FOR SELECT TO PUBLIC
  USING (true);

DROP POLICY IF EXISTS "Authenticated write dispositivo_grupos" ON public.dispositivo_grupos;
CREATE POLICY "Authenticated write dispositivo_grupos"
  ON public.dispositivo_grupos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'terminal_playlists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_playlists;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'terminal_playlist_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_playlist_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dispositivo_grupos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dispositivo_grupos;
  END IF;
END $$;
