import { manualScreenshot } from "./manual-capture";
import { test, expect } from "@playwright/test";
test(
  "properties follows the selection",
  { tag: "@manual" },
  async ({ page }, info) => {
    await page.goto("/");
    const rectangle = page.getByRole("button", {
      name: "Rectangle (R)",
      exact: true,
    });
    await expect(rectangle).toBeEnabled();
    const properties = page.getByRole("heading", {
      name: "Properties",
      exact: true,
    });
    await expect(properties).toHaveCount(0);
    await expect(page.locator(".object-properties")).toHaveCount(0);
    await manualScreenshot(page, "empty-canvas.png");
    await rectangle.click();
    const canvas = page.getByLabel("Pattern drawing canvas");
    await canvas.click({ position: { x: 150, y: 180 } });
    await canvas.click({ position: { x: 300, y: 280 } });
    await expect(properties).toBeVisible();
    await expect(page.locator(".object-properties")).toBeVisible();
    await canvas.focus();
    await page.keyboard.press("Escape");
    await canvas.click({ position: { x: 450, y: 380 } });
    await expect(properties).toHaveCount(0);
    await expect(page.locator(".object-properties")).toHaveCount(0);
    await expect(page.locator("aside .inspector-hint")).toBeVisible();
    await page.screenshot({
      path: info.outputPath("no-selection-properties.png"),
    });
  },
);

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
  await expect(hint).toContainText("Add or remove objects from selection");
  await expect(hint).toContainText("Select crossing outlines");
});

test("array field, select and button focus show the appropriate help", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Rectangle (R)", exact: true })
    .click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 480, y: 300 } });
  await canvas.click({ position: { x: 530, y: 340 } });
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await page.getByRole("button", { name: "Search tools", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search tools", exact: true })
    .fill("Rectangular Array");
  await page
    .getByRole("button", { name: "Rectangular Array", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Rectangular Array settings",
  });
  const help = page.locator("aside .inspector-hint");
  await expect(help).toContainText("Snap direction to 45°");
  await panel.getByLabel("Number", { exact: true }).focus();
  await expect(help).toContainText("Enter a value.");
  await expect(help).toContainText("Confirm point");
  await expect(help).toContainText("Alt+scroll");
  await expect(help).not.toContainText("Constrain axis");
  await panel.getByLabel("Mode", { exact: true }).focus();
  await expect(help).toContainText("Constrain axis");
  await canvas.click({ position: { x: 150, y: 320 } });
  const cancel = panel.getByRole("button", { name: "Cancel", exact: true });
  await cancel.focus();
  await expect(help).toContainText("Activate button");
  await expect(help).not.toContainText("Enter a value.");
  await cancel.press("Enter");
  await expect(panel).toBeHidden();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
});

test("transform Cancel retains native Enter activation", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Rectangle (R)", exact: true })
    .click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 150, y: 180 } });
  await canvas.click({ position: { x: 300, y: 280 } });
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  const panel = page.locator(".transform-options");
  const cancel = panel.getByRole("button", { name: "Cancel", exact: true });
  await cancel.focus();
  await cancel.press("Enter");
  await expect(panel).toBeHidden();
});

test("submitting a transform field restores canvas help after the panel closes", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Rectangle (R)", exact: true })
    .click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 150, y: 180 } });
  await canvas.click({ position: { x: 300, y: 280 } });
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  const field = page.getByLabel("X (mm)", { exact: true });
  await field.fill("5");
  const help = page.locator("aside .inspector-hint");
  await expect(help).toContainText("Enter a value.");
  await field.press("Enter");
  await expect(page.locator(".transform-options")).toBeHidden();
  await expect(help).toContainText("Choose Move");
  await expect(help).not.toContainText("Enter a value.");
});
