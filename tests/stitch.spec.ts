import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const shape = {
  id: "r",
  name: "Stitched piece",
  kind: "rectangle",
  points: [
    { x: 15, y: 20 },
    { x: 95, y: 85 },
  ],
  radius: 12,
  rotation: 0,
};
async function setup(page: any, stitchGroups: any[] = []) {
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
    name: "stitch.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 8, shapes: [shape], stitchGroups }),
    ),
  });
  await page.locator(".objects button").first().click();
  await page.getByRole("button", { name: "Stitch line", exact: true }).click();
}
async function saved(page: any) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}
test("place, merge and split within a session, then save", async ({
  page,
}, info) => {
  await setup(page);
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 125, y: 240 } });
  await page
    .getByLabel("Stitch style", { exact: true })
    .selectOption("japanese");
  await canvas.click({ position: { x: 136, y: 171 }, modifiers: ["Shift"] });
  await expect(
    page.getByRole("button", { name: "Split all", exact: true }),
  ).toBeEnabled();
  if (
    info.project.name === "chromium" &&
    process.env.UPDATE_MANUAL_SCREENSHOTS === "1"
  )
    await page.screenshot({ path: "public/manual/images/stitch-lines.png" });
  await page.getByRole("button", { name: "Split all", exact: true }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const doc = await saved(page);
  expect(doc.version).toBe(9);
  expect(doc.stitchGroups).toHaveLength(2);
  expect(
    doc.stitchGroups.every((g: any) => g.settings.style === "japanese"),
  ).toBe(true);
});

test("sharp rectangles accept placement and editable preset values in the bottom popup", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "sharp.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 8, shapes: [{ ...shape, radius: 0 }] }),
    ),
  });
  await page.locator(".objects button").first().click();
  const tool = page.getByRole("button", { name: "Stitch line", exact: true });
  await expect(tool).toHaveText("");
  await tool.click();
  await expect(
    page.locator(".transform-overlay .stitch-options"),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Custom", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Spacing presets", exact: true })
    .click();
  await expect(page.getByRole("menuitem")).toHaveCount(5);
  await page.getByRole("menuitem", { name: "3.38 mm", exact: true }).click();
  await expect(page.getByLabel("Stitch spacing", { exact: true })).toHaveValue(
    "3.38",
  );
  await page.getByLabel("Stitch spacing", { exact: true }).fill("4.25");
  await page.getByLabel("Stitch inset", { exact: true }).fill("2.75");
  await page.getByLabel("Stitch style", { exact: true }).focus();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 125, y: 240 } });
  await expect(page.locator(".stitch-options")).toContainText("1 selected");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const doc = await saved(page);
  expect(doc.stitchGroups).toHaveLength(1);
  expect(doc.stitchGroups[0].settings.spacing).toBe(4.25);
  expect(doc.stitchGroups[0].settings.inset).toBe(2.75);
});
