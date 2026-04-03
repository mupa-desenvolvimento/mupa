-- Permite ativar controlo remoto de EAN por dispositivo (painel admin → terminal)
ALTER TABLE public.dispositivos
ADD COLUMN IF NOT EXISTS input_remoto_ativo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dispositivos.input_remoto_ativo IS 'Quando true, o terminal aceita EAN enviado pelo painel Dispositivos via Realtime.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dispositivos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dispositivos;
  END IF;
END $$;
