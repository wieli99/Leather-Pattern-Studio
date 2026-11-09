import { manualScreenshot } from "./manual-capture";
import { expect, test } from "@playwright/test";

test("construction measurements cycle and retain typed sizes", { tag: "@manual" }, async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Rectangle (R)", exact: true })
    .click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 250, y: 200 } });
  const initialBox = (await canvas.boundingBox())!;
  await page.mouse.move(initialBox.x + 363, initialBox.y + 287);
  await canvas.press("Tab");
  const width = page.getByRole("spinbutton", { name: "Width", exact: true });
  await expect(width).toBeFocused();
  await width.pressSequentially("60");
  await width.press("Tab");
  const height = page.getByRole("spinbutton", { name: "Height", exact: true });
  await expect(height).toBeFocused();
  await height.pressSequentially("40");
  for (let i = 0; i < 3; i++) {
    await height.press("Tab");
    await expect(width).toBeFocused();
    await width.pressSequentially("60");
    await expect(width).toHaveValue("60");
    await width.press("Shift+Tab");
    await expect(height).toBeFocused();
    await height.pressSequentially("40");
    await expect(height).toHaveValue("40");
  }
  await height.press("Shift+Tab");
  await expect(width).toBeFocused();
  await width.press("Tab");
  await expect(height).toBeFocused();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 550, box.y + 400);
  await expect(width).toHaveValue("60");
  await expect(height).toHaveValue("40");
  await manualScreenshot(page, "construction-dimensions.png");
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

test("center rectangle displays separate dimensions before sizing", { tag: "@manual" }, async ({ page }, info) => {
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
  await manualScreenshot(page, "center-rectangle-measurements.png");
});

for (const variant of ["Three-point rectangle", "Center ellipse"]) {
  for (const typed of [false, true]) {
    test(`${variant} confirms ${typed ? "typed" : "pointer-derived"} negative height with Enter`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: variant === "Three-point rectangle" ? "Rectangle (R)" : "Circle (C)", exact: true }).click({ button: "right" });
      await page.getByRole("menuitemradio", { name: variant, exact: true }).click();
      const canvas = page.getByLabel("Pattern drawing canvas");
      await canvas.click({ position: { x: 250, y: 350 } });
      await canvas.click({ position: { x: 450, y: 350 } });
      const box = (await canvas.boundingBox())!;
      await page.mouse.move(box.x + 450, box.y + 250);
      await canvas.press("Tab");
      const height = page.getByRole("spinbutton", { name: "Height", exact: true });
      await expect(height).toBeFocused();
      expect(Number(await height.inputValue())).toBeLessThan(0);
      if (typed) {
        await height.fill("0");
        await height.press("Enter");
        await expect(page.getByRole("alert")).toHaveText("Enter a nonzero finite measurement");
        await expect(page.locator(".objects .object-select")).toHaveCount(0);
        await height.fill("-20");
      }
      await height.press("Enter");
      await expect(page.locator(".objects .object-select")).toHaveCount(1);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.locator(".objects .object-select")).toHaveCount(0);
    });
  }
}

for (const variant of ["Three-point rectangle", "Three-point circle"]) {
  test(`${variant} construction guide`, { tag: "@manual" }, async ({ page }, info) => {
    await page.goto("/");
    await page.getByRole("button", { name: variant === "Three-point rectangle" ? "Rectangle (R)" : "Circle (C)", exact: true }).click({ button: "right" });
    await page.getByRole("menuitemradio", { name: variant, exact: true }).click();
    const canvas = page.getByLabel("Pattern drawing canvas");
    await canvas.click({ position: { x: 250, y: 350 } });
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 450, box.y + 250);
    const image = variant === "Three-point rectangle" ? "three-point-rectangle-guide.png" : "three-point-circle-guide.png";
    if (variant === "Three-point rectangle")
      await manualScreenshot(page, "three-point-rectangle-guide.png");
    else
      await manualScreenshot(page, "three-point-circle-guide.png");
    await page.screenshot({ path: info.outputPath(image) });
    await canvas.click({ position: { x: 450, y: 250 } });
    await page.mouse.move(box.x + 450, box.y + 450);
    await expect(page.locator(".objects .object-select")).toHaveCount(0);
    await canvas.press("Escape");
    await expect(page.locator(".construction-measurements input")).toHaveCount(0);
  });
}

test("first construction wheel adjustment preserves editable precision", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 250, y: 200 } });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 363, box.y + 287);
  const width = page.locator(".construction-measurements input").first();
  await expect(width).toBeVisible();
  // Read the full precision exposed by focus, then restore the rounded display.
  const original = await width.evaluate(el => {
    const input = el as HTMLInputElement;
    input.focus();
    const value = Number(input.value);
    input.blur();
    return value;
  });
  await expect(width).not.toBeFocused();
  await width.evaluate(el => el.dispatchEvent(new WheelEvent("wheel", {
    altKey: true, deltaY: -100, bubbles: true, cancelable: true,
  })));
  await expect(width).toBeFocused();
  expect(Number(await width.inputValue())).toBeCloseTo(original + 1, 10);
});
