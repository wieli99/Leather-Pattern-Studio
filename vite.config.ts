import { createHash } from "node:crypto";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
export default defineConfig({
  // Container-local storage survives installs into the shared dependency volume.
  cacheDir: process.env.VITE_CACHE_DIR ?? "node_modules/.vite",
  define: {
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version),
  },
  // The manual opens in a separate tab; prepare its dependency before that tab loads.
  optimizeDeps: { include: ["markdown-it"] },
  plugins: [
    vue(),
    {
      name: "offline-manifest",
      closeBundle() {
        const html =
          readFileSync("dist/index.html", "utf8") +
          readFileSync("dist/manual/index.html", "utf8");
        const assets = [
          ...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g),
        ].map((m) => m[1]);
        // Worker and Wasm assets must also be available before the user goes offline.
        const sw = readFileSync("dist/sw.js", "utf8");
        if (!sw.includes("__BUILD_HASH__"))
          throw Error("Missing service worker build hash placeholder");
        writeFileSync(
          "dist/sw.js",
          sw.replace(
            "__BUILD_HASH__",
            createHash("sha256")
              .update(
                sw + html +
                  readdirSync("dist/assets")
                    .sort()
                    .map((f) =>
                      readFileSync("dist/assets/" + f).toString("base64"),
                    )
                    .join("") +
                  readdirSync("dist/manual/images")
                    .sort()
                    .map((f) =>
                      readFileSync("dist/manual/images/" + f).toString(
                        "base64",
                      ),
                    )
                    .join(""),
              )
              .digest("hex")
              .slice(0, 12),
          ),
        );
        writeFileSync(
          "dist/offline-assets.json",
          JSON.stringify([
            ...new Set([
              "/manual/index.html",
              ...readdirSync("dist/manual/images").map(
                (f) => "/manual/images/" + f,
              ),
              ...assets,
              ...readdirSync("dist/assets").map((f) => "/assets/" + f),
            ]),
          ]),
        );
      },
    },
  ],
  build: {
    rollupOptions: {
      input: { editor: "index.html", manual: "manual/index.html" },
    },
  },
  worker: { format: "es" },
});
