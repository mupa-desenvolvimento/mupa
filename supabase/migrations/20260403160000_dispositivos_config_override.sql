ALTER TABLE public.dispositivos
ADD COLUMN IF NOT EXISTS config_override jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.dispositivos.config_override IS 'Overrides de configuração por dispositivo (mesmas chaves do terminal_config).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dispositivos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dispositivos;
  END IF;
END $$;
