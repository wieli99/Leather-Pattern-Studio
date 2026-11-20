import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("SVG conversion preserves units, transforms, groups, holes, and open paths", async ({
  page,
}) => {
  await page.goto("/");
  // Let the app warm Vite's dependencies before importing source modules directly.
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const fixture = readFileSync(
    "tests/fixtures/vector/inkscape-pattern.svg",
    "utf8",
  );
  const output = await page.evaluate(async (text) => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const { parseProject } = await import("/src/model/project.ts");
    const r = parseVectorSvg(text);
    parseProject(
      JSON.stringify({ version: 23, shapes: r.shapes, objectTree: r.tree }),
    );
    return r;
  }, fixture);
  expect(output.width).toBeCloseTo(120);
  expect(output.height).toBeCloseTo(80);
  expect(output.bounds.x).toBeCloseTo(10);
  expect(output.bounds.width).toBeCloseTo(100);
  expect(output.shapes[0].kind).toBe("compound");
  expect(output.shapes[0].contours).toHaveLength(2);
  expect(output.shapes[1].points[0]).not.toEqual(
    output.shapes[1].points.at(-1),
  );
  expect(output.tree[0]).toMatchObject({ kind: "group", name: "Wallet" });
  expect(output.tree[0].children[0]).toMatchObject({
    kind: "group",
    name: "Construction",
  });
});

test("SVG subset rejects invalid geometry and never loads resources", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const requested: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("vector-resource")) requested.push(r.url());
  });
  const result = await page.evaluate(async () => {
    const { parseVectorSvg: parse } = await import(
      "/src/editor/vectorImport.ts"
    );
    const wrap = (
      body: string,
      attrs = 'width="100mm" height="50mm" viewBox="0 0 100 50"',
    ) => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
    const omitted = parse(
      wrap(
        '<style>@import url(https://example.com/vector-resource);</style><image href="https://example.com/vector-resource"/><script>alert(1)</script><g clip-path="url(#x)"><rect width="10" height="10"/></g><rect width="10" height="10" fill="url(https://example.com/vector-resource) red"/><text>Label</text><use href="#x"/>',
      ),
    );
    const errors = [
      "<svg>",
      '<!DOCTYPE svg [<!ENTITY x "text">]><svg/>',
      wrap('<path d="M0 0L1e999 2"/>'),
      wrap('<rect width="10" height="10"/>', 'width="100%" height="50mm"'),
      wrap("", 'viewBox="0 0 0 10"'),
      wrap('<rect width="-1" height="2"/>'),
      wrap("<g>".repeat(101) + "</g>".repeat(101)),
      wrap('<line x2="1" stroke="black"/>'.repeat(10001)),
    ].map((text) => {
      try {
        parse(text);
        return "";
      } catch (e) {
        return String(e);
      }
    });
    const scaled = parse(
      wrap(
        '<g transform="translate(10 5) scale(2)"><line x2="20" y2="5" stroke="black"/></g>',
      ),
    );
    const px = parse(
      wrap('<rect width="96" height="48"/>', 'width="96" height="48"'),
    );
    const aspect = parse(
      wrap(
        '<rect width="100" height="100"/>',
        'width="200mm" height="100mm" viewBox="0 0 100 100"',
      ),
    );
    const none = parse(
      wrap(
        '<rect width="100" height="100"/>',
        'width="200mm" height="100mm" viewBox="0 0 100 100" preserveAspectRatio="none"',
      ),
    );
    const nested = (direction: string, rule: string) =>
      parse(
        wrap(`<path fill-rule="${rule}" d="M0 0h100v50h-100z ${direction}"/>`),
      );
    const nonzero = nested("M10 10h20v20h-20z", "nonzero");
    const evenodd = nested("M10 10h20v20h-20z", "evenodd");
    const mixed = parse(wrap('<path d="M0 0h10v10h-10z M20 0h10v5"/>'));
    const primitives = parse(
      wrap(
        '<circle cx="20" cy="20" r="10"/><ellipse cx="50" cy="20" rx="10" ry="5"/><polygon points="0,0 10,0 10,10"/><polyline points="20 0 30 0 30 10"/><rect x="60" y="10" width="20" height="20" rx="3"/>',
      ),
    );
    return {
      warnings: omitted.warnings,
      omitted: omitted.shapes.length,
      errors,
      scaled,
      px,
      aspect,
      none,
      nonzero,
      evenodd,
      mixed,
      primitives,
    };
  });
  expect(requested).toEqual([]);
  expect(result.errors.every(Boolean)).toBe(true);
  expect(result.omitted).toBe(1);
  expect(result.warnings.join(" ")).toContain("clipping");
  expect(result.scaled.shapes[0].points).toEqual([
    { x: 10, y: 5 },
    { x: 50, y: 15 },
  ]);
  expect(result.px.bounds.width).toBeCloseTo(25.4);
  expect(result.aspect.bounds).toMatchObject({
    x: 50,
    width: 100,
    height: 100,
  });
  expect(result.none.bounds.width).toBeCloseTo(200);
  expect(result.nonzero.shapes).toHaveLength(1);
  expect(result.nonzero.shapes[0].contours?.length ?? 1).toBe(1);
  expect(result.evenodd.shapes[0].contours).toHaveLength(2);
  expect(result.mixed.shapes).toHaveLength(1);
  expect(result.mixed.shapes[0]).toMatchObject({ kind: "compound", fillOpacity: 1, strokeOpacity: 0 });
  expect(result.mixed.shapes[0].contours).toHaveLength(2);
  expect(result.primitives.shapes).toHaveLength(5);
});

