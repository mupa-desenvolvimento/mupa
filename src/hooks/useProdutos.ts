import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ProdutosFilter {
  q?: string;
  marca?: string;
  categoria_id?: string;
  disponivel?: boolean;
  com_imagem?: boolean;
  promo?: boolean;
  page?: number;
  per_page?: number;
}

export function useProdutos(filters: ProdutosFilter) {
  const { page = 1, per_page = 20 } = filters;

  return useQuery({
    queryKey: ["produtos", filters],
    queryFn: async () => {
      let query = supabase.from("produtos").select("*", { count: "exact" });

      if (filters.q) {
        query = query.or(`nome.ilike.%${filters.q}%,ean.ilike.%${filters.q}%,marca.ilike.%${filters.q}%`);
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
  });
}
