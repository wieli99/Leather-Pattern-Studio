import { test, expect } from "@playwright/test";

test("footer reporting opens a themed dialog and always includes the app version", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New", exact: true })).toBeEnabled();
  await page.locator("footer").getByRole("button", { name: "Report a bug" }).click();
  const dialog = page.getByRole("dialog", { name: "Report a bug" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(2);
  for (const checkbox of await dialog.getByRole("checkbox").all()) {
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
  }
  await page.screenshot({ path: testInfo.outputPath("bug-report.png") });
  await page.evaluate(() => {
    window.open = (url) => { (window as any).__reportUrl = String(url); return null; };
  });
  await dialog.getByRole("button", { name: "Open GitHub issue" }).click();
  const url = new URL(await page.evaluate(() => (window as any).__reportUrl));
  expect(url.origin).toBe("https://github.com");
  const body = url.searchParams.get("body")!;
  const version = (await page.locator(".app-version").innerText()).slice(1);
  expect(body).toContain(`App version: ${version}`);
  expect(body).not.toContain("## System information");
  expect(body).not.toContain("## Project");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("footer").getByRole("button", { name: "Report a bug" })).toBeFocused();
});
