import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { manualScreenshot } from "./manual-capture";
async function open(page:Page) {
 await page.goto("/");await expect(page.getByRole("button",{name:"Open",exact:true})).toBeEnabled();
 await page.evaluate(()=>{delete (window as any).showOpenFilePicker;delete (window as any).showSaveFilePicker;});
 const shapes=["a","b"].map((id,index)=>({id,name:id,kind:"line",points:[{x:20,y:20+index*30},{x:100,y:20+index*30}],radius:0,rotation:0}));
 const stitchGroups=shapes.map(s=>({id:s.id,shapeId:s.id,edges:["line:2:edge:0"],side:1,closed:false,settings:{style:"round",spacing:4,inset:0,alignment:"center"}}));
 const chooser=page.waitForEvent("filechooser");await page.getByRole("button",{name:"Open",exact:true}).click();
 await (await chooser).setFiles({name:"toolbar.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({version:21,shapes,stitchGroups}))});
 await expect(page.locator(".objects .object-select")).toHaveCount(2);
 await page.getByRole("button",{name:"Stitch line",exact:true}).click();
 const canvas=page.getByLabel("Pattern drawing canvas");
 await canvas.click({position:{x:200,y:160}});await canvas.click({position:{x:200,y:250},modifiers:["Shift"]});
}
async function saved(page:Page) {
 const download=page.waitForEvent("download");await page.getByRole("button",{name:"Save",exact:true}).click();
 return JSON.parse(await readFile((await (await download).path())!,"utf8"));
}
test("stitch toolbar selects focused operations and retains Apply/Cancel in the box",{tag:"@manual"},async({page})=>{
 await open(page);
 const toolbar=page.getByRole("toolbar",{name:"Stitching tools"});
 await expect(toolbar).toBeVisible();await expect(toolbar.getByRole("button")).toHaveCount(8);
 await expect(toolbar.getByRole("button",{name:"Split",exact:true})).toBeDisabled();
 await expect(toolbar.getByRole("button",{name:"Continue run",exact:true})).toBeDisabled();
 await toolbar.getByRole("button",{name:"Link",exact:true}).click();
 const options=page.getByLabel("Stitch line settings");
 await expect(options.getByLabel("Stitch spacing",{exact:true})).toBeHidden();
 await expect(options.getByRole("button",{name:"Apply",exact:true})).toBeEnabled();
 await expect(options.getByRole("button",{name:"Cancel",exact:true})).toBeVisible();
 await expect(toolbar.getByRole("button",{name:"Link",exact:true})).toHaveAttribute("aria-pressed","true");
 await manualScreenshot(page,"stitch-toolbar.png");
 await options.getByRole("button",{name:"Cancel",exact:true}).click();
 await expect(options).toBeHidden();
 await toolbar.getByRole("button",{name:"Link",exact:true}).click();
 await page.getByLabel("Pattern drawing canvas").press("Enter");
 await expect(options).toBeHidden();expect((await saved(page)).stitchLinks).toHaveLength(1);
 await page.getByLabel("Pattern drawing canvas").press("Control+z");
 expect((await saved(page)).stitchLinks).toHaveLength(0);
});
test("switching away from deletion restores the lines and narrow toolbar stays inside the canvas",async({page})=>{
 await open(page);const toolbar=page.getByRole("toolbar",{name:"Stitching tools"});
 await page.getByLabel("Pattern drawing canvas").press("Delete");
 await page.getByLabel("Pattern drawing canvas").press("Control+z");
 await page.getByRole("button",{name:"Stitch line",exact:true}).click();
 await page.getByLabel("Pattern drawing canvas").click({position:{x:200,y:160}});
 await page.getByLabel("Pattern drawing canvas").click({position:{x:200,y:250},modifiers:["Shift"]});
 await toolbar.getByRole("button",{name:"Link",exact:true}).click();
 await page.getByRole("button",{name:"Apply",exact:true}).click();
 const doc=await saved(page);expect(doc.stitchGroups).toHaveLength(2);expect(doc.stitchLinks).toHaveLength(1);
 await page.setViewportSize({width:850,height:700});
 await page.getByRole("button",{name:"Stitch line",exact:true}).click();
 const bar=(await toolbar.boundingBox())!,canvas=(await page.getByLabel("Pattern drawing canvas").boundingBox())!;
 expect(bar.x).toBeGreaterThanOrEqual(canvas.x);expect(bar.x+bar.width).toBeLessThanOrEqual(canvas.x+canvas.width);
});
