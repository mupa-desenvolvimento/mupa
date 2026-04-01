CREATE TABLE public.terminal_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  valor text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read terminal_config" ON public.terminal_config FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated write terminal_config" ON public.terminal_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.terminal_config (chave, valor) VALUES ('tipo_sugestao', 'complementares');