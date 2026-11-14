import { manualScreenshot } from "./manual-capture";
import { test, expect, type Page } from "@playwright/test";
// These scenarios exercise tools pinned by the user; default-bar behavior has dedicated tests.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tool-favorites-v1", JSON.stringify(["move", "rotate", "scale", "mirror", "corner", "trim", "join", "subtract", "intersect", "exclude"])));
});
async function load(page: Page, shapes: unknown[]) {
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "merge.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 11, shapes })),
  });
  await expect(page.locator(".objects .object-select")).toHaveCount(shapes.length);
  await page.locator(".objects .object-select").first().click();
  await expect(
    page.getByRole("button", { name: "Join", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Join", exact: true }),
  ).toBeEnabled();
  await page
    .locator(".objects .object-select")
    .nth(1)
    .click({ modifiers: ["Shift"] });
}
const rectangle = (id: string, x: number) => ({
  id,
  name: id,
  kind: "rectangle",
  points: [
    { x, y: 20 },
    { x: x + 50, y: 70 },
  ],
  radius: 0,
  rotation: 0,
});
test("Join alone highlights, cancels, applies and undoes an outline union", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await load(page, [rectangle("First", 20), rectangle("Second", 45)]);
  const merge = page.getByRole("button", { name: "Join", exact: true });
  await expect(merge).toBeEnabled();
  await merge.click();
  await expect(merge).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Trim", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("region", { name: "Join settings" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  await merge.click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
});
test("connected curves merge, cancel and round trip their handles", { tag: "@manual" }, async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  const curve = (id: string, x: number) => ({
    ...rectangle(id, x),
    kind: "control-curve",
    points: [
      { x, y: 40 },
      { x: x + 40, y: 40 },
    ],
    handles: [
      { incoming: { x: 0, y: 0 }, outgoing: { x: 12, y: -20 } },
      { incoming: { x: -12, y: 20 }, outgoing: { x: 0, y: 0 } },
    ],
  });
  await load(page, [curve("First curve", 20), curve("Second curve", 60)]);
  const merge = page.getByRole("button", { name: "Join", exact: true });
  await expect(merge).toBeEnabled();
  await merge.click();
  await manualScreenshot(page, "merge.png");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  await merge.click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
  });
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadEvent;
  const path = (await download.path())!;
  const { readFile } = await import("node:fs/promises");
  const saved = JSON.parse(await readFile(path, "utf8"));
  expect(saved.shapes[0].kind).toBe("control-curve");
  expect(saved.shapes[0].handles).toHaveLength(3);
  expect(saved.shapes[0].handles[1]).toEqual({
    incoming: { x: -12, y: 20 },
    outgoing: { x: 12, y: -20 },
  });
  await load(page, [...saved.shapes, curve("Disconnected", 160)]);
  await expect(merge).toBeEnabled();
  await merge.click();
  await expect(page.getByRole("alert")).toContainText("connected chain");
  await expect(page.getByRole("button",{name:"Apply",exact:true})).toBeDisabled();
});

test("canvas shortcuts open stitching, trim and merge previews", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await load(page, [rectangle("First", 20), rectangle("Second", 45)]);
  const canvas = page.getByLabel("Pattern drawing canvas");
  for (const [key, name] of [
    ["i", "Stitch line"],
    ["k", "Trim"],
    ["j", "Join"],
  ]) {
    await canvas.focus();
    await page.keyboard.press(key);
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("Escape");
    if (key === "i") {
      await expect(page.getByLabel("Stitch line settings")).toBeHidden();
      await page.keyboard.press("Escape");
    }
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator(".objects .object-select")).toHaveCount(2);
  }
});

test("Subtract picks a cutter from the objects panel, previews a hole, and round trips", {tag:"@manual"}, async ({page}) => {
 await page.goto("/");
 await expect(page.getByRole("button",{name:"Open",exact:true})).toBeEnabled();
 await load(page,[rectangle("Base",20),{...rectangle("Cutter",35),points:[{x:35,y:35},{x:55,y:55}]}]);
 await page.locator(".objects .object-select").filter({hasText:"Base"}).click();
 await page.getByRole("button",{name:"Subtract",exact:true}).click();
 await expect(page.getByRole("button",{name:"Select subtract objects (0)",exact:true})).toBeVisible();
 await page.locator(".objects .object-select").filter({hasText:"Cutter"}).click();
 await expect(page.locator(".objects .object-select.boolean-operand")).toHaveCount(1);
 await manualScreenshot(page,"boolean-subtract.png");
 await page.getByRole("button",{name:"Apply",exact:true}).click();
 await expect(page.locator(".objects .object-select")).toHaveCount(1);
 await page.evaluate(()=>{ delete (window as any).showSaveFilePicker; });
 const event=page.waitForEvent("download");
 await page.getByRole("button",{name:"Save",exact:true}).click();
 const path=(await (await event).path())!;
 const {readFile}=await import("node:fs/promises");
 const saved=JSON.parse(await readFile(path,"utf8"));
 expect(saved.shapes[0].kind).toBe("compound");
 expect(saved.shapes[0].contours).toHaveLength(2);
 await page.getByRole("button",{name:"Undo",exact:true}).click();
 await expect(page.locator(".objects .object-select")).toHaveCount(2);
 await page.getByRole("button",{name:"Redo",exact:true}).click();
 await expect(page.locator(".objects .object-select")).toHaveCount(1);
});

