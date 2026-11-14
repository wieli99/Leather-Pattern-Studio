import { manualScreenshot } from "./manual-capture";
import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
}
async function mode(page: Page, group: "Rectangle" | "Circle", name: string) {
  await page
    .getByRole("button", { name: `${group} (${group[0]})`, exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitemradio", { name, exact: true }).click();
}
async function points(page: Page, list: { x: number; y: number }[]) {
  for (const position of list)
    await page.getByLabel("Pattern drawing canvas").click({ position });
}
const p = [
  { x: 180, y: 220 },
  { x: 330, y: 280 },
  { x: 200, y: 360 },
];
test("all grouped variants create editable shapes and retain their tool", async ({
  page,
}) => {
  await ready(page);
  let count = 0;
  for (const [group, name] of [
    ["Rectangle", "Corner rectangle"],
    ["Rectangle", "Center rectangle"],
    ["Rectangle", "Three-point rectangle"],
    ["Circle", "Center circle"],
    ["Circle", "Diameter circle"],
    ["Circle", "Three-point circle"],
    ["Circle", "Bounding-box ellipse"],
    ["Circle", "Center ellipse"],
    ["Circle", "Center arc"],
    ["Circle", "Three-point arc"],
  ] as const) {
    await mode(page, group, name);
    await points(
      page,
      p.slice(
        0,
        [
          "Three-point rectangle",
          "Three-point circle",
          "Center ellipse",
          "Center arc",
          "Three-point arc",
        ].includes(name)
          ? 3
          : 2,
      ),
    );
    await expect(page.locator(".objects .object-select")).toHaveCount(++count);
    await expect(
      page.getByRole("button", { name: `${group} (${group[0]})`, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await expect(
    page.getByLabel("Sweep (degrees)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Arc 10");
});
test("polyline right-click, double-click and initial drag do not append anchors", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Polyline (P)", exact: true }).click();
  await points(page, p);
  await page.waitForTimeout(350);
  await page
    .getByLabel("Pattern drawing canvas")
    .dblclick({ position: { x: 400, y: 350 } });
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page.getByText("Vertex coordinates", { exact: true }).click();
  await expect(page.getByLabel("Vertex 4 X", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Vertex 5 X", { exact: true })).toHaveCount(0);
  await points(page, p.slice(0, 2));
  await page
    .getByLabel("Pattern drawing canvas")
    .click({ button: "right", position: { x: 500, y: 400 } });
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  const box = (await page.getByLabel("Pattern drawing canvas").boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + 450);
  await page.mouse.up();
  await expect(page.locator(".objects .object-select")).toHaveCount(3);
  await expect(page.getByLabel("Vertex 3 X", { exact: true })).toHaveCount(0);
});
test("live properties group undo and Escape rolls back without rounding untouched geometry", async ({
  page,
}) => {
  await ready(page);
  await mode(page, "Rectangle", "Corner rectangle");
  await points(page, p.slice(0, 2));
  const y = page.getByLabel("Position Y", { exact: true }),
    initial = await y.inputValue();
  await y.fill("50");
  await y.fill("55");
  await y.fill("60");
  await expect(y).toHaveValue("60");
  await y.press("Enter");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(y).toHaveValue(initial);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(y).toHaveValue("60");
  await y.fill("70");
  await y.press("Escape");
  await expect(y).toHaveValue("60");
  await y.focus();
  await y.press("ArrowUp");
  await y.press("ArrowUp");
  await y.press("Enter");
  await expect(y).toHaveValue("60.2");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(y).toHaveValue("60");
});
test("edge tabs persist, settings center, and themes remain selectable", async ({
  page,
}, info) => {
  await ready(page);
  for (const [hide, show] of [
    ["Hide tools", "Show tools"],
    ["Hide inspector", "Show inspector"],
    ["Hide status bar", "Show status bar"],
  ]) {
    await page.getByRole("button", { name: hide, exact: true }).click();
    await expect(
      page.getByRole("button", { name: show, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: show, exact: true }).click();
  }
  await page.getByText("Settings", { exact: true }).click();
  await page.getByLabel("Grid spacing (mm)", { exact: true }).fill("5");
  await page.getByLabel("Grid style", { exact: true }).selectOption("lines");
  await page.getByLabel("Axis rulers", { exact: true }).check();
  for (const theme of ["dark", "light", "solarized", "nord", "contrast"]) {
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const select = page.getByLabel("Theme", { exact: true });
    await expect(select).toHaveCSS("appearance", "none");
    if (theme !== "light") await expect(select).not.toHaveCSS("background-color", "rgb(255, 255, 255)");
  }
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.getByText("Settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Hide inspector", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Show inspector", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show inspector", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Properties", exact: true }),
  ).toHaveCount(0);
  const controls = (await page.locator(".center-settings").boundingBox())!;
  expect(Math.abs(controls.x + controls.width / 2 - 640)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath("panel-tabs.png") });
});
test("keyboard cycling and long press open tool variants; info is accessible", async ({
  page,
}) => {
  await ready(page);
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.focus();
  await page.keyboard.press("r");
  await page.keyboard.press("r");
  await points(page, p.slice(0, 2));
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Rectangle (R)", exact: true })
    .hover();
  await page.mouse.down();
  await page.waitForTimeout(550);
  await page.mouse.up();
  await expect(
    page.getByRole("menu", { name: "Rectangle variants", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("menuitemradio", { name: "Three-point rectangle", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Shortcuts and behavior", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Help", exact: true }).click();
  await expect(page.getByRole("link", { name: "Help", exact: true })).toHaveAttribute("href", "/manual/index.html");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("Ctrl selects interiors and crossing outlines; transform handles change cursor", async ({
  page,
}, info) => {
  await ready(page);
  await mode(page, "Rectangle", "Corner rectangle");
  await points(page, p.slice(0, 2));
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 250, y: 250 } });
  await expect(page.locator(".objects .object-select.selected")).toHaveCount(0);
  await canvas.click({ position: { x: 250, y: 250 }, modifiers: ["Control"] });
  await expect(page.locator(".objects .object-select.selected")).toHaveCount(1);
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await canvas.hover({ position: { x: 315, y: 250 } });
  await expect(canvas).toHaveCSS("cursor", "grab");
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await canvas.hover({ position: { x: 297, y: 208 } });
  await expect(canvas).toHaveCSS("cursor", "nwse-resize");
  await page.getByRole("button", {name:"Cancel",exact:true}).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 140, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 240);
  await page.mouse.up();
  await expect(page.locator(".objects .object-select.selected")).toHaveCount(0);
  await page.keyboard.down("Control");
  await page.mouse.move(box.x + 140, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 240);
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(page.locator(".objects .object-select.selected")).toHaveCount(1);
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await canvas.hover({ position: { x: 315, y: 250 } });
  await page.mouse.down();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + 300, box.y + 200);
  await expect(page.getByRole("status").first()).toContainText("Rotation");
  await page.screenshot({ path: info.outputPath("rotation-feedback.png") });
  await page.mouse.up();
  await page.keyboard.up("Shift");
});
test("light-theme dot grid and corrected construction icons", async ({
  page,
}, info) => {
  await ready(page);
  await page.getByText("Settings", { exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.getByLabel("Grid style", { exact: true }).selectOption("dots");
  await page.getByText("Settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Circle (C)", exact: true })
    .click({ button: "right" });
  await page.screenshot({ path: info.outputPath("light-dots-arc-icons.png") });
  await page
    .getByRole("menuitemradio", { name: "Three-point arc", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rectangle (R)", exact: true })
    .click({ button: "right" });
  await page.screenshot({ path: info.outputPath("rectangle-icons.png") });
});
for (const key of ["Delete", "Backspace"]) {
  test(`Model objects panel supports ${key} with undo and protects renaming`, async ({ page }) => {
    await ready(page);
    await mode(page, "Rectangle", "Corner rectangle");
    await points(page, p.slice(0, 2));
    const rows = page.locator(".objects .object-select");
    await expect(rows).toHaveCount(1);
    await points(page, [{ x: 380, y: 220 }, { x: 480, y: 280 }]);
    await expect(rows).toHaveCount(2);
    await rows.first().click();
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press(key);
    await expect(rows).toHaveCount(1);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(rows).toHaveCount(2);
    await rows.first().dblclick();
    const name = page.getByRole("textbox", { name: "Rename object", exact: true });
    await name.fill("Body");
    await name.selectText();
    await name.press(key);
    await expect(name).toHaveValue("");
    await name.press("Escape");
    await expect(rows).toHaveCount(2);
    await rows.first().click();
    await rows.last().click({ modifiers: ["Shift"] });
    await expect(page.locator(".objects .object-select.selected")).toHaveCount(2);
    await page.keyboard.press(key);
    await expect(rows).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(rows).toHaveCount(2);
  });
}
test("objects rename in place with commit, cancel and undo", async ({
  page,
}) => {
  await ready(page);
  await mode(page, "Rectangle", "Corner rectangle");
  await points(page, p.slice(0, 2));
  const row = page.locator(".objects .object-select");
  await row.dblclick();
  const name = page.getByRole("textbox", {
    name: "Rename object",
    exact: true,
  });
  await expect(name).toBeFocused();
  await name.fill("Wallet body");
  await name.press("Enter");
  await expect(row).toContainText("Wallet body");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row).toContainText("Rectangle 1");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await row.dblclick();
  await name.fill("Discard");
  await name.press("Escape");
  await expect(row).toContainText("Wallet body");
  await row.dblclick();
  await name.fill("Front");
  await page.getByRole("link", { name: "Help", exact: true }).click();
  await expect(row).toContainText("Front");
});
test("keyboard menus, F2 rename, and manual link focus", async ({
  page,
}) => {
  await ready(page);
  const tool = page.getByRole("button", { name: "Rectangle (R)", exact: true });
  await tool.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitemradio", {
      name: "Three-point rectangle",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tool).toBeFocused();
  await mode(page, "Rectangle", "Corner rectangle");
  await points(page, p.slice(0, 2));
  const row = page.locator(".objects .object-select");
  await row.focus();
  await page.keyboard.press("F2");
  await expect(
    page.getByRole("textbox", { name: "Rename object", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  const help = page.getByRole("link", { name: "Help", exact: true });
  await help.click();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
});
test("pointer motion does not rerender object rows", async ({ page }) => {
  await ready(page);
  await mode(page, "Rectangle", "Corner rectangle");
  await points(page, p.slice(0, 2));
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.evaluate(() => {
    (window as any).rowMutations = 0;
    const observer = new MutationObserver((records) => {
      (window as any).rowMutations += records.length;
    });
    observer.observe(document.querySelector(".objects")!, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
  const box = (await page.locator("canvas").boundingBox())!;
  for (let i = 0; i < 20; i++)
    await page.mouse.move(box.x + 400 + i, box.y + 400 + i);
  expect(await page.evaluate(() => (window as any).rowMutations)).toBe(0);
});
test("Settings closes on outside clicks without consuming the click", async ({
  page,
}) => {
  await ready(page);
  const settings = page.locator(".settings-trigger");
  await page.getByText("Settings", { exact: true }).click();
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Help", exact: true }).click();
  await expect(settings).not.toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Help", exact: true })).toHaveAttribute("target", "_blank");
  await page.keyboard.press("Escape");
  await page.getByText("Settings", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(settings).not.toHaveAttribute("aria-expanded", "true");
});

test("object context menu duplicates, renames and captures styling", { tag: "@manual" }, async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => { (window as any).copiedStyle = text; throw new Error("Clipboard denied"); },
      readText: async () => (window as any).copiedStyle,
    } });
  });
  await mode(page, "Rectangle", "Corner rectangle");
  await points(page, p.slice(0, 2));
  const rows = page.locator(".objects .object-select");
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  const color = page.getByLabel("Fill color", { exact: true });
  await color.fill("#ff0000");
  await color.dispatchEvent("input");
  await color.blur();
  await rows.first().click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Paste Styling", exact: true })).toHaveCount(0);
  await manualScreenshot(page, "object-context-menu.png");
  await page.getByRole("menuitem", { name: "Copy Styling", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse((window as any).copiedStyle).fillOpacity)).toBe(0.05);
  await rows.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await page.getByLabel("Fill mode", { exact: true }).selectOption("cutout");
  await page.getByLabel("Outline color", { exact: true }).fill("#123456");
  await color.fill("#00ff00");
  await color.dispatchEvent("input");
  await color.blur();
  await expect(page.getByRole("button", { name: "Reset styling", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Rectangle 1 copy", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Paste Styling", exact: true }).click();
  await expect(color).toHaveValue("#ff0000");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(color).not.toHaveValue("#ff0000");
  await page.getByRole("button", { name: "Rectangle 1 copy", exact: true }).click();
  await page.keyboard.press("Control+v");
  await expect(color).toHaveValue("#ff0000");
  await page.getByRole("button", { name: "Rectangle 1 copy", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Rename object", exact: true })).toBeFocused();
});

test("object visibility and locks persist and protect edits", { tag: "@manual" }, async ({ page }) => {
  await ready(page);
  await mode(page, "Rectangle", "Corner rectangle");
  await points(page, p.slice(0, 2));
  const row = page.locator(".objects .object-select");
  await expect(row).toHaveCount(1);
  await page.getByRole("button", { name: "Hide Rectangle 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show Rectangle 1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Show Rectangle 1", exact: true }).click();
  await page.getByRole("button", { name: "Lock Rectangle 1", exact: true }).click();
  await row.click();
  for (const name of ["Move", "Rotate", "Resize", "Mirror", "Corner radius", "Trim"]) {
    await expect(page.getByRole("toolbar", { name: "Transform selection" }).getByRole("button", { name, exact: true })).toBeDisabled();
  }
  await expect(page.getByRole("button", { name: "Stitch line", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Search tools", exact: true }).click();
  await expect(page.locator(".search-results").getByRole("button", { name: "Join", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Search tools", exact: true }).press("Escape");
  await manualScreenshot(page, "object-states.png");
  await page.keyboard.press("Delete");
  await expect(row).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve, reject) => {
    const request = indexedDB.open("leather-studio", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("recovery").objectStore("recovery").get("current");
      read.onsuccess = () => { resolve(read.result?.document.shapes[0]?.locked === true); db.close(); };
    };
  }))).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unlock Rectangle 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unlock Rectangle 1", exact: true }).click();
  await row.click();
  await expect(page.getByRole("toolbar", { name: "Transform selection" }).getByRole("button", { name: "Move", exact: true })).toBeEnabled();
  await page.keyboard.press("Delete");
  await expect(row).toHaveCount(0);
});

test("state buttons work on unselected rows and recover after editing", async ({ page }) => {
  await ready(page);
  await mode(page, "Rectangle", "Corner rectangle");
  await points(page, p.slice(0, 2));
  const rows = page.locator(".objects .object-select");
  await expect(rows).toHaveCount(1);
  await points(page, [{ x: 380, y: 220 }, { x: 480, y: 280 }]);
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: "Rectangle 1", exact: true }).click();
  const hide = page.getByRole("button", { name: "Hide Rectangle 2", exact: true });
  const lock = page.getByRole("button", { name: "Lock Rectangle 2", exact: true });
  await hide.click();
  await expect(page.getByRole("button", { name: "Rectangle 1", exact: true })).toHaveClass(/selected/);
  await expect(page.getByRole("button", { name: "Rectangle 2", exact: true })).not.toHaveClass(/selected/);
  await page.getByRole("button", { name: "Show Rectangle 2", exact: true }).click();
  await lock.click();
  await expect(page.getByRole("button", { name: "Rectangle 1", exact: true })).toHaveClass(/selected/);
  await page.getByRole("button", { name: "Unlock Rectangle 2", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle 2", exact: true }).click({ modifiers: ["Shift"] });
  await lock.click();
  await expect(page.locator(".objects .object-select.selected")).toHaveCount(2);
  await page.getByRole("button", { name: "Unlock Rectangle 2", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle 1", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle 1", exact: true }).click({ modifiers: ["Control"] });
  await expect(page.locator(".objects .object-select.selected")).toHaveCount(0);
  await lock.click();
  await expect(page.locator(".objects .object-select.selected")).toHaveCount(0);
  await page.getByRole("button", { name: "Unlock Rectangle 2", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle 1", exact: true }).click();
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await page.getByRole("toolbar", { name: "Transform selection" }).getByRole("button", { name: "Move", exact: true }).click();
  await expect(hide).toBeDisabled();
  await expect(lock).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(hide).toBeEnabled();
  await expect(lock).toBeEnabled();
  await hide.click();
  await expect(page.getByRole("button", { name: "Rectangle 1", exact: true })).toHaveClass(/selected/);
});

for (const staleAnchor of [false, true]) {
  test(`new objects anchor panel ranges (previous anchor: ${staleAnchor})`, async ({ page }) => {
    await ready(page);
    await mode(page, "Rectangle", "Corner rectangle");
    const rows = page.locator(".objects .object-select");
    for (let i = 0; i < 3; i++) {
      await expect(rows).toHaveCount(i);
      await page.waitForTimeout(350); // Keep consecutive drawings separate from double-click gestures.
      await points(page, [{ x: 180 + i * 90, y: 220 }, { x: 240 + i * 90, y: 280 }]);
    }
    await expect(rows).toHaveCount(3);
    await page.waitForTimeout(350);
    if (staleAnchor) {
      await rows.last().click();
      await mode(page, "Rectangle", "Corner rectangle");
    }
    await points(page, [{ x: 180, y: 340 }, { x: 240, y: 400 }]);
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toHaveClass(/selected/);
    await rows.last().click({ modifiers: ["Shift"] });
    await expect(page.locator(".objects .object-select.selected")).toHaveCount(4);
    await rows.nth(1).click({ modifiers: ["Shift"] });
    await expect(page.locator(".objects .object-select.selected")).toHaveCount(2);
    await rows.last().click({ modifiers: ["Shift"] });
    await expect(page.locator(".objects .object-select.selected")).toHaveCount(4);
    await rows.nth(1).click({ modifiers: ["Control"] });
    await expect(page.locator(".objects .object-select.selected")).toHaveCount(3);
  });
}
