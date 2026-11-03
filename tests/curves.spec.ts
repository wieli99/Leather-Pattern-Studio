import { manualScreenshot } from "./manual-capture";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
test("curve variants draw, edit, undo, save and reopen", async ({
  page,
}, info) => {
  await page.goto("/");
  const tool = page.getByRole("button", { name: "Polyline (P)", exact: true });
  await expect(tool).toBeEnabled();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await tool.click({ button: "right" });
  await page.getByRole("menuitemradio", { name: "Curve", exact: true }).click();
  await canvas.click({ position: { x: 150, y: 180 } });
  await canvas.click({ position: { x: 250, y: 280 } });
  await canvas.click({ position: { x: 400, y: 180 } });
  await page.keyboard.press("Enter");
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await tool.click({ button: "right" });
  await page
    .getByRole("menuitemradio", { name: "Control point curve", exact: true })
    .click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 150, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 350, { steps: 5 });
  await page.mouse.up();
  await canvas.click({ position: { x: 400, y: 400 } });
  await page.keyboard.press("Enter");
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await page.getByRole("button", { name: "Control point curve 2", exact: true }).click();
  await page.getByText("Vertex coordinates", { exact: true }).click();
  const x = page.getByLabel("Vertex 1 X", { exact: true });
  const before = Number(await x.inputValue());
  await x.fill(String(before + 10));
  await x.press("Enter");
  await expect(x).toHaveValue(String(before + 10));
  // The anchor moved 10 mm (30 pixels); drag its outgoing handle.
  await page.mouse.move(box.x + 230, box.y + 350);
  await expect(canvas).toHaveCSS("cursor", "move");
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(box.x + 250, box.y + 320, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
    delete (window as any).showOpenFilePicker;
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const path = info.outputPath("curves.json");
  await download.saveAs(path);
  const saved = JSON.parse(await readFile(path, "utf8"));
  expect(saved.shapes[0].points).toHaveLength(3);
  const h = saved.shapes[1].handles[0];
  expect(h.outgoing.x).toBeGreaterThan(20);
  expect(h.incoming.x).toBeCloseTo(-17);
  expect(h.incoming.y).toBeCloseTo(50 / 3);
  page.on("dialog", (d) => void d.accept());
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles(path);
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  await page.getByRole("button", { name: "Control point curve 2", exact: true }).click();
  await expect(page.getByLabel("Vertex 1 X", { exact: true })).toHaveValue(
    String(before + 10),
  );
  await page.screenshot({ path: info.outputPath("curve-tools.png") });
});

for (const mode of ["Curve", "Control point curve"]) {
  test(`${mode} shows working Move axis arrows`, async ({ page }, info) => {
    await page.goto("/");
    const curve = page.getByRole("button", { name: "Polyline (P)", exact: true });
    await expect(curve).toBeEnabled();
    await curve.click({ button: "right" });
    await page.getByRole("menuitemradio", { name: "Curve", exact: true }).click();
    if (mode === "Control point curve") {
      await curve.click({ button: "right" });
      await page
        .getByRole("menuitemradio", { name: mode, exact: true })
        .click();
    }
    const canvas = page.getByLabel("Pattern drawing canvas");
    await canvas.click({ position: { x: 200, y: 200 } });
    await canvas.click({ position: { x: 500, y: 400 } });
    await page.keyboard.press("Enter");
    await expect(page.locator(".objects .object-select")).toHaveCount(1);
    const before = Number(
      await page.getByLabel("Position X", { exact: true }).inputValue(),
    );
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await expect(page.getByLabel("X (mm)", { exact: true })).toHaveValue(
      "0.00",
    );
    const box = (await canvas.boundingBox())!;
    await page.keyboard.down("Alt");
    await page.mouse.move(box.x + 422, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 452, box.y + 330, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect(page.getByLabel("X (mm)", { exact: true })).toHaveValue(
      "10.00",
    );
    await expect(page.getByLabel("Y (mm)", { exact: true })).toHaveValue(
      "0.00",
    );
    await page.screenshot({ path: info.outputPath("curve-move-gizmo.png") });
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByLabel("Position X", { exact: true })).toHaveValue(
      String(before + 10),
    );
  });
}

test("Polyline groups straight and curved paths and remembers its variant", { tag: "@manual" }, async ({ page }, info) => {
  await page.goto("/");
  const tool = page.getByRole("button", { name: "Polyline (P)", exact: true });
  await expect(tool).toBeEnabled();
  await expect(page.getByRole("button", { name: "Curve (B)", exact: true })).toHaveCount(0);
  await tool.click({ button: "right" });
  for (const name of ["Polyline", "Curve", "Control point curve"]) await expect(page.getByRole("menuitemradio", { name, exact: true })).toBeVisible();
  await manualScreenshot(page, "tool-variants.png");
  await page.getByRole("menuitemradio", { name: "Curve", exact: true }).click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.focus();
  await page.keyboard.press("Escape");
  await tool.click();
  await tool.click({ button: "right" });
  await expect(page.getByRole("menuitemradio", { name: "Curve", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await canvas.focus();
  const before = await tool.locator(".tool-icon").innerHTML();
  await page.keyboard.press("b");
  expect(await tool.locator(".tool-icon").innerHTML()).toBe(before);
});

test("rectangle corners can be smoothed and their handles dragged with Alt", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 200, y: 200 } });
  await canvas.click({ position: { x: 400, y: 350 } });
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await canvas.dblclick({ position: { x: 200, y: 200 } });
  await page.getByText("Vertex coordinates", { exact: true }).click();
  await expect(page.getByRole("group", { name: "Vertex 1 corner type", exact: true })).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.keyboard.down("Alt");
  await page.mouse.move(box.x + 235.35, box.y + 164.65);
  await page.mouse.down();
  await page.mouse.move(box.x + 250, box.y + 170);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(page.getByLabel("Vertex 1 X", { exact: true })).toBeVisible();
});
