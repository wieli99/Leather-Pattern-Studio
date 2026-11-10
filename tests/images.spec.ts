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
  const width = page.getByRole("spinbutton", { name: "Width", exact: true });
  const height = page.getByRole("spinbutton", { name: "Height", exact: true });
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
    await page.getByRole("spinbutton",{name:"X factor",exact:true}).fill("1.4");
    await page.getByRole("button",{name:"Apply",exact:true}).click();
    await expect.poll(async () => (await artwork()).width/before.width).toBeCloseTo(1.4,1);
    expect((await artwork()).height).toBeCloseTo(before.height,0);
    await page.getByRole("button",{name:"Resize",exact:true}).click();
    await page.getByRole("spinbutton",{name:"Y factor",exact:true}).fill("1.2");
    await page.getByRole("button",{name:"Apply",exact:true}).click();
    await expect.poll(async () => (await artwork()).height/before.height).toBeCloseTo(1.2,1);
    if (aspect === 'width="120" height="60"') await manualScreenshot(page, "svg-resize.png");
  });
}
