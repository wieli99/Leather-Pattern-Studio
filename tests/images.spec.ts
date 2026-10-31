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
