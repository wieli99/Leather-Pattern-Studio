import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { manualScreenshot } from "./manual-capture";

const square = (x: number, y: number, size: number) => {
  const points = [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
  return points.map((a, i) => {
    const b = points[(i + 1) % 4];
    return [
      a,
      { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
      { x: b.x - (b.x - a.x) / 3, y: b.y - (b.y - a.y) / 3 },
      b,
    ];
  });
};
function ring(curved = false) {
  const contours = [square(20, 20, 50), square(35, 35, 20)];
  if (curved) {
    contours[0][0][1].y = 10;
    contours[0][0][2].y = 10;
  }
  return {
    id: "ring",
    name: "Compound ring",
    kind: "compound",
    points: [
      { x: 20, y: 20 },
      { x: 70, y: 70 },
    ],
    contours,
    rotation: 0,
    radius: 0,
  };
}
async function load(
  page: Page,
  shape: ReturnType<typeof ring>,
  stitched = false,
) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
    delete (window as any).showSaveFilePicker;
  });
  const stitchGroups = stitched
    ? [0, 1].map((i) => ({
        id: "run" + i,
        shapeId: shape.id,
        edges: [2, 3, 0, 1].map((j) => "compound:8:edge:" + (i * 4 + j)),
        side: 1,
        closed: true,
        settings: {
          style: "french",
          spacing: 3.38,
          inset: 1,
          alignment: "center",
          startClearance: 0,
          endClearance: 0,
        },
      }))
    : [];
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "compound.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 22,
        shapes: [shape],
        stitchGroups,
        stitchLinks: stitched ? [{ id: 1, members: ["run0", "run1"] }] : [],
      }),
    ),
  });
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page.locator(".objects .object-select").click();
}
async function saved(page: Page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  return JSON.parse(await readFile((await (await event).path())!, "utf8"));
}

test("native commits retain compound contour stitching through rename, insertion, undo and redo", async ({
  page,
}) => {
  await load(page, ring(), true);
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("Renamed compound");
  await name.press("Enter");
  const before = await saved(page);
  expect(before.stitchGroups).toHaveLength(2);
  expect(before.stitchGroups.every((g: any) => g.closed)).toBe(true);
  const canvas = page.getByLabel("Pattern drawing canvas");
  // Default Model view: three pixels per millimetre, pan (80,100).
  await canvas.click({ position: { x: 215, y: 160 }, modifiers: ["Alt"] });
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  const next = await saved(page);
  expect(next.shapes[0].contours[0]).toHaveLength(5);
  expect(next.stitchGroups).toHaveLength(2);
  expect(next.stitchGroups.every((g: any) => g.closed)).toBe(true);
  expect(next.stitchGroups.map((g: any) => g.edges.length)).toEqual([5, 4]);
  expect(next.stitchLinks).toEqual(before.stitchLinks);
  expect(
    next.stitchGroups.every((g: any) =>
      g.edges.every((key: string) => key.startsWith("compound:9:")),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await saved(page)).stitchGroups).toEqual(before.stitchGroups);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await saved(page)).stitchGroups).toEqual(next.stitchGroups);
});

test(
  "compound Offset, cubic measurements and anchor double-clicks are available in the editor",
  { tag: "@manual" },
  async ({ page }) => {
    await load(page, ring(true));
    const canvas = page.getByLabel("Pattern drawing canvas");
    await expect(
      page.getByRole("button", { name: "Offset", exact: true }),
    ).toBeEnabled();
    await canvas.focus();
    await canvas.press("o");
    await expect(
      page.getByRole("region", { name: "Offset settings" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Apply", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await canvas.focus();
    await page.keyboard.down("Control");
    await expect(
      page.getByRole("textbox", { name: "Edge length", exact: true }),
    ).toHaveCount(8);
    await manualScreenshot(page, "compound-editing.png");
    await page.keyboard.up("Control");
    const before = await saved(page);
    await canvas.dblclick({ position: { x: 140, y: 160 } });
    const sharp = await saved(page);
    expect(sharp.shapes[0].contours[0][0][1]).toEqual(
      sharp.shapes[0].contours[0][0][0],
    );
    expect(sharp.shapes[0].contours[1]).toEqual(before.shapes[0].contours[1]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await saved(page)).shapes[0].contours).toEqual(
      before.shapes[0].contours,
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await canvas.dblclick({ position: { x: 140, y: 160 } });
    const smooth = await saved(page);
    expect(smooth.shapes[0].contours[0][0][1]).not.toEqual(
      smooth.shapes[0].contours[0][0][0],
    );
  },
);
