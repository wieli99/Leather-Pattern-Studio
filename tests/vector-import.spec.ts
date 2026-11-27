import { test, expect } from "@playwright/test";
import { manualScreenshot } from "./manual-capture";
import { readFileSync } from "node:fs";

async function choose(
  page: import("@playwright/test").Page,
  file = "tests/fixtures/vector/inkscape-pattern.svg",
) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import image", exact: true }).click();
  await (await chooser).setFiles(file);
  await expect(page.getByRole("dialog", { name: "Import SVG" })).toBeVisible();
}

test(
  "review, cancel, import, edit and save editable SVG at physical size",
  { tag: "@manual" },
  async ({ page }, info) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Import image", exact: true }),
    ).toBeEnabled();
    await choose(page);
    const dialog = page.getByRole("dialog", { name: "Import SVG" });
    await expect(dialog).toContainText("100.00 × 60.00 mm");
    await expect(
      dialog.getByRole("img", { name: "Imported geometry preview" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeFocused();
    await expect(page.locator(".object-select")).toHaveCount(0);
    await choose(page);
    await dialog.getByRole("button", { name: "Import", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".object-select")).toHaveCount(2);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".object-select")).toHaveCount(0);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.locator(".object-select")).toHaveCount(2);
    await page.locator(".object-select").filter({ hasText: "body" }).click();
    await page.getByRole("button", { name: "Resize", exact: true }).click();
    await page
      .getByRole("textbox", { name: "X factor", exact: true })
      .fill("1.1");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await page.locator(".object-select").filter({ hasText: "guide" }).click();
    await page.getByText("Vertex coordinates", { exact: true }).click();
    const vertex = page.getByLabel("Vertex 1 X", { exact: true });
    const originalX = Number(await vertex.inputValue());
    await vertex.fill(String(originalX + 1));
    await vertex.press("Enter");
    await expect(vertex).toHaveValue(String(originalX + 1));
    await page.evaluate(() => {
      delete (window as any).showSaveFilePicker;
      delete (window as any).showOpenFilePicker;
    });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const saved = await download,
      path = info.outputPath("imported.leather");
    await saved.saveAs(path);
    const project = JSON.parse(readFileSync(path, "utf8"));
    expect(project.shapes).toHaveLength(2);
    const body = project.shapes.find((s: any) => s.name === "body");
    expect(body.kind).toBe("compound");
    const xs = body.contours
      .flat(2)
      .map((p: any) =>
        body.transform
          ? body.transform.a * p.x + body.transform.c * p.y + body.transform.e
          : p.x,
      );
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(110);
    expect(
      project.shapes.find((s: any) => s.name === "guide").points[0].x,
    ).toBeCloseTo(originalX + 1, 1);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await (await chooser).setFiles(path);
    await expect(page.locator(".object-select")).toHaveCount(2);
    await page.locator(".object-select").filter({ hasText: "guide" }).click();
    await expect(page.getByLabel("Vertex 1 X", { exact: true })).toHaveValue(
      String(originalX + 1),
    );
  },
);

test("unsupported-only SVG review disables import and Escape cancels", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import image", exact: true }).click();
  await (
    await picker
  ).setFiles({
    name: "unsupported.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm"><text>Wallet</text></svg>',
    ),
  });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  await expect(dialog).toContainText("Omitted unsupported text");
  await expect(
    dialog.getByRole("button", { name: "Import", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".object-select")).toHaveCount(0);
});

test(
  "stitch preview resets per SVG and imports only the highlighted runs",
  { tag: "@manual" },
  async ({ page }, info) => {
    const fixture = "tests/fixtures/vector/stitch-marks.svg";
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "Import SVG" });
    const detect = dialog.getByRole("checkbox", {
      name: "Detect stitching lines",
    });
    const highlights = dialog.locator("[data-detected-stitch-line]");
    const insert = dialog.getByRole("button", { name: "Import", exact: true });
    await choose(page, fixture);
    await expect(detect).toBeChecked();
    await expect(highlights).toHaveCount(5);
    await expect(dialog).toContainText("41 holes");
    await expect(dialog.getByText("DXF export puts converted stitching on the Stitch holes layer", { exact: false })).toBeVisible();
    await manualScreenshot(dialog, "editable-svg-import.png");
    await dialog.screenshot({ path: info.outputPath("detected-stitch-preview.png") });
    await detect.uncheck();
    await expect(dialog.getByText("DXF export puts converted stitching on the Stitch holes layer", { exact: false })).toHaveCount(0);
    await expect(highlights).toHaveCount(0);
    await insert.click();
    await expect(page.locator(".object-select")).toHaveCount(43);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".object-select")).toHaveCount(0);
    await choose(page, fixture);
    await expect(detect).toBeChecked();
    await expect(highlights).toHaveCount(5);
    await insert.click();
    await expect(page.locator(".object-select")).toHaveCount(7);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".object-select")).toHaveCount(0);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.locator(".object-select")).toHaveCount(7);
    await page.evaluate(() => {
      delete (window as any).showSaveFilePicker;
      delete (window as any).showOpenFilePicker;
    });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const path = info.outputPath("detected-stitching.leather");
    await (await download).saveAs(path);
    const project = JSON.parse(readFileSync(path, "utf8"));
    expect(project.stitchGroups).toHaveLength(5);
    expect(
      project.stitchGroups.every(
        (group: any) =>
          group.settings.inset === 0 &&
          project.shapes.some(
            (shape: any) => shape.id === group.shapeId && shape.stitchOnly,
          ),
      ),
    ).toBe(true);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await (await chooser).setFiles(path);
    await expect(page.locator(".object-select")).toHaveCount(7);
  },
);

