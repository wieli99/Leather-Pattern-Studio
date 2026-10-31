import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("rounding a stitched perimeter adapts through the worker and commits with history", async ({
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
    name: "rounded-stitch.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 9,
        shapes: [
          {
            id: "r",
            name: "Stitched rectangle",
            kind: "rectangle",
            points: [
              { x: 15, y: 20 },
              { x: 95, y: 85 },
            ],
            radius: 0,
            rotation: 0,
          },
        ],
        stitchGroups: [
          {
            id: "g",
            shapeId: "r",
            edges: [0, 1, 2, 3].map((i) => `rectangle:2:edge:${i}`),
            side: 1,
            closed: true,
            settings: {
              style: "french",
              spacing: 3.85,
              inset: 3,
              alignment: "center",
              startClearance: 0,
              endClearance: 0,
            },
          },
        ],
      }),
    ),
  });
  await page.locator(".objects .object-select").first().click();
  await page
    .getByRole("button", { name: "Corner radius", exact: true })
    .click();
  await page
    .getByLabel("Pattern drawing canvas")
    .click({ position: { x: 135, y: 170 } });
  const radius = page.getByLabel("All corners (mm)", { exact: true });
  await radius.fill("8");
  await radius.press("Tab");
  await expect(page.locator('.transform-options [role="alert"]')).toHaveCount(
    0,
  );
  if (
    info.project.name === "chromium" &&
    process.env.UPDATE_MANUAL_SCREENSHOTS === "1"
  )
    await page.screenshot({
      path: "public/manual/images/rounded-stitching.png",
    });
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const doc = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(doc.stitchGroups).toHaveLength(1);
  expect(doc.stitchGroups[0].edges).toHaveLength(8);
  expect(doc.stitchGroups[0].id).toBe("g");
  expect(doc.stitchGroups[0].closed).toBe(true);
});
