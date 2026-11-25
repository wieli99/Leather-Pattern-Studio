import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { manualScreenshot } from "./manual-capture";

async function rectangle(page: Page) {
  await page.goto("/");
  const tool = page.getByRole("button", { name: "Rectangle (R)", exact: true });
  await expect(tool).toBeEnabled();
  await tool.click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 150, y: 180 } });
  await canvas.click({ position: { x: 450, y: 390 } });
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
}
async function openVariables(page: Page) {
  const trigger = page.locator(".settings-trigger", { hasText: "Variables" });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Variables", exact: true });
  const pin = dialog.getByRole("button", { name: "Keep Variables open", exact: true });
  if ((await pin.getAttribute("aria-pressed")) !== "true") await pin.click();
  return dialog;
}
/** Fill the always-present empty row; Enter in the name moves to the value. */
async function addVariable(page: Page, name: string, value: string) {
  const dialog = await openVariables(page);
  const nameInput = dialog.getByRole("textbox", { name: "New variable name", exact: true });
  await nameInput.fill(name);
  await nameInput.press("Enter");
  const newValue = dialog.getByRole("textbox", { name: "New variable value", exact: true });
  await expect(newValue).toBeFocused();
  await newValue.fill(value);
  await newValue.press("Enter");
  const valueInput = dialog.getByRole("textbox", { name: `Value of ${name}`, exact: true });
  await expect(valueInput).toHaveValue(value);
  await expect(nameInput).toBeFocused();
  return valueInput;
}
async function savedProject(page: Page) {
  await page.evaluate(() => { delete (window as any).showSaveFilePicker; });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}

test("linked fields follow variable changes in one undo step", async ({ page }) => {
  await rectangle(page);
  const cardWidth = await addVariable(page, "card_w", "50");
  await addVariable(page, "t", "1.5");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("card_w + 2*t");
  await width.press("Enter");
  await expect(width).toHaveValue("53");
  await expect(width).toHaveAttribute("title", "Linked to card_w + 2*t");
  await width.focus();
  await expect(width).toHaveValue("card_w + 2*t");
  await width.press("Tab");

  await cardWidth.fill("60");
  await expect(width).toHaveValue("63");
  await cardWidth.press("Enter");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(width).toHaveValue("53");
  await expect(cardWidth).toHaveValue("50");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(width).toHaveValue("63");

  const project = await savedProject(page);
  expect(project.version).toBe(25);
  expect(project.variables.map((v: { name: string }) => v.name)).toEqual(["card_w", "t"]);
  expect(project.shapes[0].bindings).toEqual([{ property: "width", expression: "card_w + 2*t", unit: "mm" }]);

  // A plain number ends the link; the variable no longer moves the shape.
  await width.fill("40");
  await width.press("Enter");
  await expect(width).not.toHaveAttribute("title", /Linked/);
  await cardWidth.fill("70");
  await cardWidth.press("Enter");
  await expect(width).toHaveValue("40");
});

test("variables reject invalid names, formulas and values a linked object cannot take", async ({ page }) => {
  await rectangle(page);
  const w = await addVariable(page, "w", "30");
  const dialog = await openVariables(page);
  const name = dialog.getByRole("textbox", { name: "New variable name", exact: true });
  await name.fill("2bad");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("w");
  await expect(dialog.getByText("w already exists")).toBeVisible();
  await name.press("Escape");
  await expect(name).toHaveValue("");

  // A value alone creates var1; a typo in a formula is reported instead of becoming text.
  const value = dialog.getByRole("textbox", { name: "New variable value", exact: true });
  await value.fill("ww*2");
  await value.press("Enter");
  await expect(dialog.getByText("Unknown variable ww")).toBeVisible();
  await value.fill("w*2");
  await value.press("Enter");
  const self = dialog.getByRole("textbox", { name: "Value of var1", exact: true });
  await expect(self).toHaveValue("w*2");
  await expect(dialog.getByText("= 60", { exact: true })).toBeVisible();
  await self.fill("var1 + 1");
  await expect(dialog.getByText("var1 cannot refer to itself")).toBeVisible();
  await self.press("Escape");
  await expect(self).toHaveValue("w*2");

  const width = page.getByLabel("Width", { exact: true });
  await width.fill("var1");
  await width.press("Enter");
  await expect(width).toHaveValue("60");
  await w.fill("-1");
  await expect(dialog.getByText("Width of 'Rectangle 1' must be ≥ 0.001 mm")).toBeVisible();
  await w.press("Enter");
  await expect(w).toHaveValue("30");
  await expect(width).toHaveValue("60");
});

