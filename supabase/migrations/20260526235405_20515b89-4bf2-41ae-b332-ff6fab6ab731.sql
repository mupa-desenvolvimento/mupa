
-- 1) Remove public read of empresa_preco_config (contains plaintext credentials)
DROP POLICY IF EXISTS "Public read active empresa_preco_config" ON public.empresa_preco_config;

-- 2) Lock empresa_token_cache reads to service_role only
DROP POLICY IF EXISTS "Authenticated read empresa_token_cache" ON public.empresa_token_cache;
CREATE POLICY "Service read empresa_token_cache"
  ON public.empresa_token_cache FOR SELECT TO service_role USING (true);

-- 3) Helper: is current user a member of empresa?
CREATE OR REPLACE FUNCTION public.has_empresa_access(_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresa_usuarios
    WHERE empresa_id = _empresa_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_empresa_admin(_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresa_usuarios
    WHERE empresa_id = _empresa_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- 4) Privilege-escalation lockdown for empresa_usuarios
DROP POLICY IF EXISTS "Authenticated write empresa_usuarios" ON public.empresa_usuarios;

-- Allow a user to insert ONLY their own user_id, and only if:
--   (a) there are no admins yet for that empresa (bootstrap), OR
--   (b) an existing admin of that empresa is performing the insert (self-assigning is forbidden in (b) since user_id must = auth.uid())
CREATE POLICY "Self insert empresa_usuarios bootstrap"
  ON public.empresa_usuarios FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.empresa_usuarios eu
      WHERE eu.empresa_id = empresa_usuarios.empresa_id
    )
  );

-- Admins of an empresa can add/remove any user to/from THAT empresa
CREATE POLICY "Admins manage empresa_usuarios"
  ON public.empresa_usuarios FOR INSERT TO authenticated
  WITH CHECK (public.is_empresa_admin(empresa_id));

CREATE POLICY "Admins update empresa_usuarios"
  ON public.empresa_usuarios FOR UPDATE TO authenticated
  USING (public.is_empresa_admin(empresa_id))
  WITH CHECK (public.is_empresa_admin(empresa_id));

CREATE POLICY "Admins delete empresa_usuarios"
  ON public.empresa_usuarios FOR DELETE TO authenticated
  USING (public.is_empresa_admin(empresa_id));

-- Users can always remove themselves
CREATE POLICY "Users delete own empresa_usuarios"
  ON public.empresa_usuarios FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 5) Fix search_path on existing helper functions
ALTER FUNCTION public.generate_dispositivo_codigo() SET search_path = public;
ALTER FUNCTION public.random_base32_code(integer) SET search_path = public;
ALTER FUNCTION public.generate_empresa_codigo() SET search_path = public;
