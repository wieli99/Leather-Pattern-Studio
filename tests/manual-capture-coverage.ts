import { existsSync, readFileSync, readdirSync } from "node:fs";

export default function verifyCaptureCoverage() {
  const names = new Set(
    readdirSync("docs/manual")
      .filter(file => file.endsWith(".md"))
      .flatMap(file => {
        const content = readFileSync(`docs/manual/${file}`, "utf8");
        return [...content.matchAll(/!\[[^\]]*\]\(\/manual\/images\/([^)]*)\)/g)]
          .map(match => match[1]);
      }),
  );
  const missing = [...names].filter(name =>
    !existsSync(`test-results/manual/captured/${name}`),
  );
  if (missing.length) {
    throw new Error(`Manual illustrations were not captured: ${missing.join(", ")}`);
  }
}
