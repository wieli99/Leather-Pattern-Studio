import { manualScreenshot } from "./manual-capture";
import { test, expect } from "@playwright/test";
test("import an image and edit opacity and dimensions", { tag: "@manual" }, async ({page}) => {
  await page.goto("/");
  const button = page.getByRole("button", {name:"Import image", exact:true});
  await expect(button).toBeEnabled();
  const chooser = page.waitForEvent("filechooser");
  await button.click();
  await (await chooser).setFiles({name:"Reference.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP4z8DwnwGM/zMwAAAf7gP9NRsAMwAAAABJRU5ErkJggg==","base64")});
  await expect(page.locator(".object-select")).toHaveCount(1);
  const aspectLock = page.getByRole("button", { name: "Lock aspect ratio", exact: true });
  await expect(aspectLock).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Image opacity (%)", {exact:true})).toBeVisible();
  await manualScreenshot(page, "image-import.png");
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  const height = page.getByRole("textbox", { name: "Height", exact: true });
  await width.fill("120");
  await width.press("Enter");
  await expect(height).toHaveValue("120");
  await height.fill("100");
  await height.press("Enter");
  await expect(width).toHaveValue("100");
  await aspectLock.click();
  await expect(aspectLock).toHaveAttribute("aria-pressed", "false");
  const originalHeight = await height.inputValue();
  await width.fill("120");
  await width.press("Enter");
  await expect(width).toHaveValue("120");
  await expect(height).toHaveValue(originalHeight);
  await height.fill("80");
  await height.press("Enter");
  await expect(height).toHaveValue("80");
  await expect(width).toHaveValue("120");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(height).toHaveValue(originalHeight);
  await expect(width).toHaveValue("120");
  await aspectLock.click();
  await expect(aspectLock).toHaveAttribute("aria-pressed", "true");
  await width.fill("60");
  await width.press("Enter");
  await expect(height).toHaveValue("50");
});

