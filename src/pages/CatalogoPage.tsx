import { useState } from "react";
import { useProdutos } from "@/hooks/useProdutos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, ChevronLeft, ChevronRight, Package, Tag } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { motion } from "framer-motion";

export default function CatalogoPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Tables<"produtos"> | null>(null);

  const { data, isLoading } = useProdutos({ q, page, per_page: 24 });

  const getImageUrl = (p: Tables<"produtos">) => {
    return p.imagem_url_azure || p.imagem_url_vtex || null;
  };

  const getDiscount = (p: Tables<"produtos">) => {
    if (p.preco && p.preco_lista && p.preco_lista > p.preco) {
      return Math.round(((p.preco_lista - p.preco) / p.preco_lista) * 100);
    }
    return 0;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Catálogo</h1>
        <p className="text-muted-foreground mt-1">
          Pesquise por nome, EAN ou marca
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produtos..."
          className="pl-10"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Results info */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total.toLocaleString("pt-BR")} produtos encontrados` : "Carregando..."}
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

      {/* Grid */}
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
      ) : data && data.produtos.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {data.produtos.map((p) => {
            const img = getImageUrl(p);
            const discount = getDiscount(p);
            return (
              <motion.div
                key={p.id}
                className="product-card relative"
                onClick={() => setSelectedProduct(p)}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                {discount > 0 && <span className="promo-badge">-{discount}%</span>}
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
                  <p className="text-xs text-muted-foreground font-mono">{p.ean}</p>
                  <p className="text-sm font-medium leading-tight line-clamp-2">{p.nome}</p>
                  {p.marca && (
                    <p className="text-xs text-muted-foreground">{p.marca}</p>
                  )}
                  <div className="flex items-baseline gap-2 pt-1">
                    {p.preco != null && (
                      <span className="text-sm font-bold text-primary">
                        R$ {p.preco.toFixed(2)}
                      </span>
                    )}
                    {p.preco_lista != null && p.preco_lista > (p.preco ?? 0) && (
                      <span className="text-xs text-muted-foreground line-through">
                        R$ {p.preco_lista.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Package className="h-12 w-12 mb-3 opacity-30" />
          <p>Nenhum produto encontrado</p>
          <p className="text-xs mt-1">Sincronize os dados do Rissul primeiro</p>
        </div>
      )}

      {/* Product Detail Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-lg">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">{selectedProduct.nome}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {getImageUrl(selectedProduct) && (
                  <div className="bg-muted rounded-lg flex items-center justify-center p-4">
                    <img
                      src={getImageUrl(selectedProduct)!}
                      alt={selectedProduct.nome}
                      className="max-h-48 object-contain"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">EAN</span>
                    <p className="font-mono font-medium">{selectedProduct.ean}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Product ID</span>
                    <p className="font-mono font-medium">{selectedProduct.product_id}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Marca</span>
                    <p className="font-medium">{selectedProduct.marca ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Categoria</span>
                    <p className="font-medium">{selectedProduct.categoria ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Preço</span>
                    <p className="font-bold text-primary">
                      {selectedProduct.preco != null ? `R$ ${selectedProduct.preco.toFixed(2)}` : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Preço Lista</span>
                    <p className="font-medium">
                      {selectedProduct.preco_lista != null ? `R$ ${selectedProduct.preco_lista.toFixed(2)}` : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Unidade</span>
                    <p className="font-medium">{selectedProduct.unidade_medida} × {selectedProduct.multiplicador}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Disponível</span>
                    <p>
                      {selectedProduct.disponivel ? (
                        <Badge className="badge-success">Sim</Badge>
                      ) : (
                        <Badge className="badge-destructive">Não</Badge>
                      )}
                    </p>
                  </div>
                </div>
                {selectedProduct.descricao && (
                  <div>
                    <span className="text-sm text-muted-foreground">Descrição</span>
                    <p className="text-sm mt-1">{selectedProduct.descricao}</p>
                  </div>
                )}
                {selectedProduct.link_rissul && (
                  <a
                    href={selectedProduct.link_rissul}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline"
                  >
                    Ver no Rissul →
                  </a>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
