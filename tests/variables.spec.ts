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
  // The row is now the variable; Enter moves on to the next empty row.
  const valueInput = dialog.getByRole("textbox", { name: `Value of ${name}`, exact: true });
  await expect(valueInput).toBeFocused();
  await page.keyboard.press("Enter");
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
  await width.fill("{card_w} + 2*{t}");
  await width.press("Enter");
  await expect(width).toHaveValue("53");
  await expect(width).toHaveAttribute("title", "Linked to {card_w} + 2*{t}");
  await width.focus();
  await expect(width).toHaveValue("{card_w} + 2*{t}");
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
  expect(project.shapes[0].bindings).toEqual([{ property: "width", expression: "{card_w} + 2*{t}", unit: "mm" }]);

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

  // The row becomes a variable once name and value are valid; a typo is reported, not text.
  await name.fill("double");
  const value = dialog.getByRole("textbox", { name: "New variable value", exact: true });
  await value.fill("{ww}*2");
  await expect(dialog.getByText("Unknown variable ww")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Value of double" })).toHaveCount(0);
  await value.fill("{w}*2");
  const self = dialog.getByRole("textbox", { name: "Value of double", exact: true });
  await expect(self).toBeFocused();
  await expect(self).toHaveValue("{w}*2");
  await expect(dialog.getByRole("textbox", { name: "New variable name", exact: true })).toHaveValue("");
  await self.press("Enter");
  await expect(dialog.getByRole("textbox", { name: "New variable name", exact: true })).toBeFocused();
  await expect(dialog.getByText("= 60", { exact: true })).toBeVisible();
  await self.fill("{double} + 1");
  await expect(dialog.getByText("double cannot refer to itself")).toBeVisible();
  await self.press("Escape");
  await expect(self).toHaveValue("{w}*2");

  const width = page.getByLabel("Width", { exact: true });
  await width.fill("{double}");
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
  await width.fill("2*{car");
  const option = page.getByRole("option", { name: "{card_width}", exact: true });
  await expect(option).toBeVisible();
  await width.press("ArrowDown");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await width.press("Enter");
  await expect(width).toHaveValue("2*{card_width}");
  await expect(width).toBeFocused();
  await width.press("Enter");
  await expect(width).toHaveValue("80");
  await expect(width).toHaveAttribute("title", "Linked to 2*{card_width}");

  await width.hover();
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Alt");
  await expect(width).toHaveValue("81");
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
  await width.fill("{w} + 1/2");
  await width.press("Enter");
  await expect(width).toHaveValue("2.5");
  await units("mm");
  const warning = page.getByText(/^Variables did not convert/);
  await expect(warning).toBeVisible();
  await expect(w).toHaveValue("2");
  await expect(width).toHaveValue("63.5");
  await width.focus();
  await expect(width).toHaveValue("{w} + 1/2");
  await expect(page.locator(".formula-unit", { hasText: "in" })).toBeVisible();
  await width.press("Tab");
  const height = page.getByLabel("Height", { exact: true });
  await height.fill("{w}*10");
  await height.press("Enter");
  await expect(height).toHaveValue("20");
  await units("in-fractional");
  await expect(warning).toContainText("inches");
});

test("deleting a used variable keeps current values after confirmation", async ({ page }) => {
  await rectangle(page);
  await addVariable(page, "w", "45");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("{w}");
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
  await expect(width).toHaveAttribute("title", "Linked to {w}");
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
  await expect(row).toHaveText("Studio card {draft}");
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
  await width.fill("{w}");
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
  const twice = await addVariable(page, "twice", "{w}*2");
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
  await addVariable(page, "slot_w", "{card_w} + 2*{t}");
  await addVariable(page, "brand", "Acme");
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("{brand} card slot");
  await name.press("Enter");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("{slot_w}");
  await width.press("Enter");
  await expect(width).toHaveValue("89");
  await page.getByLabel("Pattern drawing canvas").hover({ position: { x: 600, y: 120 } });
  await manualScreenshot(page, "variables.png");
});

