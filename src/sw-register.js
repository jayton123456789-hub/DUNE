'use strict';

if ('serviceWorker' in navigator) {
  const hadControllerAtBoot = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  let waitingWorker = null;
  let reloadWhenSafe = false;
  let replacementRequested = false;

  const isSafeBoundary = () => globalThis.__DRIFTLINE__?.mode === 'menu';
  const activateWaiting = () => {
    if (!waitingWorker || waitingWorker.state !== 'installed' || !isSafeBoundary()) return;
    replacementRequested = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    // clients.claim() also emits controllerchange on the very first install.
    // That transition needs no reload because this page already loaded the
    // current files; only an actual worker replacement should refresh.
    if (!hadControllerAtBoot && !replacementRequested) return;
    if (!isSafeBoundary()) {
      reloadWhenSafe = true;
      return;
    }
    refreshing = true;
    location.reload();
  });

  window.addEventListener('driftline:safe-update', () => {
    if (reloadWhenSafe && isSafeBoundary()) {
      refreshing = true;
      location.reload();
      return;
    }
    activateWaiting();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = worker;
            activateWaiting();
          }
        });
      });
      await registration.update();
      waitingWorker = registration.waiting;
      activateWaiting();
    } catch (_) {}
  }, { once: true });
}
