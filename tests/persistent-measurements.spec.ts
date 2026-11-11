import { manualScreenshot } from "./manual-capture";
import { test, expect } from '@playwright/test';

test('three-click measurements persist, edit, undo and cancel', { tag: "@manual" }, async ({page}, info) => {
  await page.goto('/');
  const tool = page.getByRole('button',{name:'Measurements (D)',exact:true});
  await expect(tool).toBeEnabled();
  const textBox = await page.getByRole('button',{name:'Text (T)',exact:true}).boundingBox();
  expect((await tool.boundingBox())!.y).toBeGreaterThan(textBox!.y);
  const canvas = page.getByLabel('Pattern drawing canvas');
  await canvas.focus();
  await canvas.press('d');
  await expect(tool).toHaveAttribute('aria-pressed', 'true');
  await canvas.click({position:{x:220,y:220}});
  await canvas.click({position:{x:520,y:220}});
  await canvas.press('ArrowUp');
  await expect(page.locator('.objects .object-select')).toHaveCount(0);
  await canvas.press('Tab');
  const constructionOffset = page.getByRole('textbox',{name:'Offset',exact:true});
  await expect(constructionOffset).toBeFocused();
  await constructionOffset.pressSequentially('-15');
  await constructionOffset.press('Tab');
  await expect(constructionOffset).toBeFocused();
  await constructionOffset.pressSequentially('12');
  await expect(constructionOffset).toHaveValue('12');
  await constructionOffset.press('Shift+Tab');
  await constructionOffset.pressSequentially('-15');
  await expect(constructionOffset).toBeFocused();
  await expect(constructionOffset).toHaveValue('-15');
  await constructionOffset.press('Escape');
  await expect(canvas).toBeFocused();
  await canvas.click({position:{x:400,y:330}});
  await expect(page.locator('.objects .object-select')).toHaveCount(1);
  await page.getByRole('button',{name:'Select (V)',exact:true}).click();
  const offset = page.getByLabel('Offset (mm)',{exact:true});
  await expect(page.getByLabel('Sections',{exact:true})).toHaveValue('2');
  await expect(offset).toHaveValue('-15');
  await offset.fill('20');
  await offset.press('Enter');
  await expect(offset).toHaveValue('20');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(offset).toHaveValue('-15');
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await expect(offset).toHaveValue('20');
  await manualScreenshot(page, "persistent-measurement.png");
  await page.waitForTimeout(600); // Recovery is debounced by 300 ms.
  await page.reload();
  await page.getByRole('button', {name:'Restore',exact:true}).click();
  await expect(page.locator('.objects .object-select')).toHaveCount(1);
  await page.locator('.objects .object-select').first().click();
  await expect(offset).toHaveValue('20');
  await expect(page.getByLabel('Sections',{exact:true})).toHaveValue('2');
  await tool.click();
  await canvas.click({position:{x:300,y:400}});
  await canvas.press('Escape');
  await expect(page.locator('.objects .object-select')).toHaveCount(1);
});


test('measurement project files reopen with transformed distance and editable offset', async ({page}, info) => {
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Measurements (D)',exact:true})).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
    delete (window as any).showOpenFilePicker;
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Open',exact:true}).click();
  await (await chooser).setFiles({
    name:'measurement.leather.json', mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({version:14,shapes:[{
      id:'m',name:'Diagonal dimension',kind:'measurement',
      points:[{x:10,y:10},{x:50,y:10}],measurementOffset:12,
      radius:0,rotation:0,transform:{a:0,b:2,c:3,d:0,e:20,f:20},
    }]})),
  });
  await page.locator('.objects .object-select').first().click();
  await expect(page.getByLabel('Distance (mm)',{exact:true})).toHaveText('80.00');
  const offset = page.getByLabel('Offset (mm)',{exact:true});
  await expect(offset).toHaveValue('-36');
  await offset.fill('15');
  await offset.press('Enter');
  await expect(offset).toHaveValue('15');
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  const path = info.outputPath('measurement.leather.json');
  await (await download).saveAs(path);
  const reopen = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Open',exact:true}).click();
  await (await reopen).setFiles(path);
  await page.locator('.objects .object-select').first().click();
  await expect(offset).toHaveValue('15');
  await expect(page.getByLabel('Distance (mm)',{exact:true})).toHaveText('80.00');
});

test('short measurement labels remain selectable above outside arrowheads', async ({page}, info) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Measurements (D)',exact:true}).click();
  const canvas = page.getByLabel('Pattern drawing canvas');
  await canvas.click({position:{x:220,y:220}});
  await canvas.click({position:{x:235,y:220}});
  await canvas.click({position:{x:227,y:330}});
  await expect(page.locator('.objects .object-select')).toHaveCount(1);
  await page.getByRole('button',{name:'Select (V)',exact:true}).click();
  await canvas.click({position:{x:600,y:450}});
  await expect(page.getByLabel('Distance (mm)',{exact:true})).toHaveCount(0);
  await canvas.click({position:{x:227,y:318}});
  await expect(page.getByLabel('Distance (mm)',{exact:true})).toHaveText('5.00');
  await page.screenshot({path:info.outputPath('short-measurement-arrowheads.png')});
});


test('measurement drag releases into offset placement', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Measurements (D)',exact:true}).click();
  const canvas = page.getByLabel('Pattern drawing canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x+220,box.y+220);
  await page.mouse.down();
  await page.mouse.move(box.x+520,box.y+220,{steps:8});
  await page.mouse.up();
  await expect(page.locator('.objects .object-select')).toHaveCount(0);
  await canvas.press('Tab');
  const offset = page.getByRole('textbox',{name:'Offset',exact:true});
  await expect(offset).toBeFocused();
  await offset.fill('12');
  await offset.press('Enter');
  await expect(page.locator('.objects .object-select')).toHaveCount(1);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.locator('.objects .object-select')).toHaveCount(0);
});
