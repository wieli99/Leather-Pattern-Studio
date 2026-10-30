import { test, expect } from "@playwright/test";
test("clicking the visible inset stitching selects its group without selecting its source first", async ({
  page,
}) => {
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
    name: "select-stitch.json",
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
        stitchGroups: [
          {
            id: "row",
            shapeId: "r",
            edges: ["rectangle:2:edge:0"],
            side: 1,
            closed: false,
            settings: {
              style: "round",
              spacing: 3.85,
              inset: 10,
              alignment: "center",
              startClearance: 0,
              endClearance: 0,
            },
          },
        ],
      }),
    ),
  });
  await expect(page.locator(".objects button")).toHaveCount(1);
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 155, y: 240 } });
  await expect(
    page.getByRole("region", { name: "Stitch line settings" }),
  ).toBeVisible();
  await expect(page.locator(".stitch-options")).toContainText("1 selected");
  await expect(page.getByLabel("Stitch inset", { exact: true })).toHaveValue(
    "10.00",
  );
  await canvas.click({ position: { x: 155, y: 240 }, modifiers: ["Shift"] });
  await expect(page.locator(".stitch-options")).not.toContainText("1 selected");
  await canvas.click({ position: { x: 155, y: 240 } });
  await expect(page.locator(".stitch-options")).toContainText("1 selected");
});
