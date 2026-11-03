import { manualScreenshot } from "./manual-capture";
import { test, expect, type Page } from "@playwright/test";
const shapes = ["A", "B", "C"].map((name, i) => ({
  id: name.toLowerCase(),
  name,
  kind: "rectangle",
  points: [
    { x: i * 30, y: 0 },
    { x: i * 30 + 40, y: 30 },
  ],
  radius: 0,
  rotation: 0,
}));
async function load(page: Page, document: any = { version: 12, shapes }) {
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
    name: "groups.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.locator(".object-select")).toHaveCount(
    document.shapes.length,
  );
}
async function group(page: Page) {
  await page.getByRole("button", { name: "A", exact: true }).click();
  await page
    .getByRole("button", { name: "B", exact: true })
    .click({ modifiers: ["Shift"] });
  await page.keyboard.press("Control+g");
  await expect(page.locator(".group-select")).toHaveText("Group");
}
async function snapshot(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const req = indexedDB.open("leather-studio", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result,
            read = db
              .transaction("recovery")
              .objectStore("recovery")
              .get("current");
          read.onsuccess = () => {
            resolve(read.result);
            db.close();
          };
        };
      }),
  );
}
async function drag(page: Page, from: string, to: string, fraction = 0.5) {
  const source = page
    .locator(`[data-tree-id="${from}"]`)
    .locator(".object-select,.group-select")
    .first();
  const target = page.locator(`[data-tree-id="${to}"]`);
  const a = (await source.boundingBox())!,
    b = (await target.boundingBox())!;
  await page.mouse.move(a.x + 40, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 40, b.y + b.height * fraction, { steps: 12 });
  await expect(target).toHaveClass(/drop-/);
  await page.mouse.up();
}
test("grouping, nested inheritance, collapse and ungroup round trip", { tag: "@manual" }, async ({
  page,
}) => {
  await load(page);
  await expect(page.locator(".object-select")).toHaveText(["C", "B", "A"]);
  await group(page);
  await page.getByRole("button", { name: "Hide Group", exact: true }).click();
  await expect(page.locator(".object-row.hidden")).toHaveCount(2);
  await page.getByRole("button", { name: "Hide A", exact: true }).click();
  await page.getByRole("button", { name: "Show Group", exact: true }).click();
  await expect(page.locator(".object-row.hidden")).toHaveCount(1);
  await page.getByRole("button", { name: "Show A", exact: true }).click();
  await page.getByRole("button", { name: "Lock Group", exact: true }).click();
  await page.locator(".group-select").click();
  await expect(
    page.getByRole("button", { name: "Move", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Lock A", exact: true }).click();
  await page.getByRole("button", { name: "Unlock Group", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Move", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Unlock A", exact: true }).click();
  await page.locator(".group-select").click();
  await page.keyboard.press("Control+g");
  await expect(page.locator(".group-select")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Collapse Group", exact: true })
    .first()
    .click();
  await expect(page.locator(".object-select")).toHaveCount(1);
  await expect
    .poll(async () => (await snapshot(page))?.collapsedGroupIds?.length)
    .toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator(".object-select")).toHaveCount(1);
  await page.getByRole("button", { name: "Expand Group", exact: true }).click();
  await expect(page.locator(".group-select")).toHaveCount(2);
  await page.locator(".group-select").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Ungroup", exact: true }).click();
  await expect(page.locator(".group-select")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".group-select")).toHaveCount(2);
  await manualScreenshot(page, "object-groups.png");
});
test("drag reorders objects, reparents into collapsed groups, and supports keyboard outdent", async ({
  page,
}) => {
  await load(page);
  await group(page);
  await expect
    .poll(async () =>
      (await snapshot(page))?.document.objectTree?.some(
        (n: any) => n.kind === "group",
      ),
    )
    .toBe(true);
  const groupId = (await snapshot(page)).document.objectTree.find(
    (n: any) => n.kind === "group",
  ).id;
  await page
    .getByRole("button", { name: "Collapse Group", exact: true })
    .click();
  await page.getByRole("button", { name: "C", exact: true }).click();
  await drag(page, "c", groupId);
  await expect(page.locator(".object-select")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Group", exact: true }).click();
  await expect(page.locator(".object-select")).toHaveText(["B", "A", "C"]);
  await page.getByRole("button", { name: "C", exact: true }).focus();
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await expect
    .poll(async () => (await snapshot(page))?.document.objectTree?.at(-1)?.id)
    .toBe("c");
  await page.getByRole("button", { name: "A", exact: true }).click();
  await drag(page, "a", "b", 0.1);
  await expect(page.locator(".object-select")).toHaveText(["A", "B", "C"]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".object-select")).toHaveText(["B", "A", "C"]);
});
test("new empty group, rename, delete and undo", async ({ page }) => {
  await load(page);
  await page.getByRole("button", { name: "New Group", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Rename group", exact: true });
  await expect(name).toBeFocused();
  await expect
    .poll(() =>
      name.evaluate((input: HTMLInputElement) =>
        input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0),
      ),
    )
    .toBe("Group");
  await page.keyboard.type("Wallet");
  await page
    .getByRole("textbox", { name: "Rename group", exact: true })
    .press("Enter");
  await expect(page.locator(".group-select")).toContainText("Wallet");
  await page.locator(".group-select").click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".group-select")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".group-select")).toContainText("Wallet");
});

