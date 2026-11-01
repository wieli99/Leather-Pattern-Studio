import { expect, it } from "vitest";
import { pngAt300Dpi } from "./printExport";
it("writes one physical-resolution chunk at 300 DPI, replacing existing metadata", async () => {
  const input = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9qkAAAAASUVORK5CYII=",
    ),
    (c) => c.charCodeAt(0),
  );
  const first = await pngAt300Dpi(new Blob([input]));
  const second = await pngAt300Dpi(first);
  const bytes = new Uint8Array(await second.arrayBuffer());
  const text = String.fromCharCode(...bytes);
  expect(text.split("pHYs")).toHaveLength(2);
  const index = text.indexOf("pHYs"),
    view = new DataView(bytes.buffer);
  expect(view.getUint32(index + 4)).toBe(11811);
  expect(view.getUint32(index + 8)).toBe(11811);
  expect(bytes[index + 12]).toBe(1);
  expect(await first.arrayBuffer()).toEqual(await second.arrayBuffer());
});
