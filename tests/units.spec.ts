import { manualScreenshot } from "./manual-capture";
import { test, expect } from '@playwright/test';
test('global units accept fractions, preserve dimensions and persist', { tag: "@manual" }, async ({ page }, testInfo) => {
  await page.goto('/');
  const rectangle = page.getByRole('button', { name: 'Rectangle (R)', exact: true });
  await expect(rectangle).toBeEnabled();
  await rectangle.click();
  const canvas = page.getByLabel('Pattern drawing canvas');
  await canvas.click({ position: { x: 150, y: 180 } });
  await canvas.click({ position: { x: 450, y: 390 } });
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  const width = page.getByLabel('Width', { exact: true });
  await width.fill('12.7*2');
  await width.press('Enter');
  async function units(value: string) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Units', { exact: true }).selectOption(value);
    await page.keyboard.press('Escape');
  }
  await units('in-fractional');
  await expect(width).toHaveValue('1');
  await width.focus();
  await width.press('Tab');
  await expect(width).toHaveValue('1');
  await width.fill('1 3/8');
  await width.press('Enter');
  await expect(width).toHaveValue('1 3/8');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await manualScreenshot(page, "inch-settings.png");
  await page.keyboard.press('Escape');
  await units('mm');
  // Display precision is independent of the exact stored value.
  await width.focus();
  expect(Number(await width.inputValue())).toBeCloseTo(34.925, 10);
  await width.press('Tab');
  await units('in-decimal');
  await expect(width).toHaveValue('1.375');
  await page.reload();
  await expect(rectangle).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Units', { exact: true })).toHaveValue('in-decimal');
});

test('fractional grid entry preserves its physical spacing across unit changes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Rectangle (R)', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const units = page.getByLabel('Units', { exact: true });
  await units.selectOption('in-fractional');
  const inches = page.getByLabel('Grid spacing (in)', { exact: true });
  await inches.fill('1/8');
  await inches.press('Tab');
  await expect(inches).toHaveValue('1/8');
  await inches.fill('1/0');
  await expect(inches).toHaveAttribute('aria-invalid', 'true');
  await units.selectOption('mm');
  const mm = page.getByLabel('Grid spacing (mm)', { exact: true });
  await mm.focus();
  expect(Number(await mm.inputValue())).toBeCloseTo(3.175, 12);
  await mm.press('Tab');
  await units.selectOption('in-decimal');
  await expect(inches).toHaveValue('0.125');
  await page.keyboard.press('Escape');
});

test('grid spacing combines custom input and unit-specific presets', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Rectangle (R)', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Grid spacing presets', { exact: true }).click();
  for (const n of [0.5, 1, 5, 10, 50, 100]) await expect(page.getByRole('menuitem', { name: `${n.toFixed(2)} mm`, exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: '50.00 mm', exact: true }).click();
  await expect(page.getByLabel('Grid spacing (mm)', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Settings', { exact: true })).toBeVisible();
  await page.getByLabel('Units', { exact: true }).selectOption('in-fractional');
  await page.getByLabel('Grid spacing presets', { exact: true }).click();
  await page.getByRole('menuitem', { name: '1/8 in', exact: true }).click();
  await expect(page.getByLabel('Grid spacing (in)', { exact: true })).toHaveValue('1/8');
  if (info.project.name === 'chromium') await page.screenshot({ path: info.outputPath('combined-grid-settings.png') });
});

test('fractional corner drafts survive clamping and invalid stitches block Apply', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Rectangle (R)', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
  const canvas = page.getByLabel('Pattern drawing canvas');
  await canvas.click({ position: { x: 150, y: 180 } });
  await canvas.click({ position: { x: 210, y: 240 } });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Units', { exact: true }).selectOption('in-fractional');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Corner radius', exact: true }).click();
  await canvas.click({ position: { x: 155, y: 185 } });
  const corner = page.getByLabel('Corner radius (in)', { exact: true });
  await corner.fill('');
  await corner.pressSequentially('1/8', { delay: 100 });
  await expect(corner).toHaveValue('1/8');
  await canvas.focus();
  await expect(corner).toHaveValue('1/8');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Stitch line', exact: true }).click();
  const spacing = page.getByLabel('Stitch spacing', { exact: true });
  const apply = page.getByRole('button', { name: 'Apply', exact: true });
  await spacing.fill('1/0');
  await expect(apply).toBeDisabled();
  await spacing.press('Enter');
  await expect(spacing).toBeVisible();
  await page.getByLabel('Stitch inset', { exact: true }).fill('1/16');
  // Leaving an invalid draft restores its last valid value.
  await expect(apply).toBeEnabled();
  await spacing.fill('1/8');
  await expect(apply).toBeEnabled();
  await spacing.fill('');
  await expect(apply).toBeDisabled();
  await spacing.fill('1/8');
  for (const name of ['Stitch inset', 'Start clearance (in)', 'End clearance (in)']) {
    const input = page.getByLabel(name, { exact: true });
    await input.fill('1/0');
    await expect(apply).toBeDisabled();
    await input.fill('0');
    await expect(apply).toBeEnabled();
  }
  for (const [style, name] of [['round', 'Stitch diameter'], ['flat', 'Stitch length']]) {
    await page.getByLabel('Stitch style', { exact: true }).selectOption(style);
    const input = page.getByLabel(name, { exact: true });
    await input.fill('1/0');
    await expect(apply).toBeDisabled();
    await input.fill('1/16');
    await expect(apply).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
});
