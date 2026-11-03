export const issueTemplate = `## Problem
Describe the problem.

## Steps to reproduce
1. 

## Expected behavior

## Actual behavior

## Frequency and regression
How often does this happen? Did it work in an earlier version?

## Screenshots or recordings
Attach screenshots here if helpful.
`;
export function bugReport(context: string, system: string, project?: string) {
  const base = `${issueTemplate}\n## App context\n${context}\n${system ? `\n## System information\n${system}\n` : ""}`;
  const urlFor = (body: string) => `https://github.com/wieli99/Leather-Pattern-Studio/issues/new?${new URLSearchParams({ template: "bug_report.md", body })}`;
  let body = base;
  let attachment = false;
  if (project !== undefined) {
    const fence = "`".repeat(Math.max(3, ...Array.from(project.matchAll(/`+/g), m => m[0].length + 1)));
    body += `\n## Project\n<details><summary>Project JSON</summary>\n\n${fence}json\n${project}\n${fence}\n</details>\n`;
    if (urlFor(body).length > 7000) {
      attachment = true;
      body = `${base}\n## Project\nAttach the downloaded bug-report-project.json file here.\n`;
    }
  }
  return { body, url: urlFor(body), attachment };
}
