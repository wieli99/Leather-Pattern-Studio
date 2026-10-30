import { test, expect } from "@playwright/test";
test("inspector owns contextual guidance", async ({ page }, info) => {
  await page.goto("/");
  const canvas = page.getByLabel("Pattern drawing canvas");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  const hint = page.locator("aside .inspector-hint");
  await expect(hint).toContainText("Click an edge or drag to select.");
  await canvas.focus();
  await page.keyboard.press("r");
  await canvas.click({ position: { x: 150, y: 180 } });
  await expect(hint).toContainText("Click the opposite corner.");
  await page.screenshot({
    path: info.outputPath("inspector-drawing-hint.png"),
  });
  await page.keyboard.press("Escape");
  await expect(hint).toContainText("Click an edge or drag to select.");
  await expect(page.locator(".construction-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "Hide inspector" }).click();
  await expect(hint).toHaveCount(0);
});

test("select guidance includes anchor insertion and modifiers", async ({
  page,
}) => {
  await page.goto("/");
  const hint = page.locator("aside .inspector-hint");
  await expect(hint).toContainText("Alt+click edge");
  await expect(hint).toContainText("Add anchor");
  await expect(hint).toContainText("Toggle selection");
  await expect(hint).toContainText("Select crossing outlines");
});
