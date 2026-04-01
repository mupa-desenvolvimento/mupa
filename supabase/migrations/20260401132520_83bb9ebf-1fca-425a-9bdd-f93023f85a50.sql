
-- Produtos table
CREATE TABLE public.produtos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id TEXT UNIQUE,
    ean TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    nome_curto TEXT,
    marca TEXT,
    categoria TEXT,
    categoria_id TEXT,
    descricao TEXT,
    unidade_medida TEXT DEFAULT 'un',
    multiplicador REAL DEFAULT 1.0,
    link_rissul TEXT,
    slug TEXT,
    clusters JSONB,
    preco REAL,
    preco_lista REAL,
    disponivel BOOLEAN DEFAULT true,
    imagem_local TEXT,
    imagem_url_vtex TEXT,
    imagem_url_azure TEXT,
    imagem_baixada BOOLEAN DEFAULT false,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_produtos_ean ON public.produtos(ean);
CREATE INDEX idx_produtos_nome ON public.produtos(nome);
CREATE INDEX idx_produtos_categoria ON public.produtos(categoria_id);
CREATE INDEX idx_produtos_marca ON public.produtos(marca);
CREATE INDEX idx_produtos_disponivel ON public.produtos(disponivel);

-- Sync log table
CREATE TABLE public.sync_log (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    iniciado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
    finalizado_em TIMESTAMP WITH TIME ZONE,
    total_produtos INTEGER DEFAULT 0,
    produtos_novos INTEGER DEFAULT 0,
    produtos_atualizados INTEGER DEFAULT 0,
    imagens_baixadas INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running',
    erro TEXT
);

-- Categorias table
CREATE TABLE public.categorias (
    id TEXT PRIMARY KEY,
    nome TEXT,
    caminho TEXT,
    parent_id TEXT,
    total_produtos INTEGER DEFAULT 0
);

-- Marcas table
CREATE TABLE public.marcas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT UNIQUE NOT NULL,
    total_produtos INTEGER DEFAULT 0
);

-- Enable RLS on all tables
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marcas ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables (catalog data is public)
CREATE POLICY "Public read access for produtos" ON public.produtos FOR SELECT USING (true);
CREATE POLICY "Public read access for sync_log" ON public.sync_log FOR SELECT USING (true);
CREATE POLICY "Public read access for categorias" ON public.categorias FOR SELECT USING (true);
CREATE POLICY "Public read access for marcas" ON public.marcas FOR SELECT USING (true);

-- Service role can insert/update/delete (edge functions use service role)
CREATE POLICY "Service role full access produtos" ON public.produtos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sync_log" ON public.sync_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access categorias" ON public.categorias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access marcas" ON public.marcas FOR ALL USING (true) WITH CHECK (true);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_produtos_updated_at
    BEFORE UPDATE ON public.produtos
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
