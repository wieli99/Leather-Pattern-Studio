import { test, expect, type Page } from "@playwright/test";
const shapes = ["A", "B", "C"].map((name, i) => ({
  id: name,
  name,
  kind: "rectangle",
  points: [
    { x: i * 25, y: 0 },
    { x: i * 25 + 20, y: 20 },
  ],
  radius: 0,
  rotation: 0,
}));
async function load(page: Page, nested = false, tabCount = 3) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "reorder.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 17,
        shapes,
        objectTree: shapes.map((s) => ({ kind: "object", id: s.id })),
        printLayouts: Array.from(
          { length: tabCount },
          (_, i) =>
            ["Short", "A much wider print layout", "Third"][i] ??
            `Layout ${i + 1}`,
        ).map((name, i) => ({
          id: `layout${i}`,
          name,
          width: 210,
          height: 297,
          margin: 10,
          units: "mm",
          pages: [{ column: 0, row: 0 }],
          instances: shapes.map((s) => ({
            id: `p${s.id}`,
            sourceId: s.id,
            name: s.name,
            x: 95,
            y: 130,
            rotation: 0,
          })),
          tree: nested
            ? [
                { kind: "instance", id: "pA" },
                {
                  kind: "group",
                  id: "free",
                  name: "Free",
                  x: 0,
                  y: 0,
                  rotation: 0,
                  children: [
                    { kind: "instance", id: "pB" },
                    { kind: "instance", id: "pC" },
                  ],
                },
              ]
            : shapes.map((s) => ({ kind: "instance", id: `p${s.id}` })),
        })),
      }),
    ),
  });
  await expect(page.locator(".object-select")).toHaveCount(3);
  await expect.poll(() => snapshot(page)).toBeTruthy();
}
async function snapshot(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const req = indexedDB.open("leather-studio", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const read = db
            .transaction("recovery")
            .objectStore("recovery")
            .get("current");
          read.onsuccess = () => {
            resolve(read.result?.document);
            db.close();
          };
        };
      }),
  );
}
async function begin(page: Page, selector: string) {
  const source = page.locator(selector);
  await source.hover();
  const b = (await source.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 8, b.y + b.height / 2);
  await expect(page.locator(".reorder-floating")).toBeVisible();
  return b;
}
test("tab slot uses actual width and stays stable under the pointer, cancel and undo restore order", async ({
  page,
}) => {
  await load(page);
  const before = await snapshot(page);
  const first = (await page
    .locator('[data-print-tab="layout0"]')
    .boundingBox())!;
  const source = await begin(page, '[data-print-tab="layout1"]');
  await page.mouse.move(first.x + 2, first.y + first.height / 2, { steps: 8 });
  const slot = page.locator(".print-tabs [data-reorder-slot]");
  await expect(slot).toBeVisible();
  expect((await slot.boundingBox())!.width).toBeCloseTo(source.width, 0);
  const target = (await slot.boundingBox())!;
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
  );
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect((await slot.boundingBox())!.x).toBeCloseTo(target.x, 0);
  }
  expect(await snapshot(page)).toEqual(before);
  await page.screenshot({ path: "public/manual/images/reorder-tabs.png" });
  await page.mouse.up();
  await expect(page.getByRole("tab").nth(1)).toHaveText(
    "A much wider print layout",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("tab").nth(1)).toHaveText("Short");
  await begin(page, '[data-print-tab="layout1"]');
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(slot).toHaveCount(0);
  await expect(page.getByRole("tab").nth(1)).toHaveText("Short");
});
test("Print objects selection reserves a bottom slot, commits once, and undoes together", async ({
  page,
}) => {
  await load(page);
  await page.getByRole("tab", { name: "Short", exact: true }).click();
  const tree = page.getByLabel("Print object tree");
  await tree.getByRole("button", { name: "A", exact: true }).click();
  await tree
    .getByRole("button", { name: "B", exact: true })
    .click({ modifiers: ["Control"] });
  const before = await snapshot(page);
  await begin(page, '[data-print-row="pA"] .print-object-name');
  await expect(page.locator(".reorder-floating")).toContainText("2 items");
  const end = (await page.locator(".print-end-drop").boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 8,
  });
  const slot = tree.locator("[data-reorder-slot]");
  await expect(slot).toBeVisible();
  const b = (await slot.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(68);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  expect(await snapshot(page)).toEqual(before);
  await page.screenshot({
    path: "public/manual/images/reorder-print-objects.png",
  });
  await page.mouse.up();
  await expect(tree.locator(".print-object-name")).toHaveText(["C", "A", "B"]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(tree.locator(".print-object-name")).toHaveText(["A", "B", "C"]);
  await begin(page, '[data-print-row="pA"] .print-object-name');
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await expect(tree.locator(".print-object-name")).toHaveText(["A", "B", "C"]);
});
test("Objects slots preserve dimensions and Escape leaves document unchanged", async ({
  page,
}) => {
  await load(page);
  const before = await snapshot(page);
  const b = await begin(page, '[data-tree-id="A"] .object-select');
  const target = (await page.locator('[data-tree-id="C"]').boundingBox())!;
  await page.mouse.move(target.x + 40, target.y + target.height - 2, {
    steps: 10,
  });
  const slot = page.locator(".object-tree-list [data-reorder-slot]");
  await expect(slot).toBeVisible();
  expect((await slot.boundingBox())!.height).toBeGreaterThanOrEqual(b.height);
  expect(await snapshot(page)).toEqual(before);
  await page.screenshot({ path: "public/manual/images/reorder-objects.png" });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".object-select")).toHaveText(["A", "B", "C"]);
  expect(await snapshot(page)).toEqual(before);
});

