
-- Price API configuration per company
CREATE TABLE public.empresa_preco_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Token configuration
  token_url text NOT NULL,
  token_method text NOT NULL DEFAULT 'POST',
  token_body jsonb NOT NULL DEFAULT '{}',
  token_headers jsonb NOT NULL DEFAULT '{"Content-Type": "application/json"}',
  token_response_path text NOT NULL DEFAULT 'token',
  token_expiry_field text DEFAULT 'expires_in',
  token_expiry_seconds integer DEFAULT 3600,
  -- Product query configuration
  consulta_url text NOT NULL,
  consulta_method text NOT NULL DEFAULT 'GET',
  consulta_params_fixos jsonb NOT NULL DEFAULT '{}',
  consulta_ean_param text NOT NULL DEFAULT 'ean',
  consulta_auth_type text NOT NULL DEFAULT 'bearer',
  consulta_headers jsonb NOT NULL DEFAULT '{}',
  -- Response data extraction
  data_path text NOT NULL DEFAULT 'data',
  -- Field mappings: standard field name -> external field name
  mapeamento_campos jsonb NOT NULL DEFAULT '{
    "nome": "descricao_produto",
    "ean": "ean",
    "imagem_url": "link_imagem",
    "preco_regular": "preco_base",
    "preco_clube": "preco_clube",
    "preco_oferta": null,
    "preco_proporcional": "preco_prop_sellprice",
    "preco_proporcional_clube": "preco_prop_clube",
    "unidade_proporcional": "embalagem_proporcional",
    "embalagem_venda": "embalagem_venda",
    "status": "status_venda",
    "limite_compra": "limite",
    "codigo_etiqueta": "codigo_etiqueta",
    "media_venda": "media_venda"
  }',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id)
);

-- Token cache per company
CREATE TABLE public.empresa_token_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  token text NOT NULL,
  token_type text DEFAULT 'bearer',
  expira_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id)
);

-- RLS
ALTER TABLE public.empresa_preco_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_token_cache ENABLE ROW LEVEL SECURITY;

-- empresa_preco_config policies
CREATE POLICY "Authenticated read empresa_preco_config" ON public.empresa_preco_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write empresa_preco_config" ON public.empresa_preco_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service read empresa_preco_config" ON public.empresa_preco_config FOR SELECT TO service_role USING (true);

-- empresa_token_cache policies (service role only for write, since edge functions manage tokens)
CREATE POLICY "Service full empresa_token_cache" ON public.empresa_token_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read empresa_token_cache" ON public.empresa_token_cache FOR SELECT TO authenticated USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_empresa_preco_config_updated_at
  BEFORE UPDATE ON public.empresa_preco_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
