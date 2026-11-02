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
  // Existing geometry fixtures use a 200% view with a 50 px origin.
  const canvas = page.getByLabel("Print layout canvas");
  const box = (await canvas.boundingBox())!;
  const z = Math.max(
    0.05,
    Math.min((box.width - 80) / 210, (box.height - 80) / 297),
  );
  const pan = { x: (box.width - 210 * z) / 2, y: (box.height - 297 * z) / 2 };
  await canvas.evaluate(
    (el, delta) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new WheelEvent("wheel", {
          clientX: r.left,
          clientY: r.top,
          deltaY: delta,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    -Math.log(2 / z) / 0.001,
  );
  await canvas.focus();
  await page.keyboard.down("Space");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 50 - (pan.x * 2) / z,
    box.y + box.height / 2 + 50 - (pan.y * 2) / z,
  );
  await page.mouse.up();
  await page.keyboard.up("Space");
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
  await expect(page.getByLabel("Print move X")).toHaveCount(0);
  await page.getByRole("button", { name: "Rotate (E)", exact: true }).click();
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
  await expect(
    page
      .getByLabel("Print object tree")
      .getByRole("button", { name: "Piece", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
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

test("orientation shows both icon choices and preserves a custom name", async ({
  page,
}) => {
  await load(page);
  await page
    .getByRole("button", { name: "Create print layout", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("A4");
  await dialog.getByLabel("Format", { exact: true }).selectOption("Letter");
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
    "Letter",
  );
  await dialog.getByLabel("Name", { exact: true }).fill("My pattern");
  await dialog.getByLabel("Format", { exact: true }).selectOption("A3");
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
    "My pattern",
  );
  const orientation = dialog.getByRole("group", { name: "Paper orientation" });
  await expect(orientation.getByRole("button")).toHaveCount(2);
  await expect(
    orientation.getByRole("button", { name: "Portrait", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await orientation
    .getByRole("button", { name: "Landscape", exact: true })
    .click();
  await expect(
    orientation.getByRole("button", { name: "Landscape", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "test-results/print-orientation.png" });
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  const document = await save(page);
  expect(document.printLayouts[0]).toMatchObject({
    name: "My pattern",
    width: 420,
    height: 297,
  });
});
test("Ctrl selects, numbers, moves and deletes pages with undo", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await page
    .getByRole("button", { name: "Add page right 0,0", exact: true })
    .click();
  const canvas = page.getByLabel("Print layout canvas"),
    box = (await canvas.boundingBox())!;
  await page.keyboard.down("Control");
  await page.mouse.click(box.x + 100, box.y + 100);
  await page.screenshot({ path: "test-results/print-page-selection.png" });
  await page.getByRole("button", {name:"Delete page 0,0",exact:true}).click();
  await page.keyboard.up("Control");
  let doc = await save(page);
  expect(doc.printLayouts[0].pages).toEqual([{ column: 1, row: 0 }]);
  await canvas.focus();
  await page.keyboard.press("Control+z");
  expect((await save(page)).printLayouts[0].pages).toHaveLength(2);
  await page.keyboard.down("Control");
  await page.mouse.move(box.x + 150, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 490, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  doc = await save(page);
  expect(doc.printLayouts[0].pages).toEqual([
    { column: 1, row: 0 },
    { column: 2, row: 0 },
  ]);
});
test("source object and group hover previews use a medium popup", async ({
  page,
}) => {
  await load(page);
  await page.getByRole("button", { name: "Piece", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(page.getByRole("tooltip").locator("img")).toHaveAttribute(
    "width",
    "320",
  );
  await create(page);
  await page
    .getByLabel("Grid source objects")
    .getByRole("button", { name: "Pattern", exact: true })
    .hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.screenshot({ path: "test-results/object-hover-preview.png" });
});

test("dragging a source group previews and imports it at the drop location", async ({
  page,
}) => {
  await load(page);
  await create(page);
  const source = page
      .getByLabel("Grid source objects")
      .getByRole("button", { name: "Pattern", exact: true }),
    canvas = page.getByLabel("Print layout canvas");
  const box = (await canvas.boundingBox())!;
  const before = await canvas.evaluate((el) =>
    (el as HTMLCanvasElement).toDataURL(),
  );
  const sourceBox = (await source.boundingBox())!;
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 - 15,
    sourceBox.y + sourceBox.height / 2,
    { steps: 5 },
  );
  await page.mouse.move(box.x + 250, box.y + 260, { steps: 10 });
  // Preview is visible before releasing the pointer.
  await page.mouse.move(box.x + 251, box.y + 260);
  await expect
    .poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL()))
    .not.toBe(before);
  await expect(
    page
      .getByLabel("Print object tree")
      .getByRole("button", { name: "Piece", exact: true }),
  ).toHaveCount(0);
  const darkPreviewPixels = () =>
    canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement,
        scale = c.width / c.clientWidth;
      const data = c
        .getContext("2d")!
        .getImageData(166 * scale, 240 * scale, 10 * scale, 40 * scale).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] < 180 && data[i + 1] < 180) count++;
      return count;
    });
  await expect.poll(darkPreviewPixels).toBeGreaterThan(10);
  await page.mouse.move(box.x + 290, box.y + 260, { steps: 4 });
  await expect.poll(darkPreviewPixels).toBe(0);
  await page.mouse.move(box.x + 250, box.y + 260, { steps: 4 });
  await expect.poll(darkPreviewPixels).toBeGreaterThan(10);
  await page.screenshot({ path: "test-results/print-drag-preview.png" });
  await page.mouse.move(box.x + 250, box.y + 260);
  await page.mouse.up();
  await expect(
    page
      .getByLabel("Print object tree")
      .getByRole("button", { name: "Piece", exact: true }),
  ).toHaveCount(1);
  const doc = await save(page);
  expect(doc.printLayouts[0].instances[0].x).toBeCloseTo(90, 0);
  expect(doc.printLayouts[0].instances[0].y).toBeCloseTo(95, 0);
});

test("dropping a moved object retains its final preview while the worker commits", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  const canvas = page.getByLabel("Print layout canvas"),
    box = (await canvas.boundingBox())!;
  const sample = () =>
    canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement,
        ratio = c.width / c.clientWidth;
      return c
        .getContext("2d")!
        .getImageData(Math.round(260 * ratio), Math.round(307 * ratio), 1, 1)
        .data[0];
    });
  await expect.poll(sample).toBeLessThan(240);
  await page.evaluate(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: any, ...args: any[]) {
      if (message.operation === "commit")
        setTimeout(() => original.call(this, message, ...(args as [any])), 300);
      else original.call(this, message, ...(args as [any]));
    };
  });
  await page.mouse.move(box.x + 260, box.y + 345);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 385, { steps: 5 });
  await expect.poll(sample).toBeGreaterThan(245);
  await page.mouse.up();
  const frames = await canvas.evaluate(async (el) => {
    const c = el as HTMLCanvasElement,
      ratio = c.width / c.clientWidth,
      result: number[] = [];
    for (let i = 0; i < 8; i++) {
      await new Promise(requestAnimationFrame);
      result.push(
        c
          .getContext("2d")!
          .getImageData(Math.round(260 * ratio), Math.round(307 * ratio), 1, 1)
          .data[0],
      );
    }
    return result;
  });
  expect(frames.every((value) => value > 245)).toBe(true);
});

