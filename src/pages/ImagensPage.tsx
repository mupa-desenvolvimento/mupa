import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Image, Package, Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { motion } from "framer-motion";

type FilterMode = "all" | "com" | "sem";

export default function ImagensPage() {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 30;

  const { data, isLoading } = useQuery({
    queryKey: ["imagens", filter, q, page],
    queryFn: async () => {
      let query = supabase.from("produtos").select("id, ean, nome, marca, imagem_url_vtex, imagem_url_azure, imagem_baixada", { count: "exact" });

      if (q) {
        query = query.or(`nome.ilike.%${q}%,ean.ilike.%${q}%`);
      }
      if (filter === "com") query = query.eq("imagem_baixada", true);
      if (filter === "sem") query = query.eq("imagem_baixada", false);

      const from = (page - 1) * perPage;
      query = query.order("nome").range(from, from + perPage - 1);

      const { data, count, error } = await query;
      if (error) throw error;
      return { items: data ?? [], total: count ?? 0, totalPages: Math.ceil((count ?? 0) / perPage) };
    },
  });

  const filterBtns: { label: string; value: FilterMode }[] = [
    { label: "Todos", value: "all" },
    { label: "Com imagem", value: "com" },
    { label: "Sem imagem", value: "sem" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Imagens</h1>
        <p className="text-muted-foreground mt-1">
          Visualize e gerencie imagens dos produtos
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou EAN..."
            className="pl-10"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-1">
          {filterBtns.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => { setFilter(f.value); setPage(1); }}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} produtos` : "Carregando..."}
        </p>
        {data && data.totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {data.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {[...Array(16)].map((_, i) => (
            <div key={i} className="aspect-square bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {data.items.map((p) => {
            const img = p.imagem_url_azure || p.imagem_url_vtex;
            return (
              <motion.div
                key={p.id}
                className="group relative aspect-square bg-card border rounded-lg overflow-hidden flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {img ? (
                  <img src={img} alt={p.nome} className="h-full w-full object-contain p-1" loading="lazy" />
                ) : (
                  <Package className="h-8 w-8 text-muted-foreground/20" />
                )}
                <div className="absolute inset-0 bg-foreground/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center">
                  <p className="text-xs font-medium text-background line-clamp-2">{p.nome}</p>
                  <p className="text-[10px] text-background/70 font-mono mt-1">{p.ean}</p>
                </div>
                {!p.imagem_baixada && (
                  <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-warning" />
                )}
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Image className="h-12 w-12 mb-3 opacity-30" />
          <p>Nenhuma imagem encontrada</p>
        </div>
      )}
    </div>
  );
}
