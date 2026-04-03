import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Barcode } from "lucide-react";
import { suppressNativeKeyboardProps } from "@/components/virtual-keyboard/suppressNativeKeyboard";
import { VirtualKeyboard } from "@/components/virtual-keyboard/VirtualKeyboard";

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

type Orientation = "portrait" | "landscape";

function clamp(min: number, value: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getViewport() {
  const vv = window.visualViewport;
  const width = Math.round(vv?.width ?? window.innerWidth);
  const height = Math.round(vv?.height ?? window.innerHeight);
  return { width, height };
}

function hslToRgb({ h, s, l }: HSL): RGB {
  const hh = ((h % 360) + 360) % 360 / 360;
  const ss = clamp(0, s, 100) / 100;
  const ll = clamp(0, l, 100) / 100;

  const hueToRgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v };
  }

  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;

  return {
    r: Math.round(hueToRgb(p, q, hh + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hh) * 255),
    b: Math.round(hueToRgb(p, q, hh - 1 / 3) * 255),
  };
}

function makeVivid(rgb: RGB): RGB {
  const hsl = rgbToHsl(rgb);
  const boostedS = clamp(55, Math.max(hsl.s, 72) * 1.08, 95);
  const boostedL = clamp(28, hsl.l > 82 ? 66 : hsl.l < 18 ? 30 : hsl.l, 75);
  return hslToRgb({ h: hsl.h, s: boostedS, l: boostedL });
}

function normalizeProductName(raw: string) {
  const original = raw.replace(/\s+/g, " ").trim();

  const expanded = original
    .replace(/\bS\/AÇU?C\b/gi, "Sem Açúcar")
    .replace(/\bS\/\b/gi, "Sem ")
    .replace(/\bC\/\b/gi, "Com ")
    .replace(/\bREFRI\b/gi, "Refrigerante")
    .replace(/\bDESNAT\b/gi, "Desnatado")
    .replace(/\bINTEG\b/gi, "Integral");

  const keepUpper = new Set(["UHT", "PET", "ML", "L", "KG", "G"]);
  const tokens = expanded.split(" ").filter(Boolean);
  const out = tokens.map((t) => {
    const cleaned = t.replace(/[^\p{L}\p{N}]/gu, "");
    if (!cleaned) return t;
    if (/^\d+([.,]\d+)?(ml|l|g|kg)$/i.test(cleaned)) return cleaned.toUpperCase();
    if (/^\d+(x\d+)?$/i.test(cleaned)) return cleaned.toUpperCase();
    if (keepUpper.has(cleaned.toUpperCase())) return cleaned.toUpperCase();
    if (cleaned.length <= 2 && cleaned === cleaned.toUpperCase()) return cleaned.toUpperCase();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  });

  return out.join(" ").trim();
}

function splitHighlight(text: string, count = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  return {
    highlight: words.slice(0, count).join(" "),
    rest: words.slice(count).join(" "),
  };
}

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

  const assignments = new Array(pixels.length).fill(0);

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

        const clusters = kMeansClusters(pixels, 6, 12);
        clusters.sort((a, b) => b.count - a.count);

        const scored = clusters
          .slice(0, 10)
          .map((c) => {
            const hsl = rgbToHsl(c.center);
            const s = clamp(0, hsl.s, 100) / 100;
            const l = clamp(0, hsl.l, 100) / 100;
            const vividness = s * (1 - Math.abs(l - 0.5));
            return { ...c, hsl, score: c.count * (0.55 + vividness) };
          })
          .sort((a, b) => b.score - a.score);

        const chosen: RGB[] = [];
        const minHueDistance = 18;
        for (const s of scored) {
          if (chosen.length >= 3) break;
          const tooClose = chosen.some((p) => {
            const hp = rgbToHsl(p).h;
            const d = Math.abs(hp - s.hsl.h);
            return Math.min(d, 360 - d) < minHueDistance;
          });
          if (!tooClose) chosen.push(makeVivid(s.center));
        }

        while (chosen.length < 3 && scored[chosen.length]) {
          chosen.push(makeVivid(scored[chosen.length].center));
        }

        resolve(chosen.slice(0, 3));
      } catch { resolve([]); }
    };
    img.onerror = () => resolve([]);
    img.src = imgUrl;
  });
}

const themeCache = new Map<string, ProductTheme>();

