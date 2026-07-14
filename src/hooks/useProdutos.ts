import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ProdutosFilter {
  q?: string;
  marca?: string;
  categoria_id?: string;
  disponivel?: boolean;
  com_imagem?: boolean;
  promo?: boolean;
  eans?: string[];
  favorito_atacado?: boolean;
  page?: number;
  per_page?: number;
}

// Colunas mínimas usadas pelas grades/listas. Reduz drasticamente o payload
// comparado a `select("*")` em tabelas com muitas colunas.
const LIST_COLUMNS =
  "id, ean, nome, nome_curto, marca, categoria, categoria_id, preco, preco_lista, disponivel, imagem_url_vtex, imagem_url_azure, imagem_baixada, favorito_atacado";

export function useProdutos(filters: ProdutosFilter) {
  const { page = 1, per_page = 20 } = filters;

  return useQuery({
    queryKey: ["produtos", filters],
    queryFn: async () => {
      // `count: "estimated"` usa estatísticas do Postgres em vez de um COUNT(*)
      // completo — muito mais rápido em tabelas grandes. A paginação continua
      // funcionando; só o total exibido pode variar levemente.
      let query = supabase
        .from("produtos")
        .select(LIST_COLUMNS, { count: "estimated" });

      if (filters.q) {
        query = query.or(
          `nome.ilike.%${filters.q}%,ean.ilike.%${filters.q}%,marca.ilike.%${filters.q}%`
        );
      }
      if (filters.marca) {
        query = query.ilike("marca", `%${filters.marca}%`);
      }
      if (filters.categoria_id) {
        query = query.eq("categoria_id", filters.categoria_id);
      }
      if (filters.disponivel !== undefined) {
        query = query.eq("disponivel", filters.disponivel);
      }
      if (filters.com_imagem !== undefined) {
        query = query.eq("imagem_baixada", filters.com_imagem);
      }
      if (filters.promo) {
        query = query.not("preco_lista", "is", null).gt("preco_lista", 0);
      }
      if (filters.eans) {
        if (filters.eans.length === 0) {
          return { produtos: [], total: 0, page, per_page, totalPages: 0 };
        }
        query = query.in("ean", filters.eans);
      }
      if (filters.favorito_atacado) {
        query = query.eq("favorito_atacado", true);
      }

      const from = (page - 1) * per_page;
      const to = from + per_page - 1;

      query = query.order("nome").range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      return {
        produtos: data ?? [],
        total: count ?? 0,
        page,
        per_page,
        totalPages: Math.ceil((count ?? 0) / per_page),
      };
    },
    // Mantém a página anterior visível durante a próxima busca/paginação —
    // remove o flash de "Carregando..." e a sensação de lentidão.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useProdutoByEan(ean: string | null) {
  return useQuery({
    queryKey: ["produto", ean],
    queryFn: async () => {
      if (!ean) return null;
      const { data, error } = await supabase
        .from("produtos")
        .select("*")
        .eq("ean", ean)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!ean,
    staleTime: 60_000,
  });
}
