import { test, expect } from "@playwright/test";

test("linked stitching loads and displays controls", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("button", {name: "Open", exact: true})).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
    delete (window as any).showSaveFilePicker;
  });
  const shapes = ["a", "b"].map((id, i) => ({
    id, name: id, kind: "line", points: [{x: 20, y: 20 + i * 30}, {x: 100, y: 20 + i * 30}],
    radius: 0, rotation: 0,
  }));
  const doc = {version: 11, shapes, stitchGroups: shapes.map(s => ({
    id: s.id, shapeId: s.id, edges: ["line:2:edge:0"], side: 1, closed: false,
    settings: {style: "round", spacing: 4, inset: 0, alignment: "center"},
  })), stitchLinks: [{id: 1, members: ["a", "b"]}]};
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", {name: "Open", exact: true}).click();
  await (await chooser).setFiles({name: "links.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(doc))});
  await page.locator(".objects .object-select").first().click();
  await page.getByRole("button", {name: "Stitch line", exact: true}).click();
  await expect(page.getByRole("button", {name: "Link", exact: true})).toBeVisible();
  await expect(page.getByRole("button", {name: "Unlink", exact: true})).toBeVisible();
  await page.getByLabel("Pattern drawing canvas").click({position: {x: 260, y: 160}});
  await expect(page.locator(".stitch-options")).toContainText("21 holes");
  await expect(page.getByRole("button", {name: "Unlink", exact: true})).toBeEnabled();
  await page.screenshot({path: info.outputPath("stitch-links.png")});
  await page.getByRole("button", {name: "Unlink", exact: true}).click();
  await expect(page.getByRole("button", {name: "Unlink", exact: true})).toBeDisabled();
});