test("SVG conversion errors leave the image choice available", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: "percentage.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>',
    ),
  });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  await expect(dialog.getByRole("alert")).toContainText(
    "Unresolved SVG length",
  );
  const insert = dialog.getByRole("button", { name: "Import", exact: true });
  await expect(insert).toBeDisabled();
  await dialog.getByRole("radio", { name: "Import as image" }).check();
  await insert.click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("Image opacity (%)", { exact: true }),
  ).toBeVisible();
});

test("compound stitch import replaces just the highlighted contours", async ({ page }, info) => {
  const fixture = "tests/fixtures/vector/compound-stitch-marks.svg";
  await page.goto("/");
  await page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
    delete (window as any).showOpenFilePicker;
  });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  const highlights = dialog.locator("[data-detected-stitch-contour]");
  const insert = dialog.getByRole("button", { name: "Import", exact: true });
  async function save(name: string) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const path = info.outputPath(name + ".leather");
    await (await download).saveAs(path);
    return { document: JSON.parse(readFileSync(path, "utf8")), path };
  }

  await choose(page, fixture);
  await expect(highlights).toHaveCount(16);
  await expect(dialog.locator("[data-detected-stitch-line]")).toHaveCount(3);
  await dialog.getByRole("checkbox", { name: "Detect stitching lines" }).uncheck();
  await expect(highlights).toHaveCount(0);
  await insert.click();
  await expect(dialog).not.toBeVisible();
  const { document: original } = await save("original-contours");
  expect(original.stitchGroups ?? []).toHaveLength(0);
  expect(original.shapes.find((s: any) => s.name === "Piece").contours).toHaveLength(11);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await choose(page, fixture);
  await expect(highlights).toHaveCount(16);
  await insert.click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".object-select")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".object-select")).toHaveCount(6);

  const { document: converted, path } = await save("converted-contours");
  expect(converted.stitchGroups).toHaveLength(3);
  expect(converted.stitchGroups.map((group: any) => group.settings.holeCount).sort()).toEqual([3, 4, 9]);
  const corner = converted.stitchGroups.find((group: any) => group.settings.holeCount === 9);
  expect(converted.shapes.find((shape: any) => shape.id === corner.shapeId).kind).toBe("polyline");
  for (const group of converted.stitchGroups) {
    expect(group.settings).toMatchObject({ style: "round", inset: 0 });
    expect(group.settings.roundDiameter).toBeCloseTo(1.2);
    expect(group.settings.spacing).toBeCloseTo(4);
  }
  const piece = converted.shapes.find((s: any) => s.name === "Piece");
  expect(piece.contours).toHaveLength(2);
  const sourcePiece = original.shapes.find((s: any) => s.name === "Piece");
  for (const [i, sourceIndex] of [0, 10].entries()) {
    expect(piece.contours[i]).toEqual(sourcePiece.contours[sourceIndex]);
  }
  for (const name of ["Filled", "Branch"]) {
    expect(converted.shapes.find((s: any) => s.name === name).contours)
      .toEqual(original.shapes.find((s: any) => s.name === name).contours);
  }
  expect(converted.shapes.some((s: any) => ["Holes only", "Filled triple"].includes(s.name))).toBe(false);

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByRole("button", { name: "Piece", exact: true })).toBeVisible();
  const { document: reopened } = await save("reopened-contours");
  expect(reopened.stitchGroups).toEqual(converted.stitchGroups);
});

