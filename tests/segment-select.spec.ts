import { manualScreenshot } from "./manual-capture";
import { test, expect, type Page } from "@playwright/test";

const line = (id: string, a: [number, number], b: [number, number]) => ({
  id,
  name: id,
  kind: "line",
  points: [
    { x: a[0], y: a[1] },
    { x: b[0], y: b[1] },
  ],
  radius: 0,
  rotation: 0,
});

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
    delete (window as any).showSaveFilePicker;
  });
  // A horizontal target crossed by two vertical lines: its middle span is one segment.
  const shapes = [line("Target", [20, 40], [140, 40]), line("Cut A", [60, 10], [60, 70]), line("Cut B", [100, 10], [100, 70])];
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles({
    name: "segments.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 11, shapes })),
  });
  await expect(page.locator(".objects .object-select")).toHaveCount(3);
  const canvas = page.getByLabel("Pattern drawing canvas");
  const box = (await canvas.boundingBox())!;
  // The editor's initial view is 3 px/mm with an (80,100) px origin.
  const at = (x: number, y: number) => ({ x: box.x + 80 + x * 3, y: box.y + 100 + y * 3 });
  await canvas.focus();
  return { canvas, at };
}

test("segment selection selects, drags, deletes and switches with 1, 2 and V", async ({ page }) => {
  const { at } = await open(page);
  const select = page.getByRole("button", { name: "Select (V)", exact: true });
  const panel = page.getByRole("region", { name: "Segment selection" });
  const objects = page.locator(".objects .object-select");
  // Tool help describes segment selection only while that mode is active.
  const segmentHint = page.getByText(/Click a segment between crossings|Drag a segment, or press G/);

  await page.keyboard.press("2");
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await expect(segmentHint).toBeVisible();
  await page.mouse.click(at(80, 40).x, at(80, 40).y);
  await expect(panel.getByText("1 segment", { exact: true })).toBeVisible();

  // Dragging detaches the middle span; it stays selected in segment mode.
  await page.mouse.move(at(80, 40).x, at(80, 40).y);
  await page.mouse.down();
  await page.mouse.move(at(80, 50).x, at(80, 50).y, { steps: 4 });
  await page.mouse.move(at(80, 60).x, at(80, 60).y, { steps: 4 });
  await page.mouse.up();
  await expect(objects).toHaveCount(5);
  await expect(panel.getByText("1 segment", { exact: true })).toBeVisible();
  await expect(segmentHint).toBeVisible();

  await page.keyboard.press("Control+z");
  await expect(objects).toHaveCount(3);

  // V cycles between the select variants; Delete removes only the clicked span.
  await page.getByLabel("Pattern drawing canvas").focus();
  await page.keyboard.press("v");
  await expect(segmentHint).toBeHidden();
  await page.keyboard.press("v");
  await expect(segmentHint).toBeVisible();
  await page.mouse.click(at(120, 40).x, at(120, 40).y);
  await expect(panel.getByText("1 segment", { exact: true })).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(objects).toHaveCount(3);
  await expect(panel).toBeHidden();

  await page.keyboard.press("Shift+V");
  await expect(segmentHint).toBeHidden();
  await page.keyboard.press("2");
  await expect(segmentHint).toBeVisible();
  await page.keyboard.press("1");
  await expect(segmentHint).toBeHidden();
  await expect(select).toHaveAttribute("aria-pressed", "true");
});

test("Ctrl+A selects all segments and Separate turns them into objects", async ({ page }) => {
  await open(page);
  await page.keyboard.press("2");
  await page.keyboard.press("Control+a");
  const panel = page.getByRole("region", { name: "Segment selection" });
  // Three spans on the target and two on each cut line.
  await expect(panel.getByText("7 segments", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Separate", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(7);
  // The separated pieces stay selected as segments.
  await expect(panel.getByText("7 segments", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rotate", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Resize", exact: true })).toBeDisabled();
});

test("E rotates a selected segment by an exact angle", async ({ page }) => {
  const { at } = await open(page);
  await page.keyboard.press("2");
  await page.mouse.click(at(80, 40).x, at(80, 40).y);
  await page.keyboard.press("e");
  // The segment tool stays active; object-only tools stay unavailable while rotating.
  await expect(page.getByRole("menuitemradio")).toHaveCount(0);
  for (const name of ["Resize", "Mirror", "Corners", "Trim"])
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Rotate", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Pattern drawing canvas").focus();
  await page.keyboard.press("k");
  await expect(page.getByRole("button", { name: "Rotate", exact: true })).toHaveAttribute("aria-pressed", "true");
  const angle = page.locator(".transform-inputs input").first();
  await angle.fill("90");
  // Enter in the angle field applies the rotation.
  await angle.press("Enter");
  await expect(page.locator(".objects .object-select")).toHaveCount(5);
  await expect(page.getByRole("region", { name: "Segment selection" }).getByText("1 segment", { exact: true })).toBeVisible();
});

test("selected segments show lengths and segment actions", { tag: "@manual" }, async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
    delete (window as any).showSaveFilePicker;
  });
  // A panel crossed by a fold line, with a circular cut-out over one corner.
  const shapes = [
    { id: "panel", name: "Panel", kind: "rectangle", points: [{ x: 20, y: 20 }, { x: 140, y: 90 }], radius: 0, rotation: 0 },
    line("Fold", [0, 55], [170, 55]),
    { id: "hole", name: "Cut-out", kind: "circle", points: [{ x: 140, y: 90 }, { x: 155, y: 90 }], radius: 0, rotation: 0 },
  ];
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles({
    name: "segments.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 11, shapes })),
  });
  await expect(page.locator(".objects .object-select")).toHaveCount(3);
  const canvas = page.getByLabel("Pattern drawing canvas");
  const box = (await canvas.boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + 80 + x * 3, y: box.y + 100 + y * 3 });
  await canvas.focus();
  await page.keyboard.press("2");
  await page.mouse.click(at(80, 20).x, at(80, 20).y);
  await page.keyboard.down("Shift");
  await page.mouse.click(at(140, 40).x, at(140, 40).y);
  await page.keyboard.up("Shift");
  const panel = page.getByRole("region", { name: "Segment selection" });
  await expect(panel.getByText("2 segments", { exact: true })).toBeVisible();
  await page.mouse.move(at(152, 80).x, at(152, 80).y);
  await page.keyboard.down("Control");
  await expect(page.getByRole("textbox", { name: "Edge length" })).toHaveCount(2);
  await manualScreenshot(page, "segment-selection.png");
  await page.keyboard.up("Control");
});
