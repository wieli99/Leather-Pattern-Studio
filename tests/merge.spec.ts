import { test, expect, type Page } from "@playwright/test";
async function load(page: Page, shapes: unknown[]) {
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "merge.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 11, shapes })),
  });
  await expect(page.locator(".objects .object-select")).toHaveCount(shapes.length);
  await page.locator(".objects .object-select").first().click();
  await expect(
    page.getByRole("button", { name: "Merge", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Merge", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".objects .object-select")
    .nth(1)
    .click({ modifiers: ["Shift"] });
}
const rectangle = (id: string, x: number) => ({
  id,
  name: id,
  kind: "rectangle",
  points: [
    { x, y: 20 },
    { x: x + 50, y: 70 },
  ],
  radius: 0,
  rotation: 0,
});
test("Merge alone highlights, cancels, applies and undoes an outline union", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await load(page, [rectangle("First", 20), rectangle("Second", 45)]);
  const merge = page.getByRole("button", { name: "Merge", exact: true });
  await expect(merge).toBeEnabled();
  await merge.click();
  await expect(merge).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Trim", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("region", { name: "Merge settings" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  await merge.click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
});
test("connected curves merge, cancel and round trip their handles", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  const curve = (id: string, x: number) => ({
    ...rectangle(id, x),
    kind: "control-curve",
    points: [
      { x, y: 40 },
      { x: x + 40, y: 40 },
    ],
    handles: [
      { incoming: { x: 0, y: 0 }, outgoing: { x: 12, y: -20 } },
      { incoming: { x: -12, y: 20 }, outgoing: { x: 0, y: 0 } },
    ],
  });
  await load(page, [curve("First curve", 20), curve("Second curve", 60)]);
  const merge = page.getByRole("button", { name: "Merge", exact: true });
  await expect(merge).toBeEnabled();
  await merge.click();
  if (
    info.project.name === "chromium" &&
    process.env.UPDATE_MANUAL_SCREENSHOTS === "1"
  )
    await page.screenshot({ path: "public/manual/images/merge.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  await merge.click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
  });
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadEvent;
  const path = (await download.path())!;
  const { readFile } = await import("node:fs/promises");
  const saved = JSON.parse(await readFile(path, "utf8"));
  expect(saved.shapes[0].kind).toBe("control-curve");
  expect(saved.shapes[0].handles).toHaveLength(3);
  expect(saved.shapes[0].handles[1]).toEqual({
    incoming: { x: -12, y: 20 },
    outgoing: { x: 12, y: -20 },
  });
  await load(page, [...saved.shapes, curve("Disconnected", 160)]);
  await expect(merge).toBeDisabled();
});

test("canvas shortcuts open stitching, trim and merge previews", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await load(page, [rectangle("First", 20), rectangle("Second", 45)]);
  const canvas = page.getByLabel("Pattern drawing canvas");
  for (const [key, name] of [
    ["i", "Stitch line"],
    ["k", "Trim"],
    ["j", "Merge"],
  ]) {
    await canvas.focus();
    await page.keyboard.press(key);
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator(".objects .object-select")).toHaveCount(2);
  }
});
