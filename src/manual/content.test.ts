import { test, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";

const files = readdirSync("docs/manual").filter(file => file.endsWith(".md"));
const articles = new Map(files.map(file => [
  file.replace(/\.md$/, ""),
  readFileSync(`docs/manual/${file}`, "utf8"),
]));
const slug = (value: string) => value.toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

test("manual article and section links resolve, and all illustrations have capture scenarios", () => {
  const captureSources = readdirSync("tests")
    .filter(file => file.endsWith(".spec.ts"))
    .map(file => readFileSync(`tests/${file}`, "utf8"))
    .join("\n");
  const captures = new Set(
    [...captureSources.matchAll(/manualScreenshot\(.*?,\s*"([^"]+)"\)/g)]
      .map(match => match[1]),
  );
  const usedImages = new Set<string>();
  for (const [id, content] of articles) {
    expect(content, id).toMatch(/^# .+/);
    for (const match of content.matchAll(/(!?)\[([^\]]*)\]\(([^)]+)\)/g)) {
      const [, image, label, link] = match;
      if (link.startsWith("#")) {
        const [article, section] = link.slice(1).split("/");
        expect(articles.has(article), `${id}: ${link}`).toBe(true);
        if (section) {
          const sections = [...articles.get(article)!.matchAll(/^## (.+)$/gm)]
            .map(heading => slug(heading[1]));
          expect(sections, link).toContain(section);
        }
      } else if (image) {
        expect(label.trim(), id).not.toBe("");
        const basename = link.replace(/^\/manual\//, "").replace(/^images\//, "");
        expect(existsSync(`public/manual/images/${basename}`), link).toBe(true);
        expect(captures.has(basename), link).toBe(true);
        usedImages.add(basename);
      }
    }
  }
  expect(readdirSync("public/manual/images").sort()).toEqual([...usedImages].sort());
});
