import { expect, test } from "@playwright/test";

test("smart snapping persists and shows reference guides while drawing", async ({ page }, info) => {
  await page.goto("/");
  const smart = page.getByRole("checkbox", { name: "Smart snapping", exact: true });
  await expect(smart).toBeChecked();
  await smart.uncheck();
  await page.reload();
  await expect(smart).not.toBeChecked();
  await smart.check();
  await page.getByRole("checkbox", { name: "Grid snap", exact: true }).uncheck();
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 250, y: 200 } });
  await canvas.click({ position: { x: 450, y: 400 } });
  await expect(page.locator(".objects button")).toHaveCount(1);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 350, box.y + 300);
  await page.screenshot({ path: info.outputPath("smart-center-guides.png") });
  await smart.uncheck();
  await expect(smart).not.toBeChecked();
});
