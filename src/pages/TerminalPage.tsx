import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Barcode, AlertTriangle, Search } from "lucide-react";
import { suppressNativeKeyboardProps } from "@/components/virtual-keyboard/suppressNativeKeyboard";
import { VirtualKeyboard } from "@/components/virtual-keyboard/VirtualKeyboard";
import ErrorBoundary from "@/components/ErrorBoundary";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import { useMaintenanceStatus } from "@/hooks/useMaintenanceStatus";
import { useInfinitePolling } from "@/hooks/useInfinitePolling";

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
  link_imagem?: string;
  imagem_url_sem_fundo?: string;
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

type PrecoConsultaCache = {
  v: 1;
  codigo_empresa: string;
  numero_loja: string;
  ean: string;
  updated_at: string;
  produto: Produto;
};

type MediaManifest = {
  v: 1;
  updated_at: string;
  device_id: string | null;
  playlist_id: string | null;
  items: Array<{ id: string; tipo: "imagem" | "video"; url: string; duracao_segundos: number }>;
};

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

const EMPRESA_CODE_RE = /^[A-Z]{3}[0-9]{3}$/;

function normalizeEmpresaCode(raw: string) {
  return String(raw ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
}

function isValidEmpresaCode(code: string) {
  return EMPRESA_CODE_RE.test(code);
}

function sanitizeTerminalDeviceName(raw: string) {
  const trimmed = String(raw ?? "").replace(/\s+/g, " ").trim();
  let out = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    const c = trimmed.charCodeAt(i);
    if (c < 32 || c === 127) continue;
    out += trimmed[i];
    if (out.length >= 40) break;
  }
  return out;
}

function getViewport() {
  const vv = window.visualViewport;
  const width = Math.round(vv?.width ?? window.innerWidth);
  const height = Math.round(vv?.height ?? window.innerHeight);
  return { width, height };
}

function cacheKeyForMediaManifest(deviceId: string | null) {
  return `mupa:media_manifest:v1:${deviceId ?? "none"}`;
}

function cacheKeyForEmpresaPrecoConfig(codigoEmpresa: string) {
  return `mupa:empresa_preco_config:v1:${codigoEmpresa}`;
}

function cacheKeyForPreco(codigoEmpresa: string, numeroLoja: string, ean: string) {
  return `mupa:preco_cache:v1:${codigoEmpresa}:${numeroLoja}:${ean}`;
}

let cacheDbPromise: Promise<IDBDatabase> | null = null;