test("Illustrator-style geometry and LPS SVG paths remain editable", async ({
  page,
}) => {
  await page.goto("/");
  const fixture = readFileSync(
    "tests/fixtures/vector/illustrator-pattern.svg",
    "utf8",
  );
  const result = await page.evaluate(async (text) => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const { svgShapePath } = await import("/src/editor/printScene.ts");
    const r = parseVectorSvg(text);
    const path = svgShapePath(r.shapes[1]);
    const roundtrip = parseVectorSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="101.6mm" height="50.8mm" viewBox="0 0 101.6 50.8"><path d="${path}"/></svg>`,
    );
    return { r, roundtrip };
  }, fixture);
  expect(result.r.width).toBeCloseTo(101.6);
  expect(result.r.shapes).toHaveLength(2);
  expect(result.r.warnings.join(" ")).toContain("text");
  expect(result.roundtrip.shapes[0].points.length).toBe(
    result.r.shapes[1].points.length,
  );
});

test("imported geometry supports node edits, LPS stitching, and stale-review rejection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Import image", exact: true }),
  ).toBeEnabled();
  const fixture = readFileSync(
    "tests/fixtures/vector/inkscape-pattern.svg",
    "utf8",
  );
  const result = await page.evaluate(async (text) => {
    const { editor } = await import("/src/editor/instance.ts");
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const { parseProject } = await import("/src/model/project.ts");
    const imported = parseVectorSvg(text);
    const source = {
      document: editor.document,
      revision: editor.revision,
      epoch: editor.projectEpoch,
    };
    await editor.insertVector(imported, "Wallet", source);
    const stale = await editor.insertVector(imported, "Stale", source);
    const guide = editor.document.shapes.find((s) => s.name === "guide")!;
    editor.selectedGroups = [];
    editor.selected = [guide.id];
    await editor.edit(guide.id, {
      points: guide.points.map((p, i) => (i ? p : { x: p.x + 1, y: p.y })),
    });
    const updated = editor.document.shapes.find((s) => s.id === guide.id)!;
    const body = editor.document.shapes.find((s) => s.name === "body")!;
    editor.selected = [body.id];
    editor.notify();
    editor.activateStitch();
    const curve = body.contours![0][0];
    editor.stitchClick(
      { x: (curve[0].x + curve[3].x) / 2, y: (curve[0].y + curve[3].y) / 2 },
      false,
    );
    await editor.transactionQueue;
    await editor.applyStitch();
    const doc = parseProject(JSON.stringify(editor.document));
    return {
      stale,
      groups: doc.stitchGroups?.length ?? 0,
      shapes: doc.shapes.length,
      edited: updated.points[0].x - guide.points[0].x,
    };
  }, fixture);
  expect(result.stale).toBe(false);
  expect(result.shapes).toBe(2);
  expect(result.edited).toBe(1);
  expect(result.groups).toBeGreaterThan(0);
});

test("SVG appearance, unit conversions, transforms and hidden content are explicit", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { parseVectorSvg: parse } = await import(
      "/src/editor/vectorImport.ts"
    );
    const wrap = (
      body: string,
      attrs = 'width="1in" height="2.54cm" viewBox="0 0 100 100"',
    ) => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
    const appearance = parse(
      wrap(
        '<g fill="red" opacity="0.5" stroke="blue" stroke-width="2"><rect width="10" height="10" fill="green" style="fill:#123456;fill-opacity:50%;stroke-opacity:.25"/><g display="none"><rect width="90" height="90"/></g></g>',
      ),
    );
    const transformed = parse(
      wrap(
        '<g transform="translate(50-10) rotate(90) scale(2 3)"><line x2="10" y2="0" stroke="black"/></g>',
      ),
    );
    const inferred = parse(
      wrap(
        '<rect width="100" height="100"/>',
        'width="100mm" viewBox="0 0 100 100"',
      ),
    );
    const limits = [
      wrap('<path d="M0 0' + "l1 0".repeat(100001) + '"/>'),
      " ".repeat(10 * 1024 * 1024 + 1),
    ].map((text) => {
      try {
        parse(text);
        return "";
      } catch (e) {
        return String(e);
      }
    });
    const loops = parse(
      wrap(
        '<path fill="none" stroke="black" d="M10 10 C50 0 50 50 10 10Z"/><path fill="none" stroke="black" d="M10 10 C50 0 50 50 10 10"/>',
      ),
    );
    return { appearance, transformed, limits, loops, inferred };
  });
  expect(result.inferred.bounds.width).toBeCloseTo(100);
  expect(result.inferred.height).toBeCloseTo(100);
  expect(result.appearance.width).toBeCloseTo(25.4);
  expect(result.appearance.height).toBeCloseTo(25.4);
  expect(result.appearance.shapes).toHaveLength(1);
  expect(result.appearance.shapes[0]).toMatchObject({
    fillColor: "#123456",
    strokeColor: "#0000ff",
    fillOpacity: 0.25,
    strokeOpacity: 0.125,
  });
  expect(result.transformed.shapes[0].points[0].x).toBeCloseTo(12.7);
  expect(result.transformed.shapes[0].points[0].y).toBeCloseTo(-2.54);
  expect(result.transformed.shapes[0].points[1].y).toBeCloseTo(2.54);
  expect(result.limits.every(Boolean)).toBe(true);
  expect(result.loops.shapes).toHaveLength(1);
  expect(result.loops.shapes[0].kind).toBe("compound");
  expect(result.loops.warnings.join(" ")).toContain("coincident endpoints");
});

test("stale import review shows an actionable error without inserting outlines", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Import image", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Image file", { exact: true })
    .setInputFiles("tests/fixtures/vector/inkscape-pattern.svg");
  const review = page.getByRole("dialog", { name: "Import SVG" });
  await expect(review).toBeVisible();
  await page.evaluate(async () => {
    const { editor } = await import("/src/editor/instance.ts");
    await editor.commit({
      ...editor.document,
      shapes: [
        {
          id: "concurrent",
          name: "Concurrent edit",
          kind: "line",
          radius: 0,
          rotation: 0,
          points: [
            { x: 0, y: 0 },
            { x: 20, y: 10 },
          ],
        },
      ],
    });
  });
  await review.getByRole("button", { name: "Import", exact: true }).click();
  await expect(review.getByRole("alert")).toContainText(
    "Project changed during import",
  );
  await expect(
    review.getByRole("button", { name: "Import", exact: true }),
  ).toBeDisabled();
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".object-select")).toHaveCount(1);
});

test("detects native stitch styles and curved runs while rejecting ambiguous marks", async ({
  page,
}) => {
  await page.goto("/");
  const fixture = readFileSync(
    "tests/fixtures/vector/stitch-marks.svg",
    "utf8",
  );
  const result = await page.evaluate(async (text) => {
    const { parseVectorSvg, applyDetectedStitches } = await import(
      "/src/editor/vectorImport.ts"
    );
    const { detectSvgStitches } = await import(
      "/src/model/detectSvgStitches.ts"
    );
    const source = parseVectorSvg(text);
    const detection = detectSvgStitches(source.shapes);
    const converted = applyDetectedStitches(source, detection.runs);
    const circles = (coordinates: number[][]) =>
      parseVectorSvg(
        `<svg width="70mm" height="60mm" viewBox="0 0 70 60">${coordinates
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".4"/>`)
          .join("")}</svg>`,
      ).shapes;
    const ring = detectSvgStitches(circles(Array.from({ length: 12 }, (_, i) => [
      30 + 8 * Math.cos(i * Math.PI / 6), 30 + 8 * Math.sin(i * Math.PI / 6),
    ]))).runs.map(run => ({ closed: run.group.closed, holes: run.holes.length }));
    const ambiguous = detectSvgStitches(
      circles([
        [2, 8],
        [6, 8],
        [10, 8],
        [14, 8],
        [10, 12],
      ]),
    ).runs.length;
    const irregular = detectSvgStitches(
      circles([
        [2, 8],
        [6, 8],
        [12, 8],
        [16, 8],
      ]),
    ).runs.length;
    const badOrientation = detectSvgStitches(
      parseVectorSvg(
        '<svg width="70mm" height="60mm" viewBox="0 0 70 60">' +
          [8, 12, 16, 20]
            .map(
              (x) =>
                `<rect transform="translate(${x} 8) rotate(23)" x="-.7" y="-.1" width="1.4" height=".2"/>`,
            )
            .join("") +
          "</svg>",
      ).shapes,
    ).runs.length;
    return {
      detection,
      ring,
      names: converted.shapes.filter((s) => !s.stitchOnly).map((s) => s.name),
      ambiguous,
      irregular,
      badOrientation,
    };
  }, fixture);
  expect(result.detection.warning).toBeUndefined();
  expect(result.ring).toEqual([{ closed: true, holes: 12 }]);
  expect(result.detection.runs).toHaveLength(5);
  const runs = result.detection.runs;
  expect(runs.map((run) => run.group.settings.style).sort()).toEqual([
    "flat",
    "french",
    "japanese",
    "round",
    "round",
  ]);
  expect(
    runs.find((run) => run.group.settings.style === "flat")?.group.settings
      .flatLength,
  ).toBeCloseTo(1.8);
  expect(
    runs.find((run) => run.group.settings.style === "french")?.group.settings
      .reversed,
  ).toBe(true);
  expect(
    runs
      .filter((run) => run.shape.kind === "line")
      .every((run) => Math.abs(run.group.settings.spacing - 4) < 1e-6),
  ).toBe(true);
  const curved = runs.find((run) => run.shape.kind === "curve")!;
  expect(curved.holes).toHaveLength(9);
  expect(curved.group.settings.roundDiameter).toBeCloseTo(1);
  expect(curved.group.settings.spacing).toBeCloseTo(3.92, 1);
  expect(result.names.sort()).toEqual(["Isolated", "Wallet"]);
  expect([result.ambiguous, result.irregular, result.badOrientation]).toEqual([
    0, 0, 0,
  ]);
});

