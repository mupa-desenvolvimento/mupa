import { registerSW } from "virtual:pwa-register";

/** Chamado após o novo service worker estar pronto — recarrega a página com a nova versão. */
let applyWaitingServiceWorker: (reload?: boolean) => Promise<void> = async () => {};

export const PWA_UPDATE_EVENT = "mupa-pwa-update-available";

export function initServiceWorkerRegistration() {
  applyWaitingServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent(PWA_UPDATE_EVENT));
    },
  });
}

export function applyPwaUpdate() {
  return applyWaitingServiceWorker(true);
}
