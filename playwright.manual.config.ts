import { defineConfig } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";

const files = readdirSync("tests").filter(name =>
  name.endsWith(".spec.ts") &&
  readFileSync(`tests/${name}`, "utf8").includes("manualScreenshot("),
);

export default defineConfig({
  testDir: "tests",
  globalTeardown: "./tests/manual-capture-coverage.ts",
  testMatch: files,
  grep: /@manual/,
  timeout: 30000,
  workers: 1,
  retries: 0,
  outputDir: "test-results/manual",
  snapshotPathTemplate: "{testDir}/../public/manual/images/{arg}{ext}",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/manual", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5183",
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: "en-GB",
    timezoneId: "Europe/Vienna",
    colorScheme: "dark",
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "npm run preview -- --port 5183",
    port: 5183,
    reuseExistingServer: false,
  },
});
