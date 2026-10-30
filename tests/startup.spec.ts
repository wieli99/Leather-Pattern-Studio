import { test, expect } from "@playwright/test";
test("worker failure replaces startup message", async ({ page }) => {
  await page.route(/editor-worker.*\.js/, (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".loading")).toContainText(
    /worker failed|did not respond/i,
    { timeout: 20000 },
  );
  await expect(page.locator(".loading")).not.toContainText(
    "Starting geometry engine",
  );
});
