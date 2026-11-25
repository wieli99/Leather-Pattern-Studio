import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

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
async function addVariable(page: Page, name: string, value: string, kind?: "Length" | "Number" | "Text") {
  const dialog = await openVariables(page);
  await dialog.getByRole("button", { name: "+ Add variable", exact: true }).click();
  const nameInput = dialog.getByRole("textbox", { name: /^Name of var\d+$/ });
  await expect(nameInput).toBeFocused();
  await nameInput.fill(name);
  await nameInput.press("Enter");
  if (kind) await dialog.getByLabel(`Type of ${name}`, { exact: true }).selectOption({ label: kind });
  const valueInput = dialog.getByRole("textbox", { name: new RegExp(`^Value of ${name}`) });
  await valueInput.fill(value);
  await valueInput.press("Enter");
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
  await addVariable(page, "t", "1.5", "Number");
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
  await dialog.getByRole("button", { name: "+ Add variable", exact: true }).click();
  const name = dialog.getByRole("textbox", { name: "Name of var1", exact: true });
  await expect(name).toBeFocused();
  await name.fill("2bad");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("w");
  await expect(dialog.getByText("w already exists")).toBeVisible();
  await name.press("Escape");
  await expect(name).toHaveValue("var1");

  const self = dialog.getByRole("textbox", { name: /^Value of var1/ });
  await self.fill("var1 + 1");
  await expect(self).toHaveAttribute("aria-invalid", "true");
  await self.fill("w*2");
  await self.press("Enter");
  await expect(dialog.getByText("= 60 mm")).toBeVisible();

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

test("formulas keep their unit after switching display units", async ({ page }) => {
  await rectangle(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Units", { exact: true }).selectOption("in-decimal");
  await page.keyboard.press("Escape");
  await addVariable(page, "w", "2");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("w + 1/2");
  await width.press("Enter");
  await expect(width).toHaveValue("2.5");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Units", { exact: true }).selectOption("mm");
  await page.keyboard.press("Escape");
  await expect(width).toHaveValue("63.5");
  await width.focus();
  await expect(width).toHaveValue("w + 1/2");
  await expect(page.locator(".formula-unit", { hasText: "in" })).toBeVisible();
  await width.press("Tab");
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
  await expect(dialog.getByText("No variables yet.")).toBeVisible();
  await expect(width).toHaveValue("45");
  await expect(width).not.toHaveAttribute("title", /Linked/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(width).toHaveAttribute("title", "Linked to w");
});