test("large SVG within geometry limits reaches review and commits", async ({ page }) => {
  await page.goto("/");
  const segments = "h1".repeat(8500);
  const shapes = Array.from({ length: 8 }, (_, y) =>
    `<path d="M0 ${y}${segments}" fill="none" stroke="black"/>`).join("");
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: "large.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="8500mm" height="8mm" viewBox="0 0 8500 8">${shapes}</svg>`),
  });
  const review = page.getByRole("dialog", { name: "Import SVG" });
  await expect(review).toContainText("8500.00 × 7.00 mm");
  await review.getByRole("button", { name: "Import", exact: true }).click();
  await expect(review).not.toBeVisible();
  await expect(page.locator(".object-select")).toHaveCount(8);
});

test("editable SVG nesting limit includes the filename group and allows commit at the boundary", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  const insert = dialog.getByRole("button", { name: "Import", exact: true });
  const load = async (depth: number, body = '<rect width="10" height="10"/>') => {
    await page.getByLabel("Image file", { exact: true }).setInputFiles({
      name: "nested.svg", mimeType: "image/svg+xml",
      buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="20mm">${"<g>".repeat(depth)}${body}${"</g>".repeat(depth)}</svg>`),
    });
    await expect(dialog).toBeVisible();
  };
  await load(61);
  await expect(insert).toBeEnabled();
  await insert.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".object-select")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".object-select")).toHaveCount(0);

  await load(62);
  await expect(dialog.getByRole("alert")).toContainText("exceeds 61 nested groups");
  await expect(insert).toBeDisabled();
  await dialog.getByRole("radio", { name: "Import as image" }).check();
  await expect(insert).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  // Splitting a stroked, filled compound creates an extra retained group.
  await load(61, '<path stroke="black" d="M0 0H20V20H0Z M5 5H15V15H5Z"/>');
  await expect(dialog.getByRole("alert")).toContainText("exceeds 61 nested groups");
  await expect(insert).toBeDisabled();
});

test("geometry CSS blocks editable confirmation and keeps SVG image import available", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: "css-size.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" style="width:200mm"><rect width="20" height="10"/></svg>'),
  });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  const insert = dialog.getByRole("button", { name: "Import", exact: true });
  await expect(dialog.getByRole("alert")).toContainText("cannot apply CSS");
  await expect(insert).toBeDisabled();
  await dialog.getByRole("radio", { name: "Import as image" }).check();
  await insert.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Image opacity (%)", { exact: true })).toBeVisible();
});

test("UTF-16 SVG files with either byte order import as editable geometry", async ({ page }) => {
  await page.goto("/");
  const file = page.getByLabel("Image file", { exact: true });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  const svg = '<?xml version="1.0" encoding="UTF-16"?><svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><rect id="Échantillon" width="20" height="10"/></svg>';
  for (const bigEndian of [false, true]) {
    const bytes = Buffer.from("\ufeff" + svg, "utf16le");
    await file.setInputFiles({ name: "utf16.svg", mimeType: "image/svg+xml", buffer: bigEndian ? bytes.swap16() : bytes });
    await expect(dialog).toContainText("20.00 × 10.00 mm");
    await dialog.getByRole("button", { name: "Import", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".object-select").filter({ hasText: "Échantillon" })).toHaveCount(1);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".object-select")).toHaveCount(0);
  }
});

for (const { name, artwork, error } of [
  {
    name: "unresolved clipping",
    artwork: '<defs><clipPath id="trim"><rect width="5" height="20"/></clipPath></defs><style>#part {clip-path:url(#trim)}</style><rect id="part" width="50" height="20"/>',
    error: "cannot resolve CSS clipping",
  },
  {
    name: "CSS opacity expression",
    artwork: '<style>.outline {stroke-opacity:calc(1 - 1)}</style><rect class="outline" width="50" height="20" stroke="black"/><rect x="60" width="10" height="10"/>',
    error: "CSS expression for stroke-opacity",
  },
  {
    name: "CSS layer rollback",
    artwork: '<rect width="50" height="20" display="none" style="display:revert-layer"/><rect x="60" width="10" height="10"/>',
    error: "cannot resolve display",
  },
  {
    name: "escaped CSS visibility",
    artwork: '<style>.hide {display:n\\6f ne}</style><rect class="hide" width="50" height="20"/><rect x="60" width="10" height="10"/>',
    error: "cannot resolve display",
  },
  {
    name: "unresolved presentation variable",
    artwork: '<rect width="50" height="20" display="var(--show, none)"/><rect x="60" width="10" height="10"/>',
    error: "cannot resolve display",
  },
  {
    name: "partially shared fill boundaries",
    artwork: '<path d="M0 0H20V20H0Z M10 0H30V20H10Z"/>',
    error: "partially shared contour edges",
  },
  {
    name: "unresolved paint",
    artwork: '<style>path.cut {fill:none;stroke:none}</style><path class="cut" d="M0 0H50V20H0Z"/><rect x="60" width="10" height="10"/>',
    error: "cannot resolve CSS visibility",
  },
]) {
  test(`${name} blocks editable import and offers the original SVG as an image`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Image file", { exact: true }).setInputFiles({
      name: "artwork.svg", mimeType: "image/svg+xml",
      buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm">${artwork}</svg>`),
    });
    const dialog = page.getByRole("dialog", { name: "Import SVG" });
    const insert = dialog.getByRole("button", { name: "Import", exact: true });
    await expect(dialog.getByRole("alert")).toContainText(error);
    await expect(insert).toBeDisabled();
    await dialog.getByRole("radio", { name: "Import as image" }).check();
    await insert.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Image opacity (%)", { exact: true })).toBeVisible();
  });
}

