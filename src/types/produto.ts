import type { Tables } from "@/integrations/supabase/types";

/**
 * Modelo base do Produto vindo direto da tabela `produtos` no banco.
 */
export type ProdutoRow = Tables<"produtos">;

/**
 * Campos calculados adicionados pelo endpoint público `api-produtos`
 * (função `enrichPreco` em `supabase/functions/api-produtos/index.ts`).
 *
 * Estes campos NÃO existem na tabela — são derivados de `preco` e `preco_lista`
 * no momento da resposta da API. Convenção:
 *   - `preco`        = preço promocional (quando há oferta) ou o preço vigente.
 *   - `preco_lista`  = preço original riscado (só preenchido quando há oferta).
 */
export interface ProdutoPrecoEnriquecido {
  preco_atual: number | null;
  preco_original: number | null;
  em_oferta: boolean;
  desconto_percent: number | null;
  economia: number | null;
}

/**
 * Produto no formato retornado pela API pública (`GET /api-produtos`).
 * Use este tipo em qualquer estado/prop que possa receber tanto a linha bruta
 * quanto a versão enriquecida — os campos calculados são opcionais para
 * permitir o uso direto de resultados vindos do Supabase.
 */
export type Produto = ProdutoRow & Partial<ProdutoPrecoEnriquecido>;
