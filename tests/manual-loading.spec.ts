import { test, expect } from "@playwright/test";

test("manual loads directly in standards mode without module errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/manual/index.html");
  await expect(
    page.getByRole("heading", { name: "User manual", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.compatMode)).toBe("CSS1Compat");
  expect(errors).toEqual([]);
});

test("manual opens after visiting the editor with JavaScript module responses", async ({ page }) => {
  const errors: string[] = [];
  const modules: string[] = [];
  page.on("console", message => {
    if (message.type() === "error" && message.text().includes("file:///")) errors.push(message.text());
  });
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (!/markdown[-_]it.*\.js/.test(response.url())) return;
    modules.push(response.url());
    if (!response.ok() || !/javascript/.test(response.headers()["content-type"] ?? "")) {
      errors.push(`${response.status()} ${response.headers()["content-type"]} ${response.url()}`);
    }
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Rectangle (R)", exact: true })).toBeEnabled();
  await page.goto("/manual/index.html");
  await expect(page.getByRole("heading", { name: "User manual", exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("Tab");
  await expect(page.getByRole("region", { name: "Search results" })).toContainText("Measurements and snapping");
  // Production bundles do not retain dependency filenames; dev requests do.
  if (process.env.VITE_CACHE_DIR && modules.length) expect(modules.every(url => !url.includes("/node_modules/.vite/"))).toBe(true);
  expect(errors).toEqual([]);
});