test("suggestions insert names and Alt+wheel replaces a formula with its value", async ({ page }) => {
  await rectangle(page);
  await addVariable(page, "card_width", "40");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("car");
  const option = page.getByRole("option", { name: "card_width", exact: true });
  await expect(option).toBeVisible();
  await width.press("ArrowDown");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await width.press("Enter");
  await expect(width).toHaveValue("card_width");
  await expect(width).toBeFocused();
  await width.press("Enter");
  await expect(width).toHaveValue("40");
  await expect(width).toHaveAttribute("title", "Linked to card_width");

  await width.hover();
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Alt");
  await expect(width).toHaveValue("41");
  await width.press("Tab");
  await expect(width).not.toHaveAttribute("title", /Linked/);
});

test("variables stay plain numbers and links keep their unit when units change", async ({ page }) => {
  await rectangle(page);
  async function units(value: string) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Units", { exact: true }).selectOption(value);
    await page.keyboard.press("Escape");
  }
  await units("in-decimal");
  const w = await addVariable(page, "w", "2");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("w + 1/2");
  await width.press("Enter");
  await expect(width).toHaveValue("2.5");
  await units("mm");
  const warning = page.getByText(/^Variables did not convert/);
  await expect(warning).toBeVisible();
  await expect(w).toHaveValue("2");
  await expect(width).toHaveValue("63.5");
  await width.focus();
  await expect(width).toHaveValue("w + 1/2");
  await expect(page.locator(".formula-unit", { hasText: "in" })).toBeVisible();
  await width.press("Tab");
  const height = page.getByLabel("Height", { exact: true });
  await height.fill("w*10");
  await height.press("Enter");
  await expect(height).toHaveValue("20");
  await units("in-fractional");
  await expect(warning).toContainText("inches");
});

