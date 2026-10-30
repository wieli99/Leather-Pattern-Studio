import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("clearance typing survives rerenders and persists after Apply", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
    delete (window as any).showSaveFilePicker;
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "clearances.json",
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
  await page.getByRole("button", { name: "Stitch line", exact: true }).click();
  const start = page.getByLabel("Start clearance (mm)", { exact: true }),
    end = page.getByLabel("End clearance (mm)", { exact: true });
  await start.fill("");
  await start.pressSequentially("2.75");
  await page.mouse.move(180, 120);
  await expect(start).toHaveValue("2.75");
  await end.fill("");
  await end.pressSequentially("1.25");
  await page.mouse.move(190, 120);
  await expect(end).toHaveValue("1.25");
  await page.getByLabel("Stitch style", { exact: true }).focus();
  await expect(start).toHaveValue("2.75");
  await expect(end).toHaveValue("1.25");
  await page
    .getByLabel("Pattern drawing canvas")
    .click({ position: { x: 125, y: 240 } });
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const doc = JSON.parse(
    await readFile((await (await downloading).path())!, "utf8"),
  );
  expect(doc.stitchGroups[0].settings.startClearance).toBe(2.75);
  expect(doc.stitchGroups[0].settings.endClearance).toBe(1.25);
});
