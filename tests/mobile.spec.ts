import { test, expect, type Locator, type Page } from "@playwright/test";
import { manualScreenshot } from "./manual-capture";

// Phone-sized windows with touch input. Desktop behaviour is covered by every other spec at 1280×800.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const canvasOf = (page: Page) => page.getByLabel("Pattern drawing canvas");
const zoomOf = async (page: Page) =>
  Number((await page.locator("footer .cursor-coordinates + span").textContent())?.replace("%", ""));

/** Dispatches touch pointer events, which every engine accepts, to drive multi-finger gestures. */
async function touchPointer(target: Locator, type: string, pointerId: number, x: number, y: number) {
  const box = (await target.boundingBox())!;
  await target.dispatchEvent(type, {
    pointerId,
    pointerType: "touch",
    isPrimary: pointerId === 1,
    clientX: box.x + x,
    clientY: box.y + y,
    button: type === "pointermove" ? -1 : 0,
    buttons: type === "pointerup" ? 0 : 1,
    bubbles: true,
  });
}

async function tapCanvas(page: Page, x: number, y: number) {
  const box = (await canvasOf(page).boundingBox())!;
  await page.touchscreen.tap(box.x + x, box.y + y);
}

async function openSidebar(page: Page) {
  await page.getByRole("button", { name: "Show inspector" }).tap();
  await expect(page.getByRole("complementary", { name: "Model objects and properties" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Rectangle (R)", exact: true })).toBeEnabled();
});

test("phone layout fits the screen with the canvas uncovered", async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const element of await page.locator("header, nav, footer").all()) {
    const box = (await element.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390.5);
  }
  // Sidebar starts closed; the rail is a scrolling bar under the canvas.
  await expect(page.getByRole("complementary", { name: "Model objects and properties" })).toHaveCount(0);
  const canvas = (await canvasOf(page).boundingBox())!;
  const rail = page.getByRole("navigation", { name: "Drawing tools" });
  const railBox = (await rail.boundingBox())!;
  expect(railBox.y).toBeGreaterThanOrEqual(canvas.y + canvas.height - 1);
  expect(canvas.height).toBeGreaterThan(400);
  expect(await rail.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await rail.getByRole("button", { name: "Fit" }).scrollIntoViewIfNeeded();
  await expect(rail.getByRole("button", { name: "Fit" })).toBeInViewport();
  // Header keeps Save and moves the remaining actions into a menu.
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "More actions" }).tap();
  for (const name of ["New", "Open", "Report a bug", "Feedback", "User manual"])
    await expect(page.getByRole("menuitem", { name })).toBeVisible();
  await page.getByRole("menuitem", { name: "Report a bug" }).tap();
  await expect(page.getByRole("dialog", { name: "Report a bug" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).tap();
  // The sidebar opens as a sheet between the canvas and the rail without covering either.
  await openSidebar(page);
  const sheet = (await page.getByRole("complementary", { name: "Model objects and properties" }).boundingBox())!;
  const shrunk = (await canvasOf(page).boundingBox())!;
  expect(sheet.y).toBeGreaterThanOrEqual(shrunk.y + shrunk.height - 1);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual((await rail.boundingBox())!.y + 1);
  await page.getByRole("button", { name: "Hide inspector" }).tap();
  await expect(page.getByRole("complementary", { name: "Model objects and properties" })).toHaveCount(0);
});

test("the phone sidebar choice leaves the desktop layout untouched", async ({ page }) => {
  await openSidebar(page);
  expect(await page.evaluate(() => localStorage.getItem("panel-right"))).toBeNull();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole("complementary", { name: "Model objects and properties" })).toBeVisible();
  await expect(page.getByRole("button", { name: "More actions" })).toBeHidden();
  await expect(page.getByRole("button", { name: "New", exact: true })).toBeVisible();
});

test("taps draw and select, and tool settings stay reachable", async ({ page }) => {
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).tap();
  await tapCanvas(page, 80, 120);
  await tapCanvas(page, 240, 300);
  await openSidebar(page);
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await expect(page.locator(".objects .object-select")).toHaveClass(/selected/);
  await page.getByRole("button", { name: "Hide inspector" }).tap();
  // Tapping empty canvas clears the selection; tapping near the outline selects it again.
  await page.getByRole("button", { name: /^Select/ }).first().tap();
  await tapCanvas(page, 330, 40);
  await openSidebar(page);
  await expect(page.locator(".objects .object-select")).not.toHaveClass(/selected/);
  await page.getByRole("button", { name: "Hide inspector" }).tap();
  // Within the enlarged touch hit area, a few pixels off the edge.
  await tapCanvas(page, 94, 200);
  await openSidebar(page);
  await expect(page.locator(".objects .object-select")).toHaveClass(/selected/);
  await page.getByRole("button", { name: "Hide inspector" }).tap();
  await page.getByRole("button", { name: /^Move/ }).first().tap();
  const settings = page.getByRole("button", { name: "Apply", exact: true });
  await expect(settings).toBeInViewport();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport();
  const panel = (await page.locator(".transform-options").boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(390.5);
  await page.getByRole("button", { name: "Cancel", exact: true }).tap();
});

