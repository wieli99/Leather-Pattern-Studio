import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  // Source-module checks run against Vite in playwright.dev.config.ts.
  testIgnore: "dxf.spec.ts",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5183",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "npm run preview -- --port 5183",
    port: 5183,
    reuseExistingServer: false,
  },
});