for (const mimeType of ["image/svg+xml", ""]) {
  test(`import SVG image (${mimeType || "empty MIME"}) and undo`, { tag: "@manual" }, async ({ page }) => {
    await page.goto("/");
    const button = page.getByRole("button", { name: "Import image", exact: true });
    await expect(button).toBeEnabled();
    const chooser = page.waitForEvent("filechooser");
    await button.click();
    await (await chooser).setFiles({ name: "Reference.svg", mimeType,
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="red"/></svg>') });
    const review = page.getByRole("dialog", { name: "Import SVG" });
    await review.getByRole("radio", { name: "Import as image" }).check();
    await review.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.locator(".object-select")).toHaveCount(1);
    await expect(page.getByText("Image opacity (%)", { exact: true })).toBeVisible();
    if (mimeType) await manualScreenshot(page, "svg-import.png");
    await page.getByRole("button", { name: "Undo", exact:true }).click();
    await expect(page.locator(".object-select")).toHaveCount(0);
  });
}

for (const aspect of ['width="120" height="60"', 'viewBox="0 0 120 60"', 'viewBox="0 0 120 60" preserveAspectRatio="xMidYMid meet"']) {
  test(`SVG artwork stretches independently ${aspect || "default"}`, { tag: "@manual" }, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", {name:"Import image",exact:true})).toBeEnabled();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", {name:"Import image",exact:true}).click();
    await (await chooser).setFiles({name:"stretch.svg",mimeType:"image/svg+xml",buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${aspect}><rect width="120" height="60" fill="#ff0000"/></svg>`)});
    const review = page.getByRole("dialog", { name: "Import SVG" });
    await review.getByRole("radio", { name: "Import as image" }).check();
    await review.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.locator(".object-select")).toHaveCount(1);
    const artwork = () => page.locator("canvas").first().evaluate((canvas: HTMLCanvasElement) => {
      const {data} = canvas.getContext("2d")!.getImageData(0,0,canvas.width,canvas.height);
      let left=Infinity,right=-1,top=Infinity,bottom=-1;
      for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) {
        const i=(y*canvas.width+x)*4;
        if(data[i]>220 && data[i+1]<40 && data[i+2]<40) {left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      }
      return {width:right-left+1,height:bottom-top+1};
    });
    await expect.poll(async () => (await artwork()).width).toBeGreaterThan(10);
    const before=await artwork();
    await page.getByRole("button",{name:"Resize",exact:true}).click();
    await page.getByRole("textbox",{name:"X factor",exact:true}).fill("1.4");
    await page.getByRole("button",{name:"Apply",exact:true}).click();
    await expect.poll(async () => (await artwork()).width/before.width).toBeCloseTo(1.4,1);
    expect((await artwork()).height).toBeCloseTo(before.height,0);
    await page.getByRole("button",{name:"Resize",exact:true}).click();
    await page.getByRole("textbox",{name:"Y factor",exact:true}).fill("1.2");
    await page.getByRole("button",{name:"Apply",exact:true}).click();
    await expect.poll(async () => (await artwork()).height/before.height).toBeCloseTo(1.2,1);
    if (aspect === 'width="120" height="60"') await manualScreenshot(page, "svg-resize.png");
  });
}

test("calibrate an image from two points and a known distance", { tag: "@manual" }, async ({ page }) => {
  await page.goto("/");
  const importButton = page.getByRole("button", { name: "Import image", exact: true });
  await expect(importButton).toBeEnabled();
  const canvas = page.getByLabel("Pattern drawing canvas");
  const box = (await canvas.boundingBox())!;
  // Zoom out to half size first so the calibrated, larger image still fits the view.
  await canvas.hover({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 347);
  await page.keyboard.up("Control");
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await importButton.click();
  // A 480 × 300 px scan with a ruler across its middle; major ticks are 100 px apart.
  await (await chooser).setFiles("tests/fixtures/images/calibration-scan.png");
  await expect(page.locator(".object-select")).toHaveCount(1);
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  const original = await width.inputValue(), before = Number(original);
  await page.getByRole("button", { name: "Search tools", exact: true }).click();
  await page.getByRole("textbox", { name: "Search tools", exact: true }).fill("calibrate");
  await page.getByRole("button", { name: "Calibrate image", exact: true }).click();
  const panel = page.getByRole("region", { name: "Calibrate image settings" });
  await expect(panel).toContainText("Click point 1 on the image.");
  const apply = panel.getByRole("button", { name: "Apply", exact: true });
  await expect(apply).toBeDisabled();
  // The image is inserted at the view centre at half the view size.
  const scale = Math.min(box.width / 480, box.height / 300) / 2;
  const at = (x: number, y: number) => ({ position: { x: box.width / 2 + (x - 240) * scale, y: box.height / 2 + (y - 150) * scale } });
  // A click beside the image is refused.
  await canvas.click(at(240, -40));
  await expect(panel.getByRole("alert")).toHaveText("Pick a point on the image.");
  await canvas.click(at(130, 140));
  await expect(panel).toContainText("Click point 2 on the image.");
  // Escape steps back to point 1 instead of closing the tool.
  await canvas.press("Escape");
  await expect(panel).toContainText("Click point 1 on the image.");
  await canvas.click(at(130, 140));
  await canvas.click(at(330, 140));
  const known = panel.getByLabel("Known distance", { exact: true });
  await expect(known).toBeFocused();
  const measured = Number(await panel.getByLabel("Measured distance").textContent());
  // Clicks land on whole pixels, so allow about one pixel of error.
  expect(Math.abs(measured / (before * 200 / 480) - 1)).toBeLessThan(0.02);
  // Arrow keys step 0.1 mm and stop at the 0.001 mm minimum; Alt+scroll steps whole millimetres.
  await known.fill("0.05");
  await known.press("ArrowDown");
  await expect(known).toHaveValue("0.001");
  await known.press("ArrowUp");
  await expect(known).toHaveValue("0.101");
  await known.hover();
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Alt");
  await expect(known).toHaveValue("1.101");
  await known.fill("0");
  await expect(known).toHaveAttribute("aria-invalid", "true");
  await expect(apply).toBeDisabled();
  // Ruler marks 1 to 3 are 20 cm apart on the original.
  await known.fill("200");
  await expect(apply).toBeEnabled();
  const factor = Number((await panel.getByLabel("Scale factor").textContent())!.replace(" %", ""));
  expect(factor).toBeCloseTo(200 / measured * 100, 0);
  await manualScreenshot(page, "image-calibration.png");
  await known.press("Enter");
  await expect(panel).toHaveCount(0);
  // 200 mm across 200 of 480 px makes the whole image 480 mm wide.
  await expect.poll(async () => Number(await width.inputValue())).toBeCloseTo(before * 200 / measured, 0);
  expect(Math.abs(Number(await width.inputValue()) / 480 - 1)).toBeLessThan(0.02);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(width).toHaveValue(original);
});
