
CREATE TABLE public.sugestoes_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ean text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('complementares', 'perfil')),
  chave_perfil text DEFAULT NULL,
  categorias_ai text[] NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (ean, tipo, chave_perfil)
);

CREATE INDEX idx_sugestoes_cache_lookup ON public.sugestoes_cache (ean, tipo, chave_perfil);

ALTER TABLE public.sugestoes_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for sugestoes_cache" ON public.sugestoes_cache FOR SELECT TO public USING (true);
CREATE POLICY "Service role full access sugestoes_cache" ON public.sugestoes_cache FOR ALL TO public USING (true) WITH CHECK (true);
