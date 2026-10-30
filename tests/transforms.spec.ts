import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const rectangle = {
  id: "r",
  name: "Rounded",
  kind: "rectangle",
  points: [
    { x: 20, y: 20 },
    { x: 100, y: 70 },
  ],
  radius: 8,
  rotation: 25,
};
const arc = {
  id: "a",
  name: "Arc",
  kind: "arc",
  points: [
    { x: 130, y: 45 },
    { x: 150, y: 45 },
  ],
  radius: 0,
  rotation: 0,
  sweep: 270,
};
async function setup(page: any) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "affine.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 4, shapes: [rectangle, arc] }),
    ),
  });
  await expect(page.locator(".objects button")).toHaveCount(2);
  await page.locator(".objects button").first().click();
}
test("numeric transforms, pivot, cancellation, history and affine file recovery", async ({
  page,
}, info) => {
  await setup(page);
  const toolbar = page.getByRole("toolbar", { name: "Transform selection" });
  await expect(toolbar).toBeVisible();
  const before = await page
    .getByLabel("Position X", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await page.getByLabel("X factor", { exact: true }).fill("2");
  await page.getByLabel("Y factor", { exact: true }).fill("0.5");
  await page.screenshot({ path: info.outputPath("transform-toolbox.png") });
  await page.locator(".transform-options strong").click();
  await expect(page.getByLabel("Y factor", { exact: true })).toHaveValue(
    "0.50",
  );
  await page
    .getByLabel("Pattern drawing canvas")
    .click({ position: { x: 650, y: 100 } });
  await expect(page.getByLabel("X factor", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Position X", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.getByLabel("Corner radius (local)", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Corner radius", { exact: true })).toHaveValue(
    "8",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByLabel("X (mm)", { exact: true }).fill("15");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Position X", { exact: true })).toHaveValue(
    before,
  );
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await page.getByLabel("Angle (°)", { exact: true }).fill("35");
  await page
    .getByRole("button", { name: "Set pivot (V)", exact: true })
    .click();
  await page
    .getByLabel("Pattern drawing canvas")
    .click({ position: { x: 100, y: 100 } });
  await page.getByRole("button", { name: "Reset center", exact: true }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.locator(".objects button").nth(1).click();
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await page.getByLabel("X factor", { exact: true }).fill("2");
  await page.getByLabel("Y factor", { exact: true }).fill("0");
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Y factor", { exact: true }).fill("0.75");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.getByLabel("Radius (local)", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
  });
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = (await (await downloading).path())!;
  const document = JSON.parse(await readFile(saved, "utf8"));
  expect(document.version).toBe(6);
  expect(document.shapes.every((s: any) => s.transform)).toBe(true);
  expect(document.shapes[1].kind).toBe("arc");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles(saved);
  // Recovery is asynchronous; allow its debounce before reloading.
  await page.waitForTimeout(450);
  await page.reload();
  const restore = page.getByRole("button", { name: /Restore/ });
  await restore.click();
  await expect(page.locator(".objects button")).toHaveCount(2);
});
test("shortcuts activate tools, selection resets sessions and compact viewport keeps toolbox accessible", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("Pattern drawing canvas").focus();
  await page.keyboard.press("e");
  await expect(page.getByLabel("Angle (°)", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  await expect(page.getByLabel("X (mm)", { exact: true })).toBeVisible();
  await page.keyboard.press("s");
  await expect(page.getByLabel("X factor", { exact: true })).toBeVisible();
  await page.locator(".objects button").nth(1).click();
  await expect(page.getByLabel("X factor", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 800, height: 600 });
  await expect(
    page.getByRole("toolbar", { name: "Transform selection" }),
  ).toBeInViewport();
});

test("creation exposes transforms and move values use two decimals", async ({
  page,
}) => {
  await page.goto("/");
  const rectangle = page.getByRole("button", {
    name: "Rectangle (R)",
    exact: true,
  });
  await expect(rectangle).toBeEnabled();
  await rectangle.click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 150, y: 180 } });
  await expect(
    page.getByRole("toolbar", { name: "Transform selection" }),
  ).toHaveCount(0);
  await canvas.click({ position: { x: 450, y: 390 } });
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByLabel("X (mm)", { exact: true })).toHaveValue("0.00");
  await page.getByLabel("X (mm)", { exact: true }).fill("1.23456");
  await page.locator(".transform-options strong").click();
  await expect(page.getByLabel("X (mm)", { exact: true })).toHaveValue("1.23");
  await expect(
    page.getByText("Drag the gizmo · Enter applies · Esc cancels", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await expect(page.getByLabel("Lock proportions")).toHaveCount(0);
  await page.getByLabel("X factor", { exact: true }).fill("2");
  await expect(page.getByLabel("Y factor", { exact: true })).toHaveValue(
    "1.00",
  );
});

test("group shortcuts cover variants in both directions", async ({ page }) => {
  await page.goto("/");
  const canvas = page.getByLabel("Pattern drawing canvas");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  await canvas.focus();
  for (const [key, count] of [
    ["p", 3],
    ["h", 2],
    ["r", 3],
    ["c", 7],
  ] as const) {
    await page.keyboard.press(key);
    for (let i = 0; i < count; i++) {
      const before = await page
        .locator(".tool-group button[aria-pressed=true] .tool-icon")
        .innerHTML();
      await page.keyboard.press(key);
      await expect(
        page.locator(".tool-group button[aria-pressed=true] .tool-icon"),
      ).not.toHaveJSProperty("innerHTML", before);
      await page.keyboard.press(`Shift+${key}`);
      await expect(
        page.locator(".tool-group button[aria-pressed=true] .tool-icon"),
      ).toHaveJSProperty("innerHTML", before);
      await page.keyboard.press(key);
    }
  }
});

test("canvas shortcuts leave controls and browser combinations alone", async ({
  page,
}, info) => {
  await setup(page);
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.focus();
  await page.keyboard.press("r");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Help", exact: true }).focus();
  await page.keyboard.press("c");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const popupPromise = page.waitForEvent("popup");
  await page.keyboard.press("Enter");
  const manual = await popupPromise;
  await expect(manual).toHaveURL(/manual\/index.html/);
  await manual.close();
  await canvas.focus();
  // Synthetic dispatch checks the app's handling without opening browser chrome.
  const prevented = await canvas.evaluate((element) => {
    const event = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
});
