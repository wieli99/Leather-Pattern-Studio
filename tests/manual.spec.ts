import { test, expect } from "@playwright/test";
test("manual navigation, search, links and offline articles", async ({
  page,
  context,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Help", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Help", exact: true }).click();
  const manual = await popup;
  await expect(
    manual.getByRole("heading", { name: "User manual", exact: true }),
  ).toBeVisible();
  await manual.getByRole("searchbox").fill("pivot");
  await expect(
    manual.getByRole("region", { name: "Search results" }),
  ).toContainText("Move, rotate and resize");
  await manual.getByRole("searchbox").fill("nothingmatches123");
  await expect(manual.getByText("No matching articles.")).toBeVisible();
  await manual.goto("/manual/index.html#drawing");
  await expect(
    manual.getByRole("heading", { name: "Drawing tools", exact: true }),
  ).toBeVisible();
  await manual.screenshot({ path: info.outputPath("manual-desktop.png") });
  await manual.setViewportSize({ width: 390, height: 844 });
  await manual.screenshot({ path: info.outputPath("manual-narrow.png") });
  await context.setOffline(true);
  await manual.goto("/manual/index.html#files");
  await expect(
    manual.getByRole("heading", {
      name: "Files, recovery and offline use",
      exact: true,
    }),
  ).toBeVisible();
  for (const name of ["workspace", "tool-variants", "transforms"]) {
    expect(
      await manual.evaluate(
        async (name) => (await fetch(`/manual/images/${name}.png`)).ok,
        name,
      ),
    ).toBe(true);
  }
  await manual.goto("/manual/index.html#unknown");
  await expect(
    manual.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await context.setOffline(false);
});

test("canvas help preserves unfinished drawing", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.focus();
  await page.keyboard.press("r");
  await canvas.click({ position: { x: 150, y: 180 } });
  const popup = page.waitForEvent("popup");
  await page.keyboard.press("?");
  const manual = await popup;
  await expect(manual).toHaveURL(/manual\/index.html/);
  await manual.close();
  await expect(page.locator(".inspector-hint")).toContainText(
    "Click the opposite corner.",
  );
  await canvas.click({ position: { x: 350, y: 300 } });
  await expect(page.locator(".objects button")).toHaveCount(1);
});
