import { test, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
const files = readdirSync("docs/manual").filter((f) => f.endsWith(".md"));
test("manual articles have titles and valid links and images", () => {
  const ids = files.map((f) => f.replace(/\.md$/, ""));
  expect(ids.length).toBeGreaterThanOrEqual(11);
  for (const file of files) {
    const text = readFileSync(`docs/manual/${file}`, "utf8");
    expect(text).toMatch(/^# .+/);
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1];
      if (link.startsWith("#"))
        expect(ids).toContain(link.slice(1).split("/")[0]);
      else if (link.startsWith("/manual/images/"))
        expect(existsSync(`public${link}`)).toBe(true);
    }
  }
});