test("expanded empty groups accept drops and Escape cancels a drag", async ({
  page,
}) => {
  await load(page);
  await page.getByRole("button", { name: "New Group", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Rename group", exact: true })
    .fill("Empty");
  await page
    .getByRole("textbox", { name: "Rename group", exact: true })
    .press("Enter");
  await expect
    .poll(async () => (await snapshot(page))?.document.objectTree?.[0]?.name)
    .toBe("Empty");
  const id = (await snapshot(page)).document.objectTree[0].id;
  const source = (await page
    .getByRole("button", { name: "C", exact: true })
    .boundingBox())!;
  const placeholder = (await page.locator(".tree-empty-drop").boundingBox())!;
  await page.mouse.move(source.x + 30, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    placeholder.x + 30,
    placeholder.y + placeholder.height / 2,
    { steps: 10 },
  );
  await expect(page.locator(`[data-tree-id="${id}"]`)).toHaveClass(
    /drop-inside/,
  );
  await page.mouse.up();
  await expect(page.locator('[data-tree-id="c"]')).toHaveCSS(
    "padding-left",
    "16px",
  );
  const b = (await page
    .getByRole("button", { name: "B", exact: true })
    .boundingBox())!;
  const target = (await page.locator(`[data-tree-id="${id}"]`).boundingBox())!;
  await page.mouse.move(b.x + 30, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 30, target.y + target.height / 2, {
    steps: 10,
  });
  await expect(page.locator(`[data-tree-id="${id}"]`)).toHaveClass(
    /drop-inside/,
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".drop-inside")).toHaveCount(0);
  await expect(page.locator('[data-tree-id="b"]')).toHaveCSS(
    "padding-left",
    "0px",
  );
});

test("icons show local state and sidebar dividers share styling", async ({
  page,
}) => {
  await load(page);
  await group(page);
  const eye = page.getByRole("button", { name: "Hide A", exact: true });
  const lock = page.getByRole("button", { name: "Lock A", exact: true });
  const openLock = await lock.locator("path").getAttribute("d");
  const eyePaths = await eye.locator("path").count();
  await page.getByRole("button", { name: "Hide Group", exact: true }).click();
  await expect(eye.locator("path")).toHaveCount(eyePaths);
  await page.getByRole("button", { name: "Lock Group", exact: true }).click();
  await expect(lock.locator("path")).toHaveAttribute("d", openLock!);
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await lock.click();
  await expect(
    page.getByRole("button", { name: "Unlock A", exact: true }).locator("path"),
  ).not.toHaveAttribute("d", openLock!);
  await expect(
    page.getByRole("button", { name: "New Group", exact: true }).locator("svg"),
  ).toBeVisible();
  await expect(
    page.getByText("Drop here to move to the top level", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "A", exact: true }).click();
  const dividers = await page
    .locator("aside .property-section")
    .evaluateAll((elements) =>
      elements.map((el) => {
        const s = getComputedStyle(el);
        return `${s.borderTopWidth}|${s.borderTopStyle}|${s.borderTopColor}`;
      }),
    );
  expect(dividers.length).toBeGreaterThanOrEqual(3);
  expect(new Set(dividers).size).toBe(1);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  const lightDividers = await page
    .locator("aside .property-section")
    .evaluateAll((elements) =>
      elements.map((el) => {
        const s = getComputedStyle(el);
        return `${s.borderTopWidth}|${s.borderTopStyle}|${s.borderTopColor}`;
      }),
    );
  expect(new Set(lightDividers).size).toBe(1);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  const source = (await page
    .getByRole("button", { name: "A", exact: true })
    .boundingBox())!;
  await page.mouse.move(source.x + 30, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 40, source.y + source.height / 2, {
    steps: 3,
  });
  const root = page.getByRole("group", {
    name: "Move to top level",
    exact: true,
  });
  await expect(root).toBeVisible();
  const drop = (await root.boundingBox())!;
  await page.mouse.move(drop.x + 40, drop.y + drop.height / 2, { steps: 8 });
  await expect(root).toHaveClass(/drop-inside/);
  await page.mouse.up();
  await expect(page.locator('[data-tree-id="a"]')).toHaveCSS(
    "padding-left",
    "0px",
  );
  await expect(root).toHaveCount(0);
});

test("drag out remains reachable when all objects are grouped and the list scrolls", async ({
  page,
}) => {
  const many = Array.from({ length: 14 }, (_, i) => ({
    ...shapes[0],
    id: `s${i}`,
    name: `Item ${i}`,
  }));
  await load(page, {
    version: 13,
    shapes: many,
    objectTree: [
      {
        kind: "group",
        id: "only",
        name: "Only group",
        children: many.map((s) => ({ kind: "object", id: s.id })),
      },
    ],
  });
  const first = page.getByRole("button", { name: "Item 0", exact: true });
  await first.click();
  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 3 });
  const root = page.getByRole("group", {
    name: "Move to top level",
    exact: true,
  });
  await expect(root).toBeVisible();
  const drop = (await root.boundingBox())!;
  await page.mouse.move(drop.x + 40, drop.y + drop.height / 2, { steps: 12 });
  await expect(root).toHaveClass(/drop-inside/);
  await page.mouse.up();
  await expect(page.locator('[data-tree-id="s0"]')).toHaveCSS(
    "padding-left",
    "0px",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator('[data-tree-id="s0"]')).toHaveCSS(
    "padding-left",
    "16px",
  );
  await first.scrollIntoViewIfNeeded();
  const again = (await first.boundingBox())!;
  const row = (await page.locator('[data-tree-id="s0"]').boundingBox())!;
  await page.mouse.move(again.x + 30, again.y + again.height / 2);
  await page.mouse.down();
  await page.mouse.move(row.x + 4, again.y + again.height / 2, { steps: 10 });
  await expect(
    page.getByRole("group", { name: "Move to top level", exact: true }),
  ).toHaveClass(/drop-inside/);
  await page.mouse.up();
  await expect(page.locator('[data-tree-id="s0"]')).toHaveCSS(
    "padding-left",
    "0px",
  );
});

test("New Group automatically includes the selection and supports undo", async ({
  page,
}) => {
  await load(page);
  await page.getByRole("button", { name: "A", exact: true }).click();
  await page
    .getByRole("button", { name: "B", exact: true })
    .click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "New Group", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Rename group", exact: true })
    .press("Enter");
  await expect(page.locator('[data-tree-id="a"]')).toHaveCSS(
    "padding-left",
    "16px",
  );
  await expect(page.locator('[data-tree-id="b"]')).toHaveCSS(
    "padding-left",
    "16px",
  );
  await expect(page.locator('[data-tree-id="c"]')).toHaveCSS(
    "padding-left",
    "0px",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".group-select")).toHaveCount(0);
  await expect(page.locator('[data-tree-id="a"]')).toHaveCSS(
    "padding-left",
    "0px",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.locator(".group-select").click();
  await page.getByRole("button", { name: "New Group", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Rename group", exact: true })
    .press("Enter");
  await expect(page.locator(".group-select")).toHaveCount(2);
  await expect(page.locator('[data-tree-id="a"]')).toHaveCSS(
    "padding-left",
    "32px",
  );
});
