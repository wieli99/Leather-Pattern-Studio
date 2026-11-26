import { test, expect } from "@playwright/test";

test("DXF exports closed millimetre outlines and rejects empty layouts", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { flattenOutline } = await import("/src/model/flattenOutline.ts");
    const { layoutDxf } = await import("/src/editor/printDxf.ts");
    const shape = { id: "r", kind: "rectangle", name: "Piece", points: [{ x: 0, y: 0 }, { x: 80, y: 40 }], radius: 0, rotation: 0 };
    const circle = flattenOutline({ ...shape, kind: "circle", points: [{x:0,y:0},{x:40,y:0}] } as any);
    const arc = flattenOutline({ ...shape, kind: "arc", sweep: -360 } as any);
    const doc = { shapes: [shape], stitchGroups: [] };
    const layout = { name: "Test", units: "in", instances: [{ id: "p", sourceId: "r", x: 40, y: 20, rotation: 0 }], pages: [] };
    const output = layoutDxf(doc as any, layout as any);
    const { svgImage } = await import("/src/editor/printExport.ts");
    const image = await svgImage(output.svg);
    const canvas = document.createElement("canvas");
    canvas.width = 820;
    canvas.height = 420;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, 820, 420);
    const background = Array.from(ctx.getImageData(410, 210, 1, 1).data);
    const pixels = ctx.getImageData(0, 0, 820, 420).data;
    let darkPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] < 128 && pixels[i + 3] === 255) darkPixels++;
    }
    let error = "";
    try { layoutDxf(doc as any, { ...layout, instances: [] } as any); } catch (e) { error = String(e); }
    return { ...output, error, background, darkPixels, circleVertices: circle.points.length, arcClosed: arc.closed };
  });
  expect(result.circleVertices).toBeLessThan(1000);
  expect(result.arcClosed).toBe(true);
  expect(result.background).toEqual([255, 255, 255, 255]);
  expect(result.darkPixels).toBeGreaterThan(100);
  expect(result.darkPixels).toBeLessThan(820 * 420 / 10);
  expect(result.text).toContain("$INSUNITS\r\n70\r\n4");
  expect(result.text).toContain("LWPOLYLINE");
  expect(result.text).toContain("70\r\n1");
  expect(result.width).toBeCloseTo(82);
  expect(result.height).toBeCloseTo(42);
  expect(result.error).toContain("No outlines to export");
});

test("unpainted SVG outlines do not affect import review or DXF cuts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: "unpainted.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500mm" height="100mm" viewBox="0 0 500 100"><rect id="piece" width="50" height="20" fill="none" stroke="black"/><rect id="unpainted" x="300" width="100" height="50" fill="none"/><rect id="transparent" x="400" width="50" height="30" fill="transparent"/><line id="unstroked" x1="410" x2="450" y1="40" y2="40"/></svg>'),
  });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  await expect(dialog).toContainText("Artwork: 50.00 × 20.00 mm");
  await expect(dialog).toContainText("Omitted unpainted rect “unpainted”");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".object-select")).toHaveCount(1);
  const result = await page.evaluate(async () => {
    const { editor } = await import("/src/editor/instance.ts");
    const { layoutDxf } = await import("/src/editor/printDxf.ts");
    const shapes = editor.document.shapes;
    const layout = {
      name: "Imported", units: "mm", pages: [],
      instances: shapes.map(shape => ({ id: shape.id, sourceId: shape.id, x: 0, y: 0, rotation: 0 })),
    };
    const dxf = layoutDxf(editor.document, layout as any);
    return { names: shapes.map(shape => shape.name), cuts: dxf.text.match(/LWPOLYLINE/g)?.length, width: dxf.width };
  });
  expect(result.names).toEqual(["piece"]);
  expect(result.cuts).toBe(1);
  expect(result.width).toBeCloseTo(52);
});

