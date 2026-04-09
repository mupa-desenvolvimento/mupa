import ImageColors from "react-native-image-colors";
import { Platform } from "react-native";

export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };

export type ProductTheme = {
  primary: string;
  secondary: string;
  accent: string;
  background: [string, string, string];
  textColor: string;
  textMuted: string;
  containerGradient: [string, string];
  priceGradient: [string, string];
};

export function clamp(min: number, value: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function hexToRgb(hex: string): RGB {
  const v = hex.replace("#", "").trim();
  const norm = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  const n = parseInt(norm, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB) {
  const to = (x: number) => x.toString(16).padStart(2, "0");
  return `#${to(clamp(0, Math.round(r), 255))}${to(clamp(0, Math.round(g), 255))}${to(clamp(0, Math.round(b), 255))}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rr:
      h = (gg - bb) / d + (gg < bb ? 6 : 0);
      break;
    case gg:
      h = (bb - rr) / d + 2;
      break;
    default:
      h = (rr - gg) / d + 4;
      break;
  }
  h /= 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
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

export function luminance({ r, g, b }: RGB) {
  const toLinear = (x: number) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function makeVivid(rgb: RGB): RGB {
  const hsl = rgbToHsl(rgb);
  const boostedS = clamp(55, Math.max(hsl.s, 72) * 1.08, 95);
  const boostedL = clamp(28, hsl.l > 82 ? 66 : hsl.l < 18 ? 30 : hsl.l, 75);
  return hslToRgb({ h: hsl.h, s: boostedS, l: boostedL });
}

function darken({ r, g, b }: RGB, factor: number): RGB {
  return { r: Math.round(r * factor), g: Math.round(g * factor), b: Math.round(b * factor) };
}

function lighten({ r, g, b }: RGB, factor: number): RGB {
  return {
    r: Math.round(r + (255 - r) * factor),
    g: Math.round(g + (255 - g) * factor),
    b: Math.round(b + (255 - b) * factor),
  };
}

export async function extractThemeFromImage(uri: string): Promise<ProductTheme | null> {
  try {
    const colors = await ImageColors.getColors(uri, {
      fallback: "#c0392b",
      cache: true,
      key: uri,
    });

    const picks: string[] = [];
    if (Platform.OS === "android" && colors.platform === "android") {
      if (colors.dominant) picks.push(colors.dominant);
      if (colors.vibrant) picks.push(colors.vibrant);
      if (colors.average) picks.push(colors.average);
      if (colors.muted) picks.push(colors.muted);
      if (colors.lightVibrant) picks.push(colors.lightVibrant);
    } else if (colors.platform === "ios") {
      if (colors.primary) picks.push(colors.primary);
      if (colors.secondary) picks.push(colors.secondary);
      if (colors.detail) picks.push(colors.detail);
      if (colors.background) picks.push(colors.background);
    } else if (colors.platform === "web") {
      if (colors.vibrant) picks.push(colors.vibrant);
      if (colors.dominant) picks.push(colors.dominant);
    }

    const unique = [...new Set(picks.filter(Boolean))].slice(0, 3);
    const base = unique.length >= 3 ? unique : [...unique, "#c0392b", "#8e44ad", "#e74c3c"].slice(0, 3);

    const primary = makeVivid(hexToRgb(base[0]));
    const secondary = makeVivid(hexToRgb(base[1]));
    const accent = makeVivid(hexToRgb(base[2]));

    const bg1 = lighten(primary, 0.94);
    const bg2 = lighten(secondary, 0.95);
    const bg3 = lighten(accent, 0.96);

    const textColor = "#1a1a1a";
    const textMuted = "rgba(0,0,0,0.55)";

    const containerA = lighten(primary, 0.78);
    const containerB = lighten(primary, 0.88);

    const secDark = darken(secondary, 0.78);

    return {
      primary: rgbToHex(primary),
      secondary: rgbToHex(secondary),
      accent: rgbToHex(accent),
      background: [rgbToHex(bg1), rgbToHex(bg2), rgbToHex(bg3)],
      textColor,
      textMuted,
      containerGradient: [rgbToHex(containerA), rgbToHex(containerB)],
      priceGradient: [rgbToHex(secondary), rgbToHex(secDark)],
    };
  } catch {
    return null;
  }
}

export function pickTextColor(bg: string) {
  const lum = luminance(hexToRgb(bg));
  return lum > 0.22 ? "#1a1a1a" : "#ffffff";
}
