import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mupa:favoritos";

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useFavoritos() {
  const [favoritos, setFavoritos] = useState<string[]>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFavoritos(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: string[]) => {
    setFavoritos(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const isFavorito = useCallback(
    (ean: string) => favoritos.includes(ean),
    [favoritos]
  );

  const toggleFavorito = useCallback(
    (ean: string) => {
      if (!ean) return;
      const exists = favoritos.includes(ean);
      persist(exists ? favoritos.filter((e) => e !== ean) : [...favoritos, ean]);
    },
    [favoritos, persist]
  );

  return { favoritos, isFavorito, toggleFavorito };
}