test("Illustrator aliases, fallback selection and simple class precedence", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const svg = (declarations: string, content: string) =>
      `<!DOCTYPE svg [${declarations}]><svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="60mm" viewBox="0 0 80 60" xmlns:i="&ns_ai;">${content}</svg>`;
    const alias = '<!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">';
    const approved = parseVectorSvg(svg(alias, `
      <style>.later { fill: red; } .cut { fill: none; stroke: #111; } .cut { stroke: #222; }
        .cut rect { stroke-linecap: round; }</style>
      <switch>
        <foreignObject requiredExtensions="&ns_ai;"><i:aipgfRef/></foreignObject>
        <g requiredExtensions="&ns_ai;"><rect width="60" height="60"/></g>
        <g>
          <rect id="class-wins" class="cut later" fill="blue" width="10" height="10"/>
          <rect id="inline-wins" class="cut" style="stroke:#abc" width="10" height="10"/>
        </g>
        <g><rect width="70" height="60"/></g>
      </switch>`));
    const rejected = [
      '<!ENTITY ns_ai SYSTEM "http://example.org/svg">',
      '<!ENTITY % ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">',
      '<!ENTITY ns_ai "https://example.org/not-adobe">',
      '<!ENTITY ns_ai "&other;">',
      alias + alias,
      alias + '<!ATTLIST svg test CDATA "default">',
    ].map(declarations => {
      try { parseVectorSvg(svg(declarations, "")); return false; }
      catch { return true; }
    });
    return { shapes: approved.shapes, warnings: approved.warnings, rejected };
  });
  expect(result.shapes.map(shape => shape.name)).toEqual(["class-wins", "inline-wins"]);
  expect(result.shapes[0]).toMatchObject({ fillOpacity: 0, strokeColor: "#222222" });
  expect(result.shapes[1]).toMatchObject({ fillOpacity: 0, strokeColor: "#aabbcc" });
  expect(result.warnings.join(" ")).toContain("Unsupported SVG stylesheet selector");
  expect(result.rejected.every(Boolean)).toBe(true);
});

