import { test, expect } from "@playwright/test";

test("closed polygons expose tangent rounded corners", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const shapes = [
    [
      { x: 20, y: 20 },
      { x: 70, y: 20 },
      { x: 45, y: 65 },
      { x: 20, y: 20 },
    ],
    [
      { x: 90, y: 20 },
      { x: 140, y: 20 },
      { x: 140, y: 65 },
      { x: 90, y: 65 },
      { x: 90, y: 20 },
    ],
  ].map((points, i) => ({
    id: String(i),
    name: "Polygon " + i,
    kind: "polyline",
    points,
    radius: 0,
    rotation: 0,
  }));
  await (
    await chooser
  ).setFiles({
    name: "polygons.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 5, shapes })),
  });
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: `Polygon ${i}`, exact: true }).click();
    await expect(page.getByLabel("All corner radii", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Corners", exact: true }).click();
    await page.getByLabel("Pattern drawing canvas").click({
      position: i === 0 ? { x: 152, y: 167 } : { x: 360, y: 170 },
    });
    const radius = page.getByLabel("All corners (mm)", { exact: true });
    await radius.fill("8");
    await expect(radius).toHaveValue("8");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
  }
  await page.screenshot({ path: info.outputPath("rounded-polygons.png") });
});
