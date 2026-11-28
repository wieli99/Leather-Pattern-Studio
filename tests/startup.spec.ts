import { test, expect } from "@playwright/test";
test("new projects open on an empty canvas", async ({ page }, info) => {
  await page.goto("/");
  const canvas = page.getByLabel("Pattern drawing canvas");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  await expect(canvas).toBeVisible();
  await expect(page.locator(".objects .object-select")).toHaveCount(0);
  await expect(
    page.getByText("Start with a shape.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Draw a rectangle" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("empty-canvas.png") });
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).click();
  await canvas.click({ position: { x: 150, y: 180 } });
  await canvas.click({ position: { x: 350, y: 300 } });
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(0);
  await expect(page.locator(".empty")).toHaveCount(0);
});

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
test("startup failure shows the error and where it happened", async ({ page }) => {
  const logged: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") logged.push(message.text());
  });
  await page.addInitScript(() => {
    function failStartup(): never {
      throw new Error("Simulated startup failure");
    }
    document.fonts.load = () => Promise.resolve().then(failStartup);
  });
  await page.goto("/");
  const alert = page.locator("#root[role=alert]");
  await expect(alert).toContainText("Simulated startup failure");
  await expect(alert.locator(".startup-error-stack")).toContainText("failStartup");
  expect(logged.some((text) => text.includes("Editor startup failed"))).toBe(true);
});
