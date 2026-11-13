import { readFileSync, readdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
test("manual navigation, search, links and offline articles", async ({
  page,
  context,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Help", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Help", exact: true }).click();
  const manual = await popup;
  await expect(
    manual.getByRole("heading", { name: "User manual", exact: true }),
  ).toBeVisible();
  await manual.getByRole("searchbox").fill("pivot");
  await expect(
    manual.getByRole("region", { name: "Search results" }),
  ).toContainText("Move, rotate and resize");
  await manual.getByRole("searchbox").fill("nothingmatches123");
  await expect(manual.getByText("No matching articles.")).toBeVisible();
  await manual.goto("/manual/index.html#drawing");
  await expect(
    manual.getByRole("heading", { name: "Drawing tools", exact: true }),
  ).toBeVisible();
  await manual.screenshot({ path: info.outputPath("manual-desktop.png") });
  await manual.setViewportSize({ width: 390, height: 844 });
  await manual.screenshot({ path: info.outputPath("manual-narrow.png") });
  await context.setOffline(true);
  await manual.goto("/manual/index.html#files");
  await expect(
    manual.getByRole("heading", {
      name: "Files, recovery and offline use",
      exact: true,
    }),
  ).toBeVisible();
  const images = new Set(
    readdirSync("docs/manual").filter(file => file.endsWith(".md")).flatMap(file => {
      const content = readFileSync(`docs/manual/${file}`, "utf8");
      return [...content.matchAll(/!\[[^\]]*\]\(\/manual\/images\/([^)]*)\)/g)]
        .map(match => match[1]);
    }),
  );
  for (const name of images) {
    expect(
      await manual.evaluate(
        async (name) => (await fetch(`/manual/images/${name}`)).ok,
        name,
      ),
    ).toBe(true);
  }
  await manual.goto("/manual/index.html#unknown");
  await expect(
    manual.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await context.setOffline(false);
});

test("canvas help preserves unfinished drawing", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  const canvas = page.getByLabel("Pattern drawing canvas");
  await canvas.focus();
  await page.keyboard.press("r");
  await canvas.click({ position: { x: 150, y: 180 } });
  const popup = page.waitForEvent("popup");
  await page.keyboard.press("?");
  const manual = await popup;
  await expect(manual).toHaveURL(/manual\/index.html/);
  await manual.close();
  await expect(page.locator(".inspector-hint")).toContainText(
    "Click the opposite corner.",
  );
  await canvas.click({ position: { x: 350, y: 300 } });
  await expect(page.locator(".objects .object-select")).toHaveCount(1);
});

test("first-pattern manual walkthrough produces a saved stitched pattern and printable PDF", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Rectangle (R)", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
    delete (window as any).showOpenFilePicker;
  });
  const canvas = page.getByLabel("Pattern drawing canvas");
  await page.getByRole("button", { name: "Rectangle (R)", exact: true }).click();
  await canvas.click({ position: { x: 150, y: 180 } });
  await canvas.hover({ position: { x: 350, y: 300 } });
  await page.keyboard.press("Tab");
  await page.getByLabel("Width", { exact: true }).fill("60");
  await page.getByLabel("Width", { exact: true }).press("Tab");
  await page.getByLabel("Height", { exact: true }).fill("40");
  await page.getByLabel("Height", { exact: true }).press("Enter");
  await page.keyboard.press("Escape");
  await page.locator(".objects .object-select").first().click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("60");
  await expect(page.getByLabel("Height", { exact: true })).toHaveValue("40");
  await page.getByRole("button", { name: "Corner radius", exact: true }).click();
  await canvas.click({ position: { x: 160, y: 190 } });
  await page.getByLabel("All corners (mm)", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Stitch line", exact: true }).click();
  await canvas.click({ position: { x: 210, y: 180 } });
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const path = info.outputPath("first-pattern.leather.json");
  await (await saved).saveAs(path);
  const project = JSON.parse(readFileSync(path, "utf8"));
  expect(project.shapes).toHaveLength(1);
  expect(project.stitchGroups).toHaveLength(1);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles(path);
  await page.getByRole("button", { name: "Create print layout", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "Import Rectangle 1", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Print objects", exact: true }).locator(".print-object-name")).toHaveCount(1);
  await page.getByRole("button", { name: "Measurements (D)", exact: true }).click({ button: "right" });
  await page.getByRole("menuitemradio", { name: "Square size guide", exact: true }).click();
  const printCanvas = page.getByLabel("Print layout canvas");
  await printCanvas.click({ position: { x: 350, y: 330 } });
  await printCanvas.click({ position: { x: 390, y: 370 } });
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await page.getByLabel("Side length (mm)", { exact: true }).fill("20");
  await page.getByLabel("Side length (mm)", { exact: true }).press("Enter");
  await expect(page.getByRole("region", { name: "Print objects", exact: true }).locator(".print-object-name")).toHaveCount(2);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("canvas")).toBeVisible();
  const exported = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  expect((await exported).suggestedFilename()).toMatch(/\.pdf$/);
});

test("old Merge bookmarks resolve to the renamed Join manual section",async({page})=>{
  await page.goto("/manual/index.html#transforms/merge");
  const heading=page.getByRole("heading",{name:"Join",exact:true});
  await expect(heading).toBeVisible();
  await expect(heading).toBeInViewport();
  await page.getByRole("navigation",{name:"On this page"}).getByRole("link",{name:"Join",exact:true}).click();
  await expect(page).toHaveURL(/#transforms\/join$/);
});
