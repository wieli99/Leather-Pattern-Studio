import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { manualScreenshot } from "./manual-capture";
const master={id:"master",name:"Pocket",kind:"rectangle",points:[{x:15,y:20},{x:115,y:60}],radius:0,rotation:0};
const receiver={id:"receiver",name:"Backing",kind:"rectangle",points:[{x:145,y:20},{x:255,y:60}],radius:0,rotation:0};
const group={id:"run",shapeId:"master",edges:["rectangle:2:edge:1"],side:1,closed:false,settings:{style:"round",roundDiameter:.8,spacing:3.38,inset:3,alignment:"start",startClearance:0,endClearance:0,holeCount:2}};
async function open(page: Page) {
 await page.goto("/"); await expect(page.getByRole("button",{name:"Open",exact:true})).toBeEnabled();
 await page.evaluate(()=>{delete (window as any).showOpenFilePicker;delete (window as any).showSaveFilePicker;});
 const chooser=page.waitForEvent("filechooser"); await page.getByRole("button",{name:"Open",exact:true}).click();
 await (await chooser).setFiles({name:"layers.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({version:20,shapes:[master,receiver],stitchGroups:[group]}))});
 await expect(page.locator(".objects .object-select")).toHaveCount(2);
 await page.getByRole("button",{name:"Stitch line",exact:true}).click();
 await expect(page.getByLabel("Stitch line settings")).toBeVisible();
 await page.getByLabel("Pattern drawing canvas").click({position:{x:140,y:169}});
}
async function saved(page: Page) {
 const download=page.waitForEvent("download"); await page.getByRole("button",{name:"Save",exact:true}).click();
 return JSON.parse(await readFile((await (await download).path())!,"utf8"));
}

test("counted runs preserve chisel spacing, continue with a custom gap, and undo together",async({page})=>{
 await open(page);
 await page.getByLabel("Pattern drawing canvas").click({position:{x:159.14,y:169},modifiers:["Shift"]});
 await page.getByLabel("Gap to next hole",{exact:true}).fill("5");
 await page.getByLabel("Stitch hole count",{exact:true}).fill("100000");
 await expect(page.getByRole("button",{name:"Apply",exact:true})).toBeDisabled();
 await page.getByLabel("Stitch hole count",{exact:true}).fill("2");
 await page.getByRole("button",{name:"Apply",exact:true}).click();
 const doc=await saved(page);
 expect(doc.stitchGroups).toHaveLength(2);
 expect(doc.stitchGroups[1].continuation).toEqual({previousId:"run",gap:5});
 expect(doc.stitchGroups[1].settings.spacing).toBe(3.38);
 expect(doc.stitchGroups[1].settings.holeCount).toBe(2);
 await page.getByLabel("Pattern drawing canvas").press("Control+z");
 expect((await saved(page)).stitchGroups).toHaveLength(1);
});

test("hovered master transfers selected stitching and detached paths remain editable",{tag:"@manual"},async({page})=>{
 await open(page);
 await page.getByRole("button",{name:"Transfer stitching",exact:true}).click();
 const canvas=page.getByLabel("Pattern drawing canvas");
 const box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+680,box.y+220);
 await expect(page.getByText("Place transferred stitching",{exact:true})).toBeVisible();
 await manualScreenshot(page,"stitch-transfer.png");
 await canvas.click({position:{x:680,y:220}});
 await expect(page.getByText("Review transferred stitching",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Apply",exact:true}).click();
 await expect(page.getByText("Place transferred stitching",{exact:true})).toBeHidden();
 let doc=await saved(page);
 expect(doc.stitchTransfers).toHaveLength(1);
 expect(doc.stitchTransfers[0].pose).toBeDefined();
 expect(doc.stitchTransfers[0].number).toBe(1);
 await canvas.click({position:{x:140,y:169}});
 await page.getByText("Transfers (1)",{exact:true}).click();
 await expect(page.getByText("Transfer =1 · Backing",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Detach",exact:true}).click();
 await page.getByLabel("Stitch spacing",{exact:true}).fill("4");
 await page.getByRole("button",{name:"Apply",exact:true}).click();
 doc=await saved(page);
 expect(doc.stitchTransfers).toHaveLength(0);
 const guide=doc.shapes.find((s:any)=>s.stitchParentId==="receiver");
 const detached=doc.stitchGroups.find((g:any)=>g.shapeId===guide.id);
 expect(detached.holes).toBeUndefined();expect(detached.settings.spacing).toBe(4);
 await page.getByRole("button",{name:"Stitch line",exact:true}).click();
 await canvas.click({position:{x:539,y:169}});
 await expect(page.getByRole("button",{name:"Edit path",exact:true})).toHaveCount(0);
});

test("Escape cancels hovered transfer without changing the project",async({page})=>{
 await open(page);
 await page.getByRole("button",{name:"Transfer stitching",exact:true}).click();
 const canvas=page.getByLabel("Pattern drawing canvas");
 await canvas.press("Escape");
 await expect(page.getByText("Place transferred stitching",{exact:true})).toBeHidden();
 expect((await saved(page)).stitchTransfers ?? []).toHaveLength(0);
});

test("Ctrl selects holes with a focused settings panel and Alt selects the piece stitching",async({page})=>{
 await open(page);const canvas=page.getByLabel("Pattern drawing canvas");
 await canvas.click({position:{x:134,y:169},modifiers:["Control"]});
 await expect(page.getByLabel("Hole type",{exact:true})).toBeVisible();
 await expect(page.getByLabel("Stitch spacing",{exact:true})).toBeHidden();
 await page.getByLabel("Hole type",{exact:true}).selectOption("flat");
 await canvas.click({position:{x:144.14,y:169},modifiers:["Control","Shift"]});
 await expect(page.getByText("2 holes selected",{exact:true})).toBeVisible();
 await canvas.click({position:{x:200,y:220},modifiers:["Alt"]});
 await expect(page.getByLabel("Hole type",{exact:true})).toBeHidden();
 await expect(page.getByRole("button",{name:"Transfer stitching",exact:true})).toBeEnabled();
});

test("wheel counts clamp to the available stitch length and minimum", async ({ page }) => {
  await open(page);
  const count = page.getByLabel("Stitch hole count", { exact: true });
  await expect(count).toBeVisible();
  const maximum = Number(await count.getAttribute("data-wheel-max"));
  expect(maximum).toBeGreaterThan(2);
  expect(maximum).toBeLessThan(100000);
  await count.fill(String(maximum - 1));
  await count.evaluate(el => el.dispatchEvent(new WheelEvent("wheel", {
    altKey: true, ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true,
  })));
  await expect(count).toHaveValue(String(maximum));
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeEnabled();
  await count.fill("2");
  await count.evaluate(el => el.dispatchEvent(new WheelEvent("wheel", {
    altKey: true, shiftKey: true, deltaY: 100, bubbles: true, cancelable: true,
  })));
  await expect(count).toHaveValue("1");
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeEnabled();
});