test("SVG preserves root transforms, paint, and source group boundaries", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const { detectSvgStitches } = await import("/src/model/detectSvgStitches.ts");
    const parse = (body: string, attr = "", viewBox = "0 0 100 100") => parseVectorSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox="${viewBox}" preserveAspectRatio="none" ${attr}>${body}</svg>`,
    );
    const compound = 'd="M0 0H20V20H0Z M5 5H15V15H5Z" stroke="black"';
    const visible = parse(`<path ${compound} id="nested"/>`);
    const invisibleFill = parse(`<path ${compound} fill-opacity="0"/>`);
    const circle = (x: number, y: number, paint = "") => `<circle cx="${x}" cy="${y}" r=".4" ${paint}/>`;
    const siblings = (xs: number[], y: number, paint?: string) => xs.map(x => circle(x, y, paint)).join("");
    const geometry = parse(
      `<g id="left">${siblings([2, 4], 10)}</g><g id="right">${siblings([6, 8], 10)}</g>
       ${siblings([2, 4, 6, 8], 25, 'fill-opacity="0"')}
       ${siblings([2, 4, 6, 8], 40, 'fill="none" stroke="black" stroke-width="0"')}
       <rect id="invisible-paint" width="10" height="10" fill="none" stroke="url(#paint)" stroke-width="0"/>
       <rect id="hidden" width="10" height="10" style="display: none !important; display: inline"/>
       <rect id="styled" width="10" height="10" style="stroke: black; stroke-width: 1 !important; stroke-width: 3"/>`, "", "0 0 200 100",
    );
    const grouped = parse(`<g>${siblings([2, 4, 6, 8], 60)}</g>`, "", "0 0 200 100");
    const painted = parse(
      `<g>${siblings([2, 4, 6, 8], 60, 'fill="red"')}${siblings([10, 12, 14, 16], 60, 'fill="blue"')}</g>`,
      "", "0 0 200 100",
    );
    const sheared = parse('<rect width="10" height="10" stroke="black" transform="matrix(1,0,.6,.8,0,0)"/>', "", "0 0 200 100");
    return {
      rotated: parse('<rect width="10" height="30"/>', 'transform="rotate(90)"').bounds,
      visible, invisibleFill, geometry,
      paintedRuns: detectSvgStitches(painted.shapes, painted.tree).runs.map(run => run.holes.length),
      shearWarnings: sheared.warnings,
      runs: detectSvgStitches(geometry.shapes, geometry.tree).runs.length,
      positive: detectSvgStitches(grouped.shapes, grouped.tree).runs.length,
    };
  });
  expect(result.rotated.width).toBeCloseTo(30);
  expect(result.rotated.height).toBeCloseTo(20);
  expect(result.visible.shapes).toHaveLength(2);
  expect(result.visible.shapes[0]).toMatchObject({ fillOpacity: 1, strokeOpacity: 0 });
  expect(result.visible.shapes[1]).toMatchObject({ fillOpacity: 0, strokeOpacity: 1 });
  expect(result.visible.shapes[1].contours).toHaveLength(2);
  expect(result.invisibleFill.shapes[0].contours).toEqual(result.visible.shapes[1].contours);
  expect(result.invisibleFill.shapes).toHaveLength(1);
  expect(result.invisibleFill.warnings.join(" ")).not.toContain("Normalized");
  expect(result.geometry.shapes.some(shape => shape.name === "hidden")).toBe(false);
  expect(result.geometry.shapes.find(shape => shape.name === "invisible-paint")).toBeUndefined();
  expect(result.geometry.shapes.find(shape => shape.name === "styled")?.strokeWidth).toBeCloseTo(1);
  expect(result.geometry.shapes.filter(shape => shape.name === "Imported circle")).toHaveLength(4);
  expect(result.runs).toBe(0);
  expect(result.positive).toBe(1);
  expect(result.paintedRuns).toEqual([4, 4]);
  expect(result.shearWarnings.join(" ")).toContain("Nonuniform stroke scaling approximated");
});

test("SVG cascade and switch preserve only visible source artwork", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    return parseVectorSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <defs><clipPath id="trim"><rect width="1" height="1"/></clipPath></defs>
      <style>
        .part { clip-path: url(#trim) !important; }
        .later { clip-path: none; }
        .mask { mask: url(#mask) !important; }
        .filter { filter: url(#filter) !important; }
      </style>
      <rect id="clipped" class="part later" style="clip-path: none" width="10" height="10"/>
      <rect id="overrides" class="part" style="clip-path: none !important" width="10" height="10"/>
      <rect id="masked" class="mask" width="10" height="10"/>
      <rect id="filtered" class="filter" width="10" height="10"/>
      <switch><text>Visible text</text><rect id="inactive" width="10" height="10"/></switch>
      <switch><rect requiredFeatures="unknown" width="10" height="10"/><rect id="unknown" width="10" height="10"/></switch>
    </svg>`);
  });
  expect(result.shapes.map(shape => shape.name)).toEqual(["overrides"]);
  expect(result.warnings.join(" ")).toContain("clipped");
  expect(result.warnings.join(" ")).toContain("masked");
  expect(result.warnings.join(" ")).toContain("filtered");
  expect(result.warnings.join(" ")).toContain("Omitted unsupported text");
  expect(result.warnings.join(" ")).toContain("unsupported branch condition");
});

