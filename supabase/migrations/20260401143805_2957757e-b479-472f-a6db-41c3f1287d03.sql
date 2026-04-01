
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_produtos_nome_trgm ON public.produtos USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_produtos_disponivel_marca ON public.produtos (disponivel, marca) WHERE disponivel = true;
CREATE INDEX IF NOT EXISTS idx_produtos_preco_lista ON public.produtos (preco_lista) WHERE preco_lista IS NOT NULL AND preco_lista > 0;
CREATE INDEX IF NOT EXISTS idx_sugestoes_cache_ean_tipo ON public.sugestoes_cache (ean, tipo);
