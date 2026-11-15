import { test, expect, type Page } from "@playwright/test";
import { manualScreenshot } from "./manual-capture";
async function setup(page: Page, name: string) {
  await page.goto("/");
  const draw = page.getByRole("button", { name: "Rectangle (R)", exact: true });
  await expect(draw).toBeEnabled();
  await draw.click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 480, y: 300 } });
  await canvas.click({ position: { x: 530, y: 340 } });
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await page.getByRole("button", { name: "Search tools", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search tools", exact: true })
    .fill(name);
  await page.getByRole("button", { name, exact: true }).click();
  return {
    canvas,
    panel: page.getByRole("region", { name: name + " settings" }),
  };
}
test("rectangular array chooses endpoints then applies once @manual", async ({
  page,
}) => {
  const { canvas, panel } = await setup(page, "Rectangular Array");
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await canvas.click({ position: { x: 150, y: 320 } });
  await expect(
    panel.getByRole("button", { name: "Apply", exact: true }),
  ).toBeEnabled();
  const first = panel.getByLabel(/Distance 1/);
  const distance = await first.inputValue();
  await canvas.hover({ position: { x: 300, y: 500 } });
  await expect(first).toHaveValue(distance);
  await panel
    .getByRole("button", { name: "Select endpoint 2", exact: true })
    .click();
  await canvas.click({ position: { x: 505, y: 120 } });
  await expect(panel.getByLabel("Repeat", { exact: true })).toHaveValue("2");
  await manualScreenshot(page, "rectangular-array.png");
  await panel.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(16);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
});
test("radial array selects the center first and stays stable @manual", async ({
  page,
}) => {
  const { canvas, panel } = await setup(page, "Radial Array");
  await expect(panel).toContainText("Select center point.");
  await canvas.click({ position: { x: 420, y: 320 } });
  const angle = panel.getByLabel("Degrees", { exact: true });
  await canvas.hover({ position: { x: 550, y: 450 } });
  await expect(angle).toHaveValue("360");
  await panel.getByLabel("Mode", { exact: true }).selectOption("spacing");
  await expect(angle).toHaveValue("45");
  await panel.getByLabel("Mode", { exact: true }).selectOption("total");
  await expect(angle).toHaveValue("360");
  await manualScreenshot(page, "radial-array.png");
  await panel
    .getByRole("button", { name: "Select center point", exact: true })
    .click();
  await canvas.focus();
  await page.keyboard.press("Escape");
  await expect(
    panel.getByRole("button", { name: "Apply", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(panel).toBeHidden();
  await expect(page.locator(".objects .object-select")).toHaveCount(8);
});
test("point confirmation, axis constraints and Shift wheel follow the active stage", async ({
  page,
}) => {
  const { canvas, panel } = await setup(page, "Rectangular Array");
  await canvas.focus();
  await page.keyboard.press("x");
  await canvas.click({ position: { x: 150, y: 350 }, button: "right" });
  await expect(panel).toBeVisible();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await canvas.dispatchEvent("wheel", { deltaY: -100, shiftKey: true });
  await expect(panel.getByLabel("Number", { exact: true })).toHaveValue("9");
  await panel
    .getByRole("button", { name: "Select endpoint 2", exact: true })
    .click();
  await canvas.dispatchEvent("wheel", { deltaY: -100, shiftKey: true });
  await expect(panel.getByLabel("Repeat", { exact: true })).toHaveValue("3");
  await page.keyboard.press("Escape");
  await expect(panel.getByLabel("Repeat", { exact: true })).toHaveValue("1");
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).toBeHidden();
});
test("array numeric controls respect arrows, Alt scroll and integer limits", async ({
  page,
}) => {
  const { canvas, panel } = await setup(page, "Rectangular Array");
  await canvas.click({ position: { x: 150, y: 320 } });
  const number = panel.getByLabel("Number", { exact: true });
  await number.fill("2");
  await number.press("ArrowDown");
  await expect(number).toHaveValue("2");
  await number.dispatchEvent("wheel", {
    deltaY: -100,
    altKey: true,
    ctrlKey: true,
  });
  await expect(number).toHaveValue("12");
  await number.fill("2.5");
  await expect(number).toHaveAttribute("aria-invalid", "true");
  await number.fill("8");
  await number.press("Tab");
  const distance = panel.getByLabel(/Distance 1/);
  await distance.fill("30");
  await distance.press("ArrowUp");
  await expect(distance).toHaveValue("31");
  await distance.dispatchEvent("wheel", {
    deltaY: 100,
    altKey: true,
    shiftKey: true,
  });
  await expect(distance).toHaveValue("26");
  await distance.press("Tab");
  await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
});
test("radial center hover and modifier changes render previews before confirmation", async ({
  page,
}) => {
  const { canvas, panel } = await setup(page, "Radial Array");
  const image = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await canvas.hover({ position: { x: 400, y: 270 } });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const first = await image();
  await canvas.hover({ position: { x: 350, y: 220 } });
  await expect.poll(image).not.toBe(first);
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  const gap = await panel
    .getByLabel("Mode", { exact: true })
    .evaluate((el) => getComputedStyle(el.parentElement!).columnGap);
  expect(gap).toBe("8px");
  await canvas.focus();
  await page.keyboard.down("Shift");
  await page.keyboard.up("Shift");
  await canvas.click({ position: { x: 420, y: 320 } });
  await expect(
    panel.getByRole("button", { name: "Apply", exact: true }),
  ).toBeEnabled();
});
test("shared select spacing retains stacked full-width corner controls", async ({
  page,
}) => {
  const { panel } = await setup(page, "Rectangular Array");
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Corners", exact: true }).click();
  const label = page.locator(".corner-inputs label:has(> select)").first();
  await expect(label).toBeVisible();
  expect(await label.evaluate((el) => getComputedStyle(el).display)).toBe(
    "block",
  );
});
for (const [tool, action] of [
  ["Rectangular Array", "Cancel"],
  ["Rectangular Array", "Select endpoint 1"],
  ["Rectangular Array", "Select endpoint 2"],
  ["Radial Array", "Select center point"],
  ["Rectangular Array", "Apply"],
] as const) {
  test(`focused array button Enter activates ${action}`, async ({ page }) => {
    const { canvas, panel } = await setup(page, tool);
    await canvas.click({ position: { x: 420, y: 320 } });
    await expect(
      panel.getByRole("button", { name: "Apply", exact: true }),
    ).toBeEnabled();
    const button = panel.getByRole("button", { name: action, exact: true });
    await button.focus();
    await button.press("Enter");
    const objects = page.locator(".objects .object-select");
    if (action === "Apply") {
      await expect(panel).toBeHidden();
      await expect(objects).toHaveCount(8);
    } else if (action === "Cancel") {
      await expect(panel).toBeHidden();
      await expect(objects).toHaveCount(1);
    } else {
      await expect(panel).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "Apply", exact: true }),
      ).toBeDisabled();
      await expect(canvas).toBeFocused();
      await expect(objects).toHaveCount(1);
      await expect(panel).toContainText(
        action === "Select center point"
          ? "Select center point."
          : action === "Select endpoint 1"
            ? "Select endpoint 1."
            : "Select endpoint 2.",
      );
    }
  });
}
test("focused array numeric input Enter retains apply shortcut", async ({
  page,
}) => {
  const { canvas, panel } = await setup(page, "Rectangular Array");
  await canvas.click({ position: { x: 420, y: 320 } });
  const number = panel.getByLabel("Number", { exact: true });
  await number.fill("3");
  await number.press("Enter");
  await expect(panel).toBeHidden();
  await expect(page.locator(".objects .object-select")).toHaveCount(3);
});
