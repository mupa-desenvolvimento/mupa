import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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

interface ProductTheme {
  primary: string;
  secondary: string;
  accent: string;
  tertiary: string;
  background: string[];
  textColor: string;
  textMuted: string;
  cardColor: string;
  bannerGradient: string;
  bannerShadow: string;
  bannerTextColor: string;
  bannerTextMuted: string;
  blobColors: string[];
  waveColors: string[];
  suggestionBg: string;
  suggestionBorder: string;
  volumeBadgeBg: string;
  // Main colored container
  containerBg: string;
  containerGradient: string;
  containerTextColor: string;
  containerTextMuted: string;
  // Price sub-container (secondary color)
  priceContainerBg: string;
  priceContainerGradient: string;
  priceTextColor: string;
  priceTextMuted: string;
}

const FALLBACK_THEME: ProductTheme = {
  primary: "rgb(192,57,43)",
  secondary: "rgb(142,68,173)",
  accent: "rgb(231,76,60)",
  tertiary: "rgb(44,62,80)",
  background: ["#f5f0ef", "#f8f2f1", "#faf6f5"],
  textColor: "#1a1a1a",
  textMuted: "rgba(0,0,0,0.45)",
  cardColor: "rgba(0,0,0,0.04)",
  bannerGradient: "linear-gradient(135deg, rgb(192,57,43), rgb(169,50,38))",
  bannerShadow: "0 8px 30px rgba(192,57,43,0.25)",
  bannerTextColor: "#ffffff",
  bannerTextMuted: "rgba(255,255,255,0.8)",
  blobColors: [
    "radial-gradient(circle, rgba(192,57,43,0.15), transparent 70%)",
    "radial-gradient(circle, rgba(142,68,173,0.1), transparent 70%)",
    "radial-gradient(circle, rgba(44,62,80,0.08), transparent 70%)",
  ],
  waveColors: ["rgba(192,57,43,0.1)", "rgba(192,57,43,0.06)"],
  suggestionBg: "rgba(0,0,0,0.03)",
  suggestionBorder: "rgba(0,0,0,0.06)",
  volumeBadgeBg: "linear-gradient(135deg, rgb(192,57,43), rgb(150,40,27))",
  containerBg: "rgb(240,220,216)",
  containerGradient: "linear-gradient(180deg, rgba(192,57,43,0.18) 0%, rgba(192,57,43,0.10) 100%)",
  containerTextColor: "#1a1a1a",
  containerTextMuted: "rgba(0,0,0,0.5)",
  priceContainerBg: "rgb(142,68,173)",
  priceContainerGradient: "linear-gradient(135deg, rgb(142,68,173), rgb(110,50,140))",
  priceTextColor: "#ffffff",
  priceTextMuted: "rgba(255,255,255,0.8)",
};

interface RGB { r: number; g: number; b: number; }
interface HSL { h: number; s: number; l: number; }

