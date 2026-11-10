import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";

// Reproduce Workers Static Assets HTML redirects, which Vite preview omits.
const test = base.extend<{ deployment: { origin: string } }>({
  deployment: async ({ baseURL }, use) => {
    const current = readFileSync("dist/sw.js", "utf8");
    const server = createServer(async (request, response) => {
      try {
        const path = request.url!;
        if (path === "/manual/index.html" || path === "/index.html") {
          response.writeHead(307, { Location: path === "/index.html" ? "/" : "/manual/" });
          response.end();
          return;
        }
        if (path === "/sw.js") {
          response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
          response.end(current);
          return;
        }
        if (path === "/legacy-sw.js") {
          response.writeHead(200, { "Content-Type": "text/javascript" });
          response.end(`
            const CACHE = 'leather-studio-legacy';
            self.addEventListener('install', event => event.waitUntil((async () => {
              const cache = await caches.open(CACHE);
              const manifest = await fetch('/offline-assets.json').then(r => r.json());
              await cache.addAll(['/', '/index.html', ...manifest]);
            })()));
            self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
            self.addEventListener('fetch', event => event.respondWith((async () => {
              const cache = await caches.open(CACHE);
              return await cache.match(event.request) || fetch(event.request);
            })()));
          `);
          return;
        }
        const upstream = await fetch(`${baseURL}${path === "/manual/" ? "/manual/index.html" : path}`);
        response.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream" });
        response.end(Buffer.from(await upstream.arrayBuffer()));
      } catch {
        response.writeHead(500);
        response.end();
      }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    try {
      await use({
        origin: `http://127.0.0.1:${address.port}`,
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  },
});

async function waitForController(page: Page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test("cached redirected manual supports normal navigation, Help, reload and offline articles", async ({ page, context, deployment }) => {
  await page.goto(deployment.origin);
  await waitForController(page);
  expect(await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys())[0]);
    return (await cache.match('/manual/index.html'))?.redirected;
  })).toBe(true);
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Help", exact: true }).click();
  const manual = await popup;
  await expect(manual.getByRole("heading", { name: "User manual", exact: true })).toBeVisible();
  await manual.reload();
  await expect(manual.getByRole("heading", { name: "User manual", exact: true })).toBeVisible();
  // A cache miss follows the same hosting redirect and must be safe to return too.
  expect(await manual.evaluate(async () => {
    for (const key of await caches.keys()) {
      await (await caches.open(key)).delete('/manual/index.html');
    }
    const response = await fetch('/manual/index.html');
    return { ok: response.ok, redirected: response.redirected };
  })).toEqual({ ok: true, redirected: false });
  await expect.poll(() => manual.evaluate(async () => {
    return !!await caches.match('/manual/index.html');
  })).toBe(true);
  await context.setOffline(true);
  await manual.goto(`${deployment.origin}/manual/index.html#files`);
  await expect(manual.getByRole("heading", { name: "Files, recovery and offline use", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Help", exact: true })).toBeVisible();
});

test("accepting an update replaces a legacy worker with redirected cached pages", async ({ page, deployment }) => {
  // Install the previous cache-serving behavior before the editor registers sw.js.
  await page.goto(`${deployment.origin}/manual/`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/legacy-sw.js', { scope: '/' });
  });
  await waitForController(page);
  await page.goto(deployment.origin);
  await expect(page.getByRole("button", { name: "Reload", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  // Activation may reload the page while these checks are being evaluated.
  await expect(async () => {
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${deployment.origin}/sw.js`);
    expect(await page.evaluate(async () => (await caches.keys()).some(key => key !== "leather-studio-legacy"))).toBe(true);
  }).toPass({ timeout: 10000 });
  await page.goto(`${deployment.origin}/manual/index.html#drawing`);
  await expect(page.getByRole("heading", { name: "Drawing tools", exact: true })).toBeVisible();
});
