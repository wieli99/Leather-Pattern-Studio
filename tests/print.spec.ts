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
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    -Math.log(2 / z) / 0.002,
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
test("Fit restores the default view on an empty grid", async ({ page }) => {
  await page.goto("/");
  const fit = page.getByRole("button", { name: "Fit", exact: true });
  await expect(fit).toBeEnabled();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await fit.hover();
  const initial = await canvas.screenshot();
  await canvas.hover({ position: { x: 300, y: 200 } });
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -400);
  await page.keyboard.up("Control");
  await page.mouse.wheel(100, 200);
  await expect(async () => expect(await canvas.screenshot()).not.toEqual(initial)).toPass();
  await fit.click();
  await expect(async () => expect(await canvas.screenshot()).toEqual(initial)).toPass();
});

test("Fit restores the default page view on an empty print tab", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create print layout", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Create print layout", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  const canvas = page.getByLabel("Print layout canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  const initial = await canvas.screenshot();
  await canvas.hover({ position: { x: 300, y: 200 } });
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -400);
  await page.keyboard.up("Control");
  await page.mouse.wheel(100, 200);
  await expect(async () => expect(await canvas.screenshot()).not.toEqual(initial)).toPass();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(async () => expect(await canvas.screenshot()).toEqual(initial)).toPass();
});

test("panel edge tabs hide and restore print panels and share visibility with Grid", async ({ page }, info) => {
  await load(page);
  await create(page);
  for (const [name, selector] of [
    ["tools", 'nav[aria-label="Print tools"]'],
    ["inspector", 'aside[aria-label="Print objects and settings"]'],
    ["status bar", ".print-status"],
  ]) {
    await page.getByRole("button", { name: `Hide ${name}`, exact: true }).click();
    await expect(page.locator(selector)).toBeHidden();
    await expect(page.getByRole("button", { name: `Show ${name}`, exact: true })).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: `Show ${name}`, exact: true }).click();
    await expect(page.locator(selector)).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath("print-panel-toggles.png") });
  await page.getByRole("button", { name: "Hide tools", exact: true }).click();
  await page.getByRole("tab", { name: "Grid", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Drawing tools", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Show tools", exact: true }).click();
  await page.getByRole("tab", { name: "A4", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Print tools", exact: true })).toBeVisible();
});

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
  await page.keyboard.down("Control");
  await page
    .getByRole("button", { name: "Add page right 0,0", exact: true })
    .click();
  await page.keyboard.up("Control");
  expect((await save(page)).printLayouts[0].pages).toHaveLength(2);
  await page.getByRole("tab", { selected: true }).click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Layout settings", exact: true })
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
  await page.keyboard.down("Control");
  await page
    .getByRole("button", { name: "Add page right 0,0", exact: true })
    .click();
  await page.keyboard.up("Control");
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
  await page.getByRole("tab", { selected: true }).click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Layout settings", exact: true })
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
  await page.keyboard.down("Control");
  await page
    .getByRole("button", { name: "Add page right 0,0", exact: true })
    .click();
  await page.keyboard.up("Control");
  const canvas = page.getByLabel("Print layout canvas"),
    box = (await canvas.boundingBox())!;
  await page.keyboard.down("Control");
  await page.mouse.click(box.x + 100, box.y + 100);
  await page.screenshot({ path: "test-results/print-page-selection.png" });
  await page
    .getByRole("button", { name: "Delete page 0,0", exact: true })
    .click();
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
  await expect(page.locator(".reorder-floating")).toBeVisible();
  const destinationAlpha = () =>
    canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement,
        ratio = c.width / c.clientWidth;
      return c
        .getContext("2d")!
        .getImageData(Math.round(530 * ratio), Math.round(200 * ratio), 1, 1)
        .data[3];
    });
  await expect.poll(destinationAlpha).toBe(0);
  await page.screenshot({ path: "public/manual/images/reorder-pages.png" });
  await page.mouse.up();
  await expect.poll(destinationAlpha).toBe(255);
  await page.keyboard.up("Control");
  doc = await save(page);
  expect(doc.printLayouts[0].pages).toEqual([
    { column: 1, row: 0 },
    { column: 0, row: 0 },
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
  await page.screenshot({ path: "test-results/print-rotation-readout.png" });
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

test("wheel pans print pages and Ctrl wheel zooms", async ({ page }) => {
  await load(page);
  await create(page);
  const canvas = page.getByLabel("Print layout canvas");
  const before = await canvas.evaluate((el) =>
    (el as HTMLCanvasElement).toDataURL(),
  );
  const zoomLabel = page.locator(".print-status > span").last();
  const zoom = await zoomLabel.innerText();
  await canvas.hover();
  await page.mouse.wheel(0, 80);
  await expect
    .poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL()))
    .not.toBe(before);
  await expect(zoomLabel).toHaveText(zoom);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(zoomLabel).not.toHaveText(zoom);
});