function rgbToHsl({ r, g, b }: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s: number;
  const l = (max + min) / 2;
  if (max === min) { s = 0; } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function darkenRgb(c: RGB, factor: number): RGB {
  return { r: Math.round(c.r * factor), g: Math.round(c.g * factor), b: Math.round(c.b * factor) };
}

function lightenRgb(c: RGB, factor: number): RGB {
  return {
    r: Math.round(c.r + (255 - c.r) * factor),
    g: Math.round(c.g + (255 - c.g) * factor),
    b: Math.round(c.b + (255 - c.b) * factor),
  };
}

function rgbStr(c: RGB): string { return `rgb(${c.r},${c.g},${c.b})`; }
function rgbaStr(c: RGB, a: number): string { return `rgba(${c.r},${c.g},${c.b},${a})`; }

function luminance(c: RGB): number {
  const [rs, gs, bs] = [c.r, c.g, c.b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(c1: RGB, c2: RGB): number {
  const l1 = luminance(c1), l2 = luminance(c2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureContrast(bgColor: RGB, preferLight = true): string {
  const white: RGB = { r: 255, g: 255, b: 255 };
  const softWhite: RGB = { r: 245, g: 245, b: 245 };
  const dark: RGB = { r: 20, g: 20, b: 20 };

  if (preferLight) {
    if (contrastRatio(bgColor, white) >= 4.5) return rgbStr(white);
    if (contrastRatio(bgColor, softWhite) >= 4.5) return rgbStr(softWhite);
    let test = { ...bgColor };
    for (let i = 0; i < 10; i++) {
      test = lightenRgb(test, 0.15);
      if (contrastRatio(bgColor, test) >= 4.5) return rgbStr(test);
    }
    return rgbStr(dark);
  }
  return contrastRatio(bgColor, white) >= 4.5 ? rgbStr(white) : rgbStr(dark);
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function kMeansClusters(pixels: RGB[], k: number, iterations = 10): { center: RGB; count: number }[] {
  if (pixels.length === 0) return [];
  const centroids: RGB[] = [pixels[Math.floor(Math.random() * pixels.length)]];
  while (centroids.length < k) {
    const distances = pixels.map(p => Math.min(...centroids.map(c => colorDistance(p, c))));
    const sum = distances.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < pixels.length; i++) {
      r -= distances[i];
      if (r <= 0) { centroids.push(pixels[i]); break; }
    }
  }

  let assignments = new Array(pixels.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity, minIdx = 0;
      for (let j = 0; j < centroids.length; j++) {
        const d = colorDistance(pixels[i], centroids[j]);
        if (d < minDist) { minDist = d; minIdx = j; }
      }
      assignments[i] = minIdx;
    }
    for (let j = 0; j < k; j++) {
      let sr = 0, sg = 0, sb = 0, count = 0;
      for (let i = 0; i < pixels.length; i++) {
        if (assignments[i] === j) {
          sr += pixels[i].r; sg += pixels[i].g; sb += pixels[i].b; count++;
        }
      }
      if (count > 0) {
        centroids[j] = { r: Math.round(sr / count), g: Math.round(sg / count), b: Math.round(sb / count) };
      }
    }
  }

  const counts = new Array(k).fill(0);
  for (const a of assignments) counts[a]++;

  return centroids.map((center, i) => ({ center, count: counts[i] }));
}

function extractPalette(imgUrl: string): Promise<RGB[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 80;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve([]); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        const pixels: RGB[] = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          if (r > 235 && g > 235 && b > 235) continue;
          if (r < 20 && g < 20 && b < 20) continue;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (max - min < 15 && max > 60 && max < 200) continue;
          pixels.push({ r, g, b });
        }

        if (pixels.length < 10) { resolve([]); return; }

        const clusters = kMeansClusters(pixels, 5, 12);
        clusters.sort((a, b) => b.count - a.count);

        resolve(clusters.slice(0, 4).map(c => c.center));
      } catch { resolve([]); }
    };
    img.onerror = () => resolve([]);
    img.src = imgUrl;
  });
}

const themeCache = new Map<string, ProductTheme>();

