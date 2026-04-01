
-- Empresas
CREATE TABLE public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read empresas" ON public.empresas FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write empresas" ON public.empresas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Empresa Usuarios
CREATE TABLE public.empresa_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, user_id)
);
ALTER TABLE public.empresa_usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own empresa_usuarios" ON public.empresa_usuarios FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Authenticated write empresa_usuarios" ON public.empresa_usuarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Dispositivos
CREATE TABLE public.dispositivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  nome text NOT NULL DEFAULT 'Terminal',
  codigo_ativacao text UNIQUE NOT NULL,
  ativo boolean NOT NULL DEFAULT false,
  ativado_em timestamptz,
  ultimo_acesso timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dispositivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read dispositivos" ON public.dispositivos FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write dispositivos" ON public.dispositivos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Empresa Midias (mídia por empresa)
CREATE TABLE public.empresa_midias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL,
  url text NOT NULL,
  storage_path text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  duracao_segundos integer NOT NULL DEFAULT 8,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.empresa_midias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read empresa_midias ativas" ON public.empresa_midias FOR SELECT TO public USING (ativo = true);
CREATE POLICY "Authenticated write empresa_midias" ON public.empresa_midias FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Empresa API Config
CREATE TABLE public.empresa_api_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE UNIQUE,
  api_url text NOT NULL,
  api_token text,
  tipo_api text NOT NULL DEFAULT 'rest',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.empresa_api_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read empresa_api_config" ON public.empresa_api_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write empresa_api_config" ON public.empresa_api_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