test("SVG resolves radius, opacity, paint and transforms before conversion", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const { bounds } = await import("/src/model/geometry.ts");
    const parse = (body: string, aspect = "none") => parseVectorSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50" preserveAspectRatio="${aspect}">${body}</svg>`,
    );
    const parsed = parse(`
      <ellipse id="only-x" rx="10"/>
      <ellipse id="only-y" rx="auto" ry="10"/>
      <ellipse id="auto-y" rx="10" ry="auto"/>
      <ellipse id="zero" rx="10" ry="0"/>
      <g opacity=".5"><g><rect id="default-parent" opacity="inherit" width="10" height="10"/></g>
      <rect id="inherits" opacity="inherit" width="10" height="10"/>
      <rect id="unsets" style="opacity: unset" width="10" height="10"/></g>
      <rect id="colored" color="red" fill="currentcolor" stroke="CuRrEnTcOlOr" width="10" height="10"/>
      <g transform="scale(1e-8)"><rect id="compensated" transform="scale(1e8)" width="100" height="10"/></g>
      <rect id="collapsed" transform="scale(0 1)" width="100" height="10"/>
    `);
    const aspect = ["none meet", "none slice"].map(value => parseSvgVectorAspect(value));
    function parseSvgVectorAspect(value: string) {
      return parseVectorSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm"
        viewBox="0 0 50 50" preserveAspectRatio="${value}"><rect width="10" height="10"/></svg>`).bounds;
    }
    return {
      shapes: Object.fromEntries(parsed.shapes.map(shape => [shape.name, { ...bounds([shape]), fill: shape.fillColor, stroke: shape.strokeColor, opacity: shape.fillOpacity }])),
      aspect,
    };
  });
  for (const name of ["only-x", "only-y", "auto-y"]) {
    expect(result.shapes[name].width).toBeCloseTo(20);
    expect(result.shapes[name].height).toBeCloseTo(20);
  }
  expect(result.shapes.zero).toBeUndefined();
  expect(result.shapes.collapsed).toBeUndefined();
  expect(result.shapes["default-parent"].opacity).toBeCloseTo(.5);
  expect(result.shapes.inherits.opacity).toBeCloseTo(.25);
  expect(result.shapes.unsets.opacity).toBeCloseTo(.5);
  expect(result.shapes.colored).toMatchObject({ fill: "#ff0000", stroke: "#ff0000" });
  expect(result.shapes.compensated.width).toBeCloseTo(100);
  for (const box of result.aspect) {
    expect(box.width).toBeCloseTo(20);
    expect(box.height).toBeCloseTo(10);
  }
});

test("editable import resolves CSS keywords and conditional rendering", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const locale = navigator.languages[0].toUpperCase();
    return parseVectorSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <style>.hidden, .other { DISPLAY: NONE } .donut, .ring { fill-rule: EVENODD }</style>
      <rect id="hidden" class="hidden" x="100" width="20" height="10"/>
      <g requiredExtensions="urn:unavailable:extension"><rect id="extension" x="100" width="20" height="10"/></g>
      <rect id="wrong-language" systemLanguage="zz" x="100" width="20" height="10"/>
      <rect id="matching-language" systemLanguage="zz, ${locale}" width="4" height="4"/>
      <switch><rect systemLanguage="zz" width="20" height="10"/><rect id="switch-fallback" width="4" height="4"/></switch>
      <path id="donut" class="donut" d="M0 0H20V20H0Z M5 5H15V15H5Z"/>
      <g fill="blue" stroke="red" stroke-width="3">
        <rect id="keywords" width="10" height="10" style="fill: UNSET; stroke-width: INITIAL"/>
        <rect id="inherit" width="10" height="10" stroke-width="INHERIT" style="fill: INITIAL"/>
      </g>
      <path id="transparent-stroke" d="M0 0H10V5" fill="red" stroke="black" stroke-opacity="0"/>
      <path id="zero-stroke" d="M0 0H10V5" fill="red" stroke="black" stroke-width="0"/>
      <rect id="auto-x" width="12" height="8" rx="auto" ry="6"/>
      <rect id="auto-y" width="12" height="8" rx="6" ry="AUTO"/>
      <rect id="auto-both" width="12" height="8" rx="auto" ry="auto"/>
    </svg>`);
  });
  const shapes = Object.fromEntries(result.shapes.map(shape => [shape.name, shape]));
  expect(shapes.hidden).toBeUndefined();
  expect(shapes.extension).toBeUndefined();
  expect(shapes["wrong-language"]).toBeUndefined();
  expect(shapes["matching-language"]).toBeDefined();
  expect(shapes["switch-fallback"]).toBeDefined();
  expect(result.bounds.width).toBeCloseTo(20);
  expect(result.warnings.join(" ")).toContain("unsupported rendering condition");
  expect(shapes.donut.contours).toHaveLength(2);
  expect(shapes.keywords).toMatchObject({ fillColor: "#0000ff", strokeWidth: 1 });
  expect(shapes.inherit).toMatchObject({ fillColor: "#000000", strokeWidth: 3 });
  for (const name of ["transparent-stroke", "zero-stroke"]) {
    expect(shapes[name]).toMatchObject({ fillOpacity: 0, strokeColor: "#ff0000", strokeOpacity: 1 });
  }
  expect(shapes["auto-x"].points).toEqual(shapes["auto-y"].points);
  expect(shapes["auto-x"].points.length).toBeGreaterThan(shapes["auto-both"].points.length);
});

