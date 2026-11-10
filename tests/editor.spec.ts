import { manualScreenshot } from "./manual-capture";
import { DOCUMENT_VERSION } from "../src/model/project";
import { test, expect } from "@playwright/test";
async function ready(page: any) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
}
async function rect(page: any) {
  await page
    .getByRole("button", { name: "Rectangle (R)", exact: true })
    .click();
  const c = page.getByLabel("Pattern drawing canvas");
  await c.click({ position: { x: 150, y: 180 } });
  await c.click({ position: { x: 450, y: 390 } });
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toBeVisible();
}
async function cornerRadius(page: any) {
  await page.getByRole("button", { name: "Corner radius", exact: true }).click();
  await page.getByLabel("Pattern drawing canvas").click({
    position: { x: 160, y: 190 },
  });
  return page.getByLabel("All corners (mm)", { exact: true });
}
async function expectRadius(page: any, value: string) {
  await expect(await cornerRadius(page)).toHaveValue(value);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
}
async function setRadius(page: any, value: string) {
  await (await cornerRadius(page)).fill(value);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
}
test("precise rectangle, rounded corners, undo, redo and download", async ({
  page,
}) => {
  await ready(page);
  await rect(page);
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("100");
  await width.press("Enter");
  await setRadius(page, "10");
  await expectRadius(page, "10");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectRadius(page, "0");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expectRadius(page, "10");
  // Force the portable download path even in Chromium.
  await page.evaluate(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    });
    delete (window as any).showSaveFilePicker;
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await download).suggestedFilename()).toContain(".json");
});
test("Select tool copies and pastes with the pointer outside the canvas", async ({ page }) => {
  await ready(page);
  await rect(page);
  const canvas = page.getByLabel("Pattern drawing canvas");
  // Clear the drawing's automatic selection, then select its edge with Select.
  await canvas.click({ position: { x: 550, y: 450 } });
  await canvas.click({ position: { x: 300, y: 180 } });
  const objects = page.locator(".objects .object-select");
  await expect(page.getByLabel("Width", { exact: true })).toBeVisible();
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.mouse.move(5, 5);
  await page.keyboard.press(`${modifier}+c`);
  await canvas.hover({ position: { x: 500, y: 430 } });
  await page.mouse.move(5, 5);
  await page.keyboard.press(`${modifier}+v`);
  await expect(objects).toHaveCount(2);
  await page.keyboard.press(`${modifier}+z`);
  await expect(objects).toHaveCount(1);
});

