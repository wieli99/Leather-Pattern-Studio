import { expect, test } from "vitest";
import { editorHint, type HintState } from "./hint";
import { variants, type Mode } from "./construction";
const base: HintState = {
  mode: "select",
  selected: [],
  pending: [],
  transformTool: null,
  placingPivot: false,
};
test("all modes and drawing stages have compact guidance", () => {
  const modes: Mode[] = [
    "select",
    "text",
    "polyline",
    ...Object.values(variants).flat(),
  ];
  for (const mode of modes)
    for (const pending of [[], [{}], [{}, {}]]) {
      const hint = editorHint({ ...base, mode, pending });
      expect(hint.action.length).toBeLessThan(65);
      expect(hint.controls.length).toBeGreaterThan(0);
      expect(hint.action).toMatch(/\.$/);
    }
});
test("selection, transform, pivot and cancellation derive fresh hints", () => {
  expect(editorHint(base).action).toContain("select");
  expect(editorHint({ ...base, selected: ["a"] }).action).toContain(
    "Choose Move",
  );
  expect(editorHint({ ...base, transformTool: "scale" }).action).toContain(
    "resize",
  );
  expect(
    editorHint({ ...base, transformTool: "move", placingPivot: true }).action,
  ).toContain("pivot");
  expect(
    editorHint(base)
      .controls.map((row) => row.gesture)
      .join(" "),
  ).toContain("Shift+click");
});

test("selection exposes anchor insertion and editing contexts", () => {
  expect(
    editorHint(base).controls.find((row) => row.id === "insert")?.gesture,
  ).toBe("Alt+click edge");
  expect(
    editorHint(base, "text").controls.find((row) => row.id === "confirm")
      ?.gesture,
  ).toBe("Ctrl/⌘+Enter");
});

test.each([
  ["polyline", 3, ["finish", "close", "angle", "back", "snap"]],
  ["control-curve", 1, ["finish", "back", "snap"]],
  ["polygon", 1, ["sides", "variants", "menu", "snap"]],
] as const)("%s covers its construction controls", (mode, count, ids) => {
  const hint = editorHint({ ...base, mode, pending: Array(count).fill({}) });
  expect(hint.controls.map((row) => row.id)).toEqual(
    expect.arrayContaining([...ids]),
  );
});
test("shape-specific controls stay relevant", () => {
  const state = { ...base, selected: ["a"] };
  const curve = editorHint({ ...state, active: [{ kind: "control-curve" }] });
  expect(curve.controls.map((row) => row.id)).toEqual(
    expect.arrayContaining(["anchors", "handles", "smooth"]),
  );
  const text = editorHint({ ...state, active: [{ kind: "text" }] });
  expect(text.controls.map((row) => row.id)).toContain("text");
  expect(text.controls.map((row) => row.id)).not.toContain("handles");
});
