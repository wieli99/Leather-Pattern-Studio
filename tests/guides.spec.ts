import { test, expect } from "@playwright/test";
test("ruler guide survives release through the real worker", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Select (V)", exact: true }),
  ).toBeEnabled();
  await page.getByText("Settings", { exact: true }).click();
  await page.getByLabel("X/Y rulers", { exact: true }).check();
  await page.getByText("Settings", { exact: true }).click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 220, { steps: 10 });
  await page.mouse.up();
  await page.mouse.move(box.x + 500, box.y + 300);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const r = indexedDB.open("leather-studio", 1);
          r.onsuccess = () => resolve(r.result);
        });
        return new Promise<number>((resolve) => {
          const r = db
            .transaction("recovery")
            .objectStore("recovery")
            .get("current");
          r.onsuccess = () => {
            resolve(r.result?.document.guides?.length ?? 0);
            db.close();
          };
        });
      }),
    )
    .toBe(1);
});

test("guideline alignment reference preview", async ({ page }, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Rectangle (R)", exact: true })
    .click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 150, y: 180 } });
  await canvas.click({ position: { x: 450, y: 390 } });
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await page.getByText("Settings", { exact: true }).click();
  await page.getByLabel("X/Y rulers", { exact: true }).check();
  await page.getByText("Settings", { exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 600, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 600, box.y + 285, { steps: 10 });
  await page.screenshot({ path: info.outputPath("guide-alignment.png") });
  await page.mouse.up();
});