function _generateTheme(colors: RGB[]): ProductTheme {
  if (colors.length === 0) return FALLBACK_THEME;
  const withHsl = colors.map(c => ({ rgb: c, hsl: rgbToHsl(c) }));
  const byVibrancy = [...withHsl].sort((a, b) =>
    (b.hsl.s * (100 - Math.abs(b.hsl.l - 50))) - (a.hsl.s * (100 - Math.abs(a.hsl.l - 50)))
  );
  const primary = withHsl[0].rgb;
  const secondary = withHsl[1]?.rgb || darkenRgb(primary, 0.7);
  const accent = byVibrancy[0].rgb;
  const tertiary = withHsl[2]?.rgb || lightenRgb(primary, 0.3);
  const fourth = withHsl[3]?.rgb || darkenRgb(secondary, 0.5);

  // LIGHT backgrounds: very light tinted versions of palette colors
  const bg1 = lightenRgb(primary, 0.88);
  const bg2 = lightenRgb(secondary, 0.9);
  const bg3 = lightenRgb(tertiary, 0.92);

  // Dark text for light bg
  const textColor = "#1a1a1a";
  const textMuted = "rgba(0,0,0,0.45)";

  // Banner keeps vivid color
  const bannerDark = darkenRgb(accent, 0.7);
  const cardColor = rgbaStr(primary, 0.05);

  // Main container: lightened primary
  const containerLight = lightenRgb(primary, 0.72);
  const containerLighter = lightenRgb(primary, 0.82);
  const containerLum = luminance(containerLight);
  const containerTextColor = containerLum > 0.4 ? "#1a1a1a" : "#ffffff";
  const containerTextMuted = containerLum > 0.4 ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)";

  // Price container: secondary color
  const secDark = darkenRgb(secondary, 0.75);
  const priceLum = luminance(secondary);
  const priceTextColor = priceLum > 0.18 ? "#1a1a1a" : "#ffffff";
  const priceTextMuted = priceLum > 0.18 ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.75)";

  return {
    primary: rgbStr(primary), secondary: rgbStr(secondary), accent: rgbStr(accent), tertiary: rgbStr(tertiary),
    background: [rgbStr(bg1), rgbStr(bg2), rgbStr(bg3)],
    textColor, textMuted, cardColor,
    bannerGradient: `linear-gradient(135deg, ${rgbStr(accent)}, ${rgbStr(bannerDark)})`,
    bannerShadow: `0 8px 30px ${rgbaStr(accent, 0.25)}`,
    bannerTextColor: luminance(accent) > 0.18 ? "#1a1a1a" : "#ffffff",
    bannerTextMuted: luminance(accent) > 0.18 ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.8)",
    blobColors: [
      `radial-gradient(circle, ${rgbaStr(primary, 0.15)}, transparent 70%)`,
      `radial-gradient(circle, ${rgbaStr(secondary, 0.12)}, transparent 70%)`,
      `radial-gradient(circle, ${rgbaStr(fourth, 0.1)}, transparent 70%)`,
    ],
    waveColors: [rgbaStr(accent, 0.1), rgbaStr(secondary, 0.07)],
    suggestionBg: rgbaStr(primary, 0.08),
    suggestionBorder: rgbaStr(primary, 0.12),
    volumeBadgeBg: `linear-gradient(135deg, ${rgbStr(accent)}, ${rgbStr(darkenRgb(accent, 0.65))})`,
    containerBg: rgbStr(containerLight),
    containerGradient: `linear-gradient(180deg, ${rgbStr(containerLight)} 0%, ${rgbStr(containerLighter)} 100%)`,
    containerTextColor,
    containerTextMuted,
    priceContainerBg: rgbStr(secondary),
    priceContainerGradient: `linear-gradient(135deg, ${rgbStr(secondary)}, ${rgbStr(secDark)})`,
    priceTextColor,
    priceTextMuted,
  };
}

