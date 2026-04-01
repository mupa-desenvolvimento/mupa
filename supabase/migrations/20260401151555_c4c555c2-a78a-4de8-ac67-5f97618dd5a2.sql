
-- Create storage bucket for terminal media
INSERT INTO storage.buckets (id, name, public) VALUES ('terminal-media', 'terminal-media', true);

-- Create table to manage terminal media files
CREATE TABLE public.terminal_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('imagem', 'video')),
  url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  duracao_segundos INT NOT NULL DEFAULT 8,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_media ENABLE ROW LEVEL SECURITY;

-- Anyone can read active media (terminals are not authenticated)
CREATE POLICY "Anyone can view active terminal media"
  ON public.terminal_media FOR SELECT
  USING (ativo = true);

-- Authenticated users can manage media
CREATE POLICY "Authenticated users can insert terminal media"
  ON public.terminal_media FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update terminal media"
  ON public.terminal_media FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete terminal media"
  ON public.terminal_media FOR DELETE
  TO authenticated USING (true);

-- Storage policies for terminal-media bucket
CREATE POLICY "Anyone can view terminal media files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'terminal-media');

CREATE POLICY "Authenticated users can upload terminal media"
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'terminal-media');

CREATE POLICY "Authenticated users can delete terminal media"
  ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'terminal-media');