test("long Unicode SVG labels commit without a split surrogate", async ({ page }) => {
  await page.goto("/");
  const label = "a".repeat(199) + "😀";
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: label + ".svg", mimeType: "image/svg+xml",
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="50mm"><g id="${label}"><path id="${label}" stroke="black" d="M0 0H40V40H0Z M5 5H10V10H5Z"/></g></svg>`),
  });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".object-select")).toHaveCount(2);
});

test("declared SVG encoding preserves Latin-1 labels and rejects invalid byte sequences", async ({ page }) => {
  await page.goto("/");
  const file = page.getByLabel("Image file", { exact: true });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  const insert = dialog.getByRole("button", { name: "Import", exact: true });
  const svg = (encoding: string) => `<?xml version="1.0" encoding="${encoding}"?><svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm"><g id="Pièce"><rect width="20" height="10"/></g></svg>`;
  await file.setInputFiles({ name: "latin1.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg("ISO-8859-1"), "latin1") });
  await insert.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Pièce", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".object-select")).toHaveCount(0);

  for (const [bytes, message] of [
    [Buffer.from(svg("UTF-8"), "latin1"), "invalid UTF-8 bytes"],
    [Buffer.from(svg("KOI8-R")), "Unsupported SVG encoding"],
    [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(svg("ISO-8859-1"), "latin1")]), "conflicts with the UTF-8 byte-order mark"],
  ] as const) {
    await file.setInputFiles({ name: "encoding.svg", mimeType: "image/svg+xml", buffer: bytes });
    await expect(dialog.getByRole("alert")).toContainText(message);
    await expect(insert).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
});

test("SVG import keeps source markup and external resources out of the editor", async ({ page }) => {
  await page.goto("/");
  const resource = "https://example.invalid/svg-import-isolation";
  const requests: string[] = [];
  await page.route(resource + "**", async route => {
    requests.push(route.request().url());
    await route.abort();
  });
  const label = '<span data-svg-import-probe="">literal label</span>';
  const buffer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" viewBox="0 0 40 20" onload="window.svgImportProbe = true">
    <script>window.svgImportProbe = true</script>
    <image href="${resource}/image.png" width="10" height="10"/>
    <foreignObject width="10" height="10">
      <span xmlns="http://www.w3.org/1999/xhtml" data-svg-import-probe="">Source node</span>
    </foreignObject>
    <rect id='&lt;span data-svg-import-probe=""&gt;literal label&lt;/span&gt;' width="40" height="20" fill="url(${resource}/paint.svg#fill) red"/>
  </svg>`);
  const file = page.getByLabel("Image file", { exact: true });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  const insert = dialog.getByRole("button", { name: "Import", exact: true });
  await file.setInputFiles({ name: "isolation.svg", mimeType: "image/svg+xml", buffer });
  await expect(dialog).toContainText("Artwork: 40.00 × 20.00 mm");
  await expect(dialog.getByRole("list", { name: "Import warnings" })).toContainText("Omitted unsupported script");
  await insert.click();
  await expect(page.locator(".object-select").filter({ hasText: label })).toHaveCount(1);

  await file.setInputFiles({ name: "isolation.svg", mimeType: "image/svg+xml", buffer });
  await dialog.getByRole("radio", { name: "Import as image" }).check();
  await insert.click();
  await expect(page.locator(".object-select").filter({ hasText: "isolation.svg" })).toHaveCount(1);
  await expect(page.locator("[data-svg-import-probe]")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "svgImportProbe"))).toBeUndefined();
  expect(requests).toEqual([]);
});
