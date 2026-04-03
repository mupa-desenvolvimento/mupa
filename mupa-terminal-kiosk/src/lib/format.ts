export function normalizeProductName(raw: string) {
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

export function splitHighlight(text: string, count = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  return {
    highlight: words.slice(0, count).join(" "),
    rest: words.slice(count).join(" "),
  };
}

export function formatPrice(value: number) {
  const [reais, centavos] = value.toFixed(2).split(".");
  return { reais, centavos };
}
