import { test, expect } from "@playwright/test";
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
  await page.locator(".objects button").first().click();
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
      Math.abs(box.y + box.height - (canvas.y + canvas.height - 12)),
    ).toBeLessThan(2);
    expect(box.height).toBeLessThanOrEqual(800 * 0.48 + 1);
    const toolbar = (await page
      .getByRole("toolbar", { name: "Transform selection" })
      .boundingBox())!;
    expect(
      Math.abs(toolbar.x + toolbar.width / 2 - (canvas.x + canvas.width / 2)),
    ).toBeLessThan(2);
    if (
      info.project.name === "chromium" &&
      process.env.UPDATE_MANUAL_SCREENSHOTS === "1" &&
      (name === "Move" || name === "Corner radius")
    )
      await page.screenshot({
        path: `public/manual/images/${name === "Move" ? "transforms" : "corner-radii"}.png`,
      });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
});
