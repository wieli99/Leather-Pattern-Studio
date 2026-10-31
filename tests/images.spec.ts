import { test, expect } from "@playwright/test";
test("import an image and edit opacity and dimensions", async ({page}) => {
  await page.goto("/");
  const button = page.getByRole("button", {name:"Import image", exact:true});
  await expect(button).toBeEnabled();
  const chooser = page.waitForEvent("filechooser");
  await button.click();
  await (await chooser).setFiles({name:"Reference.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP4z8DwnwGM/zMwAAAf7gP9NRsAMwAAAABJRU5ErkJggg==","base64")});
  await expect(page.locator(".object-select")).toHaveCount(1);
  await expect(page.getByText("Lock aspect ratio", {exact:true})).toBeVisible();
  await expect(page.getByText("Image opacity (%)", {exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/image-import.png"});
});

for (const mimeType of ["image/svg+xml", ""]) {
  test(`import SVG image (${mimeType || "empty MIME"}) and undo`, async ({ page }) => {
    await page.goto("/");
    const button = page.getByRole("button", { name: "Import image", exact: true });
    await expect(button).toBeEnabled();
    const chooser = page.waitForEvent("filechooser");
    await button.click();
    await (await chooser).setFiles({ name: "Reference.svg", mimeType,
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="red"/></svg>') });
    await expect(page.locator(".object-select")).toHaveCount(1);
    await expect(page.getByText("Image opacity (%)", { exact: true })).toBeVisible();
    if (mimeType) await page.screenshot({path:"test-results/svg-import.png"});
    await page.getByRole("button", { name: "Undo", exact:true }).click();
    await expect(page.locator(".object-select")).toHaveCount(0);
  });
}
