import { describe, expect, it } from "vitest";
import { bugReport } from "./bugReport";
describe("bug reports", () => {
  it("encodes optional data and Unicode safely", () => {
    const project = JSON.stringify({ text: "ä & # ```" });
    const result = bugReport("version 1", "browser", project);
    expect(new URL(result.url).searchParams.get("body")).toBe(result.body);
    expect(result.body).toContain(project);
    expect(result.attachment).toBe(false);
  });
  it("excludes optional data", () => {
    const result = bugReport("App version: 0.1.0", "");
    expect(new URL(result.url).searchParams.get("body")).toContain("App version: 0.1.0");
    expect(result.body).not.toContain("## Project");
    expect(result.body).not.toContain("## System information");
  });
  it("offers an attachment without truncating large JSON", () => {
    const result = bugReport("version 1", "browser", JSON.stringify({ text: "x".repeat(8000) }));
    expect(result.attachment).toBe(true);
    expect(result.url.length).toBeLessThan(7000);
    expect(result.body).toContain("Attach the downloaded");
  });
});
