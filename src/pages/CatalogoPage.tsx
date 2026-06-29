import { useState, useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
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
import { Search, ChevronLeft, ChevronRight, Package, Tag, Heart, List, ImagePlus, Pencil } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFavoritos } from "@/hooks/useFavoritos";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function BarcodeSvg({ ean }: { ean: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const clean = (ean || "").replace(/\D/g, "");
    const tryFormats: Array<{ format: string; value: string }> = [];
    if (clean.length === 13) tryFormats.push({ format: "EAN13", value: clean });
    else if (clean.length === 12) tryFormats.push({ format: "EAN13", value: clean });
    else if (clean.length === 8) tryFormats.push({ format: "EAN8", value: clean });
    tryFormats.push({ format: "CODE128", value: clean || ean });

    for (const f of tryFormats) {
      try {
        JsBarcode(ref.current, f.value, {
          format: f.format,
          displayValue: true,
          height: 70,
          margin: 8,
          background: "#ffffff",
        });
        return;
      } catch {
        /* try next */
      }
    }
  }, [ean]);
  return <svg ref={ref} className="max-w-full" />;
}

export default function CatalogoPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"todos" | "favoritos">("todos");
  const [selectedProduct, setSelectedProduct] = useState<Tables<"produtos"> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const { favoritos, isFavorito, toggleFavorito } = useFavoritos();
  const queryClient = useQueryClient();
  const [editingImage, setEditingImage] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [savingImage, setSavingImage] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [precoInput, setPrecoInput] = useState("");
  const [precoOfertaInput, setPrecoOfertaInput] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);


  const { data, isLoading } = useProdutos({
    q,
    page,
    per_page: 24,
    eans: tab === "favoritos" ? favoritos : undefined,
  });

  const navigateProduct = (dir: 1 | -1) => {
    if (!data || !selectedProduct) return;
    const idx = data.produtos.findIndex((p) => p.id === selectedProduct.id);
    if (idx === -1) return;
    const next = data.produtos[idx + dir];
    if (next) {
      setSwipeDir(dir === 1 ? "left" : "right");
      setSelectedProduct(next);
      setTimeout(() => setSwipeDir(null), 250);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      navigateProduct(dx < 0 ? 1 : -1);
    }
  };

  const getImageUrl = (p: Tables<"produtos">) => {
    return p.imagem_url_vtex || p.imagem_url_azure || null;
  };

  const getDiscount = (p: Tables<"produtos">) => {
    if (p.preco && p.preco_lista && p.preco_lista > p.preco) {
      return Math.round(((p.preco_lista - p.preco) / p.preco_lista) * 100);
    }
    return 0;
  };

  const handleSaveImage = async () => {
    if (!selectedProduct) return;
    const url = imageUrlInput.trim();
    if (url) {
      try {
        new URL(url);
      } catch {
        toast.error("URL inválida");
        return;
      }
    }
    setSavingImage(true);
    try {
      const { error } = await supabase
        .from("produtos")
        .update({ imagem_url_vtex: url || null })
        .eq("id", selectedProduct.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setSelectedProduct({ ...selectedProduct, imagem_url_vtex: url || null });
      await queryClient.invalidateQueries({ queryKey: ["produtos"] });
      toast.success(url ? "Imagem atualizada" : "Imagem removida");
      setEditingImage(false);
      setImageUrlInput("");
    } finally {
      setSavingImage(false);
    }
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Catálogo</h1>
        <p className="text-muted-foreground mt-1">
          Pesquise por nome, EAN ou marca
        </p>
      </div>

      {/* Tabs + Search */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v as "todos" | "favoritos"); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="favoritos" className="gap-1">
            <Heart className="h-3.5 w-3.5" />
            Favoritos
            {favoritos.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({favoritos.length})</span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
                <button
                  type="button"
                  aria-label={isFavorito(p.ean) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorito(p.ean);
                  }}
                  className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center border border-border hover:bg-background transition-colors"
                >
                  <Heart
                    className={cn(
                      "h-4 w-4 transition-colors",
                      isFavorito(p.ean)
                        ? "fill-red-500 text-red-500"
                        : "text-muted-foreground"
                    )}
                  />
                </button>
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
          {tab === "favoritos" ? (
            <>
              <Heart className="h-12 w-12 mb-3 opacity-30" />
              <p>Nenhum favorito ainda</p>
              <p className="text-xs mt-1">Toque no coração de um produto para favoritar</p>
            </>
          ) : (
            <>
              <Package className="h-12 w-12 mb-3 opacity-30" />
              <p>Nenhum produto encontrado</p>
              <p className="text-xs mt-1">Sincronize o catálogo primeiro</p>
            </>
          )}
        </div>
      )}

      {/* Product Detail Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => { if (!open) { setSelectedProduct(null); setEditingImage(false); setImageUrlInput(""); } }}>
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {selectedProduct && (
            <motion.div
              key={selectedProduct.id}
              initial={{ opacity: 0, x: swipeDir === "left" ? 40 : swipeDir === "right" ? -40 : 0 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="font-display pr-16">{selectedProduct.nome}</DialogTitle>
                <button
                  type="button"
                  aria-label={isFavorito(selectedProduct.ean) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                  onClick={() => toggleFavorito(selectedProduct.ean)}
                  className="absolute top-4 right-12 h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors"
                >
                  <Heart
                    className={cn(
                      "h-4 w-4",
                      isFavorito(selectedProduct.ean)
                        ? "fill-red-500 text-red-500"
                        : "text-muted-foreground"
                    )}
                  />
                </button>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="bg-muted rounded-lg flex flex-col items-center justify-center p-4 gap-3 relative group">
                  {getImageUrl(selectedProduct) ? (
                    <>
                      <img
                        src={getImageUrl(selectedProduct)!}
                        alt={selectedProduct.nome}
                        className="max-h-40 sm:max-h-48 object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImageUrlInput(selectedProduct.imagem_url_vtex ?? "");
                          setEditingImage(true);
                        }}
                        className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/90 border flex items-center justify-center hover:bg-background"
                        aria-label="Editar imagem"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : editingImage ? null : (
                    <>
                      <ImagePlus className="h-10 w-10 text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground">Sem imagem</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setImageUrlInput("");
                          setEditingImage(true);
                        }}
                      >
                        <ImagePlus className="h-4 w-4 mr-1.5" />
                        Adicionar imagem
                      </Button>
                    </>
                  )}
                  {editingImage && (
                    <div className="w-full space-y-2">
                      <Input
                        type="url"
                        placeholder="https://exemplo.com/imagem.jpg"
                        value={imageUrlInput}
                        onChange={(e) => setImageUrlInput(e.target.value)}
                        autoFocus
                      />
                      {imageUrlInput && (
                        <div className="bg-background rounded border aspect-square max-h-32 flex items-center justify-center overflow-hidden">
                          <img
                            src={imageUrlInput}
                            alt="Pré-visualização"
                            className="h-full w-full object-contain p-2"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                            }}
                          />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSaveImage}
                          disabled={savingImage}
                          className="flex-1"
                        >
                          {savingImage ? "A guardar..." : "Guardar"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingImage(false);
                            setImageUrlInput("");
                          }}
                          disabled={savingImage}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {selectedProduct.ean && (
                  <div className="bg-white rounded-lg flex items-center justify-center p-3 overflow-x-auto">
                    <BarcodeSvg ean={selectedProduct.ean} />
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
                {selectedProduct.link_externo && (
                  <a
                    href={selectedProduct.link_externo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline"
                  >
                    Ver produto →
                  </a>
                )}
              </div>
            </motion.div>
          )}
        </DialogContent>
      </Dialog>

      {/* Floating Action Button - alterna entre Todos e Favoritos (mobile) */}
      <button
        type="button"
        aria-label={tab === "todos" ? "Ver favoritos" : "Ver todos"}
        onClick={() => setTab(tab === "todos" ? "favoritos" : "todos")}
        className="md:hidden fixed bottom-20 right-4 z-[100] h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl border-2 border-white flex items-center justify-center active:scale-95 transition-transform"
      >
        {tab === "todos" ? (
          <Heart className="h-6 w-6" />
        ) : (
          <List className="h-6 w-6" />
        )}
        {tab === "todos" && favoritos.length > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border border-white">
            {favoritos.length}
          </span>
        )}
      </button>
    </div>
  );
}
