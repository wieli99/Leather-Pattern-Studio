import { test, expect } from "@playwright/test";
test("1000-shape navigation benchmark", async ({ page, browserName }, info) => {
  test.skip(browserName !== "chromium", "One documented reference benchmark");
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
  });
  const shapes = Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    name: `Piece ${i}`,
    kind: "rectangle",
    points: [
      { x: (i % 40) * 20, y: Math.floor(i / 40) * 15 },
      { x: (i % 40) * 20 + 15, y: Math.floor(i / 40) * 15 + 10 },
    ],
    radius: 2,
    rotation: 0,
  }));
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "benchmark.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 3, shapes })),
  });
  await expect(page.locator(".objects button")).toHaveCount(1000);
  await page.getByRole("button", { name: "Fit all F", exact: true }).click();
  const timing = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas")!,
      times: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 90; i++) {
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: 2,
          deltaY: 1,
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      if (i > 10) times.push(now - last);
      last = now;
    }
    times.sort((a, b) => a - b);
    return {
      mean: times.reduce((a, b) => a + b, 0) / times.length,
      p95: times[Math.floor(times.length * 0.95)],
      userAgent: navigator.userAgent,
    };
  });
  await info.attach("navigation-timing", {
    body: JSON.stringify(timing, null, 2),
    contentType: "application/json",
  });
  console.log("Navigation benchmark", timing);
  expect(timing.mean).toBeLessThan(40);
});
test("1000-shape drawing and snapping benchmark", async ({
  page,
  browserName,
}, info) => {
  test.skip(browserName !== "chromium", "One documented reference benchmark");
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Rectangle (R)", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    delete (window as any).showOpenFilePicker;
  });
  const shapes = Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    name: `Shape ${i}`,
    kind: "rectangle",
    points: [
      { x: (i % 40) * 20, y: Math.floor(i / 40) * 15 },
      { x: (i % 40) * 20 + 15, y: Math.floor(i / 40) * 15 + 10 },
    ],
    radius: 2,
    rotation: 0,
  }));
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 4, shapes })),
  });
  await expect(page.locator(".objects button")).toHaveCount(1000);
  await page.getByRole("button", { name: "Fit all F", exact: true }).click();
  await page.getByRole("button", { name: "Polyline (P)", exact: true }).click();
  await page.locator("canvas").click({ position: { x: 150, y: 200 } });
  const result = await page.evaluate(async () => {
    const c = document.querySelector("canvas")!,
      r = c.getBoundingClientRect(),
      samples: number[] = [];
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      c.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: r.x + 200 + i * 2,
          clientY: r.y + 200 + i,
        }),
      );
      await new Promise(requestAnimationFrame);
      if (i > 5) samples.push(performance.now() - start);
    }
    return { mean: samples.reduce((a, b) => a + b, 0) / samples.length };
  });
  await info.attach("drawing-snapping-timing", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  expect(result.mean).toBeLessThan(40);
});
