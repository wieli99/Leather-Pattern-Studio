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
