import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Barcode } from "lucide-react";

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

interface MediaItem {
  id: string;
  tipo: "imagem" | "video";
  url: string;
  duracao_segundos: number;
}

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export default function TerminalPage() {
  const [ean, setEan] = useState("");
  const [produto, setProduto] = useState<Produto | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestoes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [tipoSugestao, setTipoSugestao] = useState<string>("complementares");
  const [beepEnabled, setBeepEnabled] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [inputFocused, setInputFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Wake Lock — prevent screen sleep on Android
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {}
    };

    requestWakeLock();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      wakeLock?.release();
    };
  }, []);

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
    enterFs();

    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Fetch terminal config
  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase
        .from("terminal_config")
        .select("chave, valor")
        .in("chave", ["tipo_sugestao", "beep_enabled", "tts_enabled"]);
      if (data) {
        for (const row of data) {
          if (row.chave === "tipo_sugestao") setTipoSugestao(row.valor);
          if (row.chave === "beep_enabled") setBeepEnabled(row.valor !== "false");
          if (row.chave === "tts_enabled") setTtsEnabled(row.valor !== "false");
        }
      }
    };
    fetchConfig();
  }, []);

  // Reset to idle after 30s of inactivity
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

  useEffect(() => {
    const handler = () => { if (produto) resetIdleTimer(); };
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [produto, resetIdleTimer]);

  // Fetch terminal media
  useEffect(() => {
    const fetchMedia = async () => {
      const { data } = await supabase
        .from("terminal_media")
        .select("id, tipo, url, duracao_segundos")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (data) setMediaList(data as MediaItem[]);
    };
    fetchMedia();
  }, []);

  // Slideshow timer
  const isIdle = !produto && !loading && !error;
  useEffect(() => {
    if (!isIdle || mediaList.length <= 1) return;
    const current = mediaList[currentMediaIndex];
    if (!current || current.tipo === "video") return;

    const timer = setTimeout(() => {
      setCurrentMediaIndex((prev) => (prev + 1) % mediaList.length);
    }, current.duracao_segundos * 1000);

    return () => clearTimeout(timer);
  }, [isIdle, currentMediaIndex, mediaList]);

  // Keep focus on hidden input for barcode scanner — aggressively
  useEffect(() => {
    const keepFocus = () => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus({ preventScroll: true });
      }
    };
    const interval = setInterval(keepFocus, 200);
    keepFocus();

    // Re-focus on any click/touch anywhere on the page
    const onPointerDown = () => setTimeout(keepFocus, 50);
    // Re-focus when window regains visibility
    const onVisibility = () => {
      if (document.visibilityState === "visible") keepFocus();
    };
    // Re-focus after fullscreen changes
    const onFsChange = () => setTimeout(keepFocus, 100);

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("touchstart", onPointerDown, true);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFsChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("touchstart", onPointerDown, true);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current?.requestFullscreen();
      }
    } catch {}
  };

  // Beep sound via Web Audio API
  const playBeep = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1200;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }, []);

  // TTS to speak the price
  const speakPrice = useCallback((preco: number, nome: string) => {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const reais = Math.floor(preco);
      const centavos = Math.round((preco - reais) * 100);
      let text = `${nome}. `;
      if (centavos > 0) {
        text += `${reais} reais e ${centavos} centavos`;
      } else {
        text += `${reais} reais`;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }, []);

  const consultar = async (code?: string) => {
    const searchEan = (code || ean).replace(/\D/g, "").trim();
    if (!searchEan) return;

    // Clear input immediately
    setEan("");

    playBeep();
    setLoading(true);
    setError(null);
    setProduto(null);
    setSugestoes(null);

    try {
      const prodRes = await fetch(`${BASE_URL}/api-produtos?ean=${searchEan}`);
      if (!prodRes.ok) {
        console.warn("[Terminal] EAN not found:", searchEan);
        setError(`Produto não encontrado (${searchEan})`);
        setLoading(false);
        return;
      }
      const prodData = await prodRes.json();
      const prod = prodData.produto;
      setProduto(prod);

      // Speak the price
      if (prod.preco) {
        speakPrice(prod.preco, prod.nome_curto || prod.nome);
      }

      fetch(`${BASE_URL}/api-sugestoes?ean=${searchEan}&limit=3`)
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

  // Get suggestions based on configured type, limited to 3
  const getSugestoes = (): Sugestao[] => {
    if (!sugestoes) return [];
    const map: Record<string, Sugestao[]> = {
      mesma_marca: sugestoes.mesma_marca,
      complementares: sugestoes.complementares,
      perfil: sugestoes.perfil,
      todas: [...sugestoes.complementares, ...sugestoes.mesma_marca, ...sugestoes.perfil],
    };
    return (map[tipoSugestao] || map.todas).slice(0, 3);
  };

  const allSugestoes = getSugestoes();

  return (
    <div ref={containerRef} className="terminal-page" style={{ cursor: "none" }}>
      {/* Hidden input for barcode scanner — no keyboard */}
      <input
        ref={inputRef}
        type="text"
        inputMode="none"
        value={ean}
        onChange={(e) => setEan(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        autoFocus
        style={{
          position: "absolute",
          opacity: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      />

      {/* Focus indicator — green dot = ready to scan */}
      <div
        className="absolute bottom-2 left-2 z-50 flex items-center gap-1"
        style={{ opacity: 0.6 }}
      >
        <div
          className="w-2 h-2 rounded-full transition-colors duration-300"
          style={{ backgroundColor: inputFocused ? "#22c55e" : "#ef4444" }}
        />
      </div>

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

      {/* Product display — IMAGE FIRST (top), then info, then suggestions */}
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
            {/* Image on top — large */}
            <motion.div
              className="terminal-product-image-top"
              initial={{ scale: 0.5, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
            >
              {produto.imagem_url_vtex ? (
                <img
                  src={produto.imagem_url_vtex}
                  alt={produto.nome}
                  className="terminal-product-image-large"
                />
              ) : (
                <div className="terminal-no-image-large">
                  <Barcode className="w-20 h-20 text-white/30" />
                </div>
              )}
            </motion.div>

            {/* Name + brand */}
            <motion.div
              className="terminal-name-banner"
              initial={{ x: -80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
            >
              <h1 className="terminal-product-name">
                {produto.nome_curto || produto.nome}
              </h1>
              {produto.marca && (
                <p className="terminal-product-brand">{produto.marca}</p>
              )}
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
                <p className="terminal-unit">{produto.unidade_medida}</p>
              )}
              {hasDiscount && (
                <motion.div
                  className="terminal-volume-price"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.55 }}
                >
                  <span className="terminal-volume-label">A partir de 3 Un:</span>
                  <span className="terminal-volume-badge">
                    R$ {produto.preco!.toFixed(2)}
                  </span>
                </motion.div>
              )}
            </motion.div>

            {/* Suggestions — max 3 */}
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

      {/* Idle state — media slideshow or fallback */}
      <AnimatePresence>
        {isIdle && (
          <>
            {mediaList.length > 0 ? (
              <motion.div
                className="terminal-media-slideshow"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                {/* Crossfade: render ALL media stacked, only active one is visible */}
                {mediaList.map((media, idx) => (
                  <motion.div
                    key={media.id}
                    className="terminal-media-item"
                    initial={false}
                    animate={{ opacity: idx === currentMediaIndex ? 1 : 0 }}
                    transition={{ duration: 1.2, ease: "easeInOut" }}
                    style={{ pointerEvents: idx === currentMediaIndex ? "auto" : "none" }}
                  >
                    {media.tipo === "imagem" ? (
                      <img
                        src={media.url}
                        alt=""
                        className="terminal-media-content"
                      />
                    ) : (
                      <video
                        src={media.url}
                        className="terminal-media-content"
                        autoPlay={idx === currentMediaIndex}
                        muted
                        playsInline
                        onEnded={() => {
                          if (idx === currentMediaIndex) {
                            setCurrentMediaIndex((prev) => (prev + 1) % mediaList.length);
                          }
                        }}
                        ref={(el) => {
                          if (!el) return;
                          if (idx === currentMediaIndex) {
                            el.play().catch(() => {});
                          } else {
                            el.pause();
                            el.currentTime = 0;
                          }
                        }}
                      />
                    )}
                  </motion.div>
                ))}
              </motion.div>
            ) : (
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
                <p className="text-white/25 text-lg mt-2">Escaneie o código de barras</p>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