test("construction fields link sizes and report fields used once", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Rectangle (R)", exact: true })).toBeEnabled();
  const cardWidth = await addVariable(page, "card_w", "40");
  await addVariable(page, "t", "1.5");
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 150, y: 180 } });
  await canvas.hover({ position: { x: 300, y: 300 } });
  await page.keyboard.press("Tab");
  const field = page.locator(".construction-measurements input").first();
  await expect(field).toBeFocused();
  // Typing { lists variables; Tab accepts the only match.
  await page.keyboard.type("{car");
  await expect(page.getByRole("option", { name: "{card_w}", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(field).toHaveValue("{card_w}");
  await page.keyboard.press("Tab");
  await page.keyboard.type("10*{t}");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  const width = page.getByLabel("Width", { exact: true });
  const height = page.getByLabel("Height", { exact: true });
  await expect(width).toHaveValue("40");
  await expect(height).toHaveValue("15");
  await expect(width).toHaveAttribute("title", "Linked to {card_w}");
  await expect(height).toHaveAttribute("title", "Linked to 10*{t}");
  await cardWidth.fill("50");
  await page.keyboard.press("Enter");
  await expect(width).toHaveValue("50");

  // A path segment cannot stay linked: {name} is refused, {=name} copies the value once.
  await page.getByRole("button", { name: "Polyline (P)", exact: true }).click();
  await canvas.click({ position: { x: 200, y: 450 } });
  await canvas.hover({ position: { x: 300, y: 500 } });
  await page.keyboard.press("Tab");
  const length = page.locator(".construction-measurements input").first();
  await page.keyboard.type("{card_w}");
  await expect(page.getByRole("alert").filter({ hasText: "Use {=card_w} here: this field does not stay linked" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(length).toBeFocused();
  // Typing { here suggests the one-time form.
  await length.fill("");
  await page.keyboard.type("{car");
  await expect(page.getByRole("option", { name: "{=card_w}", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(length).toHaveValue("{=card_w}");
  await page.keyboard.press("Enter");
  await canvas.click({ position: { x: 320, y: 560 } });
  await page.keyboard.press("Enter");
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
});

test("names, labels and one-off fields suggest variables", async ({ page }) => {
  await rectangle(page);
  await addVariable(page, "brand", "Acme");
  await addVariable(page, "w", "20");
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("{b");
  await expect(page.getByRole("option", { name: "{brand}", exact: true })).toBeVisible();
  await name.press("ArrowDown");
  await name.press("Enter");
  await expect(name).toHaveValue("{brand}");
  await expect(name).toBeFocused();
  await name.type(" slot");
  await name.press("Enter");
  await expect(page.locator(".objects .object-select")).toHaveText("Acme slot");
  // Number fields only list number variables.
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("{");
  await expect(page.getByRole("option", { name: "{w}", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "{brand}" })).toHaveCount(0);
  await width.press("Escape");
  await expect(width).toBeFocused();
  await width.press("Escape");
  // Unlinkable fields refuse {name} and take {=name} once.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const grid = page.getByLabel("Grid spacing (mm)", { exact: true });
  await grid.fill("{w}/4");
  await expect(grid).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Use {=w} here: this field does not stay linked")).toBeVisible();
  await grid.fill("{=w}/4");
  await grid.press("Enter");
  await expect(grid).toHaveAttribute("aria-invalid", "false");
  await grid.press("Tab");
  await expect(grid).toHaveValue("5");
});

test("choosing a tool right after editing a variable keeps the edited model", async ({ page }) => {
  await rectangle(page);
  const w = await addVariable(page, "w", "50");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("{w}");
  await width.press("Enter");
  await expect(width).toHaveValue("50");

  // Click a tool straight from the value field: the edit commits before the tool starts.
  await w.fill("60");
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByText("Apply or cancel the active tool to edit variables.")).toBeVisible();
  await expect(w).toBeDisabled();
  // The pinned popover can cover the tool's buttons; use the keyboard.
  await page.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
  await expect(w).toBeEnabled();
  await expect(width).toHaveValue("60");

  // Switching tools straight from the field goes through the mode change.
  await w.fill("70");
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).click();
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await page.locator(".objects .object-select").first().click();
  await expect(width).toHaveValue("70");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(width).toHaveValue("60");
  await expect(w).toHaveValue("60");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(width).toHaveValue("50");
  await expect(w).toHaveValue("50");
});

test("dragging a vertex right after a variable edit keeps the edit", async ({ page }) => {
  await page.goto("/");
  const polyline = page.getByRole("button", { name: "Polyline (P)", exact: true });
  await expect(polyline).toBeEnabled();
  await page.getByRole("checkbox", { name: "Grid snap", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Object snap", exact: true }).uncheck();
  const s = await addVariable(page, "s", "0.5");
  await polyline.click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 240, y: 240 } });
  await canvas.click({ position: { x: 500, y: 350 } });
  await canvas.click({ position: { x: 600, y: 240 } });
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  const outline = page.getByLabel("Outline width (mm)", { exact: true });
  await outline.fill("{s}");
  await outline.press("Enter");
  await expect(outline).toHaveAttribute("title", "Linked to {s}");
  await page.getByText("Vertex coordinates", { exact: true }).click();
  const x = page.getByLabel("Vertex 1 X", { exact: true });
  const initialX = await x.inputValue();
  await s.fill("1");
  // Pressing a vertex leaves the field and starts a drag at once.
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 240, box.y + 240);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 240, { steps: 5 });
  await page.mouse.up();
  await expect(x).not.toHaveValue(initialX);
  await expect(s).toHaveValue("1");
  await expect(outline).toHaveValue("1");
  await expect(outline).toHaveAttribute("title", "Linked to {s}");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(x).toHaveValue(initialX);
  await expect(outline).toHaveValue("1");
});

test("renaming then editing the next row keeps one undoable edit per row", async ({ page }) => {
  await rectangle(page);
  await addVariable(page, "a", "10");
  const b = await addVariable(page, "b", "20");
  const dialog = await openVariables(page);
  const nameA = dialog.getByRole("textbox", { name: "Name of a", exact: true });
  await nameA.fill("alpha");
  // Leave row a for row b's value: the rename is committed with row a.
  await b.click();
  await expect(dialog.getByRole("textbox", { name: "Name of alpha", exact: true })).toBeVisible();
  await b.fill("25");
  await b.press("Escape");
  await expect(b).toHaveValue("20");
  await expect(dialog.getByRole("textbox", { name: "Name of alpha", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Name of a", exact: true })).toBeVisible();
  await expect(b).toHaveValue("20");
});

test("text variables combine others and {=name} copies a value once", async ({ page }) => {
  await rectangle(page);
  const brand = await addVariable(page, "brand", "Acme");
  await addVariable(page, "model", "Slim");
  const dialog = await openVariables(page);
  await addVariable(page, "full", "{brand} {model}");
  await expect(dialog.getByRole("textbox", { name: "Value of full", exact: true })).toHaveValue("{brand} {model}");
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("{full} / {=brand}");
  await name.press("Enter");
  const row = page.locator(".objects .object-select");
  await expect(row).toHaveText("Acme Slim / Acme");
  await brand.fill("Nova");
  await page.keyboard.press("Enter");
  // The linked part follows; the one-time part was written in as text.
  await expect(row).toHaveText("Nova Slim / Acme");
  await name.focus();
  await expect(name).toHaveValue("{full} / Acme");
  await name.press("Tab");
  // A linked width written with a one-time part keeps only the linked variable.
  await addVariable(page, "w", "40");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("{w} + {=w}");
  await width.press("Enter");
  await expect(width).toHaveValue("80");
  await expect(width).toHaveAttribute("title", "Linked to {w} + (40)");
  const vertexLike = page.getByLabel("Outline opacity (%)", { exact: true });
  await vertexLike.fill("{w}");
  await expect(vertexLike).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Use {=w} here: this field does not stay linked.")).toBeVisible();
  await vertexLike.press("Escape");
  // A loop between text variables is refused.
  const brandValue = dialog.getByRole("textbox", { name: "Value of brand", exact: true });
  await brandValue.fill("{full}");
  await expect(dialog.getByText(/refers to itself/)).toBeVisible();
  await brandValue.press("Escape");
  await expect(brandValue).toHaveValue("Nova");
});

test("Ctrl edge labels show and edit a linked side's formula", async ({ page }) => {
  await rectangle(page);
  const w = await addVariable(page, "w", "50");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("{w}");
  await width.press("Enter");
  // Hold Ctrl over the canvas to show edge lengths, then open the width side.
  await page.getByLabel("Pattern drawing canvas").hover({ position: { x: 600, y: 120 } });
  await page.keyboard.down("Control");
  const edges = page.getByRole("textbox", { name: "Edge length", exact: true });
  await expect(edges).toHaveCount(4);
  const side = edges.and(page.locator('[title="Linked to {w}"]')).first();
  await side.focus();
  await page.keyboard.up("Control");
  await expect(side).toHaveValue("{w}");
  await side.fill("{w}*2");
  await side.press("Enter");
  await expect(width).toHaveValue("100");
  await expect(width).toHaveAttribute("title", "Linked to {w}*2");
  await w.fill("30");
  await page.keyboard.press("Enter");
  await expect(width).toHaveValue("60");
  // Sides without a linked property still take plain lengths; a number unlinks.
  await page.getByLabel("Pattern drawing canvas").hover({ position: { x: 600, y: 120 } });
  await page.keyboard.down("Control");
  const linked = edges.and(page.locator('[title="Linked to {w}*2"]')).first();
  await linked.focus();
  await page.keyboard.up("Control");
  await expect(linked).toHaveValue("{w}*2");
  await linked.fill("40");
  await linked.press("Enter");
  await expect(width).toHaveValue("40");
  await expect(width).not.toHaveAttribute("title", /Linked/);
});
