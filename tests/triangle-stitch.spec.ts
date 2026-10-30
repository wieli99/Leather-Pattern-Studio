import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("triangle edges accept stitching through the real worker", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
    delete (window as any).showSaveFilePicker;
  });
  const choose = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await choose
  ).setFiles({
    name: "triangle.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 9,
        shapes: [
          {
            id: "t",
            name: "Triangle",
            kind: "polyline",
            points: [
              { x: 15, y: 20 },
              { x: 95, y: 20 },
              { x: 55, y: 85 },
              { x: 15, y: 20 },
            ],
            radius: 0,
            rotation: 0,
          },
        ],
      }),
    ),
  });
  await page.locator(".objects button").first().click();
  await page.getByRole("button", { name: "Stitch line", exact: true }).click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  for (const position of [
    { x: 185, y: 257.5 },
    { x: 245, y: 160 },
    { x: 305, y: 257.5 },
  ]) {
    await canvas.click({ position });
    await expect(page.locator('.stitch-options [role="alert"]')).toHaveCount(0);
  }
  if (
    info.project.name === "chromium" &&
    process.env.UPDATE_MANUAL_SCREENSHOTS === "1"
  )
    await page.screenshot({
      path: "public/manual/images/triangle-stitching.png",
    });
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const doc = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(doc.stitchGroups).toHaveLength(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
});
