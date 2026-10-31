import { expect, test } from "@playwright/test";

test("object snapping persists and shows reference guides while drawing", async ({ page }, info) => {
  await page.goto("/");
  const objects = page.getByRole("checkbox", { name: "Object snap", exact: true });
  await expect(objects).toBeChecked();
  await objects.uncheck();
  await page.reload();
  await expect(objects).not.toBeChecked();
  await objects.check();
  await page.getByRole("checkbox", { name: "Grid snap", exact: true }).uncheck();
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 250, y: 200 } });
  await canvas.click({ position: { x: 450, y: 400 } });
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 350, box.y + 300);
  await page.screenshot({ path: info.outputPath("smart-center-guides.png") });
  if (info.project.name === "chromium") {
    await page.screenshot({ path: "public/manual/images/smart-snapping.png" });
  }
  await objects.uncheck();
  await expect(objects).not.toBeChecked();
});