for (const operation of ['Intersect','Exclude'] as const) test(`${operation} previews and saves compound results`,async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Open',exact:true})).toBeEnabled();
 await load(page,[rectangle('First',20),rectangle('Second',45)]);
 await page.getByRole('button',{name:operation,exact:true}).click();
 await expect(page.getByRole('region',{name:`${operation} settings`})).toBeVisible();
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await expect(page.locator('.objects .object-select')).toHaveCount(1);
 await page.evaluate(()=>{delete (window as any).showSaveFilePicker;});
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'Save',exact:true}).click();
 const {readFile}=await import('node:fs/promises');const saved=JSON.parse(await readFile((await (await event).path())!,'utf8'));
 expect(saved.shapes[0].kind).toBe('compound');expect(saved.shapes[0].contours).toHaveLength(operation==='Intersect'?1:2);
});

test("Join starts with one object; native button keys toggle pickers and remove operands", async ({page}) => {
  await page.goto("/");
  await expect(page.getByRole("button",{name:"Open",exact:true})).toBeEnabled();
  await load(page,[rectangle("Base",20),rectangle("Second",45)]);
  await page.locator(".objects .object-select").filter({hasText:"Base"}).click();
  const canvas=page.getByLabel("Pattern drawing canvas");
  await canvas.focus();await canvas.press("j");
  const panel=page.getByRole("region",{name:"Join settings"});
  const other=panel.getByRole("button",{name:"Select other objects (0)",exact:true});
  await expect(other).toHaveAttribute("aria-pressed","true");
  await expect(panel.getByRole("button",{name:"Apply",exact:true})).toBeDisabled();
  await other.focus();await other.press("Enter");
  await expect(other).toHaveAttribute("aria-pressed","false");
  await other.press("Space");
  await expect(other).toHaveAttribute("aria-pressed","true");
  await page.locator(".objects .object-select").filter({hasText:"Second"}).click();
  await expect(panel.locator(".boolean-operand")).toHaveCount(0);
  const second=page.locator(".objects .object-select").filter({hasText:"Second"});
  await second.focus(); await page.keyboard.press("Enter");
  await expect(panel.getByRole("button",{name:"Select other objects (0)",exact:true})).toBeVisible();
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  await expect(panel.getByRole("button",{name:"Apply",exact:true})).toBeDisabled();
  await page.locator(".objects .object-select").filter({hasText:"Second"}).click();
  const target=panel.getByRole("button",{name:"Select Target (1)",exact:true});
  await target.focus();await target.press("Enter");
  await expect(target).toHaveAttribute("aria-pressed","true");
  await expect(panel.getByRole("button",{name:"Apply",exact:true})).toBeEnabled();
  await expect(panel.locator(".boolean-instruction")).toHaveCount(0);
  await target.press("Enter");
  await expect(target).toHaveAttribute("aria-pressed","false");
  await expect(panel.getByRole("button",{name:"Apply",exact:true})).toBeEnabled();
  await target.press("Space");
  await page.locator(".objects .object-select").filter({hasText:"Second"}).click();
  await expect(panel.getByRole("button",{name:"Select Target (1)",exact:true})).toBeVisible();
  await expect(panel.getByRole("button",{name:"Select other objects (1)",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(panel.locator(".boolean-operand")).toHaveCount(0);
  await panel.getByRole("button",{name:"Apply",exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await expect(canvas).toBeFocused();
  await expect(page.locator(".objects .object-select")).toContainText("Second");
});

test("Join accepts additional open curves and Cancel returns keyboard focus to the canvas",async({page})=>{
  await page.goto("/");await expect(page.getByRole("button",{name:"Open",exact:true})).toBeEnabled();
  const curve=(id:string,x:number)=>({...rectangle(id,x),kind:"control-curve",points:[{x,y:40},{x:x+40,y:40}],handles:[{incoming:{x:0,y:0},outgoing:{x:12,y:-20}},{incoming:{x:-12,y:20},outgoing:{x:0,y:0}}]});
  await load(page,[curve("First",20),curve("Second",60)]);
  await page.locator(".objects .object-select").filter({hasText:"First"}).click();
  await page.getByRole("button",{name:"Join",exact:true}).click();
  await page.locator(".objects .object-select").filter({hasText:"Second"}).click();
  const panel=page.getByRole("region",{name:"Join settings"});
  await expect(panel.getByRole("button",{name:"Apply",exact:true})).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.getByLabel("Pattern drawing canvas")).toBeFocused();
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
});

test("count-only Boolean pickers support panel removal and differ in both themes",async({page},info)=>{
  await page.goto("/");await expect(page.getByRole("button",{name:"Open",exact:true})).toBeEnabled();
  const longName="A very long pattern object name that should truncate rather than overflow the panel";
  await load(page,[rectangle("Base",20),rectangle("Second",45),rectangle(longName,65)]);
  await page.locator(".objects .object-select").filter({hasText:"Base"}).click();
  await page.getByRole("button",{name:"Join",exact:true}).click();
  await page.locator(".objects .object-select").filter({hasText:"Second"}).click();
  await page.locator(".objects .object-select").filter({hasText:longName}).click();
  const panel=page.getByRole("region",{name:"Join settings"});
  const target=panel.getByRole("button",{name:"Select Target (1)",exact:true});
  await expect(panel.locator(".boolean-operand")).toHaveCount(0);
  const inactive=await target.evaluate(el=>getComputedStyle(el).backgroundColor);
  await target.click();
  await expect.poll(()=>target.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(inactive);
  await target.click();
  await panel.getByRole("button",{name:"Select other objects (2)",exact:true}).click();
  const second=page.locator(".objects .object-select").filter({hasText:"Second"});
  await second.focus();await page.keyboard.press("Enter");
  const longRow=page.locator(".objects .object-select").filter({hasText:longName});
  await longRow.focus();await page.keyboard.press("Space");
  await expect(panel.getByRole("button",{name:"Select other objects (0)",exact:true})).toBeVisible();
  await panel.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(page.getByLabel("Pattern drawing canvas")).toBeFocused();
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByLabel("Theme",{exact:true}).selectOption("light");
  await page.getByText("Settings",{exact:true}).click();
  await page.getByRole("button",{name:"Join",exact:true}).click();
  const lightTarget=page.getByRole("region",{name:"Join settings"}).getByRole("button",{name:"Select Target (1)",exact:true});
  const lightInactive=await lightTarget.evaluate(el=>getComputedStyle(el).backgroundColor);
  await lightTarget.click();
  await expect.poll(()=>lightTarget.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(lightInactive);
  await page.setViewportSize({width:1000,height:800});
  const box=(await panel.boundingBox())!, canvasBox=(await page.getByLabel("Pattern drawing canvas").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(canvasBox.x);
  expect(box.x+box.width).toBeLessThanOrEqual(canvasBox.x+canvasBox.width+1);
  await page.screenshot({path:info.outputPath("boolean-picker-light-narrow.png")});
});

for (const operation of ["Join","Subtract","Intersect","Exclude"]) {
  test(operation+" shows the selection hint only for its multi-object picker",async({page})=>{
    await page.goto("/");
    await expect(page.getByRole("button",{name:"Open",exact:true})).toBeEnabled();
    await load(page,[rectangle("Base",20),rectangle("Second",45)]);
    await page.locator(".objects .object-select").filter({hasText:"Base"}).click();
    await page.getByRole("button",{name:operation,exact:true}).click();
    const panel=page.getByRole("region",{name:operation+" settings",exact:true});
    const hint=panel.getByText("Shift-click on the canvas to add or remove objects.",{exact:true});
    const other=panel.getByRole("button",{name:operation==="Subtract" ? "Select subtract objects (0)" : "Select other objects (0)",exact:true});
    await expect(hint).toBeVisible();
    const second=page.locator(".objects .object-select").filter({hasText:"Second"});
    await second.click({modifiers:["Shift"]});
    await expect(panel.getByRole("button",{name:operation==="Subtract" ? "Select subtract objects (1)" : "Select other objects (1)",exact:true})).toBeVisible();
    await second.click({modifiers:["Shift"]});
    await expect(other).toBeVisible();
    await other.click();
    await expect(hint).toHaveCount(0);
    await panel.getByRole("button",{name:"Select Target (1)",exact:true}).click();
    await expect(hint).toHaveCount(0);
    await page.locator(".objects .object-select").filter({hasText:"Second"}).click({modifiers:["Shift"]});
    await expect(hint).toBeVisible();
    await panel.getByRole("button",{name:operation==="Subtract" ? "Select subtract objects (1)" : "Select other objects (1)",exact:true}).click();
    await expect(hint).toHaveCount(0);
  });
}
