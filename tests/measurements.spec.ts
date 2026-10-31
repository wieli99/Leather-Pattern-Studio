import { expect, test } from "@playwright/test";

test("construction measurements cycle and retain typed sizes", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Rectangle (R)", exact: true })
    .click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 250, y: 200 } });
  await canvas.press("Tab");
  const width = page.getByRole("spinbutton", { name: "Width", exact: true });
  await expect(width).toBeFocused();
  await width.fill("60");
  await width.press("Tab");
  const height = page.getByRole("spinbutton", { name: "Height", exact: true });
  await expect(height).toBeFocused();
  await height.fill("40");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 550, box.y + 400);
  await expect(width).toHaveValue("60");
  await expect(height).toHaveValue("40");
  await page.screenshot({
    path: info.outputPath("construction-measurements.png"),
  });
  await height.press("Enter");
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("60");
  await expect(page.getByLabel("Height", { exact: true })).toHaveValue("40");
});

test("anchor toggles share state and remain undoable", async ({ page }) => {
  await page.goto("/");
  const tool = page.getByRole("button", { name: "Polyline (P)", exact: true });
  await tool.click({ button: "right" });
  await page
    .getByRole("menuitemradio", { name: "Control point curve", exact: true })
    .click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  for (const point of [
    { x: 230, y: 250 },
    { x: 380, y: 340 },
    { x: 530, y: 250 },
  ])
    await canvas.click({ position: point });
  await canvas.press("Enter");
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await page.getByText("Vertex coordinates", { exact: true }).click();
  const group = page.getByRole("group", {
    name: "Vertex 2 corner type",
    exact: true,
  });
  const sharp = group.getByRole("button", { name: "Sharp", exact: true });
  const smooth = group.getByRole("button", { name: "Smooth", exact: true });
  await expect(sharp).toHaveAttribute("aria-pressed", "true");
  await smooth.click();
  await expect(smooth).toHaveAttribute("aria-pressed", "true");
  await canvas.dblclick({ position: { x: 380, y: 340 } });
  await expect(sharp).toHaveAttribute("aria-pressed", "true");
  await canvas.dblclick({ position: { x: 380, y: 340 } });
  await expect(smooth).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(sharp).toHaveAttribute("aria-pressed", "true");
});

test("center rectangle displays separate dimensions before sizing", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).click({ button: "right" });
  await page.getByRole("menuitemradio", { name: "Center rectangle", exact: true }).click();
  await page.getByLabel("Pattern drawing canvas").click({ position: { x: 350, y: 300 } });
  const width = page.locator(".construction-measurements label").filter({ has: page.getByRole("spinbutton", { name: "Width", exact: true }) });
  const height = page.locator(".construction-measurements label").filter({ has: page.getByRole("spinbutton", { name: "Height", exact: true }) });
  await expect(width).toBeVisible();
  await expect(height).toBeVisible();
  const a = (await width.boundingBox())!;
  const b = (await height.boundingBox())!;
  expect(a.x + a.width + 8 <= b.x || b.x + b.width + 8 <= a.x || a.y + a.height + 8 <= b.y || b.y + b.height + 8 <= a.y).toBe(true);
  await page.screenshot({ path: info.outputPath("center-rectangle-measurements.png") });
});