test("imported visual fill layers survive saving but do not duplicate DXF cuts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: "fills.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><path id="paired" fill="red" stroke="black" d="M0 0H40V40H0Z M10 10H20V20H10Z"/><rect id="ordinary" x="60" width="20" height="10" fill="black"/></svg>'),
  });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.locator(".object-select")).toHaveCount(3);
  const result = await page.evaluate(async () => {
    const { editor } = await import("/src/editor/instance.ts");
    const { parseProject } = await import("/src/model/project.ts");
    const { layoutDxf } = await import("/src/editor/printDxf.ts");
    editor.selected = editor.document.shapes.filter(shape => shape.name.startsWith("paired")).map(shape => shape.id);
    editor.activateOffset();
    editor.setOffsetDistance(3);
    if (editor.offset?.error) throw Error(editor.offset.error);
    await editor.applyOffset();
    const doc = parseProject(JSON.stringify(editor.document));
    const layout = {
      name: "Imported", units: "mm", pages: [],
      instances: doc.shapes.map(shape => ({ id: shape.id, sourceId: shape.id, x: 0, y: 0, rotation: 0 })),
    };
    return {
      excluded: doc.shapes.filter(shape => shape.excludeFromDxf).map(shape => shape.name),
      cuts: layoutDxf(doc, layout as any).text.match(/LWPOLYLINE/g)?.length,
    };
  });
  expect(result.excluded).toEqual(["paired (fill)", "paired (fill) offset"]);
  expect(result.cuts).toBe(5);
});

