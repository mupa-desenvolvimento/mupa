import { useEffect, useCallback } from "react";

/**
 * Hook that requests fullscreen mode on user interaction
 * and keeps the screen awake via Wake Lock API.
 */
export function useFullscreen(enabled = true) {
  const requestFullscreen = useCallback(() => {
    if (!enabled) return;
    const el = document.documentElement;
    if (document.fullscreenElement) return;
    el.requestFullscreen?.().catch(() => {});
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    // Request fullscreen on first user interaction
    const handler = () => {
      requestFullscreen();
      // Remove after first successful trigger
      window.removeEventListener("click", handler);
      window.removeEventListener("touchstart", handler);
      window.removeEventListener("keydown", handler);
    };

    window.addEventListener("click", handler, { once: false });
    window.addEventListener("touchstart", handler, { once: false });
    window.addEventListener("keydown", handler, { once: false });

    // Auto-request if page was opened in standalone mode (PWA installed)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      requestFullscreen();
    }

    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("touchstart", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [enabled, requestFullscreen]);

  // Wake Lock to prevent screen from sleeping
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {}
    };

    acquire();

    // Re-acquire on visibility change (e.g. after tab switch)
    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      lock?.release().catch(() => {});
    };
  }, [enabled]);

  return { requestFullscreen };
}
