import { createHash } from "node:crypto";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
export default defineConfig({
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
        writeFileSync(
          "dist/sw.js",
          sw.replace(
            "leather-studio-v3",
            "leather-studio-" +
              createHash("sha256")
                .update(
                  html +
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
