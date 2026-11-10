import { manualScreenshot } from "./manual-capture";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("text is created and edited on canvas without dialogs", async ({
  page,
}) => {
  page.on("dialog", () => {
    throw Error("Unexpected text dialog");
  });
  await page.goto("/");
  const tool = page.getByRole("button", { name: "Text (T)", exact: true });
  await expect(tool).toBeEnabled();
  await tool.click();
  await expect(tool.locator("svg circle")).toHaveCount(0);
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.hover({ position: { x: 240, y: 240 } });
  await expect(canvas).toHaveCSS("cursor", "none");
  await canvas.click({ position: { x: 240, y: 240 } });
  const input = page.getByRole("textbox", { name: "Label text", exact: true });
  await expect(input).toBeFocused();
  const initial = (await input.boundingBox())!;
  const canvasBox = (await canvas.boundingBox())!;
  expect(
    Math.abs(initial.y + initial.height / 2 - (canvasBox.y + 240)),
  ).toBeLessThan(2);
  await input.fill("Front\nLeather");
  const grown = (await input.boundingBox())!;
  expect(grown.width).toBeGreaterThan(initial.width);
  expect(grown.height).toBeGreaterThan(initial.height);
  await input.press("Control+Enter");
  await expect(input).toHaveCount(0);
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await canvas.dblclick({ position: { x: 245, y: 245 } });
  await expect(input).toHaveValue("Front\nLeather");
  await input.fill("Back");
  await input.press("Escape");
  await canvas.dblclick({ position: { x: 245, y: 245 } });
  await expect(input).toHaveValue("Front\nLeather");
  await input.fill("Back");
  await input.press("Control+Enter");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await canvas.dblclick({ position: { x: 245, y: 245 } });
  await expect(input).toHaveValue("Front\nLeather");
});

test("font size updates text dimensions and undo restores them", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Text (T)", exact: true }).click();
  await page.getByLabel("Pattern drawing canvas").click({ position: { x: 240, y: 240 } });
  const input = page.getByRole("textbox", { name: "Label text", exact: true });
  await input.fill("Front\nLeather");
  await input.press("Control+Enter");
  await page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
  });
  async function dimensions() {
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const path = (await (await downloading).path())!;
    const project = JSON.parse(await readFile(path, "utf8"));
    const [a, b] = project.shapes[0].points;
    return { width: b.x - a.x, height: b.y - a.y };
  }
  const original = await dimensions();
  const size = page.getByLabel("Font size", { exact: true });
  await size.fill("10");
  await size.press("Enter");
  const enlarged = await dimensions();
  expect(enlarged.width).toBeCloseTo(original.width * 2, 1);
  expect(enlarged.height).toBeCloseTo(original.height * 2, 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(size).toHaveValue("5");
  expect(await dimensions()).toEqual(original);
});

test("whole label formatting survives inline editing and undo @manual", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Text (T)", exact: true }).click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 240, y: 240 } });
  const input = page.getByRole("textbox", { name: "Label text", exact: true });
  await input.fill("Front\nLeather");
  await input.press("Control+Enter");
  await page.getByLabel("Font", { exact: true }).selectOption("serif");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await page.getByRole("button", { name: "Underline", exact: true }).click();
  await page.getByRole("button", { name: "Strikethrough", exact: true }).click();
  await page.getByLabel("Alignment", { exact: true }).selectOption("center");
  const spacing = page.getByLabel("Line spacing", { exact: true });
  await spacing.fill("1.8");
  await spacing.press("Enter");
  await expect(page.getByRole("status").first()).toHaveText("Ready");
  await manualScreenshot(page, "text-formatting.png");
  await canvas.dblclick({ position: { x: 245, y: 245 } });
  await expect(input).toHaveCSS("font-family", "PatternSerif");
  await expect(input).toHaveCSS("font-weight", "700");
  await expect(input).toHaveCSS("font-style", "italic");
  await input.fill("Back\nLeather");
  await input.press("Control+Enter");
  await expect(page.getByRole("button", { name: "Bold", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Font", { exact: true })).toHaveValue("serif");
});
