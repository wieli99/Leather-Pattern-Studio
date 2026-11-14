import { manualScreenshot } from "./manual-capture";
import { DOCUMENT_VERSION } from "../src/model/project";
import { test, expect } from "@playwright/test";
// These scenarios exercise tools pinned by the user; default-bar behavior has dedicated tests.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tool-favorites-v1", JSON.stringify(["move", "rotate", "scale", "mirror", "corner", "trim", "offset"])));
});
import { readFile } from "node:fs/promises";
const rectangle = {
  id: "r",
  name: "Rounded",
  kind: "rectangle",
  points: [
    { x: 20, y: 20 },
    { x: 100, y: 70 },
  ],
  radius: 8,
  rotation: 25,
};
const arc = {
  id: "a",
  name: "Arc",
  kind: "arc",
  points: [
    { x: 130, y: 45 },
    { x: 150, y: 45 },
  ],
  radius: 0,
  rotation: 0,
  sweep: 270,
};
async function setup(page: any) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "affine.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 4, shapes: [rectangle, arc] }),
    ),
  });
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
  await page.getByRole("button", { name: "Rounded", exact: true }).click();
}
test("offset creates an inset copy with a live preview", { tag: "@manual" }, async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Offset", exact: true }).click();
  await page.getByLabel("Offset distance").fill("-3");
  await expect(page.getByLabel("Offset settings")).toBeVisible();
  await manualScreenshot(page, "offset.png");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
});
test("dragging an offset outline changes its distance without committing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Rectangle (R)", exact: true })).toBeEnabled();
  await page.evaluate(() => { delete (window as any).showOpenFilePicker; });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles({ name: "offset.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: DOCUMENT_VERSION, shapes: [{
      id: "r", name: "Rectangle", kind: "rectangle", points: [{x:20,y:20},{x:100,y:70}], radius:0, rotation:0,
    }] })) });
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByRole("button", { name: "Offset", exact: true }).click();
  const field = page.getByLabel("Offset distance");
  await field.fill("1");
  await field.hover();
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Alt");
  await expect(field).toHaveValue("-1");
  await field.fill("3");
  const canvas = page.getByLabel("Pattern drawing canvas"), box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 260, box.y + 151);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 139, {steps: 5});
  await page.mouse.up();
  await expect(page.getByLabel("Offset distance")).toHaveValue("7.00");
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
  await page.getByRole("button", {name:"Apply",exact:true}).click();
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
});
test("numeric transforms, pivot, cancellation, history and affine file recovery", { tag: "@manual" }, async ({
  page,
}, info) => {
  await setup(page);
  const toolbar = page.getByRole("toolbar", { name: "Transform selection" });
  await expect(toolbar).toBeVisible();
  const before = await page
    .getByLabel("Position X", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await page.getByLabel("X factor", { exact: true }).fill("(3+1)/2");
  await page.getByLabel("Y factor", { exact: true }).fill("0.5");
  await manualScreenshot(page, "transforms.png");
  await page.locator(".transform-options strong").click();
  await expect(page.getByLabel("Y factor", { exact: true })).toHaveValue(
    "0.50",
  );
  await page
    .getByLabel("Pattern drawing canvas")
    .click({ position: { x: 650, y: 100 } });
  await expect(page.getByLabel("X factor", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Position X", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("160");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("80");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByLabel("X (mm)", { exact: true }).fill("15");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Position X", { exact: true })).toHaveValue(
    before,
  );
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await page.getByLabel("Angle (°)", { exact: true }).fill("35");
  await page.getByRole("group",{name:"Pivot",exact:true}).getByRole("button",{name:"Custom",exact:true}).click();
  await page
    .getByLabel("Pattern drawing canvas")
    .click({ position: { x: 100, y: 100 } });
  await page.getByRole("group",{name:"Pivot",exact:true}).getByRole("button",{name:"Bounding box",exact:true}).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Arc", exact: true }).click();
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await page.getByLabel("X factor", { exact: true }).fill("2");
  await page.getByLabel("Y factor", { exact: true }).fill("0");
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Y factor", { exact: true }).fill("0.75");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.getByLabel("Radius (local)", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
  });
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = (await (await downloading).path())!;
  const document = JSON.parse(await readFile(saved, "utf8"));
  expect(document.version).toBe(DOCUMENT_VERSION);
  expect(document.shapes[0].radius).toBe(8);
  expect(document.shapes.every((s: any) => s.transform)).toBe(true);
  expect(document.shapes[1].kind).toBe("arc");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles(saved);
  // Recovery is asynchronous; allow its debounce before reloading.
  await page.waitForTimeout(450);
  await page.reload();
  const restore = page.getByRole("button", { name: /Restore/ });
  await restore.click();
  await expect(page.locator(".objects .object-select")).toHaveCount(2);
});
test("shortcuts activate tools, selection resets sessions and compact viewport keeps toolbox accessible", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("Pattern drawing canvas").focus();
  await page.keyboard.press("e");
  await expect(page.getByLabel("Angle (°)", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  await expect(page.getByLabel("X (mm)", { exact: true })).toBeVisible();
  await page.keyboard.press("s");
  await expect(page.getByLabel("X factor", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Arc", exact: true }).click();
  await expect(page.getByLabel("X factor", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 800, height: 600 });
  await expect(
    page.getByRole("toolbar", { name: "Transform selection" }),
  ).toBeInViewport();
});

test("creation exposes transforms and move values use two decimals", async ({
  page,
}) => {
  await page.goto("/");
  const rectangle = page.getByRole("button", {
    name: "Rectangle (R)",
    exact: true,
  });
  await expect(rectangle).toBeEnabled();
  await rectangle.click();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.click({ position: { x: 150, y: 180 } });
  await expect(
    page.getByRole("toolbar", { name: "Transform selection" }),
  ).toBeVisible();
  await canvas.click({ position: { x: 450, y: 390 } });
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByLabel("X (mm)", { exact: true })).toHaveValue("0.00");
  await page.getByLabel("X (mm)", { exact: true }).fill("1.23456");
  await page.locator(".transform-options strong").click();
  await expect(page.getByLabel("X (mm)", { exact: true })).toHaveValue("1.23");
  await expect(
    page.getByText("Drag the gizmo or enter X/Y distances to move the selection.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await expect(page.getByLabel("Y factor", { exact: true })).toBeVisible();
  await page.getByLabel("X factor", { exact: true }).fill("2");
  await expect(page.getByLabel("Y factor", { exact: true })).toHaveValue(
    "1.00",
  );
});

test("group shortcuts cover variants in both directions", async ({ page }) => {
  await page.goto("/");
  const canvas = page.getByLabel("Pattern drawing canvas");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  await canvas.focus();
  for (const [key, count] of [
    ["p", 3],
    ["h", 2],
    ["r", 3],
    ["c", 7],
  ] as const) {
    await page.keyboard.press(key);
    for (let i = 0; i < count; i++) {
      const before = await page
        .locator(".tool-group button[aria-pressed=true] .tool-icon")
        .innerHTML();
      await page.keyboard.press(key);
      await expect(
        page.locator(".tool-group button[aria-pressed=true] .tool-icon"),
      ).not.toHaveJSProperty("innerHTML", before);
      await page.keyboard.press(`Shift+${key}`);
      await expect(
        page.locator(".tool-group button[aria-pressed=true] .tool-icon"),
      ).toHaveJSProperty("innerHTML", before);
      await page.keyboard.press(key);
    }
  }
});

test("canvas shortcuts leave controls and browser combinations alone", async ({
  page,
}, info) => {
  await setup(page);
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.focus();
  await page.keyboard.press("r");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Help", exact: true }).focus();
  await page.keyboard.press("c");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const popupPromise = page.waitForEvent("popup");
  await page.keyboard.press("Enter");
  const manual = await popupPromise;
  await expect(manual).toHaveURL(/manual\/index.html/);
  await manual.close();
  await canvas.focus();
  // Synthetic dispatch checks the app's handling without opening browser chrome.
  const prevented = await canvas.evaluate((element) => {
    const event = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
});

test("panning keeps selection tools visible", async ({ page }) => {
  await setup(page);
  const toolbar = page.getByRole("toolbar", { name: "Transform selection" });
  const box = (await page.getByLabel("Pattern drawing canvas").boundingBox())!;
  for (const space of [false, true]) {
    await page.mouse.move(box.x + 300, box.y + 200);
    if (space) await page.keyboard.down("Space");
    await page.mouse.down({ button: space ? "left" : "middle" });
    await page.mouse.move(box.x + 350, box.y + 240);
    await expect(toolbar).toBeVisible();
    await page.mouse.up({ button: space ? "left" : "middle" });
    if (space) await page.keyboard.up("Space");
    await expect(toolbar).toBeVisible();
  }
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await expect(page.getByLabel("X factor", { exact: true })).toBeVisible();
});

test("window blur preserves a pending rotation until Apply", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await page.getByLabel("Angle (°)", { exact: true }).fill("35");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByLabel("Angle (°)", { exact: true })).toHaveValue("35");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
});

test("tools require a selection and Objects controls an explicit reselection phase",async({page})=>{
  await setup(page);
  const canvas=page.getByLabel("Pattern drawing canvas");
  await page.getByRole("button",{name:"Select (V)",exact:true}).click();
  await canvas.click({position:{x:10,y:10}});
  const toolbar=page.getByRole("toolbar",{name:"Transform selection"});
  const move=toolbar.getByRole("button",{name:"Move",exact:true});
  await expect(move).toBeDisabled();
  await page.getByRole("button",{name:"Rounded",exact:true}).click();
  await move.click();
  const picker=page.locator(".tool-object-picker");
  let button=picker.getByRole("button");
  await expect(picker.locator(".boolean-operand")).toHaveCount(0);
  await expect(picker.getByText("Click Objects to change the selection.",{exact:true})).toHaveCount(0);
  await expect(button).toHaveAttribute("aria-pressed","false");
  await expect(button).toHaveAccessibleName(/Select Objects/);
  await expect(picker.getByText("Shift-click on the canvas to add or remove objects.",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Arc",exact:true}).click();
  await expect(button).toHaveText(/(Select Objects|Confirm Selection)\s*\(1\)/);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed","true");
  await expect(button).toHaveAccessibleName(/Confirm Selection/);
  await expect(picker.getByText("Shift-click on the canvas to add or remove objects.",{exact:true})).toBeVisible();
  await canvas.click({position:{x:530,y:235}});
  await canvas.click({position:{x:292,y:167},modifiers:["Shift"]});
  await expect(button).toHaveText(/(Select Objects|Confirm Selection)\s*\(2\)/);
  await canvas.click({position:{x:530,y:235}});
  await expect(button).toHaveText(/(Select Objects|Confirm Selection)\s*\(1\)/);
  await canvas.click({position:{x:530,y:235},modifiers:["Shift"]});
  await expect(button).toBeDisabled();
  await canvas.click({position:{x:530,y:235}});
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-pressed","false");
  await expect(picker.getByText("Shift-click on the canvas to add or remove objects.",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
});

test("shared Model pivot selector supports Median, V, and cancelling placement",async({page})=>{
  await setup(page);
  await page.getByRole("button",{name:"Rotate",exact:true}).click();
  const pivot=page.getByRole("group",{name:"Pivot",exact:true});
  await expect(pivot.getByRole("button",{name:"Bounding box",exact:true})).toHaveAttribute("aria-pressed","true");
  await pivot.getByRole("button",{name:"Median",exact:true}).click();
  const canvas=page.getByLabel("Pattern drawing canvas");
  await canvas.focus();
  await page.keyboard.press("v");
  await expect(pivot.getByRole("button",{name:"Custom",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.keyboard.press("Escape");
  await expect(pivot.getByRole("button",{name:"Median",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.keyboard.press("v");
  await canvas.click({position:{x:300,y:250}});
  await expect(pivot.getByRole("button",{name:"Custom",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByText("Click Custom or press V to reposition the pivot.")).toBeVisible();
  const custom=pivot.getByRole("button",{name:"Custom",exact:true});
  await expect(custom).toHaveAttribute("title","Custom");
  await custom.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Click to place the custom pivot. Escape cancels placement.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(custom).toHaveAttribute("aria-pressed","true");
  await expect(pivot.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await custom.click();
  await expect(page.getByText("Click to place the custom pivot. Escape cancels placement.")).toBeVisible();
  await page.keyboard.press("Escape");
  const bounding=pivot.getByRole("button",{name:"Bounding box",exact:true});
  await bounding.focus();
  await page.keyboard.press("Space");
  await expect(bounding).toHaveAttribute("aria-pressed","true");

  await expect(page.getByRole("button",{name:"Reset pivot",exact:true})).toHaveCount(0);
});
