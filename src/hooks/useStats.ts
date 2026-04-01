import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const [
        { count: totalProdutos },
        { count: comImagem },
        { count: disponiveis },
        { data: lastSync },
        { data: categorias },
        { data: marcas },
      ] = await Promise.all([
        supabase.from("produtos").select("*", { count: "exact", head: true }),
        supabase.from("produtos").select("*", { count: "exact", head: true }).eq("imagem_baixada", true),
        supabase.from("produtos").select("*", { count: "exact", head: true }).eq("disponivel", true),
        supabase.from("sync_log").select("*").order("iniciado_em", { ascending: false }).limit(1),
        supabase.from("categorias").select("*").order("total_produtos", { ascending: false }).limit(10),
        supabase.from("marcas").select("*").order("total_produtos", { ascending: false }).limit(10),
      ]);

      return {
        totalProdutos: totalProdutos ?? 0,
        comImagem: comImagem ?? 0,
        semImagem: (totalProdutos ?? 0) - (comImagem ?? 0),
        disponiveis: disponiveis ?? 0,
        lastSync: lastSync?.[0] ?? null,
        topCategorias: categorias ?? [],
        topMarcas: marcas ?? [],
      };
    },
    refetchInterval: 10000,
  });
}
