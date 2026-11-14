import { manualScreenshot } from "./manual-capture";
import { test, expect } from "@playwright/test";
test("tool search filters aliases and persists favorites", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("button", {
    name: "Search tools",
    exact: true,
  });
  await expect(search).toBeVisible();
  await search.focus();
  await page.keyboard.press("f");
  const input = page.getByRole("textbox", {
    name: "Search tools",
    exact: true,
  });
  await expect(input).toBeFocused();
  await expect(page.locator(".search-row")).toHaveCount(12);
  await input.fill("snip");
  await expect(page.locator(".search-row")).toHaveCount(1);
  await expect(page.locator(".search-row")).toContainText("Trim");
  await input.fill("offset");
  await page
    .getByRole("button", { name: "Options for Offset", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Add to favorites" }).click();
  await input.press("Escape");
  await expect(
    page
      .locator(".favorite-bar")
      .getByRole("button", { name: "Offset", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator(".favorite-bar")
      .getByRole("button", { name: "Offset", exact: true }),
  ).toBeVisible();
  await page.locator('[data-favorite="offset"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from favorites" }).click();
  await expect(page.locator('[data-favorite="offset"]')).toHaveCount(0);
});
test("compact search shares add and remove actions with row context menus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search tools", exact: true }).click();
  const list = page.locator(".search-results");
  expect(await list.evaluate((el) => el.clientHeight)).toBeLessThanOrEqual(220);
  expect(
    await list.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBeTruthy();
  await page.locator(".search-row").first().click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Remove from favorites", exact: true })
    .click();
  await expect(page.locator('[data-favorite="move"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Options for Move", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Add to favorites", exact: true })
    .click();
  await expect(page.locator('[data-favorite="move"]')).toHaveCount(1);
});


test("tool search and favorites menu reference", { tag: "@manual" }, async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name:"Search tools",exact:true}).click();
  await page.getByRole("button", {name:"Options for Move",exact:true}).click();
  await manualScreenshot(page, "tool-search.png");
});
test("favorites reorder persists and canceled drag keeps order", async ({page}) => {
  await page.goto("/");
  const first = page.locator('[data-favorite="move"]');
  const last = page.locator('[data-favorite="trim"]');
  await expect(first).toBeVisible();
  const a = (await first.boundingBox())!, b = (await last.boundingBox())!;
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
  await page.mouse.down();
  await page.mouse.move(b.x+b.width-2,b.y+b.height/2,{steps:12});
  await page.mouse.up();
  await expect(page.locator("[data-favorite]").last()).toHaveAttribute("data-favorite","move");
  await page.reload();
  await expect(page.locator("[data-favorite]").last()).toHaveAttribute("data-favorite","move");
  const before=await page.locator("[data-favorite]").evaluateAll(els=>els.map(el=>el.getAttribute("data-favorite")));
  const source=(await page.locator("[data-favorite]").first().boundingBox())!;
  await page.mouse.move(source.x+20,source.y+20);
  await page.mouse.down();
  await page.mouse.move(source.x+100,source.y+20,{steps:8});
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await page.locator("[data-favorite]").evaluateAll(els=>els.map(el=>el.getAttribute("data-favorite")))).toEqual(before);
});
