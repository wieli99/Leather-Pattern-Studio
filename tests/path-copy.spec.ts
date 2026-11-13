import { test, expect } from '@playwright/test';
import { manualScreenshot } from './manual-capture';

test('copy along path uses object pickers, distribution controls, and undo @manual', async ({ page }) => {
  await page.goto('/');
  const open = page.getByRole('button', { name:'Open', exact:true });
  await expect(open).toBeEnabled();
  await page.evaluate(() => { delete (window as any).showOpenFilePicker; });
  const chooser = page.waitForEvent('filechooser');
  await open.click();
  await (await chooser).setFiles({ name:'copy.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({version:22,shapes:[
    {id:'source',name:'Source',kind:'rectangle',points:[{x:2,y:3},{x:6,y:7}],radius:0,rotation:0},
    {id:'path',name:'Path',kind:'polyline',points:[{x:0,y:0},{x:40,y:0}],radius:0,rotation:0}
  ]})) });
  const objects = page.locator('.objects .object-select');
  await expect(objects).toHaveCount(2);
  await objects.filter({hasText:'Source'}).click();
  await page.getByRole('button',{name:'Copy along path',exact:true}).click();
  await objects.filter({hasText:'Path'}).click();
  const panel = page.getByRole('region',{name:'Copy along path settings'});
  await expect(panel.getByRole('button',{name:'Apply',exact:true})).toBeEnabled();
  await panel.getByLabel('Distribution').selectOption('count');
  const count = panel.getByLabel('New copies');
  await count.fill('1');
  for (const modifiers of [{}, {shiftKey:true}, {ctrlKey:true}]) {
    await count.dispatchEvent('wheel', {deltaY:100,altKey:true,...modifiers});
    await expect(count).toHaveValue('1');
  }
  await count.press('ArrowDown');
  await expect(count).toHaveValue('1');
  await count.fill('1000');
  await count.dispatchEvent('wheel', {deltaY:-100,altKey:true});
  await expect(count).toHaveValue('1000');
  await count.fill('0');
  await expect(count).toHaveAttribute('aria-invalid','true');
  await count.fill('5');
  await panel.getByLabel('Distribution').selectOption('spacing');
  const spacing = panel.getByLabel(/^Spacing/);
  await spacing.fill('0.01');
  for (const modifiers of [{}, {shiftKey:true}, {ctrlKey:true}]) {
    await spacing.dispatchEvent('wheel', {deltaY:100,altKey:true,...modifiers});
    await expect(spacing).toHaveValue('0.01');
  }
  await spacing.press('ArrowDown');
  await expect(spacing).toHaveValue('0.01');
  await spacing.fill('-1');
  await expect(spacing).toHaveAttribute('aria-invalid','true');
  await spacing.fill('10');
  await panel.getByLabel('Distribution').selectOption('count');
  await panel.getByLabel('Rotate with path').uncheck();
  await manualScreenshot(page, "copy-along-path.png");
  await panel.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(objects).toHaveCount(7);
  await page.locator('canvas').first().focus();
  await page.keyboard.press('Control+z');
  await expect(objects).toHaveCount(2);
});

test('rectangle path supports rotated copies and undo', async ({ page }) => {
  await page.goto('/');
  const open = page.getByRole('button', { name:'Open', exact:true });
  await expect(open).toBeEnabled();
  await page.evaluate(() => { delete (window as any).showOpenFilePicker; });
  const chooser = page.waitForEvent('filechooser');
  await open.click();
  await (await chooser).setFiles({ name:'copy.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({version:22,shapes:[
    {id:'source',name:'Source',kind:'rectangle',points:[{x:2,y:3},{x:6,y:7}],radius:0,rotation:0},
    {id:'path',name:'Path',kind:'rectangle',points:[{x:40,y:60},{x:140,y:140}],radius:0,rotation:0}
  ]})) });
  const objects = page.locator('.objects .object-select');
  await expect(objects).toHaveCount(2);
  await objects.filter({hasText:'Source'}).click();
  await page.getByRole('button',{name:'Copy along path',exact:true}).click();
  await objects.filter({hasText:'Path'}).click();
  const panel = page.getByRole('region',{name:'Copy along path settings'});
  await expect(panel.getByRole('button',{name:'Apply',exact:true})).toBeEnabled();
  await panel.getByLabel('Distribution').selectOption('count');
  await expect(panel.getByLabel('Rotate with path')).toBeChecked();
  await panel.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(objects).toHaveCount(7);
  await page.locator('canvas').first().focus();
  await page.keyboard.press('Control+z');
  await expect(objects).toHaveCount(2);
});