test("opening a tool closes the sidebar sheet, which can reopen without covering the tool", async ({ page }) => {
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).tap();
  await tapCanvas(page, 80, 120);
  await tapCanvas(page, 240, 300);
  await openSidebar(page);
  await page.getByRole("button", { name: /^Move/ }).first().tap();
  const sheet = page.getByRole("complementary", { name: "Model objects and properties" });
  await expect(sheet).toHaveCount(0);
  // Reopened, the sheet shrinks the canvas; tool settings stay inside it and the toggle stays usable.
  await openSidebar(page);
  const canvas = (await canvasOf(page).boundingBox())!;
  const settings = (await page.locator(".transform-options").boundingBox())!;
  expect(settings.y).toBeGreaterThanOrEqual(canvas.y);
  expect(settings.y + settings.height).toBeLessThanOrEqual(canvas.y + canvas.height + 0.5);
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Hide inspector" }).tap();
  await expect(sheet).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).tap();
});

test("two fingers pan and pinch-zoom without drawing", async ({ page }) => {
  const canvas = canvasOf(page);
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).tap();
  const before = await zoomOf(page);
  await touchPointer(canvas, "pointerdown", 1, 150, 200);
  await touchPointer(canvas, "pointerdown", 2, 250, 200);
  for (let step = 1; step <= 5; step++) {
    await touchPointer(canvas, "pointermove", 1, 150 - step * 10, 200);
    await touchPointer(canvas, "pointermove", 2, 250 + step * 10, 200);
  }
  await touchPointer(canvas, "pointerup", 2, 300, 200);
  await touchPointer(canvas, "pointermove", 1, 60, 260);
  await touchPointer(canvas, "pointerup", 1, 60, 260);
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(before * 1.8);
  // Neither finger placed a rectangle corner: one more tap pair draws exactly one rectangle.
  await tapCanvas(page, 80, 120);
  await tapCanvas(page, 200, 260);
  await openSidebar(page);
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
});

test("paths finish, close and step back with on-screen buttons", async ({ page }) => {
  await page.getByRole("button", { name: /^Polyline|^Path/ }).first().tap();
  const actions = page.getByRole("toolbar", { name: "Path drawing" });
  await expect(actions).toHaveCount(0);
  for (const [x, y] of [[60, 100], [220, 120], [200, 300], [90, 280]]) await tapCanvas(page, x, y);
  await expect(actions).toBeVisible();
  await actions.getByRole("button", { name: "Remove last point" }).tap();
  await actions.getByRole("button", { name: "Close" }).tap();
  await expect(actions).toHaveCount(0);
  for (const [x, y] of [[60, 380], [220, 400]]) await tapCanvas(page, x, y);
  await expect(actions.getByRole("button", { name: "Close" })).toBeDisabled();
  await actions.getByRole("button", { name: "Finish" }).tap();
  await openSidebar(page);
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
});

test("landscape phones keep a side rail and a usable canvas", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);
  const canvas = (await canvasOf(page).boundingBox())!;
  const rail = (await page.getByRole("navigation", { name: "Drawing tools" }).boundingBox())!;
  expect(rail.x + rail.width).toBeLessThanOrEqual(canvas.x + 1);
  expect(canvas.height).toBeGreaterThan(200);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
});

test("print layouts adapt to phones and pinch-zoom", async ({ page }) => {
  await page.getByRole("tab", { name: "A4" }).tap();
  const sheet = page.getByLabel("Print layout canvas");
  await expect(sheet).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole("navigation", { name: "Print tools" })).toBeVisible();
  const status = page.locator(".print-status");
  const zoom = async () => Number((await status.textContent())?.match(/(\d+)%/)?.[1]);
  const before = await zoom();
  await touchPointer(sheet, "pointerdown", 1, 150, 300);
  await touchPointer(sheet, "pointerdown", 2, 230, 300);
  await touchPointer(sheet, "pointermove", 2, 310, 300);
  await touchPointer(sheet, "pointerup", 2, 310, 300);
  await touchPointer(sheet, "pointerup", 1, 150, 300);
  await expect.poll(zoom).toBeGreaterThan(before * 1.5);
});

test("object rows reorder after press and hold, while a quick swipe does not", async ({ page }) => {
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).tap();
  await tapCanvas(page, 40, 60);
  await tapCanvas(page, 120, 140);
  await tapCanvas(page, 200, 220);
  await tapCanvas(page, 280, 300);
  await openSidebar(page);
  const rows = page.locator(".objects .object-select");
  await expect(rows).toHaveCount(2);
  const names = () => rows.allTextContents();
  const initial = await names();
  const drag = async (holdMs: number) => {
    const first = (await rows.nth(0).boundingBox())!, second = (await rows.nth(1).boundingBox())!;
    const x = second.x + 20, y = second.y + 10;
    // The dragged row turns into a drop slot, so later events go to the document at fixed points.
    const send = (type: string, clientY: number) =>
      page.evaluate(({ type, x, clientY }) => {
        const target = document.elementFromPoint(x, clientY) ?? document.body;
        target.dispatchEvent(new PointerEvent(type, {
          pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY,
          button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true,
        }));
      }, { type, x, clientY });
    await send("pointerdown", y);
    await page.waitForTimeout(holdMs);
    for (const step of [4, 12, 24]) await send("pointermove", y - step);
    await send("pointermove", first.y + 2);
    await send("pointerup", first.y + 2);
  };
  await drag(0);
  expect(await names()).toEqual(initial);
  await drag(500);
  await expect.poll(names).toEqual([...initial].reverse());
});

test("phone layout illustration", { tag: "@manual" }, async ({ page }) => {
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).tap();
  await tapCanvas(page, 90, 140);
  await tapCanvas(page, 290, 380);
  await openSidebar(page);
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await manualScreenshot(page, "phone-layout.png");
});
