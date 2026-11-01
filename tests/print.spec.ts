import { test, expect, type Page } from "@playwright/test";
const rectangle = {
  id: "piece",
  name: "Piece",
  kind: "rectangle",
  points: [
    { x: 0, y: 0 },
    { x: 80, y: 40 },
  ],
  radius: 4,
  rotation: 0,
};
async function load(
  page: Page,
  extras: Record<string, unknown>[] = [],
  stitchGroups: Record<string, unknown>[] = [],
) {
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
    name: "print.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 17,
        shapes: [rectangle, ...extras],
        stitchGroups,
        objectTree: [
          {
            kind: "group",
            id: "folder",
            name: "Pattern",
            children: [rectangle, ...extras].map((s) => ({
              kind: "object",
              id: s.id,
            })),
          },
        ],
      }),
    ),
  });
  await expect(page.locator(".object-select")).toHaveCount(extras.length + 1);
}
async function create(page: Page) {
  await page
    .getByRole("button", { name: "Create print layout", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "A4", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
}
async function save(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}
test("layouts are optional, import folders repeatedly, arrange copies, persist, and undo", async ({
  page,
}) => {
  await load(page);
  await expect(page.getByRole("tab")).toHaveCount(1);
  await create(page);
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Import Pattern", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import Pattern", exact: true })
    .click();
  const tree = page.getByLabel("Print object tree");
  await expect(
    tree.getByRole("button", { name: "Piece", exact: true }),
  ).toHaveCount(2);
  await tree
    .getByRole("button", { name: "Piece", exact: true })
    .first()
    .click();
  await page.getByLabel("Print move X").fill("30");
  await page.getByLabel("Print rotation", { exact: true }).fill("45");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const doc = await save(page);
  expect(doc.version).toBe(18);
  expect(doc.printLayouts).toHaveLength(1);
  expect(doc.printLayouts[0].instances).toHaveLength(2);
  expect(doc.shapes[0]).toMatchObject(rectangle);
  expect(doc.printLayouts[0].instances[0].rotation).toBeCloseTo(45);
  await page
    .locator(".print-workspace")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect
    .poll(async () => (await save(page)).printLayouts[0].instances[0].rotation)
    .toBe(0);
  await page.getByRole("tab", { name: "Grid", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeVisible();
});
test("exports actual PDF, SVG and PNG previews with physical page sizes", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await create(page);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export print layout" });
  await expect(
    dialog.getByRole("button", { name: "Export", exact: true }),
  ).toBeEnabled({ timeout: 40000 });
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  let pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const pdfDownload = await pending;
  expect(pdfDownload.suggestedFilename()).toBe("A4.pdf");
  const pdfStream = await pdfDownload.createReadStream();
  const pdfChunks: Buffer[] = [];
  for await (const chunk of pdfStream!) pdfChunks.push(chunk);
  const mediaBox = Buffer.concat(pdfChunks)
    .toString("latin1")
    .match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
  expect(mediaBox).not.toBeNull();
  expect((Number(mediaBox![1]) * 25.4) / 72).toBeCloseTo(210, 3);
  expect((Number(mediaBox![2]) * 25.4) / 72).toBeCloseTo(297, 3);
  await expect
    .poll(() =>
      dialog.getByLabel("Generated print preview").evaluate((el) => {
        const canvas = el as HTMLCanvasElement;
        return (
          canvas.width > 0 &&
          canvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height)
            .data.some((value, index) => index % 4 !== 3 && value < 100)
        );
      }),
    )
    .toBe(true);
  await page.screenshot({ path: "test-results/print-preview.png" });
  await dialog.getByLabel("Format", { exact: true }).selectOption("svg");
  await expect(
    dialog.getByRole("button", { name: "Export", exact: true }),
  ).toBeEnabled();
  pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const svg = await pending;
  expect(svg.suggestedFilename()).toBe("A4.svg");
  const stream = await svg.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toContain('width="210mm"');
  await dialog.getByLabel("Format", { exact: true }).selectOption("png");
  await expect(
    dialog.getByRole("button", { name: "Export", exact: true }),
  ).toBeEnabled({ timeout: 40000 });
  pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const png = await pending;
  expect(png.suggestedFilename()).toBe("A4.png");
  const pngStream = await png.createReadStream();
  const pngChunks: Buffer[] = [];
  for await (const chunk of pngStream!) pngChunks.push(chunk);
  const bytes = Buffer.concat(pngChunks);
  const chunk = bytes.indexOf(Buffer.from("pHYs"));
  expect(chunk).toBeGreaterThan(0);
  expect(bytes.readUInt32BE(chunk + 4)).toBe(11811);
});
test("custom paper units, settings, page additions, and cancellation", async ({
  page,
}) => {
  await load(page);
  await page
    .getByRole("button", { name: "Create print layout", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Format", { exact: true }).selectOption("Custom");
  await dialog
    .getByLabel("Units", { exact: true })
    .selectOption("in-fractional");
  await dialog.getByLabel("Paper width").fill("8 1/2");
  await dialog.getByLabel("Paper height").fill("11");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Custom", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Add page right 0,0", exact: true })
    .click();
  expect((await save(page)).printLayouts[0].pages).toHaveLength(2);
  await page
    .getByRole("button", { name: "Layout settings", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Letter pattern");
  await dialog
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Letter pattern", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create print layout", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
});

test("multiple sheets export as a ZIP and PDF export works offline", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await load(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await create(page);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  await page
    .getByRole("button", { name: "Add page right 0,0", exact: true })
    .click();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export print layout" });
  await expect(
    dialog.getByRole("button", { name: "Export", exact: true }),
  ).toBeEnabled({ timeout: 40000 });
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByText("Page 1 / 2")).toBeVisible();
  await dialog.getByLabel("Format", { exact: true }).selectOption("svg");
  await expect(
    dialog.getByRole("button", { name: "Export", exact: true }),
  ).toBeEnabled();
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("A4.zip");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  expect(Object.keys(zip.files)).toEqual(["A4-001.svg", "A4-002.svg"]);
});

test("renders all artwork families and exported unit-aware labels", async ({
  page,
}) => {
  test.setTimeout(60000);
  const svg =
    "data:image/svg+xml;base64," +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
    ).toString("base64");
  const common = { radius: 0, rotation: 0 };
  await load(
    page,
    [
      {
        ...common,
        id: "measurement",
        name: "Dimension",
        kind: "measurement",
        points: [
          { x: 0, y: 50 },
          { x: 25.4, y: 50 },
        ],
        measurementOffset: 5,
      },
      {
        ...common,
        id: "ruler",
        name: "Ruler",
        kind: "size-ruler",
        points: [
          { x: 0, y: 70 },
          { x: 25.4, y: 70 },
        ],
      },
      {
        ...common,
        id: "arrow",
        name: "Arrow",
        kind: "arrow",
        points: [
          { x: 40, y: 50 },
          { x: 60, y: 60 },
        ],
      },
      {
        ...common,
        id: "square",
        name: "Square",
        kind: "size-square",
        points: [
          { x: 40, y: 70 },
          { x: 65.4, y: 95.4 },
        ],
      },
      {
        ...common,
        id: "text",
        name: "Label",
        kind: "text",
        points: [
          { x: 0, y: 100 },
          { x: 70, y: 110 },
        ],
        text: 'Pattern ≈ 1"',
        fontSize: 4,
      },
      {
        ...common,
        id: "curve",
        name: "Curve",
        kind: "curve",
        points: [
          { x: 0, y: 120 },
          { x: 30, y: 100 },
          { x: 60, y: 120 },
        ],
      },
      {
        ...common,
        id: "circle",
        name: "Circle",
        kind: "circle",
        points: [
          { x: 80, y: 120 },
          { x: 90, y: 120 },
        ],
      },
      {
        ...common,
        id: "ellipse",
        name: "Ellipse",
        kind: "ellipse",
        points: [
          { x: 0, y: 140 },
          { x: 30, y: 160 },
        ],
      },
      {
        ...common,
        id: "arc",
        name: "Arc",
        kind: "arc",
        points: [
          { x: 50, y: 150 },
          { x: 65, y: 150 },
        ],
        sweep: 270,
      },
      {
        ...common,
        id: "image",
        name: "Reference",
        kind: "image",
        points: [
          { x: 80, y: 140 },
          { x: 100, y: 160 },
        ],
        image: svg,
      },
      {
        ...common,
        id: "hatched",
        name: "Cutout",
        kind: "rectangle",
        points: [
          { x: 100, y: 0 },
          { x: 120, y: 30 },
        ],
        fillMode: "cutout",
      },
    ],
    [
      {
        id: "stitches",
        shapeId: "piece",
        edges: ["rectangle:2:edge:0"],
        side: 1,
        settings: {
          style: "french",
          spacing: 4,
          inset: 3,
          alignment: "center",
        },
        closed: false,
      },
    ],
  );
  await create(page);
  await page
    .getByRole("button", { name: "Import Pattern", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Layout settings", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Units", { exact: true })
    .selectOption("in-decimal");
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.screenshot({ path: "test-results/print-layout.png" });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export print layout" });
  await expect(
    dialog.getByRole("button", { name: "Export", exact: true }),
  ).toBeEnabled({ timeout: 40000 });
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() =>
      dialog.getByLabel("Generated print preview").evaluate((el) => {
        const c = el as HTMLCanvasElement,
          pixels = c
            .getContext("2d")!
            .getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] > 180 && pixels[i + 1] < 80 && pixels[i + 2] < 80)
            return true;
        return false;
      }),
    )
    .toBe(true);
  await dialog.getByLabel("Format", { exact: true }).selectOption("svg");
  await expect(
    dialog.getByRole("button", { name: "Export", exact: true }),
  ).toBeEnabled();
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const download = await pending,
    stream = await download.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  expect(text).toContain("1 in");
  expect(text).toContain("Pattern ≈ 1&quot;");
  expect(text).toContain("<image");
  expect(text).toContain("<path");
});

test("cancels pointer previews, restricts drawing, and removes linked sources atomically", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  const before = await save(page);
  const canvas = page.getByLabel("Print layout canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 260, box.y + 350);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 390);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await canvas.focus();
  await page.keyboard.press("r");
  expect((await save(page)).shapes).toEqual(before.shapes);
  expect((await save(page)).printLayouts[0].instances).toEqual(
    before.printLayouts[0].instances,
  );
  await page.mouse.move(box.x + 140, box.y + 280);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 420);
  await page.mouse.up();
  await expect(page.getByLabel("Print move X")).toBeVisible();
  await page.getByRole("tab", { name: "Grid", exact: true }).click();
  await page.getByRole("button", { name: "Piece", exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".object-select")).toHaveCount(0);
  const deleted = await save(page);
  expect(deleted.printLayouts[0].instances).toHaveLength(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".object-select")).toHaveCount(1);
  expect((await save(page)).printLayouts[0].instances).toEqual(
    before.printLayouts[0].instances,
  );
});