test("geometry CSS is rejected even inside unsupported stylesheet selectors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const messages = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    return [
      ['style="WIDTH:200mm"', ""],
      ["", "<style>.piece rect { transform: scale(2) }</style>"],
      ["", "<style>@media all {.piece { rx: 2px }}</style>"],
      ['style="\\77 idth:200mm"', ""],
    ].map(([attr, css]) => {
      try {
        parseVectorSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" ${attr}>${css}<rect width="10" height="10"/></svg>`);
        return "";
      } catch (error) {
        return String(error);
      }
    });
  });
  expect(messages.every(message => message.includes("Use SVG geometry attributes or choose Import as image"))).toBe(true);
});

test("dense ambiguous stitch marks stay as editable geometry within the candidate limit", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg, applyDetectedStitches } = await import("/src/editor/vectorImport.ts");
    const { detectSvgStitches } = await import("/src/model/detectSvgStitches.ts");
    const svg = parseVectorSvg('<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="20mm" viewBox="0 0 20 20"><circle cx="2" cy="2" r=".4"/><circle cx="6" cy="2" r=".4"/></svg>');
    svg.shapes = Array.from({ length: 2000 }, (_, id) => ({ ...svg.shapes[id % 2], id: String(id) }));
    svg.tree = svg.shapes.map(shape => ({ kind: "object", id: shape.id }));
    const detection = detectSvgStitches(svg.shapes, svg.tree);
    return { ...detection, retained: applyDetectedStitches(svg, detection.runs).shapes.length };
  });
  expect(result.runs).toHaveLength(0);
  expect(result.warning).toContain("too many marks are close together");
  expect(result.retained).toBe(2000);
});

