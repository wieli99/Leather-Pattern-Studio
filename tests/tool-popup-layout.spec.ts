import { test, expect } from "@playwright/test";
test("selection toolbar follows Select mode after repeated drawing", async ({ page }) => {
  await page.goto("/");
  const rectangle = page.getByRole("button", { name: "Rectangle (R)", exact: true });
  await expect(rectangle).toBeEnabled();
  await rectangle.click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  const toolbar = page.getByRole("toolbar", { name: "Transform selection" });
  for (let count = 1; count <= 2; count++) {
    await canvas.click({ position: { x: 150 + count * 80, y: 180 } });
    await canvas.click({ position: { x: 210 + count * 80, y: 260 } });
    await expect(page.locator(".objects .object-select")).toHaveCount(count);
    await expect(toolbar).toBeVisible();
  }
  await expect(toolbar).toBeVisible();
  await canvas.press("g");
  await expect(page.locator(".transform-options").getByText("Move", { exact: true })).toBeVisible();
  await canvas.press("Escape");
  await rectangle.click();
  await canvas.focus();
  await canvas.press("i");
  await expect(page.locator(".stitch-options")).toBeVisible();
  await canvas.press("Escape");
  await rectangle.click();
  await expect(toolbar).toBeVisible();
});
test("all selection tool popups align with the right canvas edge", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "popup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 9,
        shapes: [
          {
            id: "r",
            name: "Piece",
            kind: "rectangle",
            points: [
              { x: 15, y: 20 },
              { x: 95, y: 85 },
            ],
            radius: 0,
            rotation: 0,
          },
        ],
      }),
    ),
  });
  await page.locator(".objects .object-select").first().click();
  for (const name of [
    "Move",
    "Rotate",
    "Resize",
    "Corner radius",
    "Stitch line",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    const popup = page.locator(".transform-options");
    await expect(popup).toBeVisible();
    const box = (await popup.boundingBox())!,
      canvas = (await page.getByLabel("Pattern drawing canvas").boundingBox())!;
    expect(
      Math.abs(box.x + box.width - (canvas.x + canvas.width - 12)),
    ).toBeLessThan(2);
    expect(
      Math.abs(box.y + box.height - (canvas.y + canvas.height - 28)),
    ).toBeLessThan(2);
    expect(box.height).toBeLessThanOrEqual(800 * 0.48 + 1);
    const toolbar = (await page
      .getByRole("toolbar", { name: "Transform selection" })
      .boundingBox())!;
    expect(
      Math.abs(toolbar.x + toolbar.width / 2 - (canvas.x + canvas.width / 2)),
    ).toBeLessThan(2);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
});
