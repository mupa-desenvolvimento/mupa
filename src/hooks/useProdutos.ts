import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ProdutosFilter {
  q?: string;
  marca?: string;
  categoria_id?: string;
  disponivel?: boolean;
  com_imagem?: boolean;
  promo?: boolean;
  eans?: string[];
  favorito_atacado?: boolean;
  page?: number;
  per_page?: number;
}

// ---------- Cache local (localStorage) com expiração ----------
// Mantém a última resposta bem-sucedida por combinação de filtros para que o
// catálogo continue exibindo produtos mesmo com backend lento/instável.
const CACHE_PREFIX = "mupa:produtos:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_MAX_ENTRIES = 40;

interface CachedEntry<T> {
  ts: number;
  data: T;
}

function cacheKey(filters: ProdutosFilter): string {
  return CACHE_PREFIX + JSON.stringify(filters);
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry<T>;
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T): void {
  try {
    const entry: CachedEntry<T> = { ts: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(entry));
    pruneCache();
  } catch {
    // Quota excedida — limpa entradas antigas e ignora.
    pruneCache(true);
  }
}

function pruneCache(force = false): void {
  try {
    const keys: { k: string; ts: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(CACHE_PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(k) || "{}");
        if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL_MS) {
          localStorage.removeItem(k);
          continue;
        }
        keys.push({ k, ts: parsed.ts });
      } catch {
        localStorage.removeItem(k);
      }
    }
    if (force || keys.length > CACHE_MAX_ENTRIES) {
      keys
        .sort((a, b) => a.ts - b.ts)
        .slice(0, Math.max(0, keys.length - CACHE_MAX_ENTRIES))
        .forEach((e) => localStorage.removeItem(e.k));
    }
  } catch {
    // ignore
  }
}

export function useProdutos(filters: ProdutosFilter) {
  const { page = 1, per_page = 20 } = filters;
  const key = cacheKey(filters);

  return useQuery({
    queryKey: ["produtos", filters],
    queryFn: async () => {
      try {
        let query = supabase
          .from("produtos")
          .select("*", { count: "estimated" });

        if (filters.q) {
          query = query.or(
            `nome.ilike.%${filters.q}%,ean.ilike.%${filters.q}%,marca.ilike.%${filters.q}%`
          );
        }
        if (filters.marca) query = query.ilike("marca", `%${filters.marca}%`);
        if (filters.categoria_id) query = query.eq("categoria_id", filters.categoria_id);
        if (filters.disponivel !== undefined) query = query.eq("disponivel", filters.disponivel);
        if (filters.com_imagem !== undefined) query = query.eq("imagem_baixada", filters.com_imagem);
        if (filters.promo) query = query.not("preco_lista", "is", null).gt("preco_lista", 0);
        if (filters.eans) {
          if (filters.eans.length === 0) {
            return { produtos: [], total: 0, page, per_page, totalPages: 0, fromCache: false };
          }
          query = query.in("ean", filters.eans);
        }
        if (filters.favorito_atacado) query = query.eq("favorito_atacado", true);

        const from = (page - 1) * per_page;
        const to = from + per_page - 1;
        query = query.order("nome").range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;

        const result = {
          produtos: data ?? [],
          total: count ?? 0,
          page,
          per_page,
          totalPages: Math.ceil((count ?? 0) / per_page),
          fromCache: false,
        };
        writeCache(key, result);
        return result;
      } catch (err) {
        // Backend indisponível/lento — devolve cache se houver.
        const cached = readCache<{
          produtos: any[];
          total: number;
          page: number;
          per_page: number;
          totalPages: number;
        }>(key);
        if (cached) {
          console.warn("[useProdutos] usando cache local após falha:", err);
          return { ...cached, fromCache: true };
        }
        throw err;
      }
    },
    placeholderData: (prev) => prev ?? (readCache(key) as any) ?? undefined,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useProdutoByEan(ean: string | null) {
  return useQuery({
    queryKey: ["produto", ean],
    queryFn: async () => {
      if (!ean) return null;
      const { data, error } = await supabase
        .from("produtos")
        .select("*")
        .eq("ean", ean)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!ean,
    staleTime: 60_000,
  });
}
