import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Barcode } from "lucide-react";

interface Produto {
  ean: string;
  nome: string;
  nome_curto?: string;
  marca?: string;
  categoria?: string;
  preco?: number;
  preco_lista?: number;
  disponivel?: boolean;
  imagem_url_vtex?: string;
  unidade_medida?: string;
  multiplicador?: number;
}

interface Sugestao extends Produto {
  motivo?: string;
}

interface Sugestoes {
  mesma_marca: Sugestao[];
  complementares: Sugestao[];
  perfil: Sugestao[];
}

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export default function TerminalPage() {
  const [ean, setEan] = useState("");
  const [produto, setProduto] = useState<Produto | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestoes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-fullscreen on mount & track fullscreen state
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const enterFs = async () => {
      try {
        if (!document.fullscreenElement) {
          await el.requestFullscreen();
        }
      } catch {}
    };

    // Try auto-enter; browsers may block without user gesture
    enterFs();

    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Reset to idle after 30s of inactivity when a product is shown
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setProduto(null);
      setSugestoes(null);
      setEan("");
      setError(null);
      inputRef.current?.focus();
    }, 30_000);
  }, []);

  useEffect(() => {
    if (produto) resetIdleTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [produto, resetIdleTimer]);

  // Reset idle timer on any interaction
  useEffect(() => {
    const handler = () => { if (produto) resetIdleTimer(); };
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [produto, resetIdleTimer]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current?.requestFullscreen();
      }
    } catch {}
  };

  const consultar = async (code?: string) => {
    const searchEan = code || ean.trim();
    if (!searchEan) return;

    setLoading(true);
    setError(null);
    setProduto(null);
    setSugestoes(null);

    try {
      // Fetch product
      const prodRes = await fetch(`${BASE_URL}/api-produtos?ean=${searchEan}`);
      if (!prodRes.ok) {
        setError("Produto não encontrado");
        setLoading(false);
        return;
      }
      const prodData = await prodRes.json();
      const prod = prodData.produto;
      setProduto(prod);

      // Fetch suggestions in parallel
      fetch(`${BASE_URL}/api-sugestoes?ean=${searchEan}&limit=4`)
        .then(r => r.json())
        .then(d => setSugestoes(d.sugestoes))
        .catch(() => {});

      setLoading(false);
    } catch {
      setError("Erro ao consultar produto");
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") consultar();
  };

  const formatPrice = (value: number) => {
    const [reais, centavos] = value.toFixed(2).split(".");
    return { reais, centavos };
  };

  const hasDiscount = produto?.preco_lista && produto?.preco && produto.preco_lista > produto.preco;

  const allSugestoes = sugestoes
    ? [...sugestoes.complementares, ...sugestoes.mesma_marca, ...sugestoes.perfil].slice(0, 6)
    : [];

  return (
    <div ref={containerRef} className="terminal-page" style={{ cursor: "none" }}>
      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 z-50 w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 transition-colors"
        style={{ background: "rgba(255,255,255,0.05)" }}
        title={isFullscreen ? "Sair do fullscreen" : "Entrar em fullscreen"}
      >
        {isFullscreen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        )}
      </button>

      {/* Blob shapes background */}
      <div className="terminal-blob terminal-blob-1" />
      <div className="terminal-blob terminal-blob-2" />
      <div className="terminal-blob terminal-blob-3" />

      {/* Search bar */}
      <div className="terminal-search">
        <Barcode className="w-5 h-5 text-white/60" />
        <input
          ref={inputRef}
          type="text"
          value={ean}
          onChange={(e) => setEan(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Leia o código de barras ou digite o EAN..."
          className="terminal-input"
          autoFocus
        />
        <button onClick={() => consultar()} className="terminal-search-btn">
          <Search className="w-5 h-5" />
        </button>
      </div>

      {/* Loading */}
      <AnimatePresence>
        {loading && (
          <motion.div
            className="terminal-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="terminal-spinner" />
            <p className="text-white/70 text-lg mt-4">Consultando...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="terminal-error"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <p className="text-2xl font-bold">{error}</p>
            <p className="text-white/50 mt-2">Verifique o código e tente novamente</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product display */}
      <AnimatePresence mode="wait">
        {produto && !loading && (
          <motion.div
            key={produto.ean}
            className="terminal-product-area"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Product name banner */}
            <motion.div
              className="terminal-name-banner"
              initial={{ x: -80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <h1 className="terminal-product-name">
                {produto.nome_curto || produto.nome}
              </h1>
              {produto.marca && (
                <p className="terminal-product-brand">{produto.marca}</p>
              )}
            </motion.div>

            {/* Product image with pedestal */}
            <motion.div
              className="terminal-image-container"
              initial={{ scale: 0.5, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, type: "spring", stiffness: 200, damping: 20 }}
            >
              {produto.imagem_url_vtex ? (
                <img
                  src={produto.imagem_url_vtex}
                  alt={produto.nome}
                  className="terminal-product-image"
                />
              ) : (
                <div className="terminal-no-image">
                  <Barcode className="w-16 h-16 text-white/30" />
                </div>
              )}
              <div className="terminal-pedestal" />
            </motion.div>

            {/* Price */}
            <motion.div
              className="terminal-price-area"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35 }}
            >
              {hasDiscount && (
                <p className="terminal-old-price">
                  De R$ {produto.preco_lista!.toFixed(2)}
                </p>
              )}
              <div className="terminal-price">
                <span className="terminal-price-symbol">R$</span>
                <motion.span
                  className="terminal-price-reais"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.45, type: "spring", stiffness: 300 }}
                >
                  {formatPrice(produto.preco ?? 0).reais}
                </motion.span>
                <span className="terminal-price-centavos">
                  ,{formatPrice(produto.preco ?? 0).centavos}
                </span>
              </div>
              {produto.unidade_medida && (
                <p className="terminal-unit">
                  {produto.unidade_medida}
                </p>
              )}
            </motion.div>

            {/* Suggestions */}
            {allSugestoes.length > 0 && (
              <motion.div
                className="terminal-suggestions"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.6 }}
              >
                <h2 className="terminal-suggestions-title">
                  💡 Você também pode gostar
                </h2>
                <div className="terminal-suggestions-grid">
                  {allSugestoes.map((s, i) => (
                    <motion.button
                      key={s.ean}
                      className="terminal-suggestion-card"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.7 + i * 0.08 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setEan(s.ean);
                        consultar(s.ean);
                      }}
                    >
                      {s.imagem_url_vtex ? (
                        <img
                          src={s.imagem_url_vtex}
                          alt={s.nome}
                          className="terminal-suggestion-img"
                        />
                      ) : (
                        <div className="terminal-suggestion-noimg">
                          <Barcode className="w-6 h-6 text-white/20" />
                        </div>
                      )}
                      <p className="terminal-suggestion-name">
                        {s.nome_curto || s.nome}
                      </p>
                      {s.preco && (
                        <p className="terminal-suggestion-price">
                          R$ {s.preco.toFixed(2)}
                        </p>
                      )}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle state */}
      <AnimatePresence>
        {!produto && !loading && !error && (
          <motion.div
            className="terminal-idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Barcode className="w-24 h-24 text-white/15 mb-6" />
            </motion.div>
            <p className="text-white/40 text-2xl font-bold">Consulte um produto</p>
            <p className="text-white/25 text-lg mt-2">Escaneie ou digite o código de barras</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
