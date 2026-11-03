import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

/** Source illustrations are written only by the explicit manual capture commands. */
export async function manualScreenshot(target: Page | Locator, name: string) {
  if (process.env.MANUAL_SCREENSHOTS !== "1") return;
  const page = "page" in target ? target.page() : target;
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
  await expect(target).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    maxDiffPixels: 0,
    // Allow minor rasterization noise, with no differences beyond this threshold.
    threshold: 0.1,
  });
  mkdirSync("test-results/manual/captured", { recursive: true });
  writeFileSync(`test-results/manual/captured/${name}`, test.info().title);
  test.info().annotations.push({ type: "manual-image", description: name });
}