test("deleting a used variable keeps current values after confirmation", async ({ page }) => {
  await rectangle(page);
  await addVariable(page, "w", "45");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("w");
  await width.press("Enter");
  const dialog = await openVariables(page);
  await dialog.getByRole("button", { name: "Delete w", exact: true }).click();
  await expect(dialog.getByText("w is used 1×. Delete it and keep the current values?")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete w", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete and keep values", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Value of w", exact: true })).toHaveCount(0);
  await expect(width).toHaveValue("45");
  await expect(width).not.toHaveAttribute("title", /Linked/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(width).toHaveAttribute("title", "Linked to w");
});

test("text variables fill name and label placeholders", async ({ page }) => {
  await rectangle(page);
  const brand = await addVariable(page, "brand", "Acme");
  await expect(page.getByRole("dialog", { name: "Variables" }).getByText("text", { exact: true })).toBeVisible();
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("{brand} card {{draft}}");
  await name.press("Enter");
  const row = page.locator(".objects .object-select");
  await expect(row).toHaveText("Acme card {draft}");
  await expect(name).toHaveValue("Acme card {draft}");
  await name.focus();
  await expect(name).toHaveValue("{brand} card {{draft}}");
  await name.press("Tab");

  await brand.fill("Studio");
  await brand.press("Enter");
  await expect(row).toHaveText("Studio card {draft}");
  const dialog = await openVariables(page);
  const rename = dialog.getByRole("textbox", { name: "Name of brand", exact: true });
  await rename.fill("maker");
  await rename.press("Enter");
  await expect(row).toHaveText("Studio card {draft}");
  await name.focus();
  await expect(name).toHaveValue("{maker} card {{draft}}");
  await name.press("Tab");

  // Label boxes are measured from the shown text.
  const tool = page.getByRole("button", { name: "Text (T)", exact: true });
  await tool.click();
  await page.getByLabel("Pattern drawing canvas").click({ position: { x: 240, y: 520 } });
  const label = page.getByRole("textbox", { name: "Label text", exact: true });
  await label.fill("{maker}");
  await label.press("Control+Enter");
  const width = async () => {
    const project = await savedProject(page);
    const text = project.shapes.find((s: { kind: string }) => s.kind === "text");
    expect(text.text).toBe("{maker}");
    return Math.abs(text.points[1].x - text.points[0].x);
  };
  const short = await width();
  const maker = dialog.getByRole("textbox", { name: "Value of maker", exact: true });
  await maker.fill("A much longer studio name");
  await maker.press("Enter");
  expect(await width()).toBeGreaterThan(short * 2);

  await page.getByLabel("Pattern drawing canvas").click({ position: { x: 300, y: 300 } });
  await dialog.getByRole("button", { name: "Delete maker", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete and keep values", exact: true }).click();
  await expect(row.filter({ hasText: "card" })).toHaveText("A much longer studio name card {draft}");
  const baked = await savedProject(page);
  expect(baked.variables).toBeUndefined();
  expect(baked.shapes.map((s: { name: string }) => s.name)).toContain("A much longer studio name card {{draft}}");
  expect(baked.shapes.find((s: { kind: string }) => s.kind === "text").text).toBe("A much longer studio name");
});

test("variable values step with arrows and Alt+wheel and update links live", async ({ page }) => {
  await rectangle(page);
  const w = await addVariable(page, "w", "20");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("w");
  await width.press("Enter");
  await w.focus();
  await w.press("ArrowUp");
  await expect(w).toHaveValue("20.1");
  await expect(width).toHaveValue("20.1");
  await w.press("ArrowDown");
  await w.press("ArrowDown");
  await expect(w).toHaveValue("19.9");
  await w.hover();
  await page.keyboard.down("Alt");
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Shift");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Alt");
  await expect(w).toHaveValue("23.9");
  await w.press("Enter");
  await expect(width).toHaveValue("23.9");
  // One undo step for the whole edit session.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(width).toHaveValue("20");
  // A formula steps from its evaluated value and becomes a number.
  const dialog = await openVariables(page);
  const twice = await addVariable(page, "twice", "w*2");
  await expect(dialog.getByText("= 40", { exact: true })).toBeVisible();
  await twice.focus();
  await twice.press("ArrowUp");
  await expect(twice).toHaveValue("40.1");
  await twice.press("Enter");
  await expect(dialog.getByText("= 40", { exact: true })).toHaveCount(0);
  await expect(twice).toHaveValue("40.1");
  // Text values are not stepped.
  const label = await addVariable(page, "label", "Acme");
  await label.focus();
  await label.press("ArrowUp");
  await expect(label).toHaveValue("Acme");
});

test("variables illustration", { tag: "@manual" }, async ({ page }) => {
  await rectangle(page);
  await addVariable(page, "card_w", "86");
  await addVariable(page, "t", "1.5");
  await addVariable(page, "slot_w", "card_w + 2*t");
  await addVariable(page, "brand", "Acme");
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("{brand} card slot");
  await name.press("Enter");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("slot_w");
  await width.press("Enter");
  await expect(width).toHaveValue("89");
  await page.getByLabel("Pattern drawing canvas").hover({ position: { x: 600, y: 120 } });
  await manualScreenshot(page, "variables.png");
});
