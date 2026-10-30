/** A production offline worker must never serve development modules or Wasm. */
export async function prepareDevelopmentStartup(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return true;
  const marker = "leather-development-worker-reload";
  const scope = new URL(import.meta.env.BASE_URL, location.href).href;
  const owned = (worker: ServiceWorker | null) =>
    !!worker && new URL(worker.scriptURL).href === new URL("sw.js", scope).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    if (
      registration.scope === scope &&
      [registration.active, registration.waiting, registration.installing].some(
        owned,
      )
    ) {
      await registration.unregister();
    }
  }
  if (owned(navigator.serviceWorker.controller)) {
    if (sessionStorage.getItem(marker)) {
      throw Error(
        "An old offline worker still controls this development page. Close all tabs for this app, then reopen it. Your recovery data is unchanged.",
      );
    }
    sessionStorage.setItem(marker, "1");
    location.reload();
    return false;
  }
  sessionStorage.removeItem(marker);
  return true;
}