test("embedded stylesheet effects block conversion if their rules cannot be resolved", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const parse = (css: string) => parseVectorSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm">
      <style>${css}</style><rect id="part" class="part" width="50" height="20"/><rect id="other" width="5" height="5"/>
    </svg>`);
    const rejected = [
      "#part {clip-path:url(#trim)}",
      "rect.part {mask:url(#mask)}",
      "@media all {.part {filter:url(#blur)}}",
      ".part {cl\\69 p-path: url(#trim)}",
    ].map(css => {
      try { parse(css); return ""; }
      catch (error) { return String(error); }
    });
    const supported = parse(".part {clip-path:url(#trim) !important}");
    return { rejected, names: supported.shapes.map(shape => shape.name), warnings: supported.warnings };
  });
  expect(result.rejected.every(message => message.includes("cannot resolve CSS clipping, masking, or filters"))).toBe(true);
  expect(result.names).toEqual(["other"]);
  expect(result.warnings.join(" ")).toContain("with clipping, masking, or filters");
});

test("unsupported paint uses a visible outline without retaining the previous Canvas color", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const { detectSvgStitches } = await import("/src/model/detectSvgStitches.ts");
    const unsupported = "light-dark(blue, green)";
    // Reproduce the CSS/Canvas disagreement even in engines that accept this color in Canvas.
    const supports = CSS.supports.bind(CSS);
    const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "fillStyle")!;
    CSS.supports = ((...args: string[]) => args[1] === unsupported || Reflect.apply(supports, CSS, args)) as typeof CSS.supports;
    Object.defineProperty(CanvasRenderingContext2D.prototype, "fillStyle", {
      ...descriptor, set(value) { if (value !== unsupported) descriptor.set!.call(this, value); },
    });
    try {
      const parsed = parseVectorSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
        <defs><linearGradient id="gradient"><stop stop-color="red"/></linearGradient></defs>
        <rect id="red" width="10" height="10" fill="red"/>
        <rect id="rejected" x="10" width="10" height="10" fill="${unsupported}"/>
        <rect id="first-sentinel" x="20" width="10" height="10" fill="#010203"/>
        <rect id="second-sentinel" x="30" width="10" height="10" fill="#040506"/>
        <rect id="zero-width" x="40" width="10" height="10" fill="url(#gradient)" stroke="red" stroke-width="0"/>
        <rect id="zero-opacity" x="50" width="10" height="10" fill="url(#gradient)" stroke="red" stroke-opacity="0"/>
        <rect id="visible-stroke" x="60" width="10" height="10" fill="url(#gradient)" stroke="red"/>
      </svg>`);
      const detected = detectSvgStitches(parsed.shapes, parsed.tree, parsed.stitchExcludedIds);
      return {
        shapes: Object.fromEntries(parsed.shapes.map(shape => [shape.name, shape])),
        excluded: parsed.shapes.filter(shape => parsed.stitchExcludedIds?.has(shape.id)).map(shape => shape.name),
        detected: detected.runs.length,
        warnings: parsed.warnings,
      };
    } finally {
      CSS.supports = supports;
      Object.defineProperty(CanvasRenderingContext2D.prototype, "fillStyle", descriptor);
    }
  });
  expect(result.shapes.red.fillColor).toBe("#ff0000");
  expect(result.shapes["first-sentinel"].fillColor).toBe("#010203");
  expect(result.shapes["second-sentinel"].fillColor).toBe("#040506");
  for (const name of ["rejected", "zero-width", "zero-opacity"]) {
    expect(result.shapes[name].fillColor).toBeUndefined();
    expect(result.shapes[name].strokeColor).toBeUndefined();
    expect(result.shapes[name]).toMatchObject({ fillOpacity: 0, strokeOpacity: 1, strokeWidth: 0.35 });
    expect(result.excluded).toContain(name);
  }
  expect(result.shapes["visible-stroke"]).toMatchObject({ strokeColor: "#ff0000", strokeOpacity: 1 });
  expect(result.detected).toBe(0);
  expect(result.warnings.join(" ")).toContain("Unsupported fill on rect “rejected”");
});

test("unresolved mask longhands and escaped inline effects block conversion", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const parse = (body: string) => parseVectorSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm">${body}</svg>`);
    const rect = '<rect width="20" height="20" fill="white" stroke="black" opacity=".5"/>';
    const errors = [
      rect.replace("<rect", '<rect style="mask-image:url(#trim)"'),
      rect.replace("<rect", '<rect style="cl\\69 p-path:url(#trim)"'),
      '<style>.part { -webkit-mask-image:url(#trim) }</style>' + rect.replace("<rect", '<rect class="part"'),
    ].map(body => {
      try { parse(body); return ""; }
      catch (error) { return String(error); }
    });
    return { errors, warnings: parse(rect).warnings };
  });
  expect(result.errors.every(error => error.includes("cannot resolve CSS clipping, masking, or filters"))).toBe(true);
  expect(result.warnings.join(" ")).toContain("Opacity may appear stronger where fill and stroke overlap");
});