test("print tab context menu targets its tab and drag reorders saved layouts", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await page
    .getByRole("button", { name: "Create print layout", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  const first = page.getByRole("tab", { name: "A4", exact: true }),
    second = page.getByRole("tab", { name: "A4 2", exact: true });
  await expect(second).toHaveAttribute("aria-selected", "true");
  await first.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Layout settings", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Name", { exact: true }),
  ).toHaveValue("A4");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(second).toHaveAttribute("aria-selected", "true");
  const a = (await first.boundingBox())!,
    b = (await second.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 2, a.y + a.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("tab").nth(0)).toHaveText("Grid");
  await expect(page.getByRole("tab").nth(1)).toHaveText("A4 2");
  expect(
    (await save(page)).printLayouts.map((l: { name: string }) => l.name),
  ).toEqual(["A4 2", "A4"]);
});

test("print object actions live in the shared context menu", async ({
  page,
}) => {
  await load(page);
  await create(page);
  const tree = page.getByLabel("Print object tree");
  const empty = tree.getByText("Import objects or folders from Grid.");
  await expect(empty).toHaveCSS("margin-left", "12px");
  await expect(
    page.getByRole("button", { name: "Duplicate", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  await tree
    .getByRole("button", { name: "Piece", exact: true })
    .click({ button: "right" });
  await expect(page.locator(".object-context-menu")).toBeVisible();
  await page.screenshot({ path: "test-results/print-object-menu.png" });
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(
    tree.getByRole("button", { name: "Piece", exact: true }),
  ).toHaveCount(2);
  await tree
    .getByRole("button", { name: "Piece", exact: true })
    .first()
    .click();
  await tree
    .getByRole("button", { name: "Piece", exact: true })
    .last()
    .click({ modifiers: ["Control"] });
  await tree
    .getByRole("button", { name: "Piece", exact: true })
    .first()
    .click({ button: "right" });
  await expect(
    tree.locator('.print-object-name[aria-pressed="true"]'),
  ).toHaveCount(2);
  await page.getByRole("menuitem", { name: "Group", exact: true }).click();
  await tree
    .getByRole("button", { name: "Group", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(empty).toBeVisible();
  await page.getByLabel("Print layout canvas").focus();
  await page.keyboard.press("Control+z");
  await expect(
    tree.getByRole("button", { name: "Group", exact: true }),
  ).toBeVisible();
});

test("print clipboard preserves pointer offsets and creates independent copies", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  const tree = page.getByLabel("Print object tree"),
    canvas = page.getByLabel("Print layout canvas");
  const original = (await save(page)).printLayouts[0].instances[0];
  await tree.getByRole("button", { name: "Piece", exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 400);
  const text = await canvas.evaluate((el) => {
    const data = new DataTransfer();
    const event = new ClipboardEvent("copy", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clipboardData", { value: data });
    el.dispatchEvent(event);
    return data.getData("text/plain");
  });
  expect(JSON.parse(text).format).toBe(
    "leather-pattern-designer-clipboard",
  );
  await page.mouse.move(box.x + 240, box.y + 430);
  await canvas.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clipboardData", { value: data });
    el.dispatchEvent(event);
  }, text);
  await expect(
    tree.getByRole("button", { name: "Piece copy", exact: true }),
  ).toBeVisible();
  const doc = await save(page),
    copy = doc.printLayouts[0].instances.find(
      (i: { id: string }) => i.id !== original.id,
    );
  expect(copy.snapshot).toBeDefined();
  expect(copy.sourceId).not.toBe(original.sourceId);
  expect(copy.x - original.x).toBeCloseTo(20, 0);
  expect(copy.y - original.y).toBeCloseTo(15, 0);
  expect(doc.shapes).toHaveLength(1);
  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(
    tree.getByRole("button", { name: "Piece copy", exact: true }),
  ).toHaveCount(0);
});

test("mirror hover highlights both halves of an axis", async ({ page }) => {
  await load(page);
  await create(page);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  const doc = await save(page),
    item = doc.printLayouts[0].instances[0];
  await page
    .getByLabel("Print object tree")
    .getByRole("button", { name: "Piece", exact: true })
    .click();
  await page.getByRole("button", { name: "Mirror (M)", exact: true }).click();
  const canvas = page.getByLabel("Print layout canvas"),
    box = (await canvas.boundingBox())!;
  const x = 50 + (10 + item.x) * 2,
    y = 50 + (10 + item.y) * 2;
  for (const side of [-1, 1]) {
    await page.mouse.move(box.x + x + side * 90, box.y + y);
    await expect
      .poll(() =>
        canvas.evaluate(
          (el, p) => {
            const c = el as HTMLCanvasElement,
              scale = c.width / c.clientWidth;
            return [-1, 1].every((sign) => {
              const pixels = c
                .getContext("2d")!
                .getImageData(
                  Math.round((p.x + sign * 90) * scale) - 2,
                  Math.round(p.y * scale) - 2,
                  5,
                  5,
                ).data;
              for (let i = 0; i < pixels.length; i += 4)
                if (
                  pixels[i] > 100 &&
                  pixels[i] > pixels[i + 1] * 1.5 &&
                  pixels[i] > pixels[i + 2] * 1.5
                )
                  return true;
              return false;
            });
          },
          { x, y },
        ),
      )
      .toBe(true);
    await page.screenshot({ path: "test-results/print-mirror.png" });
  }
});

test("print Move shafts drag and pivot placement uses a crosshair", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  const item = (await save(page)).printLayouts[0].instances[0];
  await page
    .getByLabel("Print object tree")
    .getByRole("button", { name: "Piece", exact: true })
    .click();
  await page.getByRole("button", { name: "Move (G)", exact: true }).click();
  const canvas = page.getByLabel("Print layout canvas"),
    box = (await canvas.boundingBox())!;
  const x = 50 + (10 + item.x) * 2,
    y = 50 + (10 + item.y) * 2;
  await page.mouse.move(box.x + x + 36, box.y + y);
  await expect(canvas).toHaveCSS("cursor", "move");
  await page.mouse.down();
  await page.mouse.move(box.x + x + 56, box.y + y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel("Print move X")).not.toHaveValue("0.00");
  await canvas.focus();
  await page.keyboard.press("v");
  await expect(canvas).toHaveCSS("cursor", "crosshair");
  await page.mouse.click(box.x + x + 20, box.y + y + 80);
  await expect(canvas).not.toHaveCSS("cursor", "crosshair");
  await page.keyboard.press("Escape");
  expect((await save(page)).printLayouts[0].instances[0].x).toBeCloseTo(item.x);
});

test("unchanged page drops clear the preview without adding history", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await page.keyboard.down("Control");
  await page
    .getByRole("button", { name: "Add page right 0,0", exact: true })
    .click();
  await page.keyboard.up("Control");
  const canvas = page.getByLabel("Print layout canvas"),
    box = (await canvas.boundingBox())!;
  await page.keyboard.down("Control");
  await page.mouse.move(box.x + 550, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 160, { steps: 8 });
  await expect(page.locator(".reorder-floating")).toBeVisible();
  await expect(page.locator(".delete-paper")).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(
    page.getByRole("button", { name: "Import Piece", exact: true }),
  ).toBeEnabled();
  expect((await save(page)).printLayouts[0].pages).toHaveLength(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await save(page)).printLayouts[0].pages).toHaveLength(1);
});
test("add-page icons require Ctrl and disappear on release and blur", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await expect(page.locator(".add-paper")).toHaveCount(0);
  await page.keyboard.down("Control");
  await expect(page.locator(".add-paper").first()).toBeVisible();
  await page.keyboard.up("Control");
  await expect(page.locator(".add-paper")).toHaveCount(0);
  await page.keyboard.down("Control");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".add-paper")).toHaveCount(0);
  await page.keyboard.up("Control");
});
test("a small rightward drag near the paper edge does not shift the row", async ({
  page,
}) => {
  await load(page);
  await create(page);
  await page.keyboard.down("Control");
  await page
    .getByRole("button", { name: "Add page right 0,0", exact: true })
    .click();
  await page.keyboard.up("Control");
  const before = await save(page),
    canvas = page.getByLabel("Print layout canvas"),
    box = (await canvas.boundingBox())!;
  await page.keyboard.down("Control");
  await page.mouse.move(box.x + 450, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 150, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  expect(await save(page)).toEqual(before);
});

test("unlink buttons freeze imported objects and folders with undo and persistence", async ({ page }) => {
  await load(page);
  await create(page);
  await page.getByRole("button", { name: "Import Pattern", exact: true }).click();
  const tree = page.getByLabel("Print object tree");
  const child = tree.getByRole("button", { name: "Unlink print Piece", exact: true });
  await expect(child).toBeEnabled();
  const row = child.locator("xpath=../..");
  await expect(row.getByRole("button").last()).toHaveAttribute("aria-label", "Unlink print Piece");
  await child.click();
  const broken = tree.getByRole("button", { name: "Unlinked print Piece", exact: true });
  await expect(broken).toBeDisabled();
  await expect(broken.locator("..")).toHaveAttribute("title", "Unlinked. Cannot be re-linked; use Undo to restore the link.");
  const detached = await save(page);
  expect(detached.printLayouts[0].instances[0].snapshot.shape).toMatchObject(rectangle);
  await page.locator(".print-workspace").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(child).toBeEnabled();
  await page.locator(".print-workspace").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(broken).toBeDisabled();
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  await tree.getByRole("button", { name: "Unlink print Pattern", exact: true }).click();
  await expect(tree.getByRole("button", { name: "Unlinked print Pattern", exact: true })).toBeDisabled();
  if (test.info().project.name === "chromium") {
    await page.locator(".print-workspace").screenshot({ path: "public/manual/images/print-unlink.png" });
  }
  await page.getByRole("tab", { name: "Grid", exact: true }).click();
  await page.getByRole("button", { name: "Piece", exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".object-select")).toHaveCount(0);
  const deleted = await save(page);
  expect(deleted.printLayouts[0].instances).toHaveLength(1);
  expect(deleted.printLayouts[0].instances[0].snapshot).toBeDefined();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles({ name: "detached.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(deleted)) });
  await page.getByRole("tab", { name: "A4", exact: true }).click();
  await expect(broken).toBeDisabled();
  expect((await save(page)).printLayouts[0].instances).toEqual(deleted.printLayouts[0].instances);
});


test("detached print copies duplicate and paste after their Grid source is deleted", async ({ page }) => {
  await load(page);
  await create(page);
  await page.getByRole("button", { name: "Import Piece", exact: true }).click();
  const tree = page.getByLabel("Print object tree");
  const canvas = page.getByLabel("Print layout canvas");
  await tree.getByRole("button", { name: "Unlink print Piece", exact: true }).click();
  await page.getByRole("tab", { name: "Grid", exact: true }).click();
  await page.getByRole("button", { name: "Piece", exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".object-select")).toHaveCount(0);
  await page.getByRole("tab", { name: "A4", exact: true }).click();
  await tree.getByRole("button", { name: "Piece", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(tree.getByRole("button", { name: "Unlinked print Piece", exact: true })).toHaveCount(2);
  await tree.getByRole("button", { name: "Piece", exact: true }).first().click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 400);
  const text = await canvas.evaluate((el) => {
    const data = new DataTransfer();
    const event = new ClipboardEvent("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    el.dispatchEvent(event);
    return data.getData("text/plain");
  });
  await canvas.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    el.dispatchEvent(event);
  }, text);
  await expect(tree.getByRole("button", { name: "Unlinked print Piece copy", exact: true })).toBeDisabled();
  const saved = await save(page);
  expect(saved.shapes).toHaveLength(0);
  expect(saved.printLayouts[0].instances).toHaveLength(3);
  for (const item of saved.printLayouts[0].instances) {
    expect(item.snapshot.shape).toMatchObject({ kind: rectangle.kind, points: rectangle.points, radius: rectangle.radius });
    expect(item.snapshot.shape.id).toBe(item.sourceId);
  }
});

test("Grid source selection clears outside the list and resets its range anchor", async ({ page }) => {
  await load(page);
  await create(page);
  const list = page.getByLabel("Grid source objects");
  const folder = list.getByRole("button", { name: "Pattern", exact: true });
  const piece = list.getByRole("button", { name: "Piece", exact: true });
  await folder.click();
  await piece.click({ modifiers: ["Control"] });
  await expect(list.locator('[aria-pressed="true"]')).toHaveCount(2);
  await page.getByLabel("Print layout canvas").click({ position: { x: 5, y: 5 } });
  await expect(list.locator('[aria-pressed="true"]')).toHaveCount(0);
  await piece.click({ modifiers: ["Shift"] });
  await expect(piece).toHaveAttribute("aria-pressed", "true");
  await expect(folder).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("tab", { name: "Grid", exact: true }).click();
  await page.getByRole("tab", { name: "A4", exact: true }).click();
  await expect(list.locator('[aria-pressed="true"]')).toHaveCount(0);
});

test("tool rails keep separators and share history and fit icons", async ({ page }) => {
  await load(page);
  const grid = page.getByRole("navigation", { name: "Drawing tools" });
  const textDivider = grid.getByRole("separator", { name: "Indicator tools" });
  for (const height of [600, 768, 800, 900]) {
    await page.setViewportSize({ width: 1280, height });
    expect((await textDivider.boundingBox())!.height).toBe(1);
    await expect(textDivider).toHaveCSS("border-top-style", "solid");
    await expect(textDivider).toHaveCSS("border-top-width", "1px");
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await grid.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(grid.getByRole("button", { name: "Fit", exact: true }).locator("svg")).toBeVisible();
  await page.screenshot({ path: "test-results/grid-tool-rail.png" });
  const historyFont = await grid.getByRole("button", { name: "Undo", exact: true }).evaluate(el => getComputedStyle(el).fontSize);
  await create(page);
  const print = page.getByRole("navigation", { name: "Print tools" });
  await expect(print.getByRole("separator")).toHaveCount(2);
  for (const separator of await print.getByRole("separator").all()) expect((await separator.boundingBox())!.height).toBe(1);
  for (const name of ["Undo", "Redo"]) {
    await expect(print.getByRole("button", { name, exact: true })).toHaveText(name === "Undo" ? "↶" : "↷");
    expect(await print.getByRole("button", { name, exact: true }).evaluate(el => getComputedStyle(el).fontSize))
      .toBe(historyFont);
  }
  await print.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(print.getByRole("button", { name: "Fit", exact: true }).locator("svg")).toBeVisible();
  await page.screenshot({ path: "test-results/print-tool-rail.png" });
});

test("native print tools create isolated editable objects and support Grid clipboard", async ({ page }) => {
  await load(page);
  await create(page);
  const canvas = page.getByLabel("Print layout canvas");
  const box = (await canvas.boundingBox())!;
  await page.getByRole("button", { name: "Text (T)", exact: true }).click();
  await canvas.click({ position: { x: 180, y: 180 } });
  await expect(page.getByRole("textbox", { name: "Label text" })).toBeFocused();
  await page.keyboard.type("Print only");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("textbox", { name: "Label text" })).toHaveCount(0);
  let document = await save(page);
  expect(document.shapes).toHaveLength(1);
  expect(document.printLayouts[0].instances).toHaveLength(1);
  expect(document.printLayouts[0].instances[0].snapshot.shape.text).toBe("Print only");
  await canvas.focus();
  await page.keyboard.press("d");
  await canvas.click({ position: { x: 170, y: 230 } });
  await canvas.click({ position: { x: 250, y: 230 } });
  await canvas.click({ position: { x: 250, y: 260 } });
  await expect.poll(async () => (await save(page)).printLayouts[0].instances.length).toBe(2);
  document = await save(page);
  expect(document.printLayouts[0].instances.some((i: any) => i.snapshot.shape.kind === "measurement")).toBe(true);
  await canvas.focus();
  await page.keyboard.press("Escape");
  // Copy a resolved print selection through the same interchange format as Grid.
  await page.getByLabel("Print object tree").getByRole("button", { name: "Measurement 2", exact: true }).click();
  await page.mouse.move(box.x + 210, box.y + 230);
  const clipboard = await canvas.evaluate(el => {
    const data = new DataTransfer();
    const event = new ClipboardEvent("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    el.dispatchEvent(event);
    return data.getData("text/plain");
  });
  expect(clipboard).toContain("leather-pattern-designer-clipboard");
  if (process.env.UPDATE_MANUAL_SCREENSHOTS && page.context().browser()?.browserType().name() === "chromium") {
    await page.screenshot({ path: "public/manual/images/print-drawing-tools.png" });
  }
  await page.getByRole("tab", { name: "Grid", exact: true }).click();
  const grid = page.getByLabel("Pattern drawing canvas");
  await grid.hover();
  await grid.evaluate((el, text) => {
    const data = new DataTransfer(); data.setData("text/plain", text);
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data }); el.dispatchEvent(event);
  }, clipboard);
  await expect.poll(async () => (await save(page)).shapes.length).toBe(2);
});

test("all print indicator variants, image import, editing, cancellation and tab isolation", async ({ page }) => {
  await load(page);
  await create(page);
  const canvas = page.getByLabel("Print layout canvas");
  for (const [index, label] of ["Square size guide", "Ruler size guide", "Arrow", "Bodyless arrow", "Crosshair"].entries()) {
    await page.getByRole("button", { name: "Measurement (D)", exact: true }).click({ button: "right" });
    await page.getByRole("menuitemradio", { name: label, exact: true }).click();
    await canvas.click({ position: { x: 180, y: 170 + index * 30 } });
    await canvas.click({ position: { x: 250, y: 190 + index * 30 } });
    await expect.poll(async () => (await save(page)).printLayouts[0].instances.length).toBe(index + 1);
  }
  await canvas.focus(); await page.keyboard.press("Escape");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import image", exact: true }).click();
  await (await chooser).setFiles({ name: "stamp.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="red"/></svg>') });
  await expect.poll(async () => (await save(page)).printLayouts[0].instances.length).toBe(6);
  await page.getByRole("button", { name: "Text (T)", exact: true }).click();
  await canvas.click({ position: { x: 160, y: 400 } });
  await page.getByRole("textbox", { name: "Label text" }).fill("Temporary");
  await page.keyboard.press("Escape");
  expect((await save(page)).printLayouts[0].instances).toHaveLength(6);
  await page.getByRole("button", { name: "Text (T)", exact: true }).click();
  await canvas.click({ position: { x: 160, y: 400 } });
  await page.getByRole("textbox", { name: "Label text" }).fill("Original label");
  await page.keyboard.press("Control+Enter");
  await expect.poll(async () => (await save(page)).printLayouts[0].instances.length).toBe(7);
  await canvas.dblclick({ position: { x: 170, y: 400 } });
  await page.getByRole("textbox", { name: "Label text" }).fill("Edited label");
  await page.keyboard.press("Control+Enter");
  await expect.poll(async () => (await save(page)).printLayouts[0].instances.find((i: any) => i.snapshot.shape.kind === "text")?.snapshot.shape.text).toBe("Edited label");
  await canvas.focus(); await page.keyboard.press("Control+z");
  await expect.poll(async () => (await save(page)).printLayouts[0].instances.find((i: any) => i.snapshot.shape.kind === "text")?.snapshot.shape.text).toBe("Original label");
  const before = await save(page);
  await page.getByRole("button", { name: "Create print layout", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("tab", { name: "A4 2", exact: true })).toHaveAttribute("aria-selected", "true");
  const after = await save(page);
  expect(after.shapes).toEqual(before.shapes);
  expect(after.printLayouts[0].instances).toEqual(before.printLayouts[0].instances);
  expect(after.printLayouts[1].instances).toEqual([]);
});

test("clipboard carries grouped Grid objects into independent copies on two print tabs", async ({ page }) => {
  await load(page);
  const grid = page.getByLabel("Pattern drawing canvas");
  await grid.hover(); await grid.focus(); await page.keyboard.press("Control+a");
  async function copy(canvas: ReturnType<Page["getByLabel"]>) {
    await canvas.hover();
    return canvas.evaluate(el => {
      const data = new DataTransfer();
      const event = new ClipboardEvent("copy", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: data }); el.dispatchEvent(event);
      return data.getData("text/plain");
    });
  }
  async function paste(canvas: ReturnType<Page["getByLabel"]>, text: string) {
    await canvas.hover();
    await canvas.evaluate((el, text) => {
      const data = new DataTransfer(); data.setData("text/plain", text);
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: data }); el.dispatchEvent(event);
    }, text);
  }
  const text = await copy(grid);
  expect(text).toContain("leather-pattern-designer-clipboard");
  await create(page);
  const canvas = page.getByLabel("Print layout canvas");
  await paste(canvas, text);
  await expect.poll(async () => (await save(page)).printLayouts[0].instances.length).toBe(1);
  const copiedPrint = await copy(canvas);
  expect(copiedPrint).toContain("leather-pattern-designer-clipboard");
  const before = await save(page);
  await page.getByRole("button", { name: "Create print layout", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("tab", { name: "A4 2", exact: true })).toHaveAttribute("aria-selected", "true");
  await paste(canvas, copiedPrint);
  await expect.poll(async () => (await save(page)).printLayouts[1].instances.length).toBe(1);
  const after = await save(page);
  expect(after.shapes).toEqual(before.shapes);
  expect(after.printLayouts[0]).toEqual(before.printLayouts[0]);
  expect(after.printLayouts[1].instances[0].snapshot).toBeDefined();
  expect(after.printLayouts[1].instances[0].id).not.toBe(before.printLayouts[0].instances[0].id);
});

test("print property edits use layout units, preview locally, cancel and undo once", async ({ page }) => {
  await load(page);
  await page.getByRole("button", { name: "Create print layout", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Units", { exact: true }).selectOption("in-decimal");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  const canvas = page.getByLabel("Print layout canvas");
  await page.getByRole("button", { name: "Measurement (D)", exact: true }).click({ button: "right" });
  await page.getByRole("menuitemradio", { name: "Square size guide", exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: 210 } });
  await canvas.click({ position: { x: box.width / 2 + 60, y: 260 } });
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  const before = await save(page);
  const side = page.getByLabel("Side length (in)", { exact: true });
  await expect(side).toBeVisible();
  await side.fill("2");
  await side.press("Escape");
  expect((await save(page)).printLayouts).toEqual(before.printLayouts);
  await side.fill("2");
  await side.press("Enter");
  await expect(side).toHaveValue("2");
  const after = await save(page);
  const shape = after.printLayouts[0].instances[0].snapshot.shape;
  const points = shape.points;
  const scale = Math.hypot(shape.transform?.a ?? 1, shape.transform?.b ?? 0);
  expect(Math.abs(points[1].x - points[0].x) * scale).toBeCloseTo(50.8);
  expect(after.shapes).toEqual(before.shapes);
  await canvas.focus(); await page.keyboard.press("Control+z");
  await expect.poll(async () => (await save(page)).printLayouts).toEqual(before.printLayouts);
});

test("a delayed image import cannot create objects after switching tabs", async ({ page }) => {
  await load(page); await create(page);
  await page.evaluate(() => {
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function(blob) {
      (window as any).releasePrintImport = () => read.call(this, blob);
    };
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import image", exact: true }).click();
  await (await chooser).setFiles({ name: "late.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10"/></svg>') });
  await page.getByRole("tab", { name: "Grid", exact: true }).click();
  await page.getByRole("tab", { name: "A4", exact: true }).click();
  await page.evaluate(() => (window as any).releasePrintImport());
  await expect(page.getByRole("alert")).toContainText("Tab or project changed during image import");
  const document = await save(page);
  expect(document.shapes).toHaveLength(1);
  expect(document.printLayouts[0].instances).toEqual([]);
});

test("print drawing layout and previews avoid asynchronous image generation", async ({ page }) => {
  await load(page); await create(page);
  const rail = page.getByRole("navigation", { name: "Print tools" });
  const order = await rail.locator('button[aria-label], [role=separator]').evaluateAll(elements => elements.map(el => el.getAttribute('aria-label') ?? 'separator'));
  expect(order.slice(0, 9)).toEqual(['Select (V)', 'Move (G)', 'Rotate (E)', 'Mirror (M)', 'separator', 'Text (T)', 'Measurement (D)', 'Import image', 'separator']);
  const canvas = page.getByLabel('Print layout canvas');
  await page.getByRole('button', { name: 'Measurement (D)', exact: true }).click({button: 'right'});
  await page.getByRole('menuitemradio', { name: 'Ruler size guide', exact: true }).click();
  await canvas.click({position: {x: 180, y: 200}});
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    (window as any).previewBlobCount = 0;
    URL.createObjectURL = function(blob) { (window as any).previewBlobCount++; return original.call(URL, blob); };
  });
  const box = (await canvas.boundingBox())!;
  for (let i = 0; i < 20; i++) await page.mouse.move(box.x + 220 + i * 3, box.y + 220 + i);
  expect(await page.evaluate(() => (window as any).previewBlobCount)).toBe(0);
  await canvas.click({position: {x: 280, y: 240}});
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  const pages = page.getByRole('region', { name: 'Pages', exact: true });
  const properties = page.locator('.print-workspace .object-properties');
  await expect(properties).toBeVisible();
  expect(await pages.evaluate((el) => !!(el.compareDocumentPosition(document.querySelector('.print-workspace .object-properties')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
});
