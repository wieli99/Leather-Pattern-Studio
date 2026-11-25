import { test, expect, type Page } from '@playwright/test';
import { manualScreenshot } from './manual-capture';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tool-favorites-v1", JSON.stringify(["move", "rotate", "scale", "mirror", "corner", "align"])));
});

async function openProject(page: Page) {
  await page.goto('/');
  const open = page.getByRole('button', { name: 'Open', exact: true });
  await expect(open).toBeEnabled();
  await page.evaluate(() => { delete (window as any).showOpenFilePicker; });
  const chooser = page.waitForEvent('filechooser');
  await open.click();
  await (await chooser).setFiles({ name: 'align.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 22, shapes: [
    { id: 'a', name: 'Strap', kind: 'rectangle', points: [{ x: 10, y: 0 }, { x: 70, y: 15 }], radius: 0, rotation: 0 },
    { id: 'b', name: 'Pocket', kind: 'rectangle', points: [{ x: 30, y: 30 }, { x: 60, y: 70 }], radius: 0, rotation: 0 },
    { id: 'c', name: 'Tab', kind: 'circle', points: [{ x: 100, y: 100 }, { x: 110, y: 100 }], radius: 0, rotation: 0 },
  ] })) });
  await expect(page.locator('.objects .object-select')).toHaveCount(3);
}
async function saved(page: Page) {
  await page.evaluate(() => { delete (window as any).showSaveFilePicker; });
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const { readFile } = await import('node:fs/promises');
  const doc = JSON.parse(await readFile((await (await event).path())!, 'utf8'));
  // Untransformed rectangles and circles: left/top edges from their points.
  const edge = (id: string, axis: 'x' | 'y') => {
    const s = doc.shapes.find((shape: any) => shape.id === id);
    if (s.kind === 'circle') return s.points[0][axis] - Math.hypot(s.points[1].x - s.points[0].x, s.points[1].y - s.points[0].y);
    return Math.min(...s.points.map((p: any) => p[axis]));
  };
  return { left: (id: string) => edge(id, 'x'), top: (id: string) => edge(id, 'y') };
}

test('align previews choices from the original until Apply, and Cancel discards them', async ({ page }) => {
  await openProject(page);
  const objects = page.locator('.objects .object-select');
  const button = page.getByRole('button', { name: 'Align and distribute', exact: true });
  await expect(button).toBeDisabled();
  await objects.filter({ hasText: 'Strap' }).click();
  await objects.filter({ hasText: 'Pocket' }).click({ modifiers: ['Shift'] });
  await objects.filter({ hasText: 'Tab' }).click({ modifiers: ['Shift'] });
  await button.click();
  const panel = page.getByRole('region', { name: 'Align and distribute settings' });
  const apply = panel.getByRole('button', { name: 'Apply', exact: true });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(apply).toBeDisabled();
  // Cancel discards a preview without touching the project.
  await panel.getByRole('button', { name: 'Align left edges' }).click();
  await expect(apply).toBeEnabled();
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel).toHaveCount(0);
  let doc = await saved(page);
  expect(['a', 'b', 'c'].map(doc.left)).toEqual([10, 30, 90]);

  await button.click();
  const left = panel.getByRole('button', { name: 'Align left edges' });
  await left.click();
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'Align top edges' }).click();
  // Switching the reference recomputes from the original: Pocket (largest) stays put.
  await panel.getByLabel('Align relative to').selectOption('largest');
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  await apply.click();
  await expect(panel).toHaveCount(0);
  doc = await saved(page);
  expect(['a', 'b', 'c'].map(doc.left)).toEqual([30, 30, 30]);
  expect(['a', 'b', 'c'].map(doc.top)).toEqual([30, 30, 30]);
  // Apply was one undo step.
  await page.locator('canvas').first().focus();
  await page.keyboard.press('Control+z');
  doc = await saved(page);
  expect(['a', 'b', 'c'].map(doc.left)).toEqual([10, 30, 90]);
  expect(['a', 'b', 'c'].map(doc.top)).toEqual([0, 30, 90]);
});

test('Escape discards and right-click applies on the canvas', async ({ page }) => {
  await openProject(page);
  const objects = page.locator('.objects .object-select');
  await objects.filter({ hasText: 'Strap' }).click();
  await objects.filter({ hasText: 'Pocket' }).click({ modifiers: ['Shift'] });
  const button = page.getByRole('button', { name: 'Align and distribute', exact: true });
  await button.click();
  const panel = page.getByRole('region', { name: 'Align and distribute settings' });
  await panel.getByRole('button', { name: 'Center horizontally' }).click();
  await panel.getByRole('button', { name: 'Center horizontally' }).press('Escape');
  await expect(panel).toHaveCount(0);
  await button.click();
  await panel.getByRole('button', { name: 'Align bottom edges' }).click();
  await page.getByLabel('Pattern drawing canvas').click({ button: 'right', position: { x: 300, y: 300 } });
  await expect(panel).toHaveCount(0);
  const doc = await saved(page);
  expect(['a', 'b'].map(doc.left)).toEqual([10, 30]);
  expect(['a', 'b'].map(doc.top)).toEqual([55, 30]);
});

test('two objects cannot be distributed and a lone object needs a reference to align', async ({ page }) => {
  await openProject(page);
  const objects = page.locator('.objects .object-select');
  await objects.filter({ hasText: 'Strap' }).click();
  await page.getByRole('button', { name: 'Align and distribute', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Align and distribute settings' });
  await expect(panel.getByRole('button', { name: 'Distribute centers horizontally' })).toBeDisabled();
  await panel.getByLabel('Align relative to').selectOption('first');
  await expect(panel.getByRole('button', { name: 'Align left edges' })).toBeDisabled();
});

test('Enter applies after clicking a choice, and rail Undo ends an open session', async ({ page }) => {
  await openProject(page);
  const objects = page.locator('.objects .object-select');
  await objects.filter({ hasText: 'Strap' }).click();
  await objects.filter({ hasText: 'Pocket' }).click({ modifiers: ['Shift'] });
  const button = page.getByRole('button', { name: 'Align and distribute', exact: true });
  const panel = page.getByRole('region', { name: 'Align and distribute settings' });
  await button.click();
  await panel.getByRole('button', { name: 'Align left edges' }).click();
  await page.keyboard.press('Enter');
  await expect(panel).toHaveCount(0);
  let doc = await saved(page);
  expect(['a', 'b'].map(doc.left)).toEqual([10, 10]);
  // Undo from the rail while a preview is open discards it; nothing can re-apply it.
  await button.click();
  await panel.getByRole('button', { name: 'Align top edges' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(panel).toHaveCount(0);
  doc = await saved(page);
  expect(['a', 'b'].map(doc.left)).toEqual([10, 30]);
  expect(['a', 'b'].map(doc.top)).toEqual([0, 30]);
});

test('align panel combining a horizontal and a vertical arrangement @manual', async ({ page }) => {
  await openProject(page);
  const objects = page.locator('.objects .object-select');
  await objects.filter({ hasText: 'Strap' }).click();
  await objects.filter({ hasText: 'Pocket' }).click({ modifiers: ['Shift'] });
  await objects.filter({ hasText: 'Tab' }).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Align and distribute', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Align and distribute settings' });
  await panel.getByLabel('Align relative to').selectOption('largest');
  await panel.getByRole('button', { name: 'Center horizontally' }).click();
  await panel.getByRole('button', { name: 'Equalize vertical gaps' }).click();
  await expect(panel.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await page.mouse.move(5, 400);
  await manualScreenshot(page, 'align-distribute.png');
});