test("move and rotate tool values preview, cancel, and commit without changing sources", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  await page
    .getByLabel("Print object tree")
    .getByRole("button", { name: "Piece", exact: true })
    .click();
  await expect(page.getByLabel("Print move X")).toHaveCount(0);
  await page.getByRole("button", { name: "Move (G)", exact: true }).click();
  await page.getByLabel("Print move X").fill("20");
  await page.getByLabel("Print move Y").fill("10");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  let doc = await save(page);
  expect(doc.printLayouts[0].instances[0]).toMatchObject({
    x: 95,
    y: 138.5,
    rotation: 0,
  });
  await page.getByRole("button", { name: "Move (G)", exact: true }).click();
  await page.getByLabel("Print move X").fill("20");
  await page.getByLabel("Print move Y").fill("10");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  doc = await save(page);
  expect(doc.printLayouts[0].instances[0]).toMatchObject({
    x: 115,
    y: 148.5,
    rotation: 0,
  });
  expect(doc.shapes[0]).toMatchObject(rectangle);
});

test("Select rotation ring uses Grid modifiers and Escape cancels its preview", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  await page
    .getByLabel("Print object tree")
    .getByRole("button", { name: "Piece", exact: true })
    .click();
  const box = (await page.getByLabel("Print layout canvas").boundingBox())!;
  await expect(page.getByLabel("Print rotation")).toHaveCount(0);
  const objects = page.getByRole("region", {
      name: "Print objects",
      exact: true,
    }),
    pages = page.getByRole("region", { name: "Pages", exact: true });
  const listBox = (await objects
      .getByLabel("Print object tree")
      .boundingBox())!,
    pagesBox = (await pages.boundingBox())!;
  expect(pagesBox.y).toBeGreaterThanOrEqual(listBox.y + listBox.height);
  await page.screenshot({ path: "test-results/print-gizmo.png" });
  await page.keyboard.down("Control");
  await page.mouse.move(box.x + 320, box.y + 347);
  await page.mouse.down();
  await page.mouse.move(
    box.x + 260 + 60 * Math.cos((48 * Math.PI) / 180),
    box.y + 347 + 60 * Math.sin((48 * Math.PI) / 180),
    { steps: 6 },
  );
  await page.mouse.up();
  await page.keyboard.up("Control");
  expect((await save(page)).printLayouts[0].instances[0].rotation).toBeCloseTo(
    50,
  );
  await page.mouse.move(box.x + 320, box.y + 347);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 407, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await save(page)).printLayouts[0].instances[0].rotation).toBeCloseTo(
    50,
  );
});

