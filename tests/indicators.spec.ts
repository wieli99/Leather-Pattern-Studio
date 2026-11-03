import { manualScreenshot } from "./manual-capture";
import { DOCUMENT_VERSION } from "../src/model/project";
import { test, expect } from "@playwright/test";

test("indicator variants, gestures, edits, undo and saved roundtrip", { tag: "@manual" },async({page})=>{
  await page.goto("/");
  const button=page.getByRole("button",{name:"Measurement (D)",exact:true});
  await expect(button).toBeEnabled();
  const canvas=page.getByLabel("Pattern drawing canvas");
  for (const [index,name] of ["Arrow","Bodyless arrow","Crosshair","Square size guide","Ruler size guide"].entries()) {
    await button.click({button:"right"});
    await page.getByRole("menuitemradio",{name,exact:true}).click();
    if (index%2) {
      const box=(await canvas.boundingBox())!;
      await page.mouse.move(box.x+180,box.y+200+index*40);
      await page.mouse.down(); await page.mouse.move(box.x+360,box.y+220+index*40,{steps:8}); await page.mouse.up();
    } else {
      await canvas.click({position:{x:180,y:200+index*40}});
      await canvas.click({position:{x:360,y:220+index*40}});
    }
    await page.getByRole("button",{name:"Select (V)",exact:true}).click();
    const field=page.getByLabel(index===1?"Head size (mm)":index===2?"Overall size (mm)":index===3?"Side length (mm)":"Length (mm)",{exact:true});
    await expect(field).toBeVisible();
    await field.fill(index===3?"50":"100"); await field.press("Enter");
    await expect(field).toHaveValue(index===3?"50":"100");
  }
  await page.evaluate(()=>{delete (window as any).showSaveFilePicker;});
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Save",exact:true}).click();
  const download=await downloadPromise;
  const path=(await download.path())!;
  const {readFile}=await import("node:fs/promises");
  const doc=JSON.parse(await readFile(path,"utf8"));
  expect(doc.version).toBe(DOCUMENT_VERSION);
  expect(doc.shapes.map((s:any)=>s.kind)).toEqual(["arrow","arrow-head","crosshair","size-square","size-ruler"]);
  await page.getByRole("button",{name:"Undo",exact:true}).click();
  await page.getByRole("button",{name:"Redo",exact:true}).click();
  await page.evaluate(()=>{delete (window as any).showOpenFilePicker;});
  const chooser=page.waitForEvent("filechooser");
  await page.getByRole("button",{name:"Open",exact:true}).click();
  await (await chooser).setFiles({name:"Indicators.leather.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(doc))});
  await expect(page.locator(".objects .object-select")).toHaveCount(5);
  await button.click({button:"right"});
  await manualScreenshot(page, "indicators.png");
});