function _generateTheme(colors: RGB[]): ProductTheme {
  if (colors.length === 0) return FALLBACK_THEME;
  const base = colors.slice(0, 3).map(makeVivid);
  const primary = base[0];
  const secondary = base[1] ?? darkenRgb(primary, 0.65);
  const accent = base[2] ?? makeVivid(lightenRgb(primary, 0.15));
  const tertiary = makeVivid(lightenRgb(secondary, 0.18));
  const fourth = makeVivid(darkenRgb(accent, 0.15));

  const bg1 = lightenRgb(primary, 0.94);
  const bg2 = lightenRgb(secondary, 0.95);
  const bg3 = lightenRgb(accent, 0.96);

  // Dark text for light bg
  const textColor = "#1a1a1a";
  const textMuted = "rgba(0,0,0,0.45)";

  const bannerDark = darkenRgb(accent, 0.75);
  const cardColor = rgbaStr(primary, 0.06);

  const containerLight = lightenRgb(primary, 0.78);
  const containerLighter = lightenRgb(primary, 0.88);
  const containerLum = luminance(containerLight);
  const containerTextColor = containerLum > 0.4 ? "#1a1a1a" : "#ffffff";
  const containerTextMuted = containerLum > 0.4 ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)";

  const secDark = darkenRgb(secondary, 0.78);
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
  const [activationDeviceName, setActivationDeviceName] = useState(() => {
    return localStorage.getItem("mupa_device_name") || "";
  });
  const [activationField, setActivationField] = useState<"codigo" | "nome">("codigo");
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activatingDevice, setActivatingDevice] = useState(false);
  const [deviceEmpresa, setDeviceEmpresa] = useState<string | null>(null);

  const sanitizeDeviceName = (raw: string) => {
    const trimmed = raw.replace(/\s+/g, " ").trim();
    let out = "";
    for (let i = 0; i < trimmed.length; i += 1) {
      const c = trimmed.charCodeAt(i);
      if (c < 32 || c === 127) continue;
      out += trimmed[i];
      if (out.length >= 40) break;
    }
    return out;
  };

  const activateDevice = async () => {
    const code = activationCode.trim().toUpperCase();
    if (!code) return;
    setActivatingDevice(true);
    setActivationError(null);
    try {
      const deviceId = localStorage.getItem("mupa_device_id");
      const deviceName = sanitizeDeviceName(activationDeviceName) || "Terminal";
      const { data, error } = await supabase.functions.invoke("api-ativar-dispositivo", {
        body: {
          codigo_empresa: code,
          device_id: deviceId || null,
          device_name: deviceName,
        },
      });

      if (error) {
        const msg = error.message || "Erro ao ativar dispositivo";
        setActivationError(
          msg.includes("Failed to send a request to the Edge Function")
            ? "Função de ativação indisponível. Publique a Edge Function 'api-ativar-dispositivo' no Supabase."
            : msg,
        );
        setActivatingDevice(false);
        return;
      }

      const dispositivo = (data as { dispositivo?: { id?: string; empresa_id?: string | null } } | null)?.dispositivo ?? null;
      if (!dispositivo?.id) {
        setActivationError("Resposta inválida do servidor");
        setActivatingDevice(false);
        return;
      }

      localStorage.setItem("mupa_device_id", dispositivo.id);
      localStorage.setItem("mupa_empresa_id", dispositivo.empresa_id || "");
      localStorage.setItem("mupa_device_name", deviceName);
      setDeviceEmpresa(dispositivo.empresa_id ?? null);
      setDeviceActivated(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setActivationError(message || "Erro ao ativar dispositivo");
    }
    setActivatingDevice(false);
  };

  // Load empresa on mount if device is activated
  useEffect(() => {
    const empresaId = localStorage.getItem("mupa_empresa_id");
    if (empresaId) setDeviceEmpresa(empresaId);
  }, []);

  const [ean, setEan] = useState("");
  const [produto, setProduto] = useState<Produto | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestoes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [tipoSugestao, setTipoSugestao] = useState<string>("complementares");
  const [beepEnabled, setBeepEnabled] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [fontNome, setFontNome] = useState(24);
  const [fontPreco, setFontPreco] = useState(72);
  const [maxSugestoes, setMaxSugestoes] = useState(3);
  const [corAutoEnabled, setCorAutoEnabled] = useState(true);
  const [corFundo, setCorFundo] = useState("#1a0a0a");
  const [corDescricao, setCorDescricao] = useState("#c0392b");
  const [corPreco, setCorPreco] = useState("#ffffff");
  const [wavesEnabled, setWavesEnabled] = useState(false);
  const [theme, setTheme] = useState<ProductTheme | null>(null);
  const [viewport, setViewport] = useState(() => getViewport());
  const orientation: Orientation = viewport.height < viewport.width ? "landscape" : "portrait";
  const lastOrientationSentRef = useRef<{ value: Orientation; ts: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
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
      try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch { wakeLock = null; }
    };
    requestWakeLock();
    const onVisibilityChange = () => { if (document.visibilityState === "visible") requestWakeLock(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { document.removeEventListener("visibilitychange", onVisibilityChange); wakeLock?.release(); };
  }, []);

  useEffect(() => {
    const enterFullscreen = async () => {
      const node = containerRef.current;
      if (!node) return;
      try {
        if (!document.fullscreenElement) await node.requestFullscreen();
      } catch {
        return;
      }
    };

    void enterFullscreen();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void enterFullscreen();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const update = () => setViewport(getViewport());
    const vv = window.visualViewport;
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    const last = lastOrientationSentRef.current;
    if (last && last.value === orientation && now - last.ts < 1500) return;
    lastOrientationSentRef.current = { value: orientation, ts: now };
    const detail = { orientation, width: viewport.width, height: viewport.height };
    window.dispatchEvent(new CustomEvent("mupa:orientation", { detail }));
    try {
      localStorage.setItem("mupa_orientation", JSON.stringify(detail));
    } catch {
      return;
    }
  }, [orientation, viewport.height, viewport.width]);

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
          case "max_sugestoes": setMaxSugestoes(Number(row.valor) || 3); break;
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
    } catch { return; }
  }, []);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const clearConsult = useCallback(() => {
    setProduto(null);
    setSugestoes(null);
    setEan("");
    setError(null);
    setTheme(null);
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!produto) return;
    const timer = window.setTimeout(() => clearConsult(), 8000);
    return () => window.clearTimeout(timer);
  }, [produto, clearConsult]);

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
        audio.play().catch(() => undefined);
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
            .then(d => { if (d.audio_url) { const a = new Audio(d.audio_url); currentAudioRef.current = a; a.play().catch(() => undefined); } })
            .catch(() => undefined);
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
        .then(r => r.json()).then(d => setSugestoes(d.sugestoes)).catch(() => undefined);

      setLoading(false);
    } catch {
      setError("Erro ao consultar produto");
      setLoading(false);
    }
  };

  const activateDeviceRef = useRef(activateDevice);
  activateDeviceRef.current = activateDevice;

  const consultarRef = useRef(consultar);
  consultarRef.current = consultar;

  useEffect(() => {
    const focus = () => {
      hiddenInputRef.current?.focus({ preventScroll: true });
    };

    const interval = window.setInterval(focus, 200);
    focus();

    const onPointerDown = () => window.setTimeout(focus, 50);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("touchstart", onPointerDown, true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") focus();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("touchstart", onPointerDown, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const onHiddenKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Enter") {
      e.preventDefault();
      if (!deviceActivated) void activateDeviceRef.current();
      else void consultarRef.current();
      return;
    }

    if (e.key === "Backspace") {
      e.preventDefault();
      if (!deviceActivated) {
        if (activationField === "codigo") setActivationCode((prev) => prev.slice(0, -1));
        else setActivationDeviceName((prev) => prev.slice(0, -1));
      }
      else setEan((prev) => prev.slice(0, -1));
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (!deviceActivated) {
        if (activationField === "codigo") setActivationCode("");
        else setActivationDeviceName("");
      }
      else clearConsult();
    }
  };

  const appendActivationKey = (k: string) => {
    if (activationField === "codigo") {
      const cleaned = k.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (!cleaned) return;
      setActivationError(null);
      setActivationCode((prev) => (prev + cleaned).toUpperCase().slice(0, 12));
      return;
    }
    const next = sanitizeDeviceName(activationDeviceName + k);
    setActivationDeviceName(next);
  };

  const backspaceActivation = () => {
    if (activationField === "codigo") setActivationCode((prev) => prev.slice(0, -1));
    else setActivationDeviceName((prev) => prev.slice(0, -1));
  };

  const onHiddenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    e.target.value = "";
    if (!raw) return;

    if (!deviceActivated) {
      if (activationField === "codigo") {
        const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        if (!cleaned) return;
        setActivationError(null);
        setActivationCode((prev) => (prev + cleaned).toUpperCase().slice(0, 12));
        return;
      }
      setActivationDeviceName((prev) => sanitizeDeviceName(prev + raw));
      return;
    }

    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    setEan((prev) => (prev + digits).slice(0, 20));
  };

  useEffect(() => {
    const id = localStorage.getItem("mupa_device_id");
    if (!deviceActivated || !id) return;

    const inputRemotoRef = { current: false };
    void supabase
      .from("dispositivos")
      .select("input_remoto_ativo")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        inputRemotoRef.current = !!data?.input_remoto_ativo;
      });

    const rowCh = supabase
      .channel(`dispositivos-row-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dispositivos", filter: `id=eq.${id}` },
        (payload) => {
          const n = payload.new as { input_remoto_ativo?: boolean };
          if (typeof n.input_remoto_ativo === "boolean") inputRemotoRef.current = n.input_remoto_ativo;
        },
      )
      .subscribe();

    const eanCh = supabase
      .channel(`terminal-ean-${id}`)
      .on("broadcast", { event: "ean" }, ({ payload }) => {
        if (!inputRemotoRef.current) return;
        const p = payload as { ean?: string } | null;
        const raw = p?.ean;
        if (raw == null || raw === "") return;
        const digits = String(raw).replace(/\D/g, "");
        if (!digits) return;
        void consultarRef.current(digits);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(rowCh);
      supabase.removeChannel(eanCh);
    };
  }, [deviceActivated]);

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
  const vw = viewport.width;
  const vh = viewport.height;
  const isLandscape = orientation === "landscape";
  const minDim = Math.min(vw, vh);
  const padding = Math.round(minDim * 0.03);
  const gap = Math.round(minDim * 0.024);
  const footerSpace = Math.round(clamp(44, vh * 0.085, 96));

  // ── Activation Screen ──
  if (!deviceActivated) {
    return (
      <div
        ref={containerRef}
        className="terminal-page flex min-h-[100dvh] flex-col"
        style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)", cursor: "default" }}
      >
        <input
          ref={hiddenInputRef}
          type="text"
          autoFocus
          aria-hidden="true"
          onKeyDown={onHiddenKeyDown}
          onChange={onHiddenChange}
          style={{ position: "absolute", opacity: 0, width: 1, height: 1, left: -10, top: -10 }}
          {...suppressNativeKeyboardProps}
        />
        <div className="flex flex-1 items-center justify-center p-4 pb-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-8 p-12 rounded-3xl w-full max-w-lg"
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
              Digite o código da empresa para vincular este terminal ao cliente correto.
            </p>

            <div className="w-full space-y-3">
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => setActivationField("nome")}
                  className="w-full text-left px-4 py-3 rounded-xl border bg-white/10 text-white border-white/20 transition-colors"
                  style={{ borderColor: activationField === "nome" ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.2)" }}
                >
                  <div className="text-[11px] text-white/50 font-semibold tracking-wider uppercase">Nome do terminal</div>
                  <div className="text-lg font-semibold mt-1">{activationDeviceName || "Terminal"}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActivationField("codigo")}
                  className="w-full text-center text-2xl font-mono tracking-[0.3em] px-4 py-4 rounded-xl border bg-white/10 text-white border-white/20 transition-colors"
                  style={{ borderColor: activationField === "codigo" ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.2)" }}
                >
                  {activationCode || "—"}
                </button>
              </div>
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
                type="button"
                onClick={activateDevice}
                disabled={!activationCode.trim() || activatingDevice}
                className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 transition-all"
              >
                {activatingDevice ? "Ativando..." : "Ativar Terminal"}
              </button>
            </div>
          </motion.div>
        </div>

        <VirtualKeyboard
          mode={activationField === "codigo" ? "activation" : "full"}
          onKey={appendActivationKey}
          onBackspace={backspaceActivation}
          onEnter={activateDevice}
          dark
        />
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
        ref={hiddenInputRef}
        type="text"
        autoFocus
        aria-hidden="true"
        onKeyDown={onHiddenKeyDown}
        onChange={onHiddenChange}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, left: -10, top: -10 }}
        {...suppressNativeKeyboardProps}
      />
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
              {(() => {
                const cleanedName = normalizeProductName(produto.nome);
                const { highlight, rest } = splitHighlight(cleanedName, 3);
                const nameScale = fontNome / 24;
                const priceScale = fontPreco / 72;
                const titleSize = clamp(35, Math.round(minDim * 0.052 * nameScale), 60);
                const restSize = clamp(18, Math.round(titleSize * 0.58), 34);
                const brandSize = clamp(12, Math.round(minDim * 0.018), 18);
                const priceReaisSize = clamp(70, Math.round(minDim * 0.14 * priceScale), 150);
                const centsSize = Math.round(priceReaisSize * 0.42);
                const containerRadius = Math.round(clamp(18, minDim * 0.03, 34));
                const imagePanelWidth = isLandscape ? Math.round(vw * 0.4) : vw - padding * 2;
                const imageMaxHeight = isLandscape ? Math.round(vh * 0.76) : Math.round(vh * 0.38);
                const suggestionCols = isLandscape ? 3 : vw < 520 ? 2 : 3;
                const suggestionTitle =
                  tipoSugestao === "mesma_marca"
                    ? "Veja os produtos da mesma marca"
                    : tipoSugestao === "perfil"
                      ? "Recomendados pra você"
                      : "Uma ótima combinação pra você";

                const suggestionsNode = allSugestoes.length > 0 ? (
                  <motion.div
                    className="terminal-suggestions"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.25 }}
                    style={{ marginTop: isLandscape ? gap : 0 }}
                  >
                    <motion.h2
                      className="terminal-suggestions-title"
                      style={{
                        color: t.containerTextColor,
                        background: `linear-gradient(90deg, ${t.priceContainerBg}22, ${t.priceContainerBg}44, ${t.priceContainerBg}22)`,
                        borderColor: `${t.priceContainerBg}33`,
                      }}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.35, type: "spring", stiffness: 240, damping: 20 }}
                    >
                      {suggestionTitle}
                    </motion.h2>
                    <div
                      className="terminal-suggestions-grid"
                      style={{
                        gridTemplateColumns: `repeat(${suggestionCols}, minmax(0, 1fr))`,
                        gap: Math.max(10, Math.round(gap * 0.8)),
                      }}
                    >
                      {allSugestoes.map((s, i) => (
                        <motion.button
                          key={s.ean}
                          className="terminal-suggestion-card"
                          style={{
                            background: "rgba(255,255,255,0.78)",
                            borderColor: `${t.priceContainerBg}30`,
                            boxShadow: `0 4px 16px ${t.priceContainerBg}14`,
                          }}
                          initial={{ opacity: 0, y: 14, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.28, delay: 0.05 + i * 0.06, type: "spring", stiffness: 220, damping: 22 }}
                          whileHover={{ scale: 1.04, y: -3 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => { setEan(s.ean); consultar(s.ean); }}
                        >
                          {s.imagem_url_vtex ? (
                            <img src={s.imagem_url_vtex} alt={s.nome} className="terminal-suggestion-img" />
                          ) : (
                            <div className="terminal-suggestion-noimg"><Barcode className="w-6 h-6 text-black/15" /></div>
                          )}
                          <p className="terminal-suggestion-name" style={{ color: t.containerTextColor }}>
                            {normalizeProductName(s.nome)}
                          </p>
                          {s.preco && (
                            <p className="terminal-suggestion-price" style={{ color: t.priceTextColor, background: t.priceContainerGradient }}>
                              R$ {s.preco.toFixed(2)}
                            </p>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                ) : null;

                const infoNode = (
                  <motion.div
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.12 }}
                    style={{
                      width: "100%",
                      borderRadius: containerRadius,
                      background: t.containerGradient,
                      boxShadow: "0 10px 40px rgba(0,0,0,0.10)",
                      padding: Math.max(16, Math.round(gap * 1.1)),
                      overflow: "hidden",
                    }}
                  >
                    <div
                      className="terminal-desc-card"
                      style={{
                        textAlign: isLandscape ? "left" : "center",
                        padding: Math.max(14, Math.round(gap * 0.95)),
                      }}
                    >
                      <h1
                        className="leading-tight"
                        style={{
                          fontSize: titleSize,
                          color: t.textColor,
                          letterSpacing: "-0.01em",
                          fontWeight: 900,
                        }}
                      >
                        {highlight}
                      </h1>
                      {rest && (
                        <p className="terminal-desc-details" style={{ fontSize: restSize, color: t.textColor }}>
                          {rest}
                        </p>
                      )}
                      {produto.marca && (
                        <p className="terminal-desc-brand" style={{ fontSize: brandSize }}>
                          {produto.marca}
                        </p>
                      )}
                    </div>

                    <motion.div
                      className="terminal-price-container"
                      style={{
                        background: t.priceContainerGradient,
                        boxShadow: `0 10px 34px ${t.priceContainerBg}3d`,
                        marginTop: Math.max(14, Math.round(gap * 0.9)),
                        padding: `${Math.max(14, Math.round(gap * 0.8))}px ${Math.max(18, Math.round(gap * 1.2))}px`,
                      }}
                      initial={{ opacity: 0, y: 16, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.32, delay: 0.18, type: "spring", stiffness: 240, damping: 20 }}
                    >
                      {hasDiscount && (
                        <p className="terminal-container-old-price" style={{ color: t.priceTextMuted }}>
                          De R$ {produto.preco_lista!.toFixed(2)}
                        </p>
                      )}
                      <div className="terminal-container-price" style={{ color: t.priceTextColor }}>
                        <span className="terminal-container-price-symbol" style={{ fontSize: Math.round(priceReaisSize * 0.26), marginTop: Math.round(priceReaisSize * 0.12) }}>
                          R$
                        </span>
                        <motion.span
                          className="terminal-container-price-reais"
                          style={{ fontSize: priceReaisSize, color: t.priceTextColor }}
                          initial={{ scale: 0.96, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.3, delay: 0.22, type: "spring", stiffness: 260, damping: 20 }}
                        >
                          {formatPrice(produto.preco ?? 0).reais}
                        </motion.span>
                        <span className="terminal-container-price-cents" style={{ fontSize: centsSize, color: t.priceTextColor }}>
                          ,{formatPrice(produto.preco ?? 0).centavos}
                        </span>
                      </div>
                      {produto.unidade_medida && (
                        <p className="terminal-container-unit" style={{ color: t.priceTextMuted }}>
                          {produto.unidade_medida}
                        </p>
                      )}
                    </motion.div>
                  </motion.div>
                );

                const imageNode = (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35, delay: 0.16 }}
                    style={{
                      width: imagePanelWidth,
                      marginRight: isLandscape ? -30 : 0,
                      background: "#ffffff",
                      borderRadius: containerRadius,
                      boxShadow: "0 18px 60px rgba(0,0,0,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: Math.max(14, Math.round(gap)),
                      minHeight: isLandscape ? Math.round(vh - footerSpace - padding * 2) : Math.round(vh * 0.34),
                    }}
                  >
                    {produto.imagem_url_vtex ? (
                      <img
                        src={produto.imagem_url_vtex}
                        alt={produto.nome}
                        style={{
                          width: "100%",
                          maxHeight: imageMaxHeight,
                          objectFit: "contain",
                          filter: "drop-shadow(0 18px 36px rgba(0,0,0,0.16))",
                        }}
                      />
                    ) : (
                      <div className="terminal-no-image-large" style={{ width: "100%", height: imageMaxHeight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Barcode className="w-20 h-20 text-black/15" />
                      </div>
                    )}
                  </motion.div>
                );

                if (isLandscape) {
                  return (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        paddingLeft: padding,
                        paddingRight: padding,
                        paddingTop: padding,
                        paddingBottom: footerSpace + padding,
                        display: "flex",
                        gap,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        {infoNode}
                        {suggestionsNode}
                      </div>
                      {imageNode}
                    </div>
                  );
                }

                return (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      paddingLeft: padding,
                      paddingRight: padding,
                      paddingTop: padding,
                      paddingBottom: footerSpace + padding,
                      display: "flex",
                      flexDirection: "column",
                      gap,
                      alignItems: "center",
                    }}
                  >
                    {imageNode}
                    {infoNode}
                    {suggestionsNode}
                  </div>
                );
              })()}
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
                          if (idx === currentMediaIndex) { el.play().catch(() => undefined); } else { el.pause(); el.currentTime = 0; }
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
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>

      <div className="terminal-footer-hint" style={{ color: t.textColor }}>
        Consulte o preço aqui
      </div>
    </div>
  );
}
