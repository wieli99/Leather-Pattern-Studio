import { manualScreenshot } from "./manual-capture";
import { test, expect } from '@playwright/test';
test('desktop update buttons are centered and select arrows stay fixed across themes @manual', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Rectangle (R)', exact: true })).toBeEnabled();
  // Exercise desktop-only settings without enabling native startup services.
  await page.evaluate(() => {
    Object.defineProperty(window, 'isTauri', { value: true, configurable: true });
    (window as any).__TAURI_INTERNALS__ = { invoke: async (command: string) => command === 'desktop_target' ? 'linux-x86_64' : [] };
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const section = page.getByRole('region', { name: 'Application updates' });
  const button = section.getByRole('button', { name: 'Check for updates', exact: true });
  await expect(button).toBeVisible();
  for (const theme of ['dark', 'light', 'solarized', 'nord', 'contrast']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    const outer = await section.boundingBox(), inner = await button.boundingBox();
    expect(outer).not.toBeNull(); expect(inner).not.toBeNull();
    expect(Math.abs((outer!.x + outer!.width / 2) - (inner!.x + inner!.width / 2))).toBeLessThan(1);
    await expect(page.getByLabel('Theme', { exact: true })).toHaveCSS('background-size', '12px 12px');
  }
  await button.click();
  await expect(section.getByRole('status')).toHaveText('No newer compatible release found.');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(section.getByRole('status')).toHaveText('No newer compatible release found.');
  await manualScreenshot(page, "desktop-updates.png");
});
test('desktop manual returns to the editor without an unpermitted window close', async ({ page }) => {
  await page.goto('/manual/index.html');
  await expect(page.getByRole('link', { name: 'Open editor ↗' })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(window, 'isTauri', { value: true, configurable: true });
    (window as any).desktopCommands = [];
    (window as any).__TAURI_INTERNALS__ = { invoke: async (command: string) => { (window as any).desktopCommands.push(command); } };
  });
  await page.getByRole('link', { name: 'Open editor ↗' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).desktopCommands)).toEqual(['focus_editor']);
});