test("DXF keeps painted and stroked paths while omitting unpainted ones", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: "open-paths.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="500mm" height="100mm" viewBox="0 0 500 100">
      <defs><linearGradient id="gradient"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs>
      <path id="open-fill" d="M0 0L20 0L10 20"/>
      <path id="open-stroke" d="M25 0L35 0" stroke="black"/>
      <path id="closed-gradient" fill="url(#gradient)" d="M5 5H10V12H5Z"/>
      <path id="closed-stroke" fill="url(#gradient)" stroke="black" d="M25 5H35Z"/>
      <path id="unpainted" d="M300 0L330 0"/>
      <path id="unpainted-gradient" fill="url(#gradient)" d="M350 0L380 0"/>
      <path id="backtrack" d="M390 0L410 0L400 0"/>
      <path id="curved-backtrack" d="M380 0Q390 20 400 0Q390 20 380 0L381 0"/>
      <path id="closed-flat" fill="url(#gradient)" d="M375 0H415Z"/>
      <path id="closed-retrace" fill="url(#gradient)" stroke="black" stroke-width="0" d="M420 0Q430 20 440 0Q430 20 420 0Z"/>
      <path id="cancelled" fill-rule="evenodd" d="M450 0L460 0L450 20 M450 0L460 0L450 20"/>
      <path id="mixed-cancelled" fill-rule="evenodd" d="M470 0H480V20H470Z M470 0H480V20H470"/>
    </svg>`),
  });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  await expect(dialog).toContainText("Artwork: 35.00 × 20.00 mm");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.locator(".object-select")).toHaveCount(4);
  const output = await page.evaluate(async () => {
    const { editor } = await import("/src/editor/instance.ts");
    const { layoutDxf } = await import("/src/editor/printDxf.ts");
    const shapes = editor.document.shapes;
    const layout = {
      name: "Imported", units: "mm", pages: [],
      instances: shapes.map(shape => ({ id: shape.id, sourceId: shape.id, x: 0, y: 0, rotation: 0 })),
    };
    return {
      names: shapes.map(shape => shape.name).sort(),
      cuts: layoutDxf(editor.document, layout as any).text.match(/LWPOLYLINE/g)?.length,
    };
  });
  expect(output.names).toEqual(["closed-gradient", "closed-stroke", "open-fill", "open-stroke"]);
  expect(output.cuts).toBe(4);
});

test("imported straight and filled shapes can be offset and exported", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: "offset.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="50mm" viewBox="0 0 200 50">
      <defs><linearGradient id="gradient"><stop stop-color="blue"/></linearGradient></defs>
      <line id="line" x2="20" stroke="black"/>
      <rect id="rectangle" x="30" width="20" height="10" fill="none" stroke="black"/>
      <circle id="circle" cx="65" cy="10" r="10" fill="url('#missing') red"/>
      <rect id="gradient-outline" x="78" width="12" height="10" fill="url(#gradient) none"/>
      <rect x="120" width="10" height="10" fill="url(#missing) none"/>
      <rect x="140" width="10" height="10" fill='url("#missing") transparent'/>
      <line x1="160" x2="180" stroke="url(#missing) none"/>
      <rect x="120" width="10" height="10" fill="url(#missing)"/>
      <line x1="160" x2="180" stroke='url("#missing")'/>
      <g visibility="hidden"><rect x="140" width="10" height="10" visibility="bogus"/></g>
      <rect x="140" width="10" height="10" display="contents"/>
      <foreignObject><style xmlns="http://www.w3.org/1999/xhtml">.guide {display:none}</style></foreignObject>
      <rect class="guide" x="140" width="10" height="10"/>
      <rect x="140" width="10" height="10" fill="url(other.svg#paint) none"/>
      <rect x="140" width="10" height="10" fill="context-fill"/>
      <rect x="140" width="10" height="10" style="fill:context-stroke"/>
      <line x1="160" x2="180" stroke="context-stroke"/>
      <g display="contents" transform="translate(120)" opacity="0" fill="none" stroke="black">
        <rect id="capsule" x="5" y="10" width="30" height="10" rx="5"/>
      </g>
      <g stroke-width="1em"><rect id="quoted-style" x="78" y="10" width="12" height="10"
        style='--note: "first; display:none; transform:scale(2); last"; --nested: fn(a; display:none; b); fill:red'/></g>
    </svg>`),
  });
  const dialog = page.getByRole("dialog", { name: "Import SVG" });
  await expect(dialog).toContainText("Artwork: 90.00 × 20.00 mm");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.locator(".object-select")).toHaveCount(6);

  const result = await page.evaluate(async () => {
    const { editor } = await import("/src/editor/instance.ts");
    const { layoutDxf } = await import("/src/editor/printDxf.ts");
    const { bounds } = await import("/src/model/geometry.ts");
    const sources = editor.document.shapes.filter(shape => shape.name !== "gradient-outline" && shape.name !== "quoted-style");
    editor.selected = sources.map(shape => shape.id);
    editor.activateOffset();
    editor.setOffsetDistance(3);
    if (editor.offset?.error) throw Error(editor.offset.error);
    await editor.applyOffset();
    editor.selected = [];
    const shapes = editor.document.shapes;
    const layout = {
      name: "Offsets", units: "mm", pages: [],
      instances: shapes.map(shape => ({ id: shape.id, sourceId: shape.id, x: 0, y: 0, rotation: 0 })),
    };
    return {
      outlines: Object.fromEntries(shapes.map(shape => [shape.name, {
        ...bounds([shape]), color: shape.strokeColor, fill: shape.fillColor, opacity: shape.strokeOpacity,
      }])),
      cuts: layoutDxf(editor.document, layout as any).text.match(/LWPOLYLINE/g)?.length,
    };
  });
  expect(result.outlines["line offset"].width).toBeCloseTo(20);
  expect(result.outlines.line.y - result.outlines["line offset"].y).toBeCloseTo(3);
  expect(result.outlines["rectangle offset"].width).toBeCloseTo(26);
  expect(result.outlines["rectangle offset"].height).toBeCloseTo(16);
  expect(result.outlines.circle.opacity).toBe(0);
  expect(result.outlines["circle offset"]).toMatchObject({ color: "#ff0000", opacity: 1 });
  expect(result.outlines["circle offset"].width).toBeCloseTo(26, 1);
  expect(result.outlines.capsule.x - result.outlines.line.x).toBeCloseTo(5);
  expect(result.outlines["capsule offset"].width).toBeCloseTo(36, 1);
  expect(result.outlines["capsule offset"].height).toBeCloseTo(16, 1);
  expect(result.outlines["quoted-style"].fill).toBe("#ff0000");
  expect(result.cuts).toBe(10);
});
