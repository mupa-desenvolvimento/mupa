import { useState, useMemo } from "react";
import { useProdutos } from "@/hooks/useProdutos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, ChevronLeft, ChevronRight, Package, Star } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { motion } from "framer-motion";

export default function FavoritosAtacadoPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [categoria, setCategoria] = useState<string>("todas");
  const [selectedProduct, setSelectedProduct] = useState<Tables<"produtos"> | null>(null);

  const { data, isLoading } = useProdutos({
    q,
    page,
    per_page: 24,
    favorito_atacado: true,
  });

  const produtosFiltrados = useMemo(() => {
    if (!data) return [];
    if (categoria === "todas") return data.produtos;
    return data.produtos.filter((p) => p.categoria === categoria);
  }, [data, categoria]);

  const categorias = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.produtos.forEach((p) => p.categoria && set.add(p.categoria));
    return Array.from(set).sort();
  }, [data]);

  const getImageUrl = (p: Tables<"produtos">) =>
    p.imagem_url_vtex || p.imagem_url_azure || null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
          <Star className="h-6 w-6 fill-amber-500" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Favoritos Atacado
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Produtos mais conhecidos dos supermercados — refrigerantes, mercearia,
            limpeza, higiene e mais.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, EAN ou marca..."
            className="pl-10"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="sm:w-64">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data
            ? `${data.total.toLocaleString("pt-BR")} produtos no catálogo atacado`
            : "Carregando..."}
        </p>
        {data && data.totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {data.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="product-card animate-pulse">
              <div className="aspect-square bg-muted" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : produtosFiltrados.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {produtosFiltrados.map((p) => {
            const img = getImageUrl(p);
            return (
              <motion.div
                key={p.id}
                className="product-card relative cursor-pointer"
                onClick={() => setSelectedProduct(p)}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <span className="absolute top-2 left-2 z-10 h-6 w-6 rounded-full bg-amber-500 flex items-center justify-center shadow">
                  <Star className="h-3 w-3 fill-white text-white" />
                </span>
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {img ? (
                    <img
                      src={img}
                      alt={p.nome}
                      className="h-full w-full object-contain p-2"
                      loading="lazy"
                    />
                  ) : (
                    <Package className="h-10 w-10 text-muted-foreground/30" />
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {p.ean}
                  </p>
                  <p className="text-sm font-medium leading-tight line-clamp-2">
                    {p.nome}
                  </p>
                  {p.marca && (
                    <p className="text-xs text-muted-foreground">{p.marca}</p>
                  )}
                  {p.categoria && (
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      {p.categoria}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Star className="h-12 w-12 mb-3 opacity-30" />
          <p>Nenhum produto encontrado</p>
        </div>
      )}

      <Dialog
        open={!!selectedProduct}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
      >
        <DialogContent className="max-w-md">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display pr-8">
                  {selectedProduct.nome}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="bg-muted rounded-lg flex items-center justify-center p-4 aspect-square">
                  {getImageUrl(selectedProduct) ? (
                    <img
                      src={getImageUrl(selectedProduct)!}
                      alt={selectedProduct.nome}
                      className="max-h-full object-contain"
                    />
                  ) : (
                    <Package className="h-16 w-16 text-muted-foreground/30" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">EAN</span>
                    <p className="font-mono font-medium">{selectedProduct.ean}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Marca</span>
                    <p className="font-medium">{selectedProduct.marca ?? "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Categoria</span>
                    <p className="font-medium">
                      {selectedProduct.categoria ?? "—"}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
