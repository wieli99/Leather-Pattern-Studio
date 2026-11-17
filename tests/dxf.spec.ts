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
