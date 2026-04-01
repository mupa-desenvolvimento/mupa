import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className="terminal-page">
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
      {loading && (
        <div className="terminal-loading">
          <div className="terminal-spinner" />
          <p className="text-white/70 text-lg mt-4">Consultando...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="terminal-error">
          <p className="text-2xl font-bold">{error}</p>
          <p className="text-white/50 mt-2">Verifique o código e tente novamente</p>
        </div>
      )}

      {/* Product display */}
      {produto && !loading && (
        <div className="terminal-product-area">
          {/* Product name banner */}
          <div className="terminal-name-banner">
            <h1 className="terminal-product-name">
              {produto.nome_curto || produto.nome}
            </h1>
            {produto.marca && (
              <p className="terminal-product-brand">{produto.marca}</p>
            )}
          </div>

          {/* Product image with pedestal */}
          <div className="terminal-image-container">
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
          </div>

          {/* Price */}
          <div className="terminal-price-area">
            {hasDiscount && (
              <p className="terminal-old-price">
                De R$ {produto.preco_lista!.toFixed(2)}
              </p>
            )}
            <div className="terminal-price">
              <span className="terminal-price-symbol">R$</span>
              <span className="terminal-price-reais">
                {formatPrice(produto.preco ?? 0).reais}
              </span>
              <span className="terminal-price-centavos">
                ,{formatPrice(produto.preco ?? 0).centavos}
              </span>
            </div>
            {produto.unidade_medida && (
              <p className="terminal-unit">
                {produto.unidade_medida}
              </p>
            )}
          </div>

          {/* Suggestions */}
          {allSugestoes.length > 0 && (
            <div className="terminal-suggestions">
              <h2 className="terminal-suggestions-title">
                💡 Você também pode gostar
              </h2>
              <div className="terminal-suggestions-grid">
                {allSugestoes.map((s) => (
                  <button
                    key={s.ean}
                    className="terminal-suggestion-card"
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
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Idle state */}
      {!produto && !loading && !error && (
        <div className="terminal-idle">
          <Barcode className="w-24 h-24 text-white/15 mb-6" />
          <p className="text-white/40 text-2xl font-bold">Consulte um produto</p>
          <p className="text-white/25 text-lg mt-2">Escaneie ou digite o código de barras</p>
        </div>
      )}
    </div>
  );
}
