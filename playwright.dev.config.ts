import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig(config, {
  testIgnore: [],
  testMatch: ["manual-loading.spec.ts", "dxf.spec.ts"],
  use: { baseURL: "http://127.0.0.1:5186" },
  webServer: {
    command: "npm run dev -- --port 5186 --force",
    port: 5186,
    reuseExistingServer: false,
  },
});