function openCacheDb() {
  if (cacheDbPromise) return cacheDbPromise;
  cacheDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open("mupa-cache", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return cacheDbPromise;
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openCacheDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readonly");
      const store = tx.objectStore("kv");
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      const store = tx.objectStore("kv");
      store.put(value as unknown, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

async function cacheGetJson<T>(key: string): Promise<T | null> {
  const fromIdb = await idbGet<T>(key);
  if (fromIdb) return fromIdb;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function cacheSetJson<T>(key: string, value: T): Promise<void> {
  const ok = await idbSet(key, value);
  if (ok) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function normalizeLojaNumero(raw: string) {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

function getByPath(obj: unknown, path: string) {
  const parts = String(path || "").split(".").map((p) => p.trim()).filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(",", ".").replace(/[^\d.]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function cleanImageUrl(raw: string | undefined) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s
    .replace(/`/g, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .trim();
}

function formatApiError(message: string) {
  const m = String(message || "").trim();
  if (!m) return "Não foi possível consultar o produto.";
  if (/abort/i.test(m) || /timeout/i.test(m)) return "Tempo esgotado ao consultar o produto. Verifique a conexão.";
  if (/404/.test(m) || /não encontrada/i.test(m)) return "Produto não encontrado na API.";
  if (/network/i.test(m) || /fetch/i.test(m)) return "Falha de rede ao consultar o produto.";
  return `Falha na consulta: ${m}`;
}

function normalizeSugestoesPayload(input: unknown): Sugestoes | null {
  const shaped = input as { sugestoes?: unknown } | null;
  const raw = shaped && typeof shaped === "object" && "sugestoes" in shaped ? (shaped as { sugestoes?: unknown }).sugestoes : input;
  const rec = asRecord(raw);
  if (!rec) return null;

  const normalizeItem = (v: unknown): Sugestao | null => {
    const r = asRecord(v);
    if (!r) return null;
    const ean = String(r.ean ?? r.codigo_barras ?? r.barcode ?? "").replace(/\D/g, "").trim();
    if (!ean) return null;
    const nome = String(r.nome ?? r.nome_curto ?? "Produto").trim() || "Produto";
    const preco = parseNumber(r.preco);
    const precoLista = parseNumber(r.preco_lista);
    const img =
      typeof r.imagem_url_vtex === "string"
        ? cleanImageUrl(r.imagem_url_vtex)
        : typeof r.link_imagem === "string"
          ? cleanImageUrl(r.link_imagem)
          : typeof r.image_url === "string"
            ? cleanImageUrl(r.image_url)
            : typeof r.url === "string"
              ? cleanImageUrl(r.url)
              : "";
    const motivo = typeof r.motivo === "string" ? r.motivo : undefined;

    return {
      ean,
      nome,
      nome_curto: typeof r.nome_curto === "string" ? r.nome_curto : undefined,
      marca: typeof r.marca === "string" ? r.marca : undefined,
      categoria: typeof r.categoria === "string" ? r.categoria : undefined,
      preco: preco ?? undefined,
      preco_lista: precoLista ?? undefined,
      disponivel: typeof r.disponivel === "boolean" ? r.disponivel : undefined,
      imagem_url_vtex: img || undefined,
      link_imagem: typeof r.link_imagem === "string" ? cleanImageUrl(r.link_imagem) : undefined,
      unidade_medida: typeof r.unidade_medida === "string" ? r.unidade_medida : undefined,
      multiplicador: parseNumber(r.multiplicador) ?? undefined,
      motivo,
    };
  };

  const normalizeList = (v: unknown) => {
    if (!Array.isArray(v)) return [];
    const out: Sugestao[] = [];
    for (const item of v) {
      const n = normalizeItem(item);
      if (n) out.push(n);
    }
    return out;
  };

  return {
    mesma_marca: normalizeList(rec.mesma_marca),
    complementares: normalizeList(rec.complementares),
    perfil: normalizeList(rec.perfil),
  };
}

function getSupabaseFunctionHeaders() {
  const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!key) return {};
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      try {
        controller?.abort();
      } catch {
        return;
      }
      const err = new Error("Timeout");
      (err as { name: string }).name = "AbortError";
      reject(err);
    }, timeoutMs);
  });
  try {
    const res = await Promise.race([
      fetch(url, { ...init, signal: controller?.signal }),
      timeoutPromise,
    ]);
    const json = await res.json().catch(() => null);
    return { res, json };
  } finally {
    if (timeoutId != null) window.clearTimeout(timeoutId);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      try {
        controller?.abort();
      } catch {
        return;
      }
      const err = new Error("Timeout");
      (err as { name: string }).name = "AbortError";
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      fetch(url, { ...init, signal: controller?.signal }),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId != null) window.clearTimeout(timeoutId);
  }
}

// PERF: background scheduling helper (never blocks consult flow)
function runInBackground(task: () => void) {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(task, { timeout: 2000 });
    return;
  }
  window.setTimeout(task, 0);
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

  let palette = await extractPalette(imageUrl);
  if (palette.length === 0 && /^https?:/i.test(imageUrl)) {
    try {
      const proxyUrl = `${BASE_URL}/api-image-proxy?url=${encodeURIComponent(imageUrl)}`;
      const res = await fetchWithTimeout(proxyUrl, { headers: { ...SUPABASE_FUNCTION_HEADERS }, cache: "force-cache" }, 8000);
      if (res.ok) {
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        try {
          palette = await extractPalette(objUrl);
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      }
    } catch {
      // ignore
    }
  }

  const theme = _generateTheme(palette);
  if (palette.length > 0) {
    themeCache.set(imageUrl, theme);
  }
  return theme;
}

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_FUNCTION_HEADERS = getSupabaseFunctionHeaders();

export default function TerminalPage() {
  // ---- Sistema de Manutenção Manual ----
  const { 
    isUnderMaintenance, 
    maintenanceMessage, 
    isLoading: maintenanceLoading,
    error: maintenanceError,
    forceCheck: forceMaintenanceCheck 
  } = useMaintenanceStatus({
    checkInterval: 30000, // 30 segundos
    retryDelay: 5000, // 5 segundos
    maxRetries: Infinity, // retry infinito
  });

  // ── Device activation state ──
  const [deviceActivated, setDeviceActivated] = useState<boolean>(() => {
    return !!localStorage.getItem("mupa_device_id");
  });
  const deviceValidationRef = useRef<{ checked: boolean; key: string }>({ checked: false, key: "" });
  const deviceKeyNotFoundRef = useRef<string>("");
  const [lastKnownDevice, setLastKnownDevice] = useState(() => {
    const id = localStorage.getItem("mupa_last_device_id") || "";
    const empresa_id = localStorage.getItem("mupa_last_empresa_id") || "";
    const empresa_code = localStorage.getItem("mupa_last_empresa_code") || "";
    const device_name = localStorage.getItem("mupa_last_device_name") || "";
    const loja_numero = localStorage.getItem("mupa_last_loja_numero") || "";
    const device_key = localStorage.getItem("mupa_last_device_key") || "";
    return { id, empresa_id, empresa_code, device_name, loja_numero, device_key };
  });
  const [urlDeviceKey, setUrlDeviceKey] = useState(() => localStorage.getItem("mupa_device_key") || "");
  const [detectedDevice, setDetectedDevice] = useState<{
    id: string;
    empresa_id: string;
    empresa_code: string;
    device_name: string;
    grupo_id: string | null;
    loja_numero: string;
    device_key: string;
  } | null>(null);
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2 | 3>(0);
  const [wizardEmpresaCode, setWizardEmpresaCode] = useState("");
  const [wizardEmpresaId, setWizardEmpresaId] = useState<string | null>(null);
  const [wizardGrupoId, setWizardGrupoId] = useState<string | null>(null);
  const [wizardDeviceName, setWizardDeviceName] = useState(() => localStorage.getItem("mupa_device_name") || "");
  const [wizardLojaNumero, setWizardLojaNumero] = useState(() => localStorage.getItem("mupa_loja_numero") || "");
  const [wizardGroupPath, setWizardGroupPath] = useState<string[]>([]);
  const [wizardGroups, setWizardGroups] = useState<Array<{ id: string; nome: string; parent_id: string | null }>>([]);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [activatingDevice, setActivatingDevice] = useState(false);
  const [deviceEmpresa, setDeviceEmpresa] = useState<string | null>(null);
  const [empresaCode, setEmpresaCode] = useState(() => normalizeEmpresaCode(localStorage.getItem("mupa_empresa_code") || ""));
  const [lojaNumeroAtivo, setLojaNumeroAtivo] = useState(() => normalizeLojaNumero(localStorage.getItem("mupa_loja_numero") || ""));

  const [precoConfigLoading, setPrecoConfigLoading] = useState(false);
  const [precoConfigReady, setPrecoConfigReady] = useState(false);
  const [precoConfigError, setPrecoConfigError] = useState<string | null>(null);
  const [precoConfigUpdatedAt, setPrecoConfigUpdatedAt] = useState<string | null>(null);
  const precoConfigReqRef = useRef(0);

  const produtosByEanRef = useRef<Record<string, Produto>>({});

  const resetToWizard = useCallback(() => {
    localStorage.removeItem("mupa_device_id");
    localStorage.removeItem("mupa_empresa_id");
    localStorage.removeItem("mupa_empresa_code");
    localStorage.removeItem("mupa_device_name");
    localStorage.removeItem("mupa_loja_numero");
    setEmpresaCode("");
    setLojaNumeroAtivo("");
    setDeviceEmpresa(null);
    setDeviceActivated(false);
    setWizardStep(0);
    setWizardEmpresaCode("");
    setWizardEmpresaId(null);
    setWizardGrupoId(null);
    setWizardDeviceName("");
    setWizardLojaNumero("");
    setWizardGroupPath([]);
    setWizardError(null);
    setPrecoConfigLoading(false);
    setPrecoConfigReady(false);
    setPrecoConfigError(null);
    setPrecoConfigUpdatedAt(null);
    produtosByEanRef.current = {};
  }, []);

  const restoreLastKnownDevice = useCallback(() => {
    const id = (lastKnownDevice.id || "").trim();
    const empresa_id = (lastKnownDevice.empresa_id || "").trim();
    const empresa_code = normalizeEmpresaCode(lastKnownDevice.empresa_code || "");
    const device_name = sanitizeTerminalDeviceName(lastKnownDevice.device_name || "") || "Terminal";
    const loja_numero = normalizeLojaNumero(lastKnownDevice.loja_numero || "");
    const device_key = String(lastKnownDevice.device_key || "").trim();
    if (!id || !empresa_code || !loja_numero) return;

    localStorage.setItem("mupa_device_id", id);
    localStorage.setItem("mupa_empresa_id", empresa_id);
    localStorage.setItem("mupa_empresa_code", empresa_code);
    localStorage.setItem("mupa_device_name", device_name);
    localStorage.setItem("mupa_loja_numero", loja_numero);
    if (device_key) localStorage.setItem("mupa_device_key", device_key);

    setEmpresaCode(empresa_code);
    setLojaNumeroAtivo(loja_numero);
    setDeviceEmpresa(empresa_id || null);
    setWizardDeviceName(device_name);
    setWizardLojaNumero(loja_numero);
    setDeviceActivated(true);
  }, [lastKnownDevice]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("device_id") || params.get("device_key") || "";
    const normalized = raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    if (!normalized) return;
    localStorage.setItem("mupa_device_key", normalized);
    setUrlDeviceKey(normalized);
  }, []);

  useEffect(() => {
    if (deviceActivated) return;
    const key = (urlDeviceKey || "").trim();
    if (!key) return;
    if (deviceKeyNotFoundRef.current === key) return;
    let cancelled = false;
    void (async () => {
      try {
        type MaybeSingleResult = { data: unknown; error: { message?: string } | null };
        type Query = {
          select: (columns: string) => Query;
          eq: (column: string, value: string) => Query;
          maybeSingle: () => Promise<MaybeSingleResult>;
        };
        const sb = supabase as unknown as { from: (table: string) => Query };
        let dev:
          | { id: string; empresa_id: string | null; nome: string; grupo_id: string | null; loja_numero?: string | null }
          | null = null;
        {
          const res = await sb
            .from("dispositivos")
            .select("id, empresa_id, nome, grupo_id, loja_numero")
            .eq("device_key", key)
            .maybeSingle();
          if (res.error) {
            const msg = res.error.message || "";
            if (msg.includes("loja_numero") && msg.includes("column")) {
              const res2 = await sb
                .from("dispositivos")
                .select("id, empresa_id, nome, grupo_id")
                .eq("device_key", key)
                .maybeSingle();
              if (res2.error) throw res2.error;
              dev = res2.data as typeof dev;
            } else if (msg.includes("device_key") && msg.includes("column")) {
              return;
            } else {
              throw res.error;
            }
          } else {
            dev = res.data as typeof dev;
          }
        }
        if (!dev?.id || !dev.empresa_id) {
          if (cancelled) return;
          deviceKeyNotFoundRef.current = key;
          resetToWizard();
          setWizardError("Dispositivo não cadastrado. Faça um novo cadastro.");
          return;
        }
        const { data: emp, error: empErr } = await sb
          .from("empresas")
          .select("codigo_vinculo")
          .eq("id", dev.empresa_id)
          .maybeSingle();
        if (empErr) throw empErr;
        const empresa_code = normalizeEmpresaCode((emp as { codigo_vinculo?: string | null } | null)?.codigo_vinculo ?? "");
        const loja_numero = normalizeLojaNumero(String((dev as { loja_numero?: string | null }).loja_numero ?? ""));
        if (!empresa_code || !loja_numero) {
          if (cancelled) return;
          deviceKeyNotFoundRef.current = key;
          resetToWizard();
          setWizardError("Dispositivo cadastrado sem configuração completa. Faça um novo cadastro.");
          return;
        }
        if (cancelled) return;
        setDetectedDevice({
          id: dev.id,
          empresa_id: dev.empresa_id,
          empresa_code,
          device_name: sanitizeTerminalDeviceName(dev.nome) || "Terminal",
          grupo_id: dev.grupo_id ?? null,
          loja_numero,
          device_key: key,
        });
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceActivated, resetToWizard, urlDeviceKey]);

  const resolveEmpresaContext = useCallback(async (): Promise<{ codigo_empresa: string; numero_loja: string; empresa_id: string } | null> => {
    const code = normalizeEmpresaCode(localStorage.getItem("mupa_empresa_code") || empresaCode || "");
    const loja = normalizeLojaNumero(lojaNumeroAtivo || localStorage.getItem("mupa_loja_numero") || "");
    if (code && code !== empresaCode) setEmpresaCode(code);
    if (loja && loja !== lojaNumeroAtivo) setLojaNumeroAtivo(loja);
    if (!code || !isValidEmpresaCode(code) || !loja) return null;
    const empresaId = localStorage.getItem("mupa_empresa_id") || deviceEmpresa || "";
    return { codigo_empresa: code, numero_loja: loja, empresa_id: empresaId };
  }, [deviceEmpresa, empresaCode, lojaNumeroAtivo]);

  const ensureEmpresaPrecoConfigLoaded = useCallback(async () => {
    if (!deviceActivated) return;
    const reqId = ++precoConfigReqRef.current;
    setPrecoConfigLoading(true);
    setPrecoConfigError(null);
    try {
      await Promise.race([
        (async () => {
          const ctx = await resolveEmpresaContext();
          let codigoEmpresa = ctx?.codigo_empresa || "";
          let lojaNumero = ctx?.numero_loja || "";

          if ((!codigoEmpresa || !lojaNumero) && navigator.onLine) {
            const deviceId = localStorage.getItem("mupa_device_id") || "";
            const deviceKey = localStorage.getItem("mupa_device_key") || "";
            const q = deviceId ? `device_id=${encodeURIComponent(deviceId)}` : deviceKey ? `device_id=${encodeURIComponent(deviceKey)}` : "";
            if (q) {
              const { res, json } = await fetchJsonWithTimeout(`${BASE_URL}/api-device-lookup?${q}`, {
                method: "GET",
                headers: { ...SUPABASE_FUNCTION_HEADERS },
              }, 8000);
              if (res.ok) {
                const payload = json as {
                  found?: boolean;
                  dispositivo?: { loja_numero?: string | null };
                  empresa?: { codigo_vinculo?: string | null };
                } | null;
                if (payload?.found) {
                  const nextCode = normalizeEmpresaCode(payload?.empresa?.codigo_vinculo ?? "");
                  const nextLoja = normalizeLojaNumero(payload?.dispositivo?.loja_numero ?? "");
                  if (nextCode) {
                    codigoEmpresa = nextCode;
                    localStorage.setItem("mupa_empresa_code", nextCode);
                  }
                  if (nextLoja) {
                    lojaNumero = nextLoja;
                    localStorage.setItem("mupa_loja_numero", nextLoja);
                  }
                  if (precoConfigReqRef.current === reqId) {
                    if (nextCode) setEmpresaCode(nextCode);
                    if (nextLoja) setLojaNumeroAtivo(nextLoja);
                  }
                }
              }
            }
          }

          if (!codigoEmpresa || !isValidEmpresaCode(codigoEmpresa) || !lojaNumero) {
            throw new Error("Configuração incompleta. Revise código da empresa e número da loja.");
          }

          const ckey = cacheKeyForEmpresaPrecoConfig(codigoEmpresa);
          const cached = await cacheGetJson<{ v: 1; updated_at: string; ok: boolean }>(ckey);
          if (cached && cached.v === 1 && cached.ok && precoConfigReqRef.current === reqId) {
            setPrecoConfigUpdatedAt(cached.updated_at);
            setPrecoConfigReady(true);
          }

          if (!navigator.onLine) {
            if (cached && cached.v === 1 && cached.ok) return;
            throw new Error("Sem internet e sem cache da configuração de preço para esta empresa.");
          }

          const { res, json } = await fetchJsonWithTimeout(`${BASE_URL}/api-consulta-preco`, {
            method: "POST",
            headers: { ...SUPABASE_FUNCTION_HEADERS, "Content-Type": "application/json" },
            body: JSON.stringify({ action: "status", codigo_empresa: codigoEmpresa }),
          }, 8000);
          const payload = json as { ok?: boolean; has_config?: boolean; error?: string } | null;
          if (!res.ok) {
            if (res.status === 404) throw new Error("Edge Function api-consulta-preco não encontrada. Publique as functions no Supabase.");
            throw new Error(payload?.error || "Falha ao validar configuração de preço");
          }
          if (!payload?.has_config) throw new Error("Configuração de consulta de preço não encontrada para esta empresa.");

          const next = { v: 1 as const, updated_at: new Date().toISOString(), ok: true };
          await cacheSetJson(ckey, next);
          if (precoConfigReqRef.current === reqId) {
            setPrecoConfigUpdatedAt(next.updated_at);
            setPrecoConfigReady(true);
          }
        })(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => {
            const err = new Error("Timeout");
            (err as { name: string }).name = "AbortError";
            reject(err);
          }, 12000);
        }),
      ]);
    } catch (e: unknown) {
      const message =
        e instanceof Error && e.name === "AbortError"
          ? "Sem resposta do servidor. Verifique internet e se as Edge Functions estão publicadas."
          : e instanceof Error
            ? e.message
            : "Erro ao carregar configuração de preço";
      if (precoConfigReqRef.current === reqId) {
        setPrecoConfigError(message);
        setPrecoConfigReady(false);
      }
    } finally {
      if (precoConfigReqRef.current === reqId) setPrecoConfigLoading(false);
    }
  }, [deviceActivated, empresaCode, lojaNumeroAtivo, resolveEmpresaContext]);

  useEffect(() => {
    if (!deviceActivated) return;
    void ensureEmpresaPrecoConfigLoaded();
  }, [deviceActivated, ensureEmpresaPrecoConfigLoaded]);

  // ---- Sistema de Polling Infinito (nunca para) ----
  const { 
    data: precoConfigData, 
    isLoading: precoConfigPollingLoading, 
    error: precoConfigPollingError,
    forceUpdate: forcePrecoConfigUpdate 
  } = useInfinitePolling(
    async () => {
      if (!deviceActivated) return null;
      await ensureEmpresaPrecoConfigLoaded();
      return { timestamp: Date.now() };
    },
    {
      interval: 5 * 60 * 1000, // 5 minutos (mais frequente)
      retryDelay: 10000, // 10 segundos entre tentativas
      maxRetries: Infinity, // nunca para de tentar
      onError: (error) => {
        console.log('Erro no polling de configuração, tentando novamente...', error.message);
      },
      onSuccess: () => {
        console.log('Configuração atualizada com sucesso');
      }
    }
  );

  const loadGroupsForWizard = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("dispositivo_grupos")
        .select("id, nome, parent_id")
        .order("nome", { ascending: true });
      if (error) throw error;
      setWizardGroups((data || []) as Array<{ id: string; nome: string; parent_id: string | null }>);
    } catch {
      setWizardGroups([]);
    }
  }, []);

  useEffect(() => {
    if (deviceActivated) return;
    void loadGroupsForWizard();
  }, [deviceActivated, loadGroupsForWizard]);

  const activateDeviceDirect = useCallback(async (args: {
    codigoEmpresa: string;
    deviceName: string;
    grupoId: string | null;
    lojaNumero: string;
  }) => {
    const codigoEmpresa = normalizeEmpresaCode(args.codigoEmpresa);
    const deviceName = sanitizeTerminalDeviceName(args.deviceName) || "Terminal";
    const lojaNumero = normalizeLojaNumero(args.lojaNumero);
    const grupoId = args.grupoId;

    setActivatingDevice(true);
    setWizardError(null);
    try {
      const deviceId = localStorage.getItem("mupa_device_id");
      const deviceKey = localStorage.getItem("mupa_device_key");
      const { res, json } = await fetchJsonWithTimeout(`${BASE_URL}/api-ativar-dispositivo`, {
        method: "POST",
        headers: { ...SUPABASE_FUNCTION_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo_empresa: codigoEmpresa,
          device_id: deviceId || deviceKey || null,
          device_name: deviceName,
          grupo_id: grupoId,
          loja_numero: lojaNumero || null,
        }),
      }, 12000);
      const payload = json as { dispositivo?: { id: string; empresa_id: string | null; codigo_ativacao?: string | null }; warnings?: string[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Erro ao ativar dispositivo");
      const dev = payload?.dispositivo;
      if (!dev?.id) throw new Error("Resposta inválida ao ativar dispositivo");

      localStorage.setItem("mupa_device_id", dev.id);
      localStorage.setItem("mupa_empresa_id", dev.empresa_id || "");
      localStorage.setItem("mupa_empresa_code", codigoEmpresa);
      localStorage.setItem("mupa_device_name", deviceName);
      localStorage.setItem("mupa_loja_numero", lojaNumero);
      localStorage.setItem("mupa_last_device_id", dev.id);
      localStorage.setItem("mupa_last_empresa_id", dev.empresa_id || "");
      localStorage.setItem("mupa_last_empresa_code", codigoEmpresa);
      localStorage.setItem("mupa_last_device_name", deviceName);
      localStorage.setItem("mupa_last_loja_numero", lojaNumero);
      localStorage.setItem("mupa_last_device_key", deviceKey || "");
      setLastKnownDevice({ id: dev.id, empresa_id: dev.empresa_id || "", empresa_code: codigoEmpresa, device_name: deviceName, loja_numero: lojaNumero, device_key: deviceKey || "" });

      setEmpresaCode(codigoEmpresa);
      setLojaNumeroAtivo(lojaNumero);
      setDeviceEmpresa(dev.empresa_id ?? null);
      setDeviceActivated(true);

      if (Array.isArray(payload?.warnings) && payload!.warnings.length) {
        setWizardError(payload!.warnings.join(" "));
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const isNetwork =
        e instanceof TypeError &&
        (message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("network"));
      setWizardError(
        isNetwork
          ? "Não foi possível ativar (erro de rede). Verifique a internet do terminal."
          : (message || "Erro ao ativar dispositivo"),
      );
    } finally {
      setActivatingDevice(false);
    }
  }, []);

  const activateDeviceWizard = useCallback(async () => {
    const codigoEmpresa = normalizeEmpresaCode(wizardEmpresaCode);
    const deviceName = sanitizeTerminalDeviceName(wizardDeviceName) || "Terminal";
    const lojaNumero = normalizeLojaNumero(wizardLojaNumero);
    await activateDeviceDirect({ codigoEmpresa, deviceName, grupoId: wizardGrupoId, lojaNumero });
  }, [activateDeviceDirect, wizardEmpresaCode, wizardDeviceName, wizardGrupoId, wizardLojaNumero]);

  // Load empresa on mount if device is activated
  useEffect(() => {
    const empresaId = localStorage.getItem("mupa_empresa_id");
    if (empresaId) setDeviceEmpresa(empresaId);
  }, []);

  useEffect(() => {
    if (!deviceActivated) return;
    if (deviceValidationRef.current.checked) return;
    const deviceId = String(localStorage.getItem("mupa_device_id") || "").trim();
    const deviceKey = String(localStorage.getItem("mupa_device_key") || "").trim();
    const q = deviceId ? deviceId : deviceKey;
    if (!q) return;
    deviceValidationRef.current = { checked: true, key: q };

    void (async () => {
      try {
        const { res, json } = await fetchJsonWithTimeout(
          `${BASE_URL}/api-device-lookup?device_id=${encodeURIComponent(q)}`,
          { method: "GET", headers: { ...SUPABASE_FUNCTION_HEADERS } },
          8000,
        );
        if (!res.ok) return;
        const payload = json as { found?: boolean } | null;
        if (payload?.found === false) {
          resetToWizard();
          setWizardError("Dispositivo não encontrado na plataforma. Faça um novo cadastro.");
        }
      } catch {
        return;
      }
    })();
  }, [deviceActivated, resetToWizard]);

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
  const [layout, setLayout] = useState("classico");
  const [fontNome, setFontNome] = useState(24);
  const [fontPreco, setFontPreco] = useState(72);
  const [imgSize, setImgSize] = useState(280);
  const [maxSugestoes, setMaxSugestoes] = useState(3);
  const [corAutoEnabled, setCorAutoEnabled] = useState(true);
  const [corFundo, setCorFundo] = useState("#1a0a0a");
  const [corDescricao, setCorDescricao] = useState("#c0392b");
  const [corPreco, setCorPreco] = useState("#ffffff");
  const [wavesEnabled, setWavesEnabled] = useState(false);
  const [footerEnabled, setFooterEnabled] = useState(true);
  const [footerClockEnabled, setFooterClockEnabled] = useState(true);
  const [layoutPadding, setLayoutPadding] = useState(10);
  const [layoutGap, setLayoutGap] = useState(0);
  const [imageMarginRight, setImageMarginRight] = useState(10);
  const [imageSide, setImageSide] = useState<"left" | "right">("right");
  const [landscapeAlign, setLandscapeAlign] = useState<"top" | "center">("top");
  const [suggestionsOverlayInset, setSuggestionsOverlayInset] = useState(10);
  const [suggestionsOverlayMaxPct, setSuggestionsOverlayMaxPct] = useState(40);
  const [loadingText, setLoadingText] = useState("Por favor aguarde, consultando o produto");
  const [infoVerticalAlign, setInfoVerticalAlign] = useState<"top" | "center">("top");
  const [theme, setTheme] = useState<ProductTheme | null>(null);
  const [viewport, setViewport] = useState(() => getViewport());
  const orientation: Orientation = viewport.height < viewport.width ? "landscape" : "portrait";
  const lastOrientationSentRef = useRef<{ value: Orientation; ts: number } | null>(null);
  const [now, setNow] = useState(() => new Date());

  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanTrapRef = useRef<HTMLDivElement>(null);
  const scanBufferRef = useRef("");
  const scanLastKeyTsRef = useRef(0);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const terminalEanChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [scanFocused, setScanFocused] = useState(false);
  const scanFocusedRef = useRef(false);
  const scanFocusLoopRef = useRef<number | null>(null);

  const isAndroidWebView = useMemo(() => {
    const ua = navigator.userAgent || "";
    const wv = /\bwv\b/i.test(ua) || /; wv\)/i.test(ua);
    const rn = typeof (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView !== "undefined";
    return /Android/i.test(ua) && (wv || rn);
  }, []);

  const focusScanInput = useCallback(() => {
    const el = (isAndroidWebView ? scanTrapRef.current : scanInputRef.current) || scanInputRef.current;
    if (!el) return;
    try {
      (el as unknown as { focus: (opts?: unknown) => void }).focus?.({ preventScroll: true });
      el.dispatchEvent(new Event("focus", { bubbles: true }));
    } catch {
      return;
    }
    try {
      const inputEl = scanInputRef.current;
      if (inputEl) inputEl.setSelectionRange(0, inputEl.value.length);
    } catch {
      return;
    }
    if (!scanFocusedRef.current) {
      scanFocusedRef.current = true;
      setScanFocused(true);
    }
  }, [isAndroidWebView]);

  useEffect(() => {
    if (!deviceActivated || !precoConfigReady) return;

    const attempt = () => {
      if (document.visibilityState !== "visible") return;
      const el = scanInputRef.current;
      if (!el) return;
      if (document.activeElement === el) return;
      focusScanInput();
    };

    const timers: number[] = [];
    timers.push(window.setTimeout(attempt, 0));
    timers.push(window.setTimeout(attempt, 80));
    timers.push(window.setTimeout(attempt, 250));
    timers.push(window.setTimeout(attempt, 700));
    timers.push(window.setTimeout(attempt, 1500));

    const onVisibility = () => attempt();
    const onWindowFocus = () => attempt();
    const onPageShow = () => attempt();
    const onPointerDown = () => attempt();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("touchstart", onPointerDown, { passive: true });
    window.addEventListener("mousedown", onPointerDown, { passive: true });

    if (scanFocusLoopRef.current) window.clearInterval(scanFocusLoopRef.current);
    scanFocusLoopRef.current = window.setInterval(attempt, 900);

    return () => {
      for (const t of timers) window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("mousedown", onPointerDown);
      if (scanFocusLoopRef.current) {
        window.clearInterval(scanFocusLoopRef.current);
        scanFocusLoopRef.current = null;
      }
    };
  }, [deviceActivated, precoConfigReady, focusScanInput]);

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

  // ---- Fullscreen Simplificado (sem interferência na operação) ----
  useEffect(() => {
    const tryFullscreen = async () => {
      const node = containerRef.current;
      if (!node || document.fullscreenElement) return;
      
      try {
        await node.requestFullscreen();
      } catch (error) {
        // Silenciosamente ignorar falhas de fullscreen
        console.log('Fullscreen não disponível, operação continua normal');
      }
    };

    // Tentar fullscreen apenas uma vez após carregar
    const timeoutId = setTimeout(() => {
      void tryFullscreen();
    }, 1000);

    // Tentar novamente quando a página ficar visível
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !document.fullscreenElement) {
        setTimeout(() => void tryFullscreen(), 500);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
    if (!deviceActivated || !precoConfigReady) return;
    focusScanInput();
  }, [deviceActivated, precoConfigReady, focusScanInput]);

  useEffect(() => {
    if (!deviceActivated || !precoConfigReady) return;
    const onWinFocus = () => focusScanInput();
    const onVisibility = () => {
      if (document.visibilityState === "visible") focusScanInput();
    };
    window.addEventListener("focus", onWinFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onWinFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [deviceActivated, precoConfigReady, focusScanInput]);

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

  const applyConfigValue = useCallback((chave: string, raw: unknown) => {
    const asString = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
    switch (chave) {
      case "tipo_sugestao": setTipoSugestao(asString); break;
      case "beep_enabled": setBeepEnabled(asString !== "false"); break;
      case "tts_enabled": setTtsEnabled(asString !== "false"); break;
      case "layout": setLayout(asString); break;
      case "font_nome": setFontNome(Number(asString) || 24); break;
      case "font_preco": setFontPreco(Number(asString) || 72); break;
      case "img_size": {
        const n = Number(raw);
        setImgSize(Number.isFinite(n) ? n : 280);
        break;
      }
      case "max_sugestoes": {
        const n = Number(raw);
        setMaxSugestoes(Number.isFinite(n) ? n : 3);
        break;
      }
      case "cor_auto": setCorAutoEnabled(asString !== "false"); break;
      case "cor_fundo": setCorFundo(asString); break;
      case "cor_descricao": setCorDescricao(asString); break;
      case "cor_preco": setCorPreco(asString); break;
      case "waves_enabled": setWavesEnabled(asString === "true"); break;
      case "footer_enabled": setFooterEnabled(asString !== "false"); break;
      case "footer_clock_enabled": setFooterClockEnabled(asString !== "false"); break;
      case "layout_padding": {
        const n = Number(raw);
        if (Number.isFinite(n)) setLayoutPadding(n);
        break;
      }
      case "layout_gap": {
        const n = Number(raw);
        if (Number.isFinite(n)) setLayoutGap(n);
        break;
      }
      case "image_margin_right": {
        const n = Number(raw);
        if (Number.isFinite(n)) setImageMarginRight(n);
        break;
      }
      case "image_side": {
        const v = asString === "left" ? "left" : asString === "right" ? "right" : null;
        if (v) setImageSide(v);
        break;
      }
      case "landscape_align": {
        const v = asString === "top" ? "top" : asString === "center" ? "center" : null;
        if (v) setLandscapeAlign(v);
        break;
      }
      case "suggestions_overlay_inset": {
        const n = Number(raw);
        if (Number.isFinite(n)) setSuggestionsOverlayInset(n);
        break;
      }
      case "suggestions_overlay_max_pct": {
        const n = Number(raw);
        if (Number.isFinite(n)) setSuggestionsOverlayMaxPct(n);
        break;
      }
      case "loading_text": setLoadingText(asString); break;
      case "info_vertical_align": {
        const v = asString === "center" ? "center" : asString === "top" ? "top" : null;
        if (v) setInfoVerticalAlign(v);
        break;
      }
    }
  }, []);

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from("terminal_config").select("chave, valor");
    if (data) {
      for (const row of data) applyConfigValue(row.chave, row.valor);
    }
  }, [applyConfigValue]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  useEffect(() => {
    if (!footerClockEnabled) return;
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, [footerClockEnabled]);

  useEffect(() => {
    const channel = supabase.channel("terminal-config-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "terminal_config" }, () => loadConfig())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadConfig]);

  const persistMediaManifest = useCallback(async (list: MediaItem[], playlistId: string | null) => {
    const deviceId = localStorage.getItem("mupa_device_id");
    const manifest: MediaManifest = {
      v: 1,
      updated_at: new Date().toISOString(),
      device_id: deviceId,
      playlist_id: playlistId,
      items: list.map((m) => ({ id: m.id, tipo: m.tipo, url: m.url, duracao_segundos: m.duracao_segundos })),
    };
    await cacheSetJson(cacheKeyForMediaManifest(deviceId), manifest);
  }, []);

  const prefetchMediaFiles = useCallback(async (urls: string[]) => {
    if (!("caches" in window)) return;
    if (!navigator.onLine) return;
    const cache = await caches.open("mupa-media-v1");
    const unique = Array.from(new Set(urls.filter((u) => typeof u === "string" && u.length > 0)));
    const head = unique.slice(0, 48);
    await Promise.allSettled(
      head.map(async (url) => {
        const existing = await cache.match(url);
        if (existing) return;
        const res = await fetch(url, { cache: "reload" });
        if (!res.ok) return;
        await cache.put(url, res.clone());
      })
    );
  }, []);

  useEffect(() => {
    const refreshMedia = async () => {
      const deviceId = localStorage.getItem("mupa_device_id");
      if (!deviceId) {
        const { data } = await supabase
          .from("terminal_media")
          .select("id, tipo, url, duracao_segundos")
          .eq("ativo", true)
          .order("ordem", { ascending: true });
        if (data) {
          const list = data as MediaItem[];
          setMediaList(list);
          void persistMediaManifest(list, null);
          void prefetchMediaFiles(list.map((m) => m.url));
        }
        return;
      }

      const { data: dev } = await supabase
        .from("dispositivos")
        .select("id, grupo_id, config_override")
        .eq("id", deviceId)
        .maybeSingle();

      let playlistId: string | null = null;
      const overrides = (dev as { config_override?: unknown } | null)?.config_override;
      if (overrides && typeof overrides === "object") {
        const raw = (overrides as Record<string, unknown>).playlist_id;
        if (typeof raw === "string" && raw.length > 0) playlistId = raw;
      }

      let groupId = (dev as { grupo_id?: string | null } | null)?.grupo_id ?? null;
      for (let i = 0; i < 8 && !playlistId && groupId; i += 1) {
        const { data: g } = await supabase
          .from("dispositivo_grupos")
          .select("id, parent_id, playlist_id")
          .eq("id", groupId)
          .maybeSingle();
        if (!g) break;
        if (g.playlist_id) {
          playlistId = g.playlist_id;
          break;
        }
        groupId = g.parent_id;
      }

      if (!playlistId) {
        const { data } = await supabase
          .from("terminal_media")
          .select("id, tipo, url, duracao_segundos")
          .eq("ativo", true)
          .order("ordem", { ascending: true });
        if (data) {
          const list = data as MediaItem[];
          setMediaList(list);
          void persistMediaManifest(list, null);
          void prefetchMediaFiles(list.map((m) => m.url));
        }
        return;
      }

      const { data: items } = await supabase
        .from("terminal_playlist_items")
        .select("id, ordem, duracao_segundos, terminal_media ( id, tipo, url, duracao_segundos )")
        .eq("playlist_id", playlistId)
        .eq("ativo", true)
        .order("ordem", { ascending: true });

      const list = (items || [])
        .map((it) => {
          const media = (it as unknown as { terminal_media?: MediaItem | null }).terminal_media;
          if (!media) return null;
          const duration = (it as unknown as { duracao_segundos?: number | null }).duracao_segundos;
          return {
            id: (it as unknown as { id: string }).id,
            tipo: media.tipo,
            url: media.url,
            duracao_segundos: typeof duration === "number" ? duration : media.duracao_segundos,
          } satisfies MediaItem;
        })
        .filter((x): x is MediaItem => x !== null);

      setMediaList(list);
      void persistMediaManifest(list, playlistId);
      void prefetchMediaFiles(list.map((m) => m.url));
    };

    void refreshMedia();

    const channel = supabase
      .channel("terminal-media-routing-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "terminal_media" }, () => void refreshMedia())
      .on("postgres_changes", { event: "*", schema: "public", table: "terminal_playlist_items" }, () => void refreshMedia())
      .on("postgres_changes", { event: "*", schema: "public", table: "terminal_playlists" }, () => void refreshMedia())
      .on("postgres_changes", { event: "*", schema: "public", table: "dispositivo_grupos" }, () => void refreshMedia())
      .on("postgres_changes", { event: "*", schema: "public", table: "dispositivos" }, () => void refreshMedia())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [persistMediaManifest, prefetchMediaFiles]);

  const isIdle = !produto && !loading && !error;
  const [offlineMediaUrl, setOfflineMediaUrl] = useState<string | null>(null);
  const offlineMediaUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const current = mediaList[currentMediaIndex];
    if (!isIdle || !current || !current.url) {
      if (offlineMediaUrlRef.current) URL.revokeObjectURL(offlineMediaUrlRef.current);
      offlineMediaUrlRef.current = null;
      setOfflineMediaUrl(null);
      return;
    }

    if (navigator.onLine || !("caches" in window)) {
      if (offlineMediaUrlRef.current) URL.revokeObjectURL(offlineMediaUrlRef.current);
      offlineMediaUrlRef.current = null;
      setOfflineMediaUrl(null);
      return;
    }

    let cancelled = false;
    void caches.open("mupa-media-v1").then(async (cache) => {
      const match = await cache.match(current.url);
      if (!match) return;
      const blob = await match.blob();
      if (cancelled) return;
      const objUrl = URL.createObjectURL(blob);
      if (offlineMediaUrlRef.current) URL.revokeObjectURL(offlineMediaUrlRef.current);
      offlineMediaUrlRef.current = objUrl;
      setOfflineMediaUrl(objUrl);
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [currentMediaIndex, isIdle, mediaList]);

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

  const playErrorBeep = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.42);
    } catch { return; }
  }, []);

  const speakError = useCallback((text: string) => {
    try {
      const msg = String(text || "").trim();
      if (!msg) return;
      const synth = window.speechSynthesis;
      if (!synth || typeof (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance === "undefined") return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(msg);
      u.lang = "pt-BR";
      u.rate = 1;
      u.pitch = 1;
      u.volume = 1;
      synth.speak(u);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (error) {
      playErrorBeep();
      speakError(error);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setError(null), 4500);
    }
    return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current); };
  }, [error, playErrorBeep, speakError]);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const returnTimerRef = useRef<number | null>(null);
  const productImageObjectUrlRef = useRef<string | null>(null);
  const noBgInFlightRef = useRef<Set<string>>(new Set());

  const clearConsult = useCallback(() => {
    if (returnTimerRef.current) {
      window.clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
    setProduto(null);
    setSugestoes(null);
    setEan("");
    setError(null);
    setTheme(null);
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (productImageObjectUrlRef.current) {
      URL.revokeObjectURL(productImageObjectUrlRef.current);
      productImageObjectUrlRef.current = null;
    }
  }, []);

  const clearTerminalCaches = useCallback(async (mode: "all" | "nobg" = "all") => {
    try {
      if ("caches" in window) {
        await Promise.allSettled([
          mode === "all" ? caches.delete("mupa-media-v1") : Promise.resolve(false),
          caches.delete("mupa-nobg-v1"),
          caches.delete("mupa-nobg-v2"),
        ]);
      }
    } catch {
      return;
    }

    if (mode === "all") {
      try {
        indexedDB.deleteDatabase("mupa-cache");
        cacheDbPromise = null;
      } catch {
        return;
      }

      try {
        const keys = Object.keys(localStorage);
        for (const k of keys) {
          if (k.startsWith("mupa:preco_cache:v1:")) localStorage.removeItem(k);
          if (k.startsWith("mupa:empresa_preco_config:v1:")) localStorage.removeItem(k);
          if (k.startsWith("mupa:media_manifest:v1:")) localStorage.removeItem(k);
        }
      } catch {
        return;
      }

      produtosByEanRef.current = {};
    }
  }, []);

  const armReturnToIdle = useCallback(
    (audio: HTMLAudioElement | null, fallbackMs = 8000) => {
      if (returnTimerRef.current) {
        window.clearTimeout(returnTimerRef.current);
        returnTimerRef.current = null;
      }

      if (!audio) {
        returnTimerRef.current = window.setTimeout(() => clearConsult(), fallbackMs);
        return;
      }

      const scheduleAfterDone = () => {
        if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
        returnTimerRef.current = window.setTimeout(() => clearConsult(), 3000);
      };

      const safety = window.setTimeout(() => clearConsult(), 25000);
      const done = () => {
        window.clearTimeout(safety);
        scheduleAfterDone();
      };

      if (audio.ended) {
        done();
        return;
      }

      audio.addEventListener("ended", done, { once: true });
      audio.addEventListener("error", done, { once: true });
    },
    [clearConsult],
  );

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
        return audio;
      }
    } catch (e) {
      console.error("TTS error:", e);
    }
    return null;
  }, []);

  // PERF: network call isolated from cache/UI. Used only for background refresh + cache misses.
  const fetchPrecoFromApi = useCallback(async (codigoEmpresa: string, numeroLoja: string, eanDigits: string): Promise<Produto> => {
    const ean = eanDigits.replace(/\D/g, "").trim();
    if (!ean) throw new Error("EAN inválido.");
    if (!navigator.onLine) throw new Error("Sem internet para consultar.");

    const { res, json } = await fetchJsonWithTimeout(`${BASE_URL}/api-consulta-preco`, {
      method: "POST",
      headers: { ...SUPABASE_FUNCTION_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ codigo_empresa: codigoEmpresa, numero_loja: numeroLoja, ean }),
    }, 8000);
    const payload = json as { produto?: unknown; error?: string } | null;
    if (!res.ok) throw new Error(payload?.error || `Erro ao consultar (${res.status})`);
    const prod = asRecord(payload?.produto);
    if (!prod) throw new Error("Resposta inválida ao consultar preço.");

    return {
      ean: String(prod.ean ?? ean).replace(/\D/g, "") || ean,
      nome: String(prod.nome ?? "Produto"),
      preco: parseNumber(prod.preco) ?? undefined,
      preco_lista: parseNumber(prod.preco_lista) ?? undefined,
      imagem_url_vtex:
        typeof prod.imagem_url_vtex === "string"
          ? cleanImageUrl(prod.imagem_url_vtex)
          : typeof prod.link_imagem === "string"
            ? cleanImageUrl(prod.link_imagem)
            : typeof prod.image_url === "string"
              ? cleanImageUrl(prod.image_url)
              : undefined,
      link_imagem: typeof prod.link_imagem === "string" ? cleanImageUrl(prod.link_imagem) : undefined,
      disponivel: true,
    };
  }, []);

  const updateSugestoesPricesInBackground = useCallback((base: Sugestoes, codigoEmpresa: string, numeroLoja: string) => {
    if (!navigator.onLine) return;
    runInBackground(() => {
      void (async () => {
        try {
          const all = [
            ...(base.complementares || []),
            ...(base.mesma_marca || []),
            ...(base.perfil || []),
          ];
          const eans = Array.from(new Set(all.map((s) => String(s.ean ?? "").replace(/\D/g, "").trim()).filter(Boolean)));
          if (eans.length === 0) return;

          const results: Record<string, Produto> = {};
          const concurrency = 3;
          let idx = 0;
          const worker = async () => {
            while (idx < eans.length) {
              const current = eans[idx++];
              try {
                const p = await fetchPrecoFromApi(codigoEmpresa, numeroLoja, current);
                results[current] = p;
              } catch {
                continue;
              }
            }
          };
          await Promise.all(Array.from({ length: Math.min(concurrency, eans.length) }, () => worker()));

          setSugestoes((prev) => {
            if (!prev) return prev;
            const patchList = (list: Sugestao[]) => list.map((s) => {
              const e = String(s.ean ?? "").replace(/\D/g, "").trim();
              const p = results[e];
              if (!p) return s;
              return {
                ...s,
                preco: p.preco ?? s.preco,
                preco_lista: p.preco_lista ?? s.preco_lista,
                imagem_url_vtex: p.imagem_url_vtex || s.imagem_url_vtex,
                link_imagem: p.link_imagem || s.link_imagem,
              };
            });
            return {
              mesma_marca: patchList(prev.mesma_marca || []),
              complementares: patchList(prev.complementares || []),
              perfil: patchList(prev.perfil || []),
            };
          });
        } catch {
          return;
        }
      })();
    });
  }, [fetchPrecoFromApi]);

  // PERF: cache read is used to show instant values (cache-first UI).
  const getCachedPrecoFromStorage = useCallback(async (codigoEmpresa: string, numeroLoja: string, eanDigits: string) => {
    const ean = eanDigits.replace(/\D/g, "").trim();
    if (!ean) return null;
    const ckey = cacheKeyForPreco(codigoEmpresa, numeroLoja, ean);
    const cached = await cacheGetJson<PrecoConsultaCache>(ckey);
    if (cached && cached.v === 1 && cached.produto?.ean) return cached.produto;
    return null;
  }, []);

  // PERF: background remove-bg: simple, cheap(ish), only runs after UI is already updated.
  const _remove_bg_simple = useCallback(async (input: Blob) => {
    const bitmap = await createImageBitmap(input);
    const maxW = 640;
    const scale = bitmap.width > maxW ? maxW / bitmap.width : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx2d) return input;
    ctx2d.drawImage(bitmap, 0, 0, w, h);
    const img = ctx2d.getImageData(0, 0, w, h);
    const d = img.data;

    const idx = (x: number, y: number) => (y * w + x) * 4;
    const isNearWhite = (r: number, g: number, b: number) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return (max >= 242 && (max - min) <= 22) || (lum >= 235 && (max - min) <= 14);
    };

    const visited = new Uint8Array(w * h);
    const queue = new Uint32Array(w * h);
    let qh = 0;
    let qt = 0;

    const tryPush = (x: number, y: number) => {
      const p = y * w + x;
      if (visited[p]) return;
      const i = idx(x, y);
      const a = d[i + 3];
      if (a === 0) return;
      if (!isNearWhite(d[i], d[i + 1], d[i + 2])) return;
      visited[p] = 1;
      queue[qt++] = p;
    };

    for (let x = 0; x < w; x += 1) {
      tryPush(x, 0);
      tryPush(x, h - 1);
    }
    for (let y = 0; y < h; y += 1) {
      tryPush(0, y);
      tryPush(w - 1, y);
    }

    while (qh < qt) {
      const p = queue[qh++];
      const x = p % w;
      const y = (p / w) | 0;
      const i = p * 4;
      d[i + 3] = 0;
      if (x > 0) tryPush(x - 1, y);
      if (x + 1 < w) tryPush(x + 1, y);
      if (y > 0) tryPush(x, y - 1);
      if (y + 1 < h) tryPush(x, y + 1);
    }

    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const p = y * w + x;
        const i = p * 4;
        if (d[i + 3] === 0) continue;
        if (!isNearWhite(d[i], d[i + 1], d[i + 2])) continue;
        const left = d[(p - 1) * 4 + 3] === 0;
        const right = d[(p + 1) * 4 + 3] === 0;
        const up = d[(p - w) * 4 + 3] === 0;
        const down = d[(p + w) * 4 + 3] === 0;
        if (left || right || up || down) d[i + 3] = 0;
      }
    }

    ctx2d.putImageData(img, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
    return out ?? input;
  }, []);

  // PERF: background task; caches PNG with transparency and updates current product without blocking consult.
  const processImageBackground = useCallback((p: Produto, codigoEmpresa: string, numeroLoja: string) => {
    const ean = p.ean.replace(/\D/g, "").trim();
    const companyImgUrl = cleanImageUrl(p.imagem_url_vtex || p.link_imagem);
    if (!ean) return;
    if (p.imagem_url_sem_fundo) return;
    const inFlightKey = `${codigoEmpresa}:${numeroLoja}:${ean}`;
    if (noBgInFlightRef.current.has(inFlightKey)) return;
    noBgInFlightRef.current.add(inFlightKey);

    runInBackground(() => {
      void (async () => {
        try {
          if (!("caches" in window)) return;
          const key = `mupa:nobg:v2:${codigoEmpresa}:${numeroLoja}:${ean}`;
          const cache = await caches.open("mupa-nobg-v2");
          const req = new Request(`https://mupa.cache/${encodeURIComponent(key)}`);
          const cached = await cache.match(req);
          if (cached) {
            const blob = await cached.blob();
            const objUrl = URL.createObjectURL(blob);
            if (productImageObjectUrlRef.current) URL.revokeObjectURL(productImageObjectUrlRef.current);
            productImageObjectUrlRef.current = objUrl;
            setProduto((prev) => (prev && prev.ean === ean ? { ...prev, imagem_url_sem_fundo: objUrl } : prev));
            return;
          }

          const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
          const storagePath = `nobg-v2/${codigoEmpresa}/${numeroLoja}/${ean}.png`;
          const storedUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/produto-nobg/${storagePath}` : "";
          if (storedUrl) {
            const storedRes = await fetch(storedUrl, { cache: "force-cache" }).catch(() => null);
            if (storedRes && storedRes.ok) {
              const storedBlob = await storedRes.blob();
              await cache.put(req, new Response(storedBlob, { headers: { "Content-Type": "image/png" } }));
              setProduto((prev) => (prev && prev.ean === ean ? { ...prev, imagem_url_sem_fundo: storedUrl } : prev));
              return;
            }
          }

          const fetchViaProxy = async (srcUrl: string) => {
            const proxyUrl = `${BASE_URL}/api-image-proxy?url=${encodeURIComponent(srcUrl)}`;
            return await fetchWithTimeout(proxyUrl, { headers: { ...SUPABASE_FUNCTION_HEADERS }, cache: "force-cache" }, 12000);
          };

          const extractUrlFromApiProdutos = (payload: unknown) => {
            const rec = asRecord(payload);
            if (!rec) return "";
            const direct = rec.imagem_url_vtex ?? rec.link_imagem ?? rec.image_url ?? rec.url;
            if (typeof direct === "string" && cleanImageUrl(direct)) return cleanImageUrl(direct);
            const nested = asRecord(rec.produto) || asRecord(rec.data) || asRecord(rec.item);
            if (nested) {
              const u = nested.imagem_url_vtex ?? nested.link_imagem ?? nested.image_url ?? nested.url;
              if (typeof u === "string" && cleanImageUrl(u)) return cleanImageUrl(u);
            }
            return "";
          };

          let rawBlob: Blob | null = null;

          // 1) Supabase api-produtos?ean= -> imagem_url_vtex
          const apiProdutosUrl = `${String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}/functions/v1/api-produtos?ean=${encodeURIComponent(ean)}`;
          if (apiProdutosUrl.includes("/functions/v1/api-produtos")) {
            try {
              const { res, json } = await fetchJsonWithTimeout(apiProdutosUrl, { method: "GET", headers: { ...SUPABASE_FUNCTION_HEADERS } }, 8000);
              if (res.ok) {
                const u = extractUrlFromApiProdutos(json);
                if (u) {
                  const imgRes = await fetchViaProxy(u).catch(() => null);
                  if (imgRes && imgRes.ok) rawBlob = await imgRes.blob();
                }
              }
            } catch {
              rawBlob = null;
            }
          }

          // 2) API Mupa produto-imagem/{ean}
          if (!rawBlob) {
            const mupaSrc = `http://srv-mupa.ddns.net:5050/produto-imagem/${encodeURIComponent(ean)}`;
            const imgRes = await fetchViaProxy(mupaSrc).catch(() => null);
            if (imgRes && imgRes.ok) rawBlob = await imgRes.blob();
          }

          // 3) API da empresa (imagem da resposta do produto)
          if (!rawBlob && companyImgUrl) {
            const imgRes = await fetchViaProxy(companyImgUrl).catch(() => null);
            if (imgRes && imgRes.ok) rawBlob = await imgRes.blob();
          }

          if (!rawBlob) return;
          const outBlob = await _remove_bg_simple(rawBlob);
          await cache.put(req, new Response(outBlob, { headers: { "Content-Type": "image/png" } }));
          const objUrl = URL.createObjectURL(outBlob);
          if (productImageObjectUrlRef.current) URL.revokeObjectURL(productImageObjectUrlRef.current);
          productImageObjectUrlRef.current = objUrl;
          setProduto((prev) => (prev && prev.ean === ean ? { ...prev, imagem_url_sem_fundo: objUrl } : prev));

          const toBase64 = async (blob: Blob) => {
            const buf = new Uint8Array(await blob.arrayBuffer());
            let binary = "";
            const chunk = 0x8000;
            for (let i = 0; i < buf.length; i += chunk) {
              binary += String.fromCharCode(...buf.subarray(i, i + chunk));
            }
            return btoa(binary);
          };

          const png_base64 = await toBase64(outBlob);
          const uploadRes = await fetchWithTimeout(`${BASE_URL}/api-produto-nobg`, {
            method: "POST",
            headers: { ...SUPABASE_FUNCTION_HEADERS, "Content-Type": "application/json" },
            body: JSON.stringify({ codigo_empresa: codigoEmpresa, numero_loja: numeroLoja, ean, png_base64 }),
          }, 15000).catch(() => null);
          if (uploadRes && uploadRes.ok) {
            const data = (await uploadRes.json().catch(() => null)) as { url?: string } | null;
            const url = typeof data?.url === "string" ? data.url : storedUrl;
            if (url) {
              setProduto((prev) => {
                if (!prev || prev.ean !== ean) return prev;
                if (productImageObjectUrlRef.current && prev.imagem_url_sem_fundo === productImageObjectUrlRef.current) {
                  URL.revokeObjectURL(productImageObjectUrlRef.current);
                  productImageObjectUrlRef.current = null;
                }
                return { ...prev, imagem_url_sem_fundo: url };
              });
            }
          }
        } catch {
          return;
        } finally {
          noBgInFlightRef.current.delete(inFlightKey);
        }
      })();
    });
  }, [_remove_bg_simple]);

  const consultarPreco = useCallback(async (eanDigits: string): Promise<Produto> => {
    const ctx = await resolveEmpresaContext().catch(() => null);
    if (!ctx) throw new Error("Configuração incompleta. Revise código da empresa e número da loja.");

    const codigoEmpresa = ctx.codigo_empresa;
    const loja = ctx.numero_loja;
    const ean = eanDigits.replace(/\D/g, "");
    if (!ean) throw new Error("EAN inválido.");

    const ckey = cacheKeyForPreco(codigoEmpresa, loja, ean);
    const cached = await cacheGetJson<PrecoConsultaCache>(ckey);
    if (cached && cached.v === 1 && cached.produto?.ean) {
      return cached.produto;
    }

    if (!navigator.onLine) throw new Error("Sem internet e sem cache para este produto.");
    const produto = await fetchPrecoFromApi(codigoEmpresa, loja, ean);

    await cacheSetJson(ckey, { v: 1, codigo_empresa: codigoEmpresa, numero_loja: loja, ean, updated_at: new Date().toISOString(), produto });
    return produto;
  }, [fetchPrecoFromApi, resolveEmpresaContext]);

  // PERF: cache-first UI + background sync. Updates state/cache if price changes.
  const updateProductInBackground = useCallback(async (eanDigits: string, baseline: Produto, codigoEmpresa: string, numeroLoja: string) => {
    const ean = eanDigits.replace(/\D/g, "").trim();
    if (!ean || !navigator.onLine) return;

    runInBackground(() => {
      void (async () => {
        try {
          const latest = await fetchPrecoFromApi(codigoEmpresa, numeroLoja, ean);
          const changed = (baseline.preco ?? null) !== (latest.preco ?? null) || (baseline.preco_lista ?? null) !== (latest.preco_lista ?? null);
          if (!changed) return;

          produtosByEanRef.current[ean] = latest;
          const ckey = cacheKeyForPreco(codigoEmpresa, numeroLoja, ean);
          await cacheSetJson(ckey, { v: 1, codigo_empresa: codigoEmpresa, numero_loja: numeroLoja, ean, updated_at: new Date().toISOString(), produto: latest });
          setProduto((p) => (p && p.ean === ean ? { ...p, ...latest } : p));
          processImageBackground(latest, codigoEmpresa, numeroLoja);
        } catch {
          return;
        }
      })();
    });
  }, [fetchPrecoFromApi, processImageBackground]);

  const consultar = useCallback(async (code?: string) => {
    const raw = String(code ?? ean ?? "").trim();
    const digitsAll = raw.replace(/\D/g, "").trim();
    let searchEan = digitsAll;
    if (digitsAll.length >= 5 && digitsAll.slice(0, 1) === "2") {
      searchEan = digitsAll.slice(1, 5);
    }
    if (!searchEan) return;
    setEan("");
    if (beepEnabled) playBeep();
    setLoading(true); setError(null); setProduto(null); setSugestoes(null);
    setTheme(null);
    if (returnTimerRef.current) {
      window.clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }

    try {
      const ctx = await resolveEmpresaContext().catch(() => null);
      if (!ctx) throw new Error("Configuração incompleta. Revise código da empresa e número da loja.");

      const codigoEmpresa = ctx.codigo_empresa;
      const numeroLoja = ctx.numero_loja;

      const cachedMem = produtosByEanRef.current[searchEan] ?? null;
      if (cachedMem) {
        // PERF: show cache immediately; API sync + remove-bg run in background
        setProduto(cachedMem);
        processImageBackground(cachedMem, codigoEmpresa, numeroLoja);
        void updateProductInBackground(searchEan, cachedMem, codigoEmpresa, numeroLoja);

        const sugPromise = (maxSugestoes ?? 0) > 0
          ? fetch(`${BASE_URL}/api-sugestoes?ean=${searchEan}&limit=${maxSugestoes || 3}`, { headers: { ...SUPABASE_FUNCTION_HEADERS } })
            .then(r => r.json())
            .then((d: unknown) => {
              const next = normalizeSugestoesPayload(d);
              setSugestoes(next);
              if (next) updateSugestoesPricesInBackground(next, codigoEmpresa, numeroLoja);
              return !!next && (
                (next.mesma_marca?.length || 0) +
                (next.complementares?.length || 0) +
                (next.perfil?.length || 0)
              ) > 0;
            })
            .catch(() => false)
          : null;
        if (!sugPromise) setSugestoes(null);
        terminalEanChannelRef.current
          ?.send({
            type: "broadcast",
            event: "consulted",
            payload: { ean: searchEan, ts: Date.now(), ok: true, cache: true },
          })
          .catch(() => undefined);

        setLoading(false);

        if (ttsEnabled && typeof cachedMem.preco === "number") {
          let speakProduto: Produto = cachedMem;
          if (navigator.onLine) {
            const maybeLatest = await Promise.race([
              fetchPrecoFromApi(codigoEmpresa, numeroLoja, searchEan),
              new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 900)),
            ]);
            if (maybeLatest && typeof maybeLatest.preco === "number" && (maybeLatest.preco ?? null) !== (cachedMem.preco ?? null)) {
              speakProduto = maybeLatest;
              produtosByEanRef.current[searchEan] = maybeLatest;
              const ckey = cacheKeyForPreco(codigoEmpresa, numeroLoja, searchEan);
              await cacheSetJson(ckey, { v: 1, codigo_empresa: codigoEmpresa, numero_loja: numeroLoja, ean: searchEan, updated_at: new Date().toISOString(), produto: maybeLatest });
              setProduto((p) => (p && p.ean === searchEan ? { ...p, ...maybeLatest } : p));
            }
          }
          const tipoForTts = sugPromise
            ? await Promise.race([
              sugPromise.then((has) => (has ? tipoSugestao : undefined)),
              new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), 900)),
            ])
            : undefined;
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
          const audioEl = await speakPrice(speakProduto.preco, speakProduto.preco_lista, tipoForTts);
          armReturnToIdle(audioEl, 8000);
        } else {
          armReturnToIdle(null, 8000);
        }

        if (corAutoEnabled && cachedMem.imagem_url_vtex) {
          const imgForTheme = cachedMem.imagem_url_sem_fundo || cachedMem.imagem_url_vtex || cachedMem.link_imagem || "";
          if (imgForTheme) generateThemeFromImage(imgForTheme).then(t => setTheme(t));
        }

        return;
      }


      const cachedStorage = await getCachedPrecoFromStorage(codigoEmpresa, numeroLoja, searchEan);
      if (cachedStorage) {
        // PERF: show cache immediately; API sync + remove-bg run in background
        produtosByEanRef.current[searchEan] = cachedStorage;
        setProduto(cachedStorage);
        processImageBackground(cachedStorage, codigoEmpresa, numeroLoja);
        void updateProductInBackground(searchEan, cachedStorage, codigoEmpresa, numeroLoja);

        const sugPromise = (maxSugestoes ?? 0) > 0
          ? fetch(`${BASE_URL}/api-sugestoes?ean=${searchEan}&limit=${maxSugestoes || 3}`, { headers: { ...SUPABASE_FUNCTION_HEADERS } })
            .then(r => r.json())
            .then((d: unknown) => {
              const next = normalizeSugestoesPayload(d);
              setSugestoes(next);
              if (next) updateSugestoesPricesInBackground(next, codigoEmpresa, numeroLoja);
              return !!next && (
                (next.mesma_marca?.length || 0) +
                (next.complementares?.length || 0) +
                (next.perfil?.length || 0)
              ) > 0;
            })
            .catch(() => false)
          : null;
        if (!sugPromise) setSugestoes(null);

        terminalEanChannelRef.current
          ?.send({
            type: "broadcast",
            event: "consulted",
            payload: { ean: searchEan, ts: Date.now(), ok: true, cache: true },
          })
          .catch(() => undefined);

        setLoading(false);

        if (ttsEnabled && cachedStorage.preco) {
          let speakProduto: Produto = cachedStorage;
          if (navigator.onLine) {
            const maybeLatest = await Promise.race([
              fetchPrecoFromApi(codigoEmpresa, numeroLoja, searchEan),
              new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 900)),
            ]);
            if (maybeLatest && (maybeLatest.preco ?? null) !== (cachedStorage.preco ?? null)) {
              speakProduto = maybeLatest;
              produtosByEanRef.current[searchEan] = maybeLatest;
              const ckey = cacheKeyForPreco(codigoEmpresa, numeroLoja, searchEan);
              await cacheSetJson(ckey, { v: 1, codigo_empresa: codigoEmpresa, numero_loja: numeroLoja, ean: searchEan, updated_at: new Date().toISOString(), produto: maybeLatest });
              setProduto((p) => (p && p.ean === searchEan ? { ...p, ...maybeLatest } : p));
            }
          }
          const tipoForTts = sugPromise
            ? await Promise.race([
              sugPromise.then((has) => (has ? tipoSugestao : undefined)),
              new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), 900)),
            ])
            : undefined;
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
          const audio = await speakPrice(speakProduto.preco, speakProduto.preco_lista, tipoForTts);
          armReturnToIdle(audio, 8000);
        } else {
          armReturnToIdle(null, 8000);
        }

        if (corAutoEnabled && cachedStorage.imagem_url_vtex) {
          const imgForTheme = cachedStorage.imagem_url_sem_fundo || cachedStorage.imagem_url_vtex || cachedStorage.link_imagem || "";
          if (imgForTheme) generateThemeFromImage(imgForTheme).then(t => setTheme(t));
        }

        return;
      }

      if (!navigator.onLine) throw new Error(`Produto não encontrado no cache (${searchEan})`);

      const prod = await fetchPrecoFromApi(codigoEmpresa, numeroLoja, searchEan);
      await cacheSetJson(cacheKeyForPreco(codigoEmpresa, numeroLoja, searchEan), {
        v: 1,
        codigo_empresa: codigoEmpresa,
        numero_loja: numeroLoja,
        ean: searchEan,
        updated_at: new Date().toISOString(),
        produto: prod,
      });
      produtosByEanRef.current[searchEan] = prod;
      setProduto(prod);
      processImageBackground(prod, codigoEmpresa, numeroLoja);
      terminalEanChannelRef.current
        ?.send({
          type: "broadcast",
          event: "consulted",
          payload: { ean: searchEan, ts: Date.now(), ok: true },
        })
        .catch(() => undefined);

      const sugPromise = (maxSugestoes ?? 0) > 0
        ? fetch(`${BASE_URL}/api-sugestoes?ean=${searchEan}&limit=${maxSugestoes || 3}`, { headers: { ...SUPABASE_FUNCTION_HEADERS } })
          .then(r => r.json())
          .then((d: unknown) => {
            const next = normalizeSugestoesPayload(d);
            setSugestoes(next);
            if (next) updateSugestoesPricesInBackground(next, codigoEmpresa, numeroLoja);
            return !!next && (
              (next.mesma_marca?.length || 0) +
              (next.complementares?.length || 0) +
              (next.perfil?.length || 0)
            ) > 0;
          })
          .catch(() => false)
        : null;
      if (!sugPromise) setSugestoes(null);

      setLoading(false);

      if (ttsEnabled && prod.preco) {
        const tipoForTts = sugPromise
          ? await Promise.race([
            sugPromise.then((has) => (has ? tipoSugestao : undefined)),
            new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), 900)),
          ])
          : undefined;
        const audio = await speakPrice(prod.preco, prod.preco_lista, tipoForTts);
        armReturnToIdle(audio, 8000);
      } else {
        armReturnToIdle(null, 8000);
      }

      if (corAutoEnabled) {
        const imgForTheme = prod.imagem_url_sem_fundo || prod.imagem_url_vtex || prod.link_imagem || "";
        if (imgForTheme) generateThemeFromImage(imgForTheme).then(t => setTheme(t));
      }

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(formatApiError(msg));
      terminalEanChannelRef.current
        ?.send({
          type: "broadcast",
          event: "consulted",
          payload: { ean: searchEan, ts: Date.now(), ok: false },
        })
        .catch(() => undefined);
      setLoading(false);
    }
  }, [
    armReturnToIdle,
    beepEnabled,
    corAutoEnabled,
    ean,
    fetchPrecoFromApi,
    getCachedPrecoFromStorage,
    maxSugestoes,
    playBeep,
    processImageBackground,
    speakPrice,
    tipoSugestao,
    ttsEnabled,
    updateSugestoesPricesInBackground,
    updateProductInBackground,
    resolveEmpresaContext,
  ]);

  useEffect(() => {
    if (!deviceActivated || !precoConfigReady) return;
    const scan = (raw: unknown) => {
      const text = String(raw ?? "").trim();
      if (!text) return;
      focusScanInput();

      const upper = text.toUpperCase();
      if (upper.startsWith("MUPA:")) {
        const cmd = upper.slice(5).trim();
        if (cmd === "CLEAR_CACHE") {
          void clearTerminalCaches("all").finally(() => window.setTimeout(() => window.location.reload(), 150));
          return;
        }
        if (cmd === "CLEAR_NOBG") {
          void clearTerminalCaches("nobg").finally(() => window.setTimeout(() => window.location.reload(), 150));
          return;
        }
        if (cmd === "RESET_WIZARD") {
          resetToWizard();
          return;
        }
        if (cmd === "RELOAD") {
          window.location.reload();
          return;
        }
        if (cmd === "FOCUS") {
          focusScanInput();
          return;
        }
      }

      const digits = text.replace(/\D/g, "").trim();
      if (!digits) return;
      setEan(digits);
      void consultar(digits);
    };

    const onMessage = (ev: MessageEvent) => {
      const data = (ev as MessageEvent).data;
      if (typeof data === "string") {
        const trimmed = data.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (parsed && typeof parsed === "object") {
            const rec = parsed as Record<string, unknown>;
            if (typeof rec.ean === "string") return scan(rec.ean);
            if (typeof rec.code === "string") return scan(rec.code);
            if (typeof rec.barcode === "string") return scan(rec.barcode);
          }
        } catch {
          scan(trimmed);
        }
        return;
      }

      if (data && typeof data === "object") {
        const rec = data as Record<string, unknown>;
        if (typeof rec.ean === "string") return scan(rec.ean);
        if (typeof rec.code === "string") return scan(rec.code);
        if (typeof rec.barcode === "string") return scan(rec.barcode);
      }
    };

    (window as unknown as { mupaScan?: (ean: string) => void }).mupaScan = (eanValue: string) => scan(eanValue);
    window.addEventListener("message", onMessage);
    const doc = document as unknown as {
      addEventListener: (type: "message", listener: (ev: MessageEvent) => void) => void;
      removeEventListener: (type: "message", listener: (ev: MessageEvent) => void) => void;
    };
    doc.addEventListener("message", onMessage);

    return () => {
      try {
        delete (window as unknown as { mupaScan?: (ean: string) => void }).mupaScan;
      } catch {
        (window as unknown as { mupaScan?: undefined }).mupaScan = undefined;
      }
      window.removeEventListener("message", onMessage);
      doc.removeEventListener("message", onMessage);
    };
  }, [clearTerminalCaches, consultar, deviceActivated, focusScanInput, precoConfigReady, resetToWizard]);

  const wizardNext = useCallback(async () => {
    setWizardError(null);
    if (wizardStep === 0) {
      const code = normalizeEmpresaCode(wizardEmpresaCode);
      if (!isValidEmpresaCode(code)) {
        setWizardError("Informe o código da empresa no formato ABC123.");
        return;
      }
      setActivatingDevice(true);
      try {
        let empresaId: string | null = null;
        if (!empresaId) {
          const { data, error } = await supabase
            .from("empresas")
            .select("id, ativo")
            .eq("codigo_vinculo", code)
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("Código inválido");
          if (data.ativo === false) throw new Error("Empresa inativa");
          empresaId = data.id;
        }

        if (!empresaId) throw new Error("Código inválido");
        setWizardEmpresaId(empresaId);
        setWizardEmpresaCode(code);
        setWizardStep(1);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const isNetwork =
          e instanceof TypeError &&
          (message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("network"));
        setWizardError(isNetwork ? "Não foi possível validar (erro de rede). Verifique a internet do terminal." : (message || "Código inválido"));
      } finally {
        setActivatingDevice(false);
      }
      return;
    }

    if (wizardStep === 1) {
      if (!wizardGrupoId) {
        setWizardError("Selecione um grupo para este dispositivo.");
        return;
      }
      setWizardStep(2);
      return;
    }

    if (wizardStep === 2) {
      const name = sanitizeTerminalDeviceName(wizardDeviceName);
      if (!name) {
        setWizardError("Informe um nome/apelido para o dispositivo.");
        return;
      }
      setWizardDeviceName(name);
      setWizardStep(3);
      return;
    }

    const loja = wizardLojaNumero.replace(/\s+/g, " ").trim();
    if (!loja) {
      setWizardError("Informe o número da loja.");
      return;
    }
    setWizardLojaNumero(loja);
    await activateDeviceWizard();
  }, [activateDeviceWizard, wizardDeviceName, wizardEmpresaCode, wizardGrupoId, wizardLojaNumero, wizardStep]);

  const wizardPrev = useCallback(() => {
    setWizardError(null);
    setWizardStep((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2 | 3) : s));
  }, []);

  const wizardNextRef = useRef(wizardNext);
  wizardNextRef.current = wizardNext;

  const consultarRef = useRef(consultar);
  consultarRef.current = consultar;

  useEffect(() => {
    const focus = () => {
      const target = deviceActivated ? scanInputRef.current : hiddenInputRef.current;
      target?.focus({ preventScroll: true });
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
  }, [deviceActivated]);

  const commitScan = useCallback((raw: string) => {
    const text = String(raw ?? "").trim();
    if (!text) return;
    scanBufferRef.current = "";
    scanLastKeyTsRef.current = 0;

    const upper = text.toUpperCase();
    if (upper.startsWith("MUPA:")) {
      const cmd = upper.slice(5).trim();
      if (cmd === "CLEAR_CACHE") {
        void clearTerminalCaches("all").finally(() => window.setTimeout(() => window.location.reload(), 150));
        return;
      }
      if (cmd === "CLEAR_NOBG") {
        void clearTerminalCaches("nobg").finally(() => window.setTimeout(() => window.location.reload(), 150));
        return;
      }
      if (cmd === "RESET_WIZARD") {
        resetToWizard();
        return;
      }
      if (cmd === "RELOAD") {
        window.location.reload();
        return;
      }
      if (cmd === "FOCUS") {
        focusScanInput();
        return;
      }
    }

    const digits = text.replace(/\D/g, "");
    if (!digits) return;
    void consultarRef.current(digits);
    setEan("");
  }, [clearTerminalCaches, focusScanInput, resetToWizard]);

  const onScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const nowTs = Date.now();
    if (nowTs - scanLastKeyTsRef.current > 250) scanBufferRef.current = "";
    scanLastKeyTsRef.current = nowTs;

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const raw = scanBufferRef.current || e.currentTarget.value || ean;
      commitScan(raw);
      e.currentTarget.value = "";
      return;
    }

    if (e.key.length === 1 && /[0-9A-Za-z:_-]/.test(e.key)) {
      scanBufferRef.current += e.key;
      return;
    }
  };

  const onScanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const hasLineBreak = /[\r\n]/.test(raw);
    const digits = raw.replace(/\D/g, "");

    if (hasLineBreak) {
      e.target.value = "";
      setEan(digits);
      commitScan(raw.replace(/[\r\n]/g, ""));
      setEan("");
      return;
    }

    setEan(digits);
  };

  useEffect(() => {
    if (!deviceActivated) return;

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      const isTypingField =
        !!active &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable) &&
        active !== scanInputRef.current &&
        active !== hiddenInputRef.current;
      if (isTypingField) return;

      const nowTs = Date.now();
      if (nowTs - scanLastKeyTsRef.current > 250) scanBufferRef.current = "";
      scanLastKeyTsRef.current = nowTs;

      if (ev.key === "Enter" || ev.key === "Tab") {
        if (!scanBufferRef.current) return;
        ev.preventDefault();
        commitScan(scanBufferRef.current);
        return;
      }

      if (ev.key.length === 1 && /[0-9A-Za-z:_-]/.test(ev.key)) {
        scanBufferRef.current += ev.key;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [commitScan, deviceActivated]);

  const appendWizardKey = (k: string) => {
    setWizardError(null);
    if (wizardStep === 0) {
      const cleaned = k.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (!cleaned) return;
      setWizardEmpresaCode((prev) => normalizeEmpresaCode(prev + cleaned));
      return;
    }
    if (wizardStep === 2) {
      setWizardDeviceName((prev) => sanitizeTerminalDeviceName(prev + k));
      return;
    }
    if (wizardStep === 3) {
      const cleaned = k.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase();
      if (!cleaned) return;
      setWizardLojaNumero((prev) => (prev + cleaned).slice(0, 12));
    }
  };

  const backspaceWizard = () => {
    setWizardError(null);
    if (wizardStep === 0) setWizardEmpresaCode((prev) => prev.slice(0, -1));
    else if (wizardStep === 2) setWizardDeviceName((prev) => prev.slice(0, -1));
    else if (wizardStep === 3) setWizardLojaNumero((prev) => prev.slice(0, -1));
  };

  const onHiddenKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Enter") {
      e.preventDefault();
      if (!deviceActivated) void wizardNextRef.current();
      else void consultarRef.current();
      return;
    }

    if (e.key === "Backspace") {
      e.preventDefault();
      if (!deviceActivated) {
        backspaceWizard();
      }
      else setEan((prev) => prev.slice(0, -1));
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (!deviceActivated) {
        setWizardError(null);
        if (wizardStep === 1) {
          setWizardGrupoId(null);
          setWizardGroupPath([]);
        } else if (wizardStep === 0) {
          setWizardEmpresaCode("");
        } else if (wizardStep === 2) {
          setWizardDeviceName("");
        } else if (wizardStep === 3) {
          setWizardLojaNumero("");
        }
      }
      else clearConsult();
    }
  };

  const onHiddenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    e.target.value = "";
    if (!raw) return;

    if (!deviceActivated) {
      setWizardError(null);
      if (wizardStep === 0) {
        const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        if (!cleaned) return;
        setWizardEmpresaCode((prev) => normalizeEmpresaCode(prev + cleaned));
        return;
      }
      if (wizardStep === 2) {
        setWizardDeviceName((prev) => sanitizeTerminalDeviceName(prev + raw));
        return;
      }
      if (wizardStep === 3) {
        const cleaned = raw.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase();
        if (!cleaned) return;
        setWizardLojaNumero((prev) => (prev + cleaned).slice(0, 12));
        return;
      }
      return;
    }

    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    setEan((prev) => (prev + digits).slice(0, 20));
  };

  useEffect(() => {
    const id = localStorage.getItem("mupa_device_id");
    if (!deviceActivated || !id) return;

    const inputRemotoRef = { current: true };
    void supabase
      .from("dispositivos")
      .select("input_remoto_ativo, config_override")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error) return;
        if (typeof data?.input_remoto_ativo === "boolean") inputRemotoRef.current = data.input_remoto_ativo;
        const overrides = (data as { config_override?: unknown } | null)?.config_override;
        if (overrides && typeof overrides === "object") {
          for (const [k, v] of Object.entries(overrides as Record<string, unknown>)) {
            applyConfigValue(k, v);
          }
        }
      });

    

    const rowCh = supabase
      .channel(`dispositivos-row-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dispositivos", filter: `id=eq.${id}` },
        (payload) => {
          const n = payload.new as { input_remoto_ativo?: boolean; config_override?: unknown; loja_numero?: string | null };
          if (typeof n.input_remoto_ativo === "boolean") inputRemotoRef.current = n.input_remoto_ativo;
          if (typeof n.loja_numero === "string") {
            const next = normalizeLojaNumero(n.loja_numero);
            if (next) {
              try {
                localStorage.setItem("mupa_loja_numero", next);
              } catch {
                return;
              }
              setLojaNumeroAtivo(next);
              setWizardLojaNumero(next);
            }
          }
          const overrides = n.config_override;
          if (overrides && typeof overrides === "object") {
            for (const [k, v] of Object.entries(overrides as Record<string, unknown>)) {
              applyConfigValue(k, v);
            }
          }
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
        const text = String(raw).trim();
        if (!text) return;
        const upper = text.toUpperCase();
        if (upper.startsWith("MUPA:")) {
          commitScan(upper);
          return;
        }
        const digits = text.replace(/\D/g, "");
        if (!digits) return;
        void consultarRef.current(digits);
      })
      .subscribe();

    terminalEanChannelRef.current = eanCh;

    return () => {
      terminalEanChannelRef.current = null;
      supabase.removeChannel(rowCh);
      supabase.removeChannel(eanCh);
    };
  }, [applyConfigValue, commitScan, deviceActivated]);

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
    const pool = map[tipoSugestao] || map.todas;
    const available = pool.length;
    const limit = maxSugestoes && maxSugestoes > 0 ? maxSugestoes : Math.min(3, available);
    return pool.slice(0, limit);
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
  const outerMargin = Math.round(clamp(0, layoutPadding, 40));
  const padding = outerMargin;
  const gapAuto = layout === "compacto" ? Math.round(minDim * 0.018) : Math.round(minDim * 0.024);
  const gap = layoutGap > 0 ? Math.round(clamp(6, layoutGap, 80)) : gapAuto;
  const footerSpace = Math.round(clamp(44, vh * 0.085, 96));

  const wizardGroupsById = useMemo(() => {
    return new Map(wizardGroups.map((g) => [g.id, g]));
  }, [wizardGroups]);

  const wizardChildrenByParent = useMemo(() => {
    const m = new Map<string | null, Array<{ id: string; nome: string; parent_id: string | null }>>();
    for (const g of wizardGroups) {
      const key = g.parent_id ?? null;
      const list = m.get(key) ?? [];
      list.push(g);
      m.set(key, list);
    }
    for (const [, list] of m) list.sort((a, b) => a.nome.localeCompare(b.nome));
    return m;
  }, [wizardGroups]);

  const wizardBrowseParentId = wizardGroupPath.length ? wizardGroupPath[wizardGroupPath.length - 1] : null;
  const wizardCurrentGroups = wizardChildrenByParent.get(wizardBrowseParentId) ?? [];
  const wizardSelectedGroup = wizardGrupoId ? wizardGroupsById.get(wizardGrupoId) ?? null : null;

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
        {isLandscape ? (
          <div className="flex flex-1 w-full gap-2 p-2">
            <div className="w-[35%] flex items-start justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center rounded-3xl w-full gap-3 p-5"
                style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
            <div className="text-center">
              <h1 className={`${isLandscape ? "text-lg" : "text-xl"} font-bold text-white leading-tight`}>Mupa</h1>
              <p className={`${isLandscape ? "text-[11px]" : "text-xs"} text-white/50`}>Configuração do Terminal</p>
            </div>

            <div className="text-[10px] text-white/50 font-semibold tracking-wider uppercase">
              Passo {wizardStep + 1} de 4
            </div>

            <div className={`w-full ${isLandscape ? "space-y-2" : "space-y-3"}`}>
              {wizardStep === 0 && (
                <div className="space-y-2">
                  {detectedDevice ? (
                    <div className="rounded-xl border border-white/15 bg-white/5 p-3 space-y-2">
                      <div className="text-[11px] text-white/70">
                        Dispositivo detectado pelo ID do app:
                      </div>
                      <div className="text-white font-semibold text-sm">
                        {sanitizeTerminalDeviceName(detectedDevice.device_name || "Terminal")}
                      </div>
                      <div className="text-[11px] text-white/55 font-mono">
                        {normalizeEmpresaCode(detectedDevice.empresa_code)} · Loja {normalizeLojaNumero(detectedDevice.loja_numero)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => void activateDeviceDirect({
                            codigoEmpresa: detectedDevice.empresa_code,
                            deviceName: detectedDevice.device_name,
                            grupoId: detectedDevice.grupo_id,
                            lojaNumero: detectedDevice.loja_numero,
                          })}
                          className="w-full py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 transition-all"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetectedDevice(null)}
                          className="w-full py-2 rounded-lg font-semibold text-white bg-white/10 hover:bg-white/15 transition-all border border-white/20"
                        >
                          Ignorar
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {lastKnownDevice.id && normalizeEmpresaCode(lastKnownDevice.empresa_code) && normalizeLojaNumero(lastKnownDevice.loja_numero) ? (
                    <div className="rounded-xl border border-white/15 bg-white/5 p-3 space-y-2">
                      <div className="text-[11px] text-white/70">
                        Dispositivo já cadastrado:
                      </div>
                      <div className="text-white font-semibold text-sm">
                        {sanitizeTerminalDeviceName(lastKnownDevice.device_name || "Terminal")}
                      </div>
                      <div className="text-[11px] text-white/55 font-mono">
                        {normalizeEmpresaCode(lastKnownDevice.empresa_code)} · Loja {normalizeLojaNumero(lastKnownDevice.loja_numero)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={restoreLastKnownDevice}
                          className="w-full py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 transition-all"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            localStorage.removeItem("mupa_last_device_id");
                            localStorage.removeItem("mupa_last_empresa_id");
                            localStorage.removeItem("mupa_last_empresa_code");
                            localStorage.removeItem("mupa_last_device_name");
                            localStorage.removeItem("mupa_last_loja_numero");
                            setLastKnownDevice({ id: "", empresa_id: "", empresa_code: "", device_name: "", loja_numero: "", device_key: "" });
                          }}
                          className="w-full py-2 rounded-lg font-semibold text-white bg-white/10 hover:bg-white/15 transition-all border border-white/20"
                        >
                          Novo
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <p className={`${isLandscape ? "text-[13px]" : "text-sm"} text-white/70 text-center leading-relaxed`}>
                    Digite o código da empresa.
                  </p>
                  <button
                    type="button"
                    className={`w-full text-center font-mono ${isLandscape ? "text-xl tracking-[0.24em] py-3" : "text-2xl tracking-[0.3em] py-4"} px-4 rounded-xl border bg-white/10 text-white border-white/20 transition-colors`}
                    style={{ borderColor: isValidEmpresaCode(normalizeEmpresaCode(wizardEmpresaCode)) ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.2)" }}
                  >
                    {normalizeEmpresaCode(wizardEmpresaCode) || "ABC123"}
                  </button>
                  <p className="text-xs text-white/50 text-center">Formato: ABC123</p>
                </div>
              )}

              {wizardStep === 1 && (
                <div className="space-y-3">
                  <p className={`${isLandscape ? "text-[13px]" : "text-sm"} text-white/70 text-center leading-relaxed`}>
                    Selecione o grupo inicial do dispositivo.
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-white/60">
                    <button type="button" className="underline underline-offset-2" onClick={() => setWizardGroupPath([])}>
                      Raiz
                    </button>
                    {wizardGroupPath.map((id, idx) => {
                      const g = wizardGroupsById.get(id);
                      const label = g?.nome ?? "Grupo";
                      return (
                        <button
                          key={id}
                          type="button"
                          className="underline underline-offset-2"
                          onClick={() => setWizardGroupPath((prev) => prev.slice(0, idx + 1))}
                        >
                          / {label}
                        </button>
                      );
                    })}
                  </div>

                  <div className={`${isLandscape ? "max-h-44" : "max-h-64"} overflow-auto rounded-xl border bg-white/10 border-white/20 p-2`}>
                    {wizardCurrentGroups.length === 0 ? (
                      <div className="text-white/60 text-sm text-center py-6">
                        Nenhum grupo encontrado neste nível.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {wizardCurrentGroups.map((g) => {
                          const children = wizardChildrenByParent.get(g.id) ?? [];
                          const selected = wizardGrupoId === g.id;
                          return (
                            <div
                              key={g.id}
                              className="flex items-center gap-2 rounded-lg border px-3 py-2"
                              style={{ borderColor: selected ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.15)" }}
                            >
                              <button
                                type="button"
                                className="flex-1 text-left text-white"
                                onClick={() => { setWizardError(null); setWizardGrupoId(g.id); }}
                              >
                                <div className="text-sm font-semibold">{g.nome}</div>
                                <div className="text-[11px] text-white/50">{children.length ? `${children.length} subgrupos` : "Sem subgrupos"}</div>
                              </button>
                              {children.length > 0 && (
                                <button
                                  type="button"
                                  className="px-3 py-2 rounded-lg border text-xs text-white bg-white/5"
                                  style={{ borderColor: "rgba(255,255,255,0.15)" }}
                                  onClick={() => setWizardGroupPath((prev) => [...prev, g.id])}
                                >
                                  Abrir
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-white/60 text-center">
                    Selecionado: <span className="text-white/80 font-semibold">{wizardSelectedGroup?.nome ?? "—"}</span>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-2">
                  <p className={`${isLandscape ? "text-[13px]" : "text-sm"} text-white/70 text-center leading-relaxed`}>
                    Informe um nome/apelido para este dispositivo.
                  </p>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 rounded-xl border bg-white/10 text-white border-white/20 transition-colors"
                    style={{ borderColor: wizardDeviceName.trim() ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.2)" }}
                  >
                    <div className="text-[11px] text-white/50 font-semibold tracking-wider uppercase">Nome / Apelido</div>
                    <div className={`${isLandscape ? "text-base" : "text-lg"} font-semibold mt-1`}>{wizardDeviceName || "Ex: Caixa 01 - Frente"}</div>
                  </button>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-2">
                  <p className={`${isLandscape ? "text-[13px]" : "text-sm"} text-white/70 text-center leading-relaxed`}>
                    Informe o número da loja.
                  </p>
                  <button
                    type="button"
                    className={`w-full text-center font-mono ${isLandscape ? "text-xl tracking-[0.16em] py-3" : "text-2xl tracking-[0.2em] py-4"} px-4 rounded-xl border bg-white/10 text-white border-white/20 transition-colors`}
                    style={{ borderColor: wizardLojaNumero.trim() ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.2)" }}
                  >
                    {wizardLojaNumero.toUpperCase() || "—"}
                  </button>
                </div>
              )}

              {wizardError && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-sm text-center"
                >
                  {wizardError}
                </motion.p>
              )}

              <div className={`grid grid-cols-2 ${isLandscape ? "gap-2" : "gap-3"} pt-1`}>
                <button
                  type="button"
                  onClick={wizardPrev}
                  disabled={wizardStep === 0 || activatingDevice}
                  className={`w-full ${isLandscape ? "py-2.5 text-sm" : "py-3"} rounded-xl font-semibold text-white bg-white/10 hover:bg-white/15 disabled:opacity-50 transition-all border border-white/20`}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={wizardNext}
                  disabled={
                    activatingDevice ||
                    (wizardStep === 0 && !isValidEmpresaCode(normalizeEmpresaCode(wizardEmpresaCode))) ||
                    (wizardStep === 1 && !wizardGrupoId) ||
                    (wizardStep === 2 && !sanitizeTerminalDeviceName(wizardDeviceName)) ||
                    (wizardStep === 3 && !wizardLojaNumero.trim())
                  }
                  className={`w-full ${isLandscape ? "py-2.5 text-sm" : "py-3"} rounded-xl font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 transition-all`}
                >
                  {activatingDevice ? "Aguarde..." : wizardStep === 3 ? "Finalizar" : "Próximo"}
                </button>
              </div>
            </div>
              </motion.div>
            </div>

            {wizardStep !== 1 && (
              <div className="w-[65%] flex px-1">
                <VirtualKeyboard
                  mode={wizardStep === 2 ? "full" : "activation"}
                  onKey={appendWizardKey}
                  onBackspace={backspaceWizard}
                  onEnter={wizardNext}
                  dark
                  className="w-full h-full border-t-0 border-l p-2 shadow-none"
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-1 justify-center p-3 items-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center rounded-3xl w-full gap-4 p-6"
                style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", width: "90%", maxWidth: 520 }}
              >
                <div className="text-center">
                  <h1 className="text-xl font-bold text-white leading-tight">Mupa</h1>
                  <p className="text-xs text-white/50">Configuração do Terminal</p>
                </div>

                <div className="text-[10px] text-white/50 font-semibold tracking-wider uppercase">
                  Passo {wizardStep + 1} de 4
                </div>

                <div className="w-full space-y-3">
                  {wizardStep === 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-white/70 text-center leading-relaxed">
                        Digite o código da empresa.
                      </p>
                      <button
                        type="button"
                        className="w-full text-center text-2xl font-mono tracking-[0.3em] py-4 px-4 rounded-xl border bg-white/10 text-white border-white/20 transition-colors"
                        style={{ borderColor: isValidEmpresaCode(normalizeEmpresaCode(wizardEmpresaCode)) ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.2)" }}
                      >
                        {normalizeEmpresaCode(wizardEmpresaCode) || "ABC123"}
                      </button>
                      <p className="text-xs text-white/50 text-center">Formato: ABC123</p>
                    </div>
                  )}

                  {wizardStep === 1 && (
                    <div className="space-y-3">
                      <p className="text-sm text-white/70 text-center leading-relaxed">
                        Selecione o grupo inicial do dispositivo.
                      </p>

                      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-white/60">
                        <button type="button" className="underline underline-offset-2" onClick={() => setWizardGroupPath([])}>
                          Raiz
                        </button>
                        {wizardGroupPath.map((id, idx) => {
                          const g = wizardGroupsById.get(id);
                          const label = g?.nome ?? "Grupo";
                          return (
                            <button
                              key={id}
                              type="button"
                              className="underline underline-offset-2"
                              onClick={() => setWizardGroupPath((prev) => prev.slice(0, idx + 1))}
                            >
                              / {label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="max-h-64 overflow-auto rounded-xl border bg-white/10 border-white/20 p-2">
                        {wizardCurrentGroups.length === 0 ? (
                          <div className="text-white/60 text-sm text-center py-6">
                            Nenhum grupo encontrado neste nível.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {wizardCurrentGroups.map((g) => {
                              const children = wizardChildrenByParent.get(g.id) ?? [];
                              const selected = wizardGrupoId === g.id;
                              return (
                                <div
                                  key={g.id}
                                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                                  style={{ borderColor: selected ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.15)" }}
                                >
                                  <button
                                    type="button"
                                    className="flex-1 text-left text-white"
                                    onClick={() => { setWizardError(null); setWizardGrupoId(g.id); }}
                                  >
                                    <div className="text-sm font-semibold">{g.nome}</div>
                                    <div className="text-[11px] text-white/50">{children.length ? `${children.length} subgrupos` : "Sem subgrupos"}</div>
                                  </button>
                                  {children.length > 0 && (
                                    <button
                                      type="button"
                                      className="px-3 py-2 rounded-lg border text-xs text-white bg-white/5"
                                      style={{ borderColor: "rgba(255,255,255,0.15)" }}
                                      onClick={() => setWizardGroupPath((prev) => [...prev, g.id])}
                                    >
                                      Abrir
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="text-xs text-white/60 text-center">
                        Selecionado: <span className="text-white/80 font-semibold">{wizardSelectedGroup?.nome ?? "—"}</span>
                      </div>
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div className="space-y-2">
                      <p className="text-sm text-white/70 text-center leading-relaxed">
                        Informe um nome/apelido para este dispositivo.
                      </p>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-3 rounded-xl border bg-white/10 text-white border-white/20 transition-colors"
                        style={{ borderColor: wizardDeviceName.trim() ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.2)" }}
                      >
                        <div className="text-[11px] text-white/50 font-semibold tracking-wider uppercase">Nome / Apelido</div>
                        <div className="text-lg font-semibold mt-1">{wizardDeviceName || "Ex: Caixa 01 - Frente"}</div>
                      </button>
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <div className="space-y-2">
                      <p className="text-sm text-white/70 text-center leading-relaxed">
                        Informe o número da loja.
                      </p>
                      <button
                        type="button"
                        className="w-full text-center text-2xl font-mono tracking-[0.2em] py-4 px-4 rounded-xl border bg-white/10 text-white border-white/20 transition-colors"
                        style={{ borderColor: wizardLojaNumero.trim() ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.2)" }}
                      >
                        {wizardLojaNumero.toUpperCase() || "—"}
                      </button>
                    </div>
                  )}

                  {wizardError && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-400 text-sm text-center"
                    >
                      {wizardError}
                    </motion.p>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={wizardPrev}
                      disabled={wizardStep === 0 || activatingDevice}
                      className="w-full py-3 rounded-xl font-semibold text-white bg-white/10 hover:bg-white/15 disabled:opacity-50 transition-all border border-white/20"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={wizardNext}
                      disabled={
                        activatingDevice ||
                        (wizardStep === 0 && !isValidEmpresaCode(normalizeEmpresaCode(wizardEmpresaCode))) ||
                        (wizardStep === 1 && !wizardGrupoId) ||
                        (wizardStep === 2 && !sanitizeTerminalDeviceName(wizardDeviceName)) ||
                        (wizardStep === 3 && !wizardLojaNumero.trim())
                      }
                      className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 transition-all"
                    >
                      {activatingDevice ? "Aguarde..." : wizardStep === 3 ? "Finalizar" : "Próximo"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>

            {wizardStep !== 1 && (
              <VirtualKeyboard
                mode={wizardStep === 2 ? "full" : "activation"}
                onKey={appendWizardKey}
                onBackspace={backspaceWizard}
                onEnter={wizardNext}
                dark
              />
            )}
          </>
        )}
      </div>
    );
  }

  if (!precoConfigReady) {
    return (
      <div
        ref={containerRef}
        className="terminal-page flex min-h-[100dvh] flex-col items-center justify-center"
        style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)", cursor: "default" }}
      >
        <div className="w-full max-w-xl px-5">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="text-center">
              <div className="text-white text-lg font-semibold">Preparando consulta de preço</div>
              <div className="mt-1 text-white/60 text-sm">
                {precoConfigLoading ? "Aguarde..." : precoConfigError ? precoConfigError : "Carregando configuração da empresa"}
              </div>
              {precoConfigUpdatedAt ? (
                <div className="mt-2 text-white/45 text-xs">
                  Última atualização: {new Date(precoConfigUpdatedAt).toLocaleString("pt-BR")}
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void ensureEmpresaPrecoConfigLoaded()}
                disabled={precoConfigLoading}
                className="w-full py-3 rounded-xl font-semibold text-white bg-white/10 hover:bg-white/15 disabled:opacity-50 transition-all border border-white/20"
              >
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={resetToWizard}
                className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 transition-all"
              >
                Voltar ao wizard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Exibir banner de manutenção apenas se status manual indicar
  if (isUnderMaintenance) {
    return (
      <MaintenanceBanner
        message={maintenanceMessage || "Sistema em manutenção programada. Retornamos em breve."}
        onRetry={forceMaintenanceCheck}
        showRetry={true}
      />
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <MaintenanceBanner
          message="Ocorreu um erro inesperado no sistema."
          onRetry={() => window.location.reload()}
        />
      }
    >
      <div
        ref={containerRef}
        className="terminal-page"
        style={{ background: bgGradient, cursor: "none", transition: transitionStyle }}
      >
      <div
        ref={scanTrapRef}
        tabIndex={0}
        aria-hidden="true"
        onFocus={() => {
          if (!scanFocusedRef.current) {
            scanFocusedRef.current = true;
            setScanFocused(true);
          }
        }}
        onBlur={() => {
          if (scanFocusedRef.current) {
            scanFocusedRef.current = false;
            setScanFocused(false);
          }
          window.setTimeout(() => {
            if (document.visibilityState !== "visible") return;
            focusScanInput();
          }, 120);
        }}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, left: 4, top: 4 }}
      />
      <input
        ref={scanInputRef}
        type="text"
        inputMode="none"
        autoFocus={!isAndroidWebView}
        value={ean}
        onKeyDown={onScanKeyDown}
        onChange={onScanChange}
        onFocus={() => {
          if (!scanFocusedRef.current) {
            scanFocusedRef.current = true;
            setScanFocused(true);
          }
        }}
        onBlur={() => {
          if (scanFocusedRef.current) {
            scanFocusedRef.current = false;
            setScanFocused(false);
          }
          window.setTimeout(() => {
            if (document.visibilityState !== "visible") return;
            if (!scanInputRef.current) return;
            if (document.activeElement === scanInputRef.current) return;
            focusScanInput();
          }, 120);
        }}
        aria-hidden="true"
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, left: 4, top: 4 }}
        {...suppressNativeKeyboardProps}
      />
      {!scanFocused && (
        <div style={{ position: "absolute", top: 14, left: 14, zIndex: 80, pointerEvents: "auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.78)",
              border: "1px solid rgba(0,0,0,0.10)",
              boxShadow: "0 10px 28px rgba(0,0,0,0.12)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.60)" }}>
              dispositivo pronto pra consulta
            </div>
            <button
              type="button"
              onClick={() => {
                focusScanInput();
                if (!scanFocusedRef.current) {
                  scanFocusedRef.current = true;
                  setScanFocused(true);
                }
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 800,
                color: "rgba(0,0,0,0.72)",
                background: "rgba(255,255,255,0.9)",
                border: "1px solid rgba(0,0,0,0.12)",
              }}
            >
              Focar
            </button>
          </div>
        </div>
      )}
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
          <motion.div className="terminal-loading-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="terminal-loading-screen-content">
              <div className="terminal-loading-screen-badge">
                <Search className="terminal-loading-screen-icon" />
              </div>
              <div className="terminal-loading-screen-title">Consultando preço</div>
              <div className="terminal-loading-screen-text">{loadingText}</div>
              <div className="terminal-loading-screen-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div className="terminal-error-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="terminal-error-screen-content">
              <AlertTriangle className="terminal-error-screen-icon" />
              <div className="terminal-error-screen-text">{error}</div>
              <div className="terminal-error-screen-sub">Tente novamente. Se persistir, verifique a internet e a disponibilidade das APIs.</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {produto && !loading && (
          <motion.div
              key={produto.ean}
              className="terminal-product-area"
              style={{ width: "100%", maxWidth: "100%", padding: 0, margin: 0 }}
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
                const layoutKey = layout || "classico";
                const layoutParams = (() => {
                  switch (layoutKey) {
                    case "compacto":
                      return { imageWidthLandscape: 0.34, imageHeightLandscape: 0.7, imageHeightPortrait: 0.32, priceBoost: 0.92, colsLandscape: 4, colsPortrait: 3 };
                    case "cartaz":
                      return { imageWidthLandscape: 0.5, imageHeightLandscape: 0.84, imageHeightPortrait: 0.54, priceBoost: 1.18, colsLandscape: 2, colsPortrait: 2 };
                    case "vitrine":
                      return { imageWidthLandscape: 0.46, imageHeightLandscape: 0.82, imageHeightPortrait: 0.5, priceBoost: 1.12, colsLandscape: 0, colsPortrait: 0 };
                    case "painel":
                      return { imageWidthLandscape: 0.38, imageHeightLandscape: 0.76, imageHeightPortrait: 0.4, priceBoost: 1.05, colsLandscape: 3, colsPortrait: 2 };
                    case "minimalista":
                      return { imageWidthLandscape: 0.36, imageHeightLandscape: 0.72, imageHeightPortrait: 0.34, priceBoost: 1.0, colsLandscape: 0, colsPortrait: 0 };
                    default:
                      return { imageWidthLandscape: 0.4, imageHeightLandscape: 0.76, imageHeightPortrait: 0.44, priceBoost: 1.0, colsLandscape: 3, colsPortrait: 3 };
                  }
                })();
                const titleSize = clamp(35, Math.round(minDim * 0.052 * nameScale), 60);
                const restSize = clamp(18, Math.round(titleSize * 0.58), 34);
                const brandSize = clamp(12, Math.round(minDim * 0.018), 18);
                const priceReaisSize = clamp(70, Math.round(minDim * 0.14 * priceScale * layoutParams.priceBoost), 150);
                const centsSize = Math.round(priceReaisSize * 0.42);
                const containerRadius = Math.round(clamp(18, minDim * 0.03, 34));
                const imagePanelWidth = isLandscape ? Math.round(vw * layoutParams.imageWidthLandscape) : vw - padding * 2;
                const imageMaxHeightByViewport = isLandscape ? Math.round(vh * layoutParams.imageHeightLandscape) : Math.round(vh * layoutParams.imageHeightPortrait);
                const imageMaxHeight = Math.min(imageMaxHeightByViewport, imgSize || imageMaxHeightByViewport);
                const suggestionColsRaw = isLandscape ? layoutParams.colsLandscape : vw < 520 ? 2 : layoutParams.colsPortrait;
                const suggestionCols = suggestionColsRaw > 0 ? suggestionColsRaw : isLandscape ? 3 : 2;
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
                    style={{
                      marginTop: isLandscape ? gap : 0,
                      maxHeight: isLandscape ? undefined : Math.round(vh * 0.26),
                      overflow: isLandscape ? undefined : "auto",
                      paddingBottom: isLandscape ? 0 : 2,
                    }}
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
                          {typeof s.preco === "number" && (
                            <p className="terminal-suggestion-price" style={{ color: t.priceTextColor, background: t.priceContainerGradient }}>
                              R$ {s.preco.toFixed(2)}
                            </p>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                ) : null;

                const suggestionsOverlayNode = allSugestoes.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: Math.round(vh * 0.2) }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: Math.round(vh * 0.2) }}
                    transition={{ duration: 0.35, type: "spring", stiffness: 240, damping: 22 }}
                    style={{
                      position: "absolute",
                      zIndex: 30,
                      left: Math.round(clamp(0, suggestionsOverlayInset, 40)),
                      right: Math.round(clamp(0, suggestionsOverlayInset, 40)),
                      bottom: Math.round(clamp(0, suggestionsOverlayInset, 40)),
                      maxHeight: Math.round(vh * (clamp(20, suggestionsOverlayMaxPct, 60) / 100)),
                      borderRadius: Math.max(18, Math.round(containerRadius * 0.9)),
                      overflow: "hidden",
                      background: "rgba(255,255,255,0.94)",
                      backdropFilter: "blur(10px)",
                      boxShadow: `0 26px 90px ${t.priceContainerBg}38`,
                      border: `2px solid ${t.priceContainerBg}55`,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: `linear-gradient(180deg, ${t.priceContainerBg}18 0%, transparent 55%)`,
                        pointerEvents: "none",
                      }}
                    />
                    <div
                      style={{
                        height: 4,
                        width: 44,
                        borderRadius: 999,
                        background: `${t.priceContainerBg}40`,
                        alignSelf: "center",
                        marginTop: 10,
                        marginBottom: 10,
                      }}
                    />
                    <div style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 8 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "rgba(0,0,0,0.72)",
                        }}
                      >
                        {suggestionTitle}
                      </div>
                    </div>
                    <div style={{ padding: 12, paddingTop: 0, overflow: "auto" }}>
                      <div
                        className="terminal-suggestions-grid"
                        style={{
                          gridTemplateColumns: `repeat(${Math.min(3, Math.max(2, suggestionCols))}, minmax(0, 1fr))`,
                          gap: Math.max(10, Math.round(gap * 0.8)),
                        }}
                      >
                        {allSugestoes.map((s, i) => (
                          <motion.button
                            key={s.ean}
                            className="terminal-suggestion-card"
                            style={{
                              background: "rgba(255,255,255,0.96)",
                              borderColor: `${t.priceContainerBg}30`,
                              boxShadow: `0 4px 16px ${t.priceContainerBg}10`,
                            }}
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.22, delay: 0.02 + i * 0.04 }}
                            whileHover={{ scale: 1.03, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => { setEan(s.ean); consultar(s.ean); }}
                          >
                            {s.imagem_url_vtex ? (
                              <img src={s.imagem_url_vtex} alt={s.nome} className="terminal-suggestion-img" />
                            ) : (
                              <div className="terminal-suggestion-noimg"><Barcode className="w-6 h-6 text-black/15" /></div>
                            )}
                            <p className="terminal-suggestion-name" style={{ color: "#111" }}>
                              {normalizeProductName(s.nome)}
                            </p>
                            {typeof s.preco === "number" && (
                              <p className="terminal-suggestion-price" style={{ color: t.priceTextColor, background: t.priceContainerGradient }}>
                                R$ {s.preco.toFixed(2)}
                              </p>
                            )}
                          </motion.button>
                        ))}
                      </div>
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
                      height: isLandscape ? Math.round(vh - padding * 2) : undefined,
                      flex: isLandscape ? undefined : "0 0 auto",
                      borderRadius: containerRadius,
                      background: t.containerGradient,
                      boxShadow: "0 10px 40px rgba(0,0,0,0.10)",
                      padding: Math.max(16, Math.round(gap * 1.1)),
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: infoVerticalAlign === "center" ? "center" : "flex-start",
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
                      {produto.marca && (() => {
                        const bg = t.accent || t.priceContainerBg || (t.background?.[1] ?? "#c0392b");
                        const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(bg);
                        let fg = "#ffffff";
                        if (m) {
                          const rr = parseInt(m[1], 10), gg = parseInt(m[2], 10), bb = parseInt(m[3], 10);
                          fg = luminance({ r: rr, g: gg, b: bb }) > 0.22 ? "#1a1a1a" : "#ffffff";
                        }
                        return (
                          <span
                            className="terminal-desc-brand"
                            style={{
                              display: "inline-block",
                              fontSize: brandSize,
                              background: bg,
                              color: fg,
                              padding: "4px 10px",
                              borderRadius: 999,
                              boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
                            }}
                          >
                            {produto.marca}
                          </span>
                        );
                      })()}
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
                        <span className="terminal-container-price-symbol" style={{ fontSize: Math.round(priceReaisSize * 0.26) }}>
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

                const hasSuggestions = allSugestoes.length > 0;
                const imageNode = (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 0 }}
                    animate={{ opacity: 1, scale: 1, y: hasSuggestions ? (isLandscape ? -12 : -8) : 0 }}
                    transition={{ duration: 0.35, delay: 0.16, type: "spring", stiffness: 220, damping: 22 }}
                    style={{
                      width: imagePanelWidth,
                      marginRight: isLandscape && imageSide === "right" ? Math.round(clamp(0, imageMarginRight, 60)) : 0,
                      marginLeft: isLandscape && imageSide === "left" ? Math.round(clamp(0, imageMarginRight, 60)) : 0,
                      background: "#ffffff",
                      borderRadius: containerRadius,
                      boxShadow: hasSuggestions
                        ? `0 26px 80px ${t.priceContainerBg}26`
                        : "0 18px 60px rgba(0,0,0,0.12)",
                      position: "relative",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: Math.max(14, Math.round(gap)),
                      height: isLandscape ? Math.round(vh - padding * 2) : undefined,
                      flex: isLandscape ? undefined : "1 1 auto",
                      minHeight: isLandscape ? Math.round(vh - padding * 2) : Math.round(clamp(220, vh * 0.44, 520)),
                    }}
                  >
                    {(produto.imagem_url_sem_fundo || produto.imagem_url_vtex) ? (
                      <img
                        src={produto.imagem_url_sem_fundo || produto.imagem_url_vtex}
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
                    {suggestionsOverlayNode}
                  </motion.div>
                );

                if (isLandscape) {
                  const alignItems = landscapeAlign === "top" ? "flex-start" : "center";
                  const content = imageSide === "left"
                    ? (<>{imageNode}<div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{infoNode}</div></>)
                    : (<><div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{infoNode}</div>{imageNode}</>);
                  return (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        paddingLeft: padding,
                        paddingRight: padding,
                        paddingTop: padding,
                        paddingBottom: padding,
                        display: "flex",
                        gap,
                        alignItems,
                      }}
                    >
                      {content}
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
                      paddingBottom: padding,
                      display: "flex",
                      flexDirection: "column",
                      gap,
                      alignItems: "stretch",
                      overflow: "hidden",
                    }}
                  >
                    {imageNode}
                    {infoNode}
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
                    {(() => {
                      const src = idx === currentMediaIndex && offlineMediaUrl ? offlineMediaUrl : media.url;
                      return media.tipo === "imagem" ? (
                        <img src={src} alt="" className="terminal-media-content" />
                      ) : (
                        <video src={src} className="terminal-media-content" autoPlay={idx === currentMediaIndex} muted playsInline
                          onEnded={() => { if (idx === currentMediaIndex) setCurrentMediaIndex((prev) => (prev + 1) % mediaList.length); }}
                          ref={(el) => {
                            if (!el) return;
                            if (idx === currentMediaIndex) { el.play().catch(() => undefined); } else { el.pause(); el.currentTime = 0; }
                          }}
                        />
                      );
                    })()}
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

      {footerEnabled && !produto && (
        <div className="terminal-footer-hint">
          <div className="terminal-footer-inner">
            <div className="terminal-footer-left">
              {footerClockEnabled && (
                <span className="terminal-footer-clock">
                  {now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
                  {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            <div className="terminal-footer-center">
              <span className="terminal-footer-text">Consulte o preço aqui</span>
            </div>
            <div className="terminal-footer-right" />
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