async function generateThemeFromImage(imageUrl: string): Promise<ProductTheme> {
  const cached = themeCache.get(imageUrl);
  if (cached) return cached;

  const palette = await extractPalette(imageUrl);
  const theme = _generateTheme(palette);
  themeCache.set(imageUrl, theme);
  return theme;
}

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export default function TerminalPage() {
  // ── Device activation state ──
  const [deviceActivated, setDeviceActivated] = useState<boolean>(() => {
    return !!localStorage.getItem("mupa_device_id");
  });
  const [activationCode, setActivationCode] = useState("");
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activatingDevice, setActivatingDevice] = useState(false);
  const [deviceEmpresa, setDeviceEmpresa] = useState<string | null>(null);

  const activateDevice = async () => {
    const code = activationCode.trim().toUpperCase();
    if (!code) return;
    setActivatingDevice(true);
    setActivationError(null);
    try {
      const { data, error } = await supabase
        .from("dispositivos")
        .select("id, empresa_id, ativo")
        .eq("codigo_ativacao", code)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setActivationError("Código inválido. Verifique e tente novamente.");
        setActivatingDevice(false);
        return;
      }
      // Activate device
      await supabase.from("dispositivos").update({
        ativo: true,
        ativado_em: new Date().toISOString(),
        ultimo_acesso: new Date().toISOString(),
      }).eq("id", data.id);

      localStorage.setItem("mupa_device_id", data.id);
      localStorage.setItem("mupa_empresa_id", data.empresa_id || "");
      setDeviceEmpresa(data.empresa_id);
      setDeviceActivated(true);
    } catch (e: any) {
      setActivationError(e.message || "Erro ao ativar dispositivo");
    }
    setActivatingDevice(false);
  };

  // Load empresa on mount if device is activated
  useEffect(() => {
    const empresaId = localStorage.getItem("mupa_empresa_id");
    if (empresaId) setDeviceEmpresa(empresaId);
    // Update last access
    const deviceId = localStorage.getItem("mupa_device_id");
    if (deviceId) {
      supabase.from("dispositivos").update({ ultimo_acesso: new Date().toISOString() }).eq("id", deviceId).then(() => {});
    }
  }, []);

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
  const [fontNome, setFontNome] = useState(24);
  const [fontPreco, setFontPreco] = useState(72);
  const [imgSize, setImgSize] = useState(280);
  const [maxSugestoes, setMaxSugestoes] = useState(3);
  const [corAutoEnabled, setCorAutoEnabled] = useState(true);
  const [corFundo, setCorFundo] = useState("#1a0a0a");
  const [corDescricao, setCorDescricao] = useState("#c0392b");
  const [corPreco, setCorPreco] = useState("#ffffff");
  const [wavesEnabled, setWavesEnabled] = useState(false);
  const [theme, setTheme] = useState<ProductTheme | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const activeTheme = useMemo<ProductTheme>(() => {
    if (corAutoEnabled && theme) return theme;
    if (!corAutoEnabled) {
      return {
        ...FALLBACK_THEME,
        background: [corFundo, `${corFundo}ee`, corFundo],
        bannerGradient: `linear-gradient(135deg, ${corDescricao}, ${corDescricao}cc)`,
        bannerShadow: `0 8px 30px ${corDescricao}66`,
        bannerTextColor: (() => { const m = corDescricao.match(/\d+/g); if (m) { const c = { r: +m[0], g: +m[1], b: +m[2] }; return luminance(c) > 0.18 ? "#1a1a1a" : "#ffffff"; } return "#ffffff"; })(),
        bannerTextMuted: (() => { const m = corDescricao.match(/\d+/g); if (m) { const c = { r: +m[0], g: +m[1], b: +m[2] }; return luminance(c) > 0.18 ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.8)"; } return "rgba(255,255,255,0.8)"; })(),
        textColor: corPreco,
        primary: corDescricao,
        accent: corDescricao,
      };
    }
    return FALLBACK_THEME;
  }, [corAutoEnabled, theme, corFundo, corDescricao, corPreco]);

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch {}
    };
    requestWakeLock();
    const onVisibilityChange = () => { if (document.visibilityState === "visible") requestWakeLock(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { document.removeEventListener("visibilitychange", onVisibilityChange); wakeLock?.release(); };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const enterFs = async () => { try { if (!document.fullscreenElement) await el.requestFullscreen(); } catch {} };
    enterFs();
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from("terminal_config").select("chave, valor");
    if (data) {
      for (const row of data) {
        switch (row.chave) {
          case "tipo_sugestao": setTipoSugestao(row.valor); break;
          case "beep_enabled": setBeepEnabled(row.valor !== "false"); break;
          case "tts_enabled": setTtsEnabled(row.valor !== "false"); break;
          case "font_nome": setFontNome(Number(row.valor) || 24); break;
          case "font_preco": setFontPreco(Number(row.valor) || 72); break;
          case "img_size": setImgSize(Number(row.valor) || 280); break;
          case "max_sugestoes": setMaxSugestoes(Number(row.valor) ?? 3); break;
          case "cor_auto": setCorAutoEnabled(row.valor !== "false"); break;
          case "cor_fundo": setCorFundo(row.valor); break;
          case "cor_descricao": setCorDescricao(row.valor); break;
          case "cor_preco": setCorPreco(row.valor); break;
          case "waves_enabled": setWavesEnabled(row.valor === "true"); break;
        }
      }
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  useEffect(() => {
    const channel = supabase.channel("terminal-config-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "terminal_config" }, () => loadConfig())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadConfig]);

  useEffect(() => {
    const channel = supabase.channel("terminal-media-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "terminal_media" }, async () => {
        const { data } = await supabase.from("terminal_media").select("id, tipo, url, duracao_segundos")
          .eq("ativo", true).order("ordem", { ascending: true });
        if (data) setMediaList(data as MediaItem[]);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setProduto(null); setSugestoes(null); setEan(""); setError(null);
      setTheme(null);
      if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
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
    return () => { window.removeEventListener("pointerdown", handler); window.removeEventListener("keydown", handler); };
  }, [produto, resetIdleTimer]);

  useEffect(() => {
    if (error) {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setError(null), 3000);
    }
    return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current); };
  }, [error]);

  useEffect(() => {
    const fetchMedia = async () => {
      const { data } = await supabase.from("terminal_media").select("id, tipo, url, duracao_segundos")
        .eq("ativo", true).order("ordem", { ascending: true });
      if (data) setMediaList(data as MediaItem[]);
    };
    fetchMedia();
  }, []);

  const isIdle = !produto && !loading && !error;
  useEffect(() => {
    if (!isIdle || mediaList.length <= 1) return;
    const current = mediaList[currentMediaIndex];
    if (!current || current.tipo === "video") return;
    const timer = setTimeout(() => setCurrentMediaIndex((prev) => (prev + 1) % mediaList.length), current.duracao_segundos * 1000);
    return () => clearTimeout(timer);
  }, [isIdle, currentMediaIndex, mediaList]);

  useEffect(() => {
    const keepFocus = () => {
      if (inputRef.current && document.activeElement !== inputRef.current) inputRef.current.focus({ preventScroll: true });
    };
    const interval = setInterval(keepFocus, 200);
    keepFocus();
    const onPointerDown = () => setTimeout(keepFocus, 50);
    const onVisibility = () => { if (document.visibilityState === "visible") keepFocus(); };
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
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch { }
  };

  const playBeep = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 1200; osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
    } catch { }
  }, []);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const speakPrice = useCallback(async (preco: number, precoLista?: number, currentTipoSugestao?: string) => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      const params = new URLSearchParams({
        preco: preco.toString(),
        ...(precoLista && precoLista > preco ? { preco_lista: precoLista.toString() } : {}),
        tipo_sugestao: currentTipoSugestao || "complementares",
      });

      const res = await fetch(`${BASE_URL}/tts-audio?${params}`);
      if (!res.ok) {
        console.error("TTS fetch failed:", res.status);
        return;
      }
      const data = await res.json();
      if (data.audio_url) {
        const audio = new Audio(data.audio_url);
        currentAudioRef.current = audio;
        audio.play().catch(() => {});
      }
    } catch (e) {
      console.error("TTS error:", e);
    }
  }, []);

  const consultar = async (code?: string) => {
    const searchEan = (code || ean).replace(/\D/g, "").trim();
    if (!searchEan) return;
    setEan("");
    if (beepEnabled) playBeep();
    setLoading(true); setError(null); setProduto(null); setSugestoes(null);
    setTheme(null);

    try {
      const prodRes = await fetch(`${BASE_URL}/api-produtos?ean=${searchEan}`);
      if (!prodRes.ok) {
        setError(`Produto não encontrado (${searchEan})`);
        if (ttsEnabled) {
          fetch(`${BASE_URL}/tts-audio?tipo=indisponivel`)
            .then(r => r.json())
            .then(d => { if (d.audio_url) { const a = new Audio(d.audio_url); currentAudioRef.current = a; a.play().catch(() => {}); } })
            .catch(() => {});
        }
        setLoading(false);
        return;
      }
      const prodData = await prodRes.json();
      const prod = prodData.produto;
      setProduto(prod);

      if (ttsEnabled && prod.preco) speakPrice(prod.preco, prod.preco_lista, tipoSugestao);

      if (corAutoEnabled && prod.imagem_url_vtex) {
        generateThemeFromImage(prod.imagem_url_vtex).then(t => setTheme(t));
      }

      fetch(`${BASE_URL}/api-sugestoes?ean=${searchEan}&limit=${maxSugestoes || 3}`)
        .then(r => r.json()).then(d => setSugestoes(d.sugestoes)).catch(() => { });

      setLoading(false);
    } catch {
      setError("Erro ao consultar produto");
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") consultar(); };

  const formatPrice = (value: number) => {
    const [reais, centavos] = value.toFixed(2).split(".");
    return { reais, centavos };
  };

  const hasDiscount = produto?.preco_lista && produto?.preco && produto.preco_lista > produto.preco;

  const getSugestoes = (): Sugestao[] => {
    if (!sugestoes) return [];
    const map: Record<string, Sugestao[]> = {
      mesma_marca: sugestoes.mesma_marca,
      complementares: sugestoes.complementares,
      perfil: sugestoes.perfil,
      todas: [...sugestoes.complementares, ...sugestoes.mesma_marca, ...sugestoes.perfil],
    };
    return (map[tipoSugestao] || map.todas).slice(0, maxSugestoes);
  };

  const allSugestoes = getSugestoes();
  const t = activeTheme;

  const bgGradient = produto
    ? `linear-gradient(160deg, ${t.background[0]} 0%, ${t.background[1]} 50%, ${t.background[2]} 100%)`
    : `linear-gradient(160deg, #f5f0ef 0%, #f8f2f1 50%, #faf6f5 100%)`;

  const transitionStyle = "background 1s ease, color 0.6s ease";

  // ── Activation Screen ──
  if (!deviceActivated) {
    return (
      <div className="terminal-page flex items-center justify-center" style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)", cursor: "default" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-8 p-12 rounded-3xl"
          style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", maxWidth: 480 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Barcode className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Mupa Terminal</h1>
              <p className="text-sm text-white/50">Ativação de Dispositivo</p>
            </div>
          </div>

          <p className="text-white/70 text-center text-sm leading-relaxed">
            Digite o código de ativação fornecido pelo administrador ou escaneie o QR Code para vincular este terminal à sua empresa.
          </p>

          <div className="w-full space-y-3">
            <input
              type="text"
              placeholder="Ex: ABCD1234"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && activateDevice()}
              maxLength={12}
              className="w-full text-center text-2xl font-mono tracking-[0.3em] px-4 py-4 rounded-xl border bg-white/10 text-white placeholder:text-white/30 border-white/20 focus:border-blue-400 focus:outline-none transition-colors"
              autoFocus
            />
            {activationError && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-sm text-center"
              >
                {activationError}
              </motion.p>
            )}
            <button
              onClick={activateDevice}
              disabled={!activationCode.trim() || activatingDevice}
              className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 transition-all"
            >
              {activatingDevice ? "Ativando..." : "Ativar Dispositivo"}
            </button>
          </div>

          <p className="text-white/30 text-xs">Catálogo Mupa v1.0</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="terminal-page"
      style={{ background: bgGradient, cursor: "none", transition: transitionStyle }}
    >
      <input
        ref={inputRef} type="text" inputMode="none" value={ean}
        onChange={(e) => setEan(e.target.value)} onKeyDown={handleKeyDown}
        onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
        autoFocus
        style={{ position: "absolute", opacity: 0, width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}
      />

      <div className="absolute bottom-2 left-2 z-50 flex items-center gap-1" style={{ opacity: 0.6 }}>
        <div className="w-2 h-2 rounded-full transition-colors duration-300"
          style={{ backgroundColor: inputFocused ? "#22c55e" : "#ef4444" }} />
      </div>

      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 z-50 w-8 h-8 rounded-lg flex items-center justify-center text-black/20 hover:text-black/50 transition-colors"
        style={{ background: "rgba(0,0,0,0.03)" }}
        title={isFullscreen ? "Sair do fullscreen" : "Entrar em fullscreen"}
      >
        {isFullscreen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        )}
      </button>

      <AnimatePresence>
        {produto && (
          <>
            <motion.div
              className="terminal-blob terminal-blob-1"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              style={{ background: t.blobColors[0], transition: "background 1s ease" }}
            />
            <motion.div
              className="terminal-blob terminal-blob-2"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 1.4, ease: "easeOut", delay: 0.15 }}
              style={{ background: t.blobColors[1], transition: "background 1s ease" }}
            />
            <motion.div
              className="terminal-blob terminal-blob-3"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 1.6, ease: "easeOut", delay: 0.3 }}
              style={{ background: t.blobColors[2], transition: "background 1s ease" }}
            />
          </>
        )}
      </AnimatePresence>

      {isIdle && !mediaList.length && (
        <>
          <div className="terminal-blob terminal-blob-1" />
          <div className="terminal-blob terminal-blob-2" />
          <div className="terminal-blob terminal-blob-3" />
        </>
      )}

      {wavesEnabled && produto && (
        <svg
          className="absolute bottom-0 left-0 w-full pointer-events-none z-[1]"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          style={{ height: "30vh", opacity: 0.7, transition: "opacity 0.6s ease" }}
        >
          <motion.path
            fill={t.waveColors[0]}
            d="M0,224L48,208C96,192,192,160,288,165.3C384,171,480,213,576,224C672,235,768,213,864,186.7C960,160,1056,128,1152,128C1248,128,1344,160,1392,176L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          />
          <motion.path
            fill={t.waveColors[1]}
            d="M0,288L48,272C96,256,192,224,288,213.3C384,203,480,213,576,229.3C672,245,768,267,864,261.3C960,256,1056,224,1152,208C1248,192,1344,192,1392,192L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
            style={{ opacity: 0.6 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          />
        </svg>
      )}

      <AnimatePresence>
        {loading && (
          <motion.div className="terminal-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="terminal-spinner" />
            <p className="text-lg mt-4" style={{ color: t.textMuted }}>Consultando...</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div className="terminal-error" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
            <p className="text-2xl font-bold" style={{ color: t.textColor }}>{error}</p>
            <p className="mt-2" style={{ color: t.textMuted }}>Verifique o código e tente novamente</p>
            <motion.div className="mt-4 h-1 rounded-full overflow-hidden w-48 mx-auto" style={{ background: "rgba(0,0,0,0.08)" }}>
              <motion.div className="h-full rounded-full" style={{ background: "rgba(0,0,0,0.25)" }}
                initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 3, ease: "linear" }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              {/* Product Image - OUTSIDE the main container */}
              <motion.div
                className="terminal-product-image-top"
                initial={{ scale: 0.5, opacity: 0, y: 40 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
                style={{ width: imgSize, height: imgSize }}
              >
                {produto.imagem_url_vtex ? (
                  <img src={produto.imagem_url_vtex} alt={produto.nome} className="terminal-product-image-large"
                    style={{ maxWidth: imgSize, maxHeight: imgSize }} />
                ) : (
                  <div className="terminal-no-image-large" style={{ width: imgSize, height: imgSize }}>
                    <Barcode className="w-20 h-20 text-black/15" />
                  </div>
                )}
              </motion.div>

              {/* MAIN COLORED CONTAINER - wraps description + price + suggestions */}
              <motion.div
                className="terminal-main-container"
                style={{
                  background: t.containerGradient,
                  transition: "background 0.8s ease",
                }}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
              >
                {/* Description sub-container (white/translucent) */}
                <motion.div
                  className="terminal-desc-card"
                  initial={{ x: -60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.3, ease: "easeOut" }}
                >
                  {(() => {
                    const fullName = produto.nome_curto || produto.nome;
                    const words = fullName.split(/\s+/);
                    const highlight = words.slice(0, 3).join(" ");
                    const rest = words.slice(3).join(" ");
                    return (
                      <>
                        <h1 className="terminal-desc-highlight" style={{ fontSize: Math.max(fontNome, 28) }}>
                          {highlight}
                        </h1>
                        {rest && (
                          <p className="terminal-desc-details" style={{ fontSize: Math.max(fontNome * 0.7, 16) }}>
                            {rest}
                          </p>
                        )}
                      </>
                    );
                  })()}
                  {produto.marca && (
                    <p className="terminal-desc-brand">{produto.marca}</p>
                  )}
                </motion.div>

                {/* Price sub-container (secondary color) */}
                <motion.div
                  className="terminal-price-container"
                  style={{
                    background: t.priceContainerGradient,
                    boxShadow: `0 8px 30px ${t.priceContainerBg}44`,
                    transition: "background 0.8s ease, box-shadow 0.8s ease",
                  }}
                  initial={{ opacity: 0, y: 30, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.4, type: "spring", stiffness: 250, damping: 22 }}
                >
                  {hasDiscount && (
                    <p className="terminal-container-old-price" style={{ color: t.priceTextMuted }}>
                      De R$ {produto.preco_lista!.toFixed(2)}
                    </p>
                  )}
                  <div className="terminal-container-price" style={{ color: t.priceTextColor }}>
                    <span className="terminal-container-price-symbol">R$</span>
                    <motion.span
                      className="terminal-container-price-reais"
                      style={{ fontSize: fontPreco, color: t.priceTextColor }}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.4, delay: 0.5, type: "spring", stiffness: 300 }}
                    >
                      {formatPrice(produto.preco ?? 0).reais}
                    </motion.span>
                    <span className="terminal-container-price-cents" style={{ fontSize: fontPreco * 0.45, color: t.priceTextColor }}>
                      ,{formatPrice(produto.preco ?? 0).centavos}
                    </span>
                  </div>
                  {produto.unidade_medida && (
                    <p className="terminal-container-unit" style={{ color: t.priceTextMuted }}>{produto.unidade_medida}</p>
                  )}
                </motion.div>

                {/* Promo strip */}
                {hasDiscount && (
                  <motion.div
                    className="terminal-promo-strip"
                    style={{
                      background: `linear-gradient(90deg, ${t.accent}, ${t.tertiary})`,
                      color: t.bannerTextColor,
                      transition: "background 0.8s ease",
                    }}
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ delay: 0.55, duration: 0.4 }}
                  >
                    PROMOÇÃO
                  </motion.div>
                )}

                {/* Suggestions inside the main container */}
                {allSugestoes.length > 0 && (
                  <motion.div className="terminal-suggestions" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.6 }}>
                    <motion.h2
                      className="terminal-suggestions-title"
                      style={{
                        color: t.containerTextColor,
                        background: `linear-gradient(90deg, ${t.priceContainerBg}22, ${t.priceContainerBg}44, ${t.priceContainerBg}22)`,
                        borderColor: `${t.priceContainerBg}33`,
                      }}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.55, duration: 0.4, type: "spring" }}
                    >
                      {tipoSugestao === "mesma_marca" ? "🏷️ Mais dessa marca!" :
                       tipoSugestao === "perfil" ? "⭐ Recomendados pra você!" :
                       "✨ Combina perfeitamente!"}
                    </motion.h2>
                    <div className="terminal-suggestions-grid">
                      {allSugestoes.map((s, i) => (
                        <motion.button
                          key={s.ean}
                          className="terminal-suggestion-card"
                          style={{
                            background: "rgba(255,255,255,0.75)",
                            borderColor: `${t.priceContainerBg}30`,
                            boxShadow: `0 4px 15px ${t.priceContainerBg}15`,
                            transition: "background 0.8s ease, border-color 0.8s ease, box-shadow 0.3s ease",
                          }}
                          initial={{ opacity: 0, y: 20, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.35, delay: 0.7 + i * 0.1, type: "spring", stiffness: 200 }}
                          whileHover={{ scale: 1.05, y: -4 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => { setEan(s.ean); consultar(s.ean); }}
                        >
                          {s.imagem_url_vtex ? (
                            <img src={s.imagem_url_vtex} alt={s.nome} className="terminal-suggestion-img" />
                          ) : (
                            <div className="terminal-suggestion-noimg"><Barcode className="w-6 h-6 text-black/15" /></div>
                          )}
                          <p className="terminal-suggestion-name" style={{ color: t.containerTextColor }}>{s.nome_curto || s.nome}</p>
                          {s.preco && (
                            <p className="terminal-suggestion-price" style={{
                              color: t.priceTextColor,
                              background: t.priceContainerGradient,
                            }}>
                              R$ {s.preco.toFixed(2)}
                            </p>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isIdle && (
          <>
            {mediaList.length > 0 ? (
              <motion.div className="terminal-media-slideshow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
                {mediaList.map((media, idx) => (
                  <motion.div key={media.id} className="terminal-media-item" initial={false}
                    animate={{ opacity: idx === currentMediaIndex ? 1 : 0 }}
                    transition={{ duration: 1.2, ease: "easeInOut" }}
                    style={{ pointerEvents: idx === currentMediaIndex ? "auto" : "none" }}
                  >
                    {media.tipo === "imagem" ? (
                      <img src={media.url} alt="" className="terminal-media-content" />
                    ) : (
                      <video src={media.url} className="terminal-media-content" autoPlay={idx === currentMediaIndex} muted playsInline
                        onEnded={() => { if (idx === currentMediaIndex) setCurrentMediaIndex((prev) => (prev + 1) % mediaList.length); }}
                        ref={(el) => {
                          if (!el) return;
                          if (idx === currentMediaIndex) { el.play().catch(() => { }); } else { el.pause(); el.currentTime = 0; }
                        }}
                      />
                    )}
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div className="terminal-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.4 }}>
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                  <Barcode className="w-24 h-24 text-black/10 mb-6" />
                </motion.div>
                <p className="text-black/30 text-2xl font-bold">Consulte um produto</p>
                <p className="text-black/20 text-lg mt-2">Escaneie o código de barras</p>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