test("draw every primitive, multi-select and delete", async ({ page }) => {
  await ready(page);
  const canvas = page.getByLabel("Pattern drawing canvas");
  let count = 0;
  for (const tool of [
    "Polyline (P)",
    "Rectangle (R)",
    "Circle (C)",
    "Circle (C)",
  ]) {
    await page.getByRole("button", { name: tool, exact: true }).click();
    if (count === 3) {
      await page
        .getByRole("button", { name: "Circle (C)", exact: true })
        .click({ button: "right" });
      await page
        .getByRole("menuitemradio", {
          name: "Bounding-box ellipse",
          exact: true,
        })
        .click();
    }
    await canvas.click({ position: { x: 150, y: 180 } });
    await canvas.click({ position: { x: 350, y: 300 } });
    if (tool === "Polyline (P)") await page.keyboard.press("Enter");
    await expect(page.locator(".objects .object-select")).toHaveCount(++count);
  }
  await page.getByRole("button", { name: "Polyline (P)", exact: true }).click();
  for (const p of [
    { x: 100, y: 150 },
    { x: 200, y: 150 },
    { x: 200, y: 250 },
  ])
    await canvas.click({ position: p });
  await page.keyboard.press("Enter");
  await expect(page.locator(".objects .object-select")).toHaveCount(5);
  await canvas.focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect(page.locator(".objects .object-select")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(5);
});
test("cancellation creates no shape and recovery restores after reload", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Rectangle (R)", exact: true })
    .click();
  await page
    .getByLabel("Pattern drawing canvas")
    .click({ position: { x: 150, y: 180 } });
  await page.keyboard.press("Escape");
  await expect(page.locator(".objects .object-select")).toHaveCount(0);
  await rect(page);
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
});
test("offline reload loads application and Wasm engine", async ({
  page,
  context,
}) => {
  await ready(page);
  await rect(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  await context.setOffline(false);
});
test("move, cancel, scale, rotate and duplicate through the viewport", async ({
  page,
}) => {
  await ready(page);
  await rect(page);
  const c = page.getByLabel("Pattern drawing canvas"),
    box = (await c.boundingBox())!;
  const value = async (label: string) =>
    Number(await page.getByLabel(label, { exact: true }).inputValue());
  const geometry = async () => {
    const x = await value("Position X"),
      y = await value("Position Y"),
      w = await value("Width"),
      h = await value("Height");
    return {
      x: box.x + 80 + x * 3,
      y: box.y + 100 + y * 3,
      w: w * 3,
      h: h * 3,
    };
  };
  const beforeX = await value("Position X");
  let g = await geometry();
  const drag = async (x: number, y: number, dx: number, dy: number) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 5 });
    await page.mouse.up();
  };
  await drag(g.x - g.w / 2, g.y, 60, 30);
  await expect(page.getByLabel("Position X", { exact: true })).toHaveValue(
    String(beforeX),
  );
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await drag(g.x, g.y, 60, 30);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Position X", { exact: true })).toHaveValue(
    String(beforeX),
  );
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await drag(g.x, g.y, 60, 30);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => value("Position X")).toBeGreaterThan(beforeX);
  g = await geometry();
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await drag(g.x + 42, g.y - 42, 35, -35);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => value("Width")).toBeGreaterThan(100);
  g = await geometry();
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await drag(g.x + 60, g.y, -60, 60);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect
    .poll(async () => Math.abs(await value("Rotation (degrees)")))
    .toBeGreaterThan(1);
  await expect(page.getByRole("button", { name: "Duplicate", exact: true })).toHaveCount(0);
  await c.focus();
  await page.keyboard.press("Control+d");
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
});
test("saved project opens and invalid file preserves current work", { tag: "@manual" }, async ({
  page,
}, info) => {
  await ready(page);
  await rect(page);
  await setRadius(page, "8");
  await page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
    delete (window as any).showOpenFilePicker;
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise,
    path = info.outputPath("roundtrip.json");
  await download.saveAs(path);
  page.on("dialog", (dialog) => void dialog.accept());
  let chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles(path);
  await page.locator(".objects .object-select").first().click();
  await expectRadius(page, "8");
  await manualScreenshot(page, "workspace.png");
  chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":3,"shapes":[null]}'),
  });
  await expect(page.getByRole("status").first()).toContainText("Invalid shape");
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
});
test("native save writes editable project and cancelled save preserves dirty state", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Native file picker path is supported by Chromium",
  );
  await ready(page);
  await rect(page);
  await page.evaluate(() => {
    (window as any).savedProject = "";
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => ({
        name: "example.leather.json",
        createWritable: async () => ({
          write: async (text: string) => {
            (window as any).savedProject = text;
          },
          close: async () => {},
        }),
      }),
    });
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Project filename")).toHaveValue(
    "example",
  );
  expect(
    await page.evaluate(() => JSON.parse((window as any).savedProject).version),
  ).toBe(DOCUMENT_VERSION);
  await page.getByLabel("Width", { exact: true }).fill("120");
  await page.getByLabel("Width", { exact: true }).press("Enter");
  await expect(page.locator(".document-name")).toContainText("•");
  await page.evaluate(() => {
    (window as any).showSaveFilePicker = async () => {
      throw new DOMException("Cancelled", "AbortError");
    };
  });
  await page.getByTitle("Rename project").click();
  await page.getByLabel("Project filename").fill("Renamed");
  await page.getByLabel("Project filename").press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".document-name")).toContainText("•");
});

test("corner tool previews, edits numerically and applies once", { tag: "@manual" }, async ({
  page,
}, testInfo) => {
  await ready(page);
  await rect(page);
  await page
    .getByRole("button", { name: "Corner radius", exact: true })
    .click();
  const canvas = page.getByLabel("Pattern drawing canvas"),
    box = (await canvas.boundingBox())!;
  const x = box.x + 160,
    y = box.y + 190;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.keyboard.down("Control");
  await page.mouse.move(x + 25, y + 25, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  const corner = page.getByLabel("Corner radius (mm)", { exact: true });
  await expect(corner).toBeVisible();
  await corner.fill("999");
  await canvas.focus();
  await expect(corner).toHaveValue("70");
  await corner.fill("8.12");
  await canvas.focus();
  await manualScreenshot(page, "corner-radii.png");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByLabel("Corner 1 radius", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("All corner radii", { exact: true })).toHaveCount(0);
  await cornerRadius(page);
  await expect(corner).toHaveValue("8.12");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectRadius(page, "0");
});

test("inline rename controls download filename", { tag: "@manual" }, async ({ page }, info) => {
  await ready(page);
  await page.evaluate(() => { delete (window as any).showSaveFilePicker; });
  const filename = page.getByLabel("Project filename");
  const before = await filename.boundingBox();
  await filename.click();
  expect(await filename.boundingBox()).toEqual(before);
  await expect(filename).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await filename.fill("Cancelled");
  await filename.press("Escape");
  await expect(filename).toHaveValue("Untitled");
  await filename.fill("Wallet");
  await manualScreenshot(page, "rename.png");
  await page.getByLabel("Project filename").press("Enter");
  await expect(filename).toHaveValue("Wallet");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await pending).suggestedFilename()).toBe("Wallet.leather.json");
});