test("Print objects enter a collapsed folder and return to the root without mutating previews", async ({
  page,
}) => {
  await load(page, true);
  await page.getByRole("tab", { name: "Short", exact: true }).click();
  const tree = page.getByLabel("Print object tree");
  await tree.getByRole("button", { name: "Expand Free", exact: true }).click();
  const target = (await tree.locator('[data-print-row="free"]').boundingBox())!;
  const before = await snapshot(page);
  await begin(page, '[data-print-row="pA"] .print-object-name');
  await page.mouse.move(target.x + 45, target.y + target.height / 2, {
    steps: 8,
  });
  await expect(tree.locator("[data-reorder-slot]")).toHaveCSS(
    "margin-left",
    "14px",
  );
  expect(await snapshot(page)).toEqual(before);
  await page.mouse.up();
  await expect(tree.locator(".print-object-name")).toHaveText(["Free"]);
  await tree.getByRole("button", { name: "Expand Free", exact: true }).click();
  await expect(tree.locator(".print-object-name")).toHaveText([
    "Free",
    "B",
    "C",
    "A",
  ]);
  await tree.getByRole("button", { name: "A", exact: true }).click();
  await begin(page, '[data-print-row="pA"] .print-object-name');
  const end = (await tree.locator(".print-end-drop").boundingBox())!;
  await page.mouse.move(end.x + 45, end.y + end.height / 2, { steps: 8 });
  await expect(tree.locator("[data-reorder-slot]")).toHaveCSS(
    "margin-left",
    "0px",
  );
  await page.mouse.up();
  await expect(tree.locator('[data-print-row="pA"]')).toHaveCSS(
    "padding-left",
    "0px",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(tree.locator('[data-print-row="pA"]')).toHaveCSS(
    "padding-left",
    "14px",
  );
});
test("unchanged tab drops and window blur leave the document intact", async ({
  page,
}) => {
  await load(page);
  const before = await snapshot(page);
  await begin(page, '[data-print-tab="layout1"]');
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  expect(await snapshot(page)).toEqual(before);
  await begin(page, '[data-tree-id="A"] .object-select');
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".reorder-floating")).toHaveCount(0);
  await page.mouse.up();
  expect(await snapshot(page)).toEqual(before);
});

test("a document change cancels a stale tab drag", async ({ page }) => {
  await load(page);
  const first = (await page
    .locator('[data-print-tab="layout0"]')
    .boundingBox())!;
  await begin(page, '[data-print-tab="layout1"]');
  await page.mouse.move(first.x + 2, first.y + first.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("tab").nth(1)).toHaveText(
    "A much wider print layout",
  );
  await begin(page, '[data-print-tab="layout2"]');
  await page.keyboard.press("Control+z");
  await expect(page.locator(".reorder-floating")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByRole("tab").nth(1)).toHaveText("Short");
});

test("the tab strip scrolls near its edge during a drag", async ({ page }) => {
  await load(page, false, 20);
  const before = await snapshot(page);
  await begin(page, '[data-print-tab="layout0"]');
  const strip = page.locator(".print-tabs"),
    box = (await strip.boundingBox())!;
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, {
    steps: 12,
  });
  await expect
    .poll(() => strip.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(100);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await snapshot(page)).toEqual(before);
});
test("the updated manual and destination screenshots remain available offline", async ({
  page,
  context,
}) => {
  await load(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await context.setOffline(true);
  await page.goto("/manual/index.html#printing");
  await expect(
    page.getByText("An empty dashed outline reserves the destination", {
      exact: false,
    }),
  ).toBeVisible();
  for (const image of [
    "reorder-tabs.png",
    "reorder-print-objects.png",
    "reorder-pages.png",
  ]) {
    expect(
      await page.evaluate(
        async (name) => (await fetch(`/manual/images/${name}`)).ok,
        image,
      ),
    ).toBe(true);
  }
});