test("print tools select first, apply by right click, and mirror linked artwork", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  const canvas = page.getByLabel("Print layout canvas");
  const box = (await canvas.boundingBox())!;
  // Import centers the placement in the viewport; click the object using its saved position.
  const initial = await save(page);
  const placement = initial.printLayouts[0].instances[0];
  await page.getByRole("button", { name: "Move (G)", exact: true }).click();
  await page.mouse.click(
    box.x + 50 + (10 + placement.x) * 2,
    box.y + 50 + (10 + placement.y) * 2,
  );
  await expect(
    page.getByRole("button", { name: "Move (G)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Print move X").fill("12");
  await canvas.click({ button: "right", position: { x: 550, y: 500 } });
  const moved = await save(page);
  expect(moved.printLayouts[0].instances[0].x).toBeCloseTo(placement.x + 12);
  await page.getByRole("button", { name: "Mirror (M)", exact: true }).click();
  await canvas.click({
    position: {
      x: 50 + (10 + placement.x + 12) * 2 + 40,
      y: 50 + (10 + placement.y) * 2,
    },
  });
  await page.screenshot({ path: "test-results/print-mirror.png" });
  await page
    .locator(".print-transform")
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  const mirrored = await save(page);
  expect(mirrored.printLayouts[0].instances[0].mirrored).toBe(true);
  await page.keyboard.down("Control");
  await expect(
    page.getByRole("button", { name: "Delete page 0,0", exact: true }),
  ).toBeVisible();
  await page.keyboard.up("Control");
  await expect(
    page.getByRole("button", { name: "Delete page 0,0", exact: true }),
  ).toHaveCount(0);
});