test("SVG CSS and even-odd fill preserve visible cut geometry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const { booleanShapes } = await import("/src/model/booleanShapes.ts");
    const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">${body}</svg>`;
    const cancellation = "M0 0H20V20H0Z M0 0H20V20H0Z";
    const parse = parseVectorSvg(wrap(`
      <style>.blue { fill: rgb(10,
        20, 30) }</style>
      <path id="cancelled" d="${cancellation}" fill-rule="evenodd"/>
      <path id="stroked" d="${cancellation}" fill-rule="evenodd" stroke="red"/>
      <path id="union-source" fill="red" stroke="black" d="M0 0H40V40H0Z M5 5H10V10H5Z"/>
      <rect id="extender" class="blue" x="20" width="40" height="40"/>
    `));
    const errors = [
      '<rect style="-webkit-transform: scale(2)" width="20" height="20"/>',
      '<style>.part {-webkit-transform:scale(2)}</style><rect class="part" width="20" height="20"/>',
      '<path d="M0 0 L10 0 L,20 20" stroke="black"/>',
      '<path d="M0 0H20V20H0Z M10 0H30V20H10Z"/>',
      '<path fill-rule="evenodd" d="M0 0H20V20H0Z M10 0H30V20H10Z"/>',
    ].map(body => {
      try { parseVectorSvg(wrap(body)); return ""; }
      catch (error) { return String(error); }
    });
    const layer = parse.shapes.find(s => s.excludeFromDxf)!;
    const extender = parse.shapes.find(s => s.name === "extender")!;
    const union = booleanShapes("union", [layer, extender])!;
    const [disjoint] = parseVectorSvg(wrap('<rect x="80" width="15" height="10"/>')).shapes;
    let disconnectedJoin = "";
    try {
      booleanShapes("union", [layer, disjoint]);
    } catch (error) { disconnectedJoin = String(error); }
    const { layoutDxf } = await import("/src/editor/printDxf.ts");
    const dxf = layoutDxf({ version: 23, shapes: [union] }, {
      name: "Joined", units: "mm", pages: [],
      instances: [{ id: "joined", sourceId: union.id, x: 0, y: 0, rotation: 0 }],
    } as any);
    return {
      errors, names: parse.shapes.map(s => s.name), color: extender.fillColor,
      strokeContours: parse.shapes.find(s => s.name === "stroked")?.contours?.length,
      unionExcluded: union.excludeFromDxf, unionWidth: dxf.width, disconnectedJoin,
    };
  });
  expect(result.errors.slice(0, 2).every(error => error.includes("cannot apply CSS"))).toBe(true);
  expect(result.errors[2]).toContain("Invalid SVG path separator");
  for (const error of result.errors.slice(3)) expect(error).toContain("partially shared contour edges");
  expect(result.names).not.toContain("cancelled");
  expect(result.strokeContours).toBe(2);
  expect(result.color).toBe("#0a141e");
  expect(result.unionExcluded).toBeUndefined();
  expect(result.unionWidth).toBeCloseTo(62);
  expect(result.disconnectedJoin).toContain("disconnected pieces");
});

test("implicitly closed SVG fill boundaries preserve holes and original open strokes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const { isClosedShape } = await import("/src/model/closedShape.ts");
    const wrap = (body: string, attrs = "") =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ${attrs}>${body}</svg>`;
    const outline = "M0 0H40V40H0Z M10 10H30V30H10";
    const parsed = parseVectorSvg(wrap(`
      <path id="fill" fill-rule="evenodd" d="${outline}"/>
      <path id="mixed" fill-rule="evenodd" stroke="black" d="${outline}"/>
    `));
    const errors = [
      wrap('<rect width="20" height="10"/>', 'transform="rotate(90)" transform-origin="15 20"'),
      wrap('<g transform="rotate(90)" transform-origin="15 20"><rect width="20" height="10"/></g>'),
    ].map(svg => {
      try { parseVectorSvg(svg); return ""; }
      catch (error) { return String(error); }
    });
    return {
      shapes: parsed.shapes.map(shape => ({
        name: shape.name, contours: shape.contours?.length, closed: isClosedShape(shape),
        fill: shape.fillOpacity, excluded: shape.excludeFromDxf,
      })),
      errors,
    };
  });
  expect(result.shapes).toEqual([
    { name: "fill", contours: 2, closed: true, fill: 1, excluded: undefined },
    { name: "mixed (fill)", contours: 2, closed: true, fill: 1, excluded: true },
    { name: "mixed (stroke)", contours: 1, closed: true, fill: 0, excluded: undefined },
    { name: "mixed", contours: undefined, closed: false, fill: 0, excluded: undefined },
  ]);
  for (const error of result.errors)
    expect(error).toContain("transform-origin attribute");
});

test("discarded visibility CSS and degenerate fill-only paths never become cuts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import image", exact: true })).toBeEnabled();
  const result = await page.evaluate(async () => {
    const { parseVectorSvg } = await import("/src/editor/vectorImport.ts");
    const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">${body}</svg>`;
    const parsed = parseVectorSvg(wrap(`
      <style>.hide { visibility: hidden; visibility: nope !important }</style>
      <rect class="hide" width="50" height="50"/>
      <rect style="display:none; display: bad-value" width="50" height="50"/>
      <polygon id="flat" points="0,0 30,0"/>
      <path id="backtrack" d="M0 0H30H0Z"/>
      <path id="stroked" stroke="black" fill="none" d="M0 0H30H0Z"/>
      <path id="painted" d="M0 0H20V20H0Z"/>
    `));
    const errors = [
      "#guides {display:none}",
      "@media all {.guide {visibility:hidden}}",
      "rect#guides {fill:none; stroke:none}",
    ].map(css => {
      try { parseVectorSvg(wrap(`<style>${css}</style><rect id="guides" width="10" height="10"/>`)); return ""; }
      catch (error) { return String(error); }
    });
    return { names: parsed.shapes.map(shape => shape.name), errors };
  });
  expect(result.names).toEqual(["stroked", "painted"]);
  expect(result.errors.every(error => error.includes("cannot resolve CSS visibility"))).toBe(true);
});
