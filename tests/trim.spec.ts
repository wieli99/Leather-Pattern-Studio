import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("curved trim highlights, cancels, applies, undoes and round trips", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
    delete (window as any).showSaveFilePicker;
  });
  const shapes = [
    {
      id: "circle",
      name: "Circle",
      kind: "circle",
      points: [
        { x: 80, y: 70 },
        { x: 110, y: 70 },
      ],
      radius: 0,
      rotation: 0,
    },
    {
      id: "cut",
      name: "Cutting line",
      kind: "line",
      points: [
        { x: 80, y: 20 },
        { x: 80, y: 120 },
      ],
      radius: 0,
      rotation: 0,
    },
  ];
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "trim.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 11, shapes })),
  });
  await expect(page.locator(".objects button")).toHaveCount(2);
  await page.locator(".objects button").first().click();
  const trim = page.getByRole("button", { name: "Trim", exact: true });
  await page.getByRole("button", { name: "Circle (C)", exact: true }).click();
  await trim.click();
  await expect(
    page.getByRole("button", { name: "Select (V)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Circle (C)", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  const canvas = page.getByLabel("Pattern drawing canvas");
  const box = (await canvas.boundingBox())!;
  // The editor's initial view is 3 px/mm with an (80,100) px origin.
  const point = { x: box.x + 80 + 110 * 3, y: box.y + 100 + 70 * 3 };
  await page.mouse.move(point.x, point.y);
  await page.screenshot({ path: info.outputPath("curved-trim.png") });
  if (
    info.project.name === "chromium" &&
    process.env.UPDATE_MANUAL_SCREENSHOTS === "1"
  )
    await page.screenshot({ path: "public/manual/images/trim.png" });
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press("Escape");
  await expect(trim).toHaveAttribute("aria-pressed", "false");
  await trim.click();
  await page.mouse.click(point.x, point.y);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const save = async (name: string) => {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const path = info.outputPath(name);
    await (await pending).saveAs(path);
    return { path, doc: JSON.parse(await readFile(path, "utf8")) };
  };
  const saved = await save("trimmed.json");
  expect(saved.doc.shapes[0].kind).toBe("arc");
  expect(saved.doc.shapes[0].sweep).toBeCloseTo(180, 5);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await save("undo.json")).doc.shapes[0].kind).toBe("circle");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await save("redo.json")).doc.shapes[0].kind).toBe("arc");
  page.on("dialog", (d) => void d.accept());
  const reopen = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await reopen).setFiles(saved.path);
  await expect(page.locator(".objects button")).toHaveCount(2);
  expect((await save("roundtrip.json")).doc.shapes).toEqual(saved.doc.shapes);
});
