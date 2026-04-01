
-- Create storage bucket for TTS audio cache
INSERT INTO storage.buckets (id, name, public) VALUES ('tts-audio', 'tts-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to tts-audio bucket
CREATE POLICY "Public read tts-audio" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'tts-audio');

-- Allow service role to insert/update tts-audio
CREATE POLICY "Service insert tts-audio" ON storage.objects FOR INSERT TO service_role WITH CHECK (bucket_id = 'tts-audio');
CREATE POLICY "Service update tts-audio" ON storage.objects FOR UPDATE TO service_role USING (bucket_id = 'tts-audio');

-- Create table for TTS audio cache metadata
CREATE TABLE public.tts_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  storage_path TEXT NOT NULL,
  texto TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Public read access (terminal doesn't need auth)
ALTER TABLE public.tts_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tts_cache" ON public.tts_cache FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service write tts_cache" ON public.tts_cache FOR INSERT TO service_role WITH CHECK (true);
