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
test.each(["select", "rectangle"] as const)(
  "guideline drag overrides %s guidance",
  (mode) => {
    const hint = editorHint({ ...base, mode, guideDrag: { axis: "y" } });
    expect(hint.action).toBe("Drag to position the guideline.");
    expect(hint.controls).toEqual(
      expect.arrayContaining([
        { id: "guide-step", gesture: "Drag", action: "1 mm steps" },
        { id: "guide-coarse", gesture: "Ctrl", action: "10 mm steps" },
        { id: "guide-medium", gesture: "Shift", action: "5 mm steps" },
        { id: "snap", gesture: "Alt", action: "Free placement" },
        { id: "cancel", gesture: "Esc", action: "Cancel guideline drag" },
      ]),
    );
    expect(hint.controls.filter((row) => row.id === "cancel")).toHaveLength(1);
    expect(
      hint.controls.some(
        (row) => row.id === "toggle" || row.id === "draw-drag",
      ),
    ).toBe(false);
    expect(editorHint({ ...base, mode }).action).not.toBe(hint.action);
  },
);
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

test("vertex dragging advertises angle constraint without changing handle guidance", () => {
  const hint = editorHint({ ...base, gesture: { kind: "vertex" } });
  expect(hint.controls).toContainEqual({
    id: "angle",
    gesture: "Shift",
    action: "Constrain movement to 45°",
  });
  expect(
    editorHint({
      ...base,
      gesture: { kind: "vertex", handleSide: "outgoing" },
    }).controls.some((c) => c.id === "angle"),
  ).toBe(false);
});

test.each([0, 1, 2])(
  "measurement help explains equal sections at placement stage %i",
  (count) => {
    const hint = editorHint({
      ...base,
      mode: "measurement",
      pending: Array.from({ length: count }, () => ({})),
      measurementSections: 4,
    });
    expect(hint.controls).toContainEqual({
      id: "sections",
      gesture: "Up / Down / Shift+scroll",
      action: "Add / remove equal sections",
    });
  },
);

test("boolean hints distinguish target picking, operands and keyboard button activation", () => {
  const target = editorHint({
    ...base,
    booleanOperation: "union",
    booleanPicker: "target",
  });
  expect(target.action).toContain("original objects");
  expect(target.controls.some((c) => c.id === "apply")).toBe(false);
  const operands = editorHint({
    ...base,
    booleanOperation: "subtract",
    booleanPicker: "cutters",
  });
  expect(operands.action).toContain("add or remove");
  expect(operands.controls).toContainEqual({
    id: "buttons",
    gesture: "Enter / Space on a button",
    action: "Activate button",
  });
  expect(operands.controls.some((c) => c.id === "apply")).toBe(true);
});

test("Select help explains Shift-click addition and removal explicitly", () => {
  expect(
    editorHint(base).controls.find((row) => row.gesture === "Shift+click")
      ?.action,
  ).toBe("Add or remove objects from selection");
});
test("array help lists constraints and navigation only in the appropriate stages", () => {
  const picking = editorHint({
    ...base,
    array: { kind: "radial" },
    arrayStage: "center",
  });
  expect(picking.controls.map((c) => c.id)).toEqual(
    expect.arrayContaining([
      "angles",
      "axes",
      "snap",
      "count",
      "center",
      "fields",
      "pan",
      "zoom",
      "confirm",
      "cancel",
    ]),
  );
  expect(picking.controls.find((c) => c.id === "confirm")!.action).toBe(
    "Confirm point",
  );
  const review = editorHint({
    ...base,
    array: { kind: "radial" },
    arrayStage: "review",
  });
  expect(review.controls.some((c) => c.id === "angles")).toBe(false);
  expect(review.controls.find((c) => c.id === "confirm")!.action).toBe(
    "Apply copies",
  );
  const sources = editorHint({
    ...base,
    array: { kind: "rectangular" },
    arrayStage: "endpoint1",
    objectPicker: true,
  });
  expect(sources.controls.some((c) => c.id === "angles")).toBe(false);
  expect(sources.controls.find((c) => c.id === "confirm")!.action).toBe(
    "Confirm selection",
  );
  expect(
    editorHint({
      ...base,
      array: { kind: "radial" },
      arrayStage: "center",
      objectPicker: true,
    }).controls.some((c) => c.id === "center"),
  ).toBe(false);
});

const helpContexts: Partial<HintState>[] = [
  {},
  { mode: "polyline", pending: [{}] },
  { transformTool: "move" },
  { transformTool: "rotate" },
  { transformTool: "scale" },
  { transformTool: "mirror" },
  { transformTool: "corner" },
  { transformTool: "move", placingPivot:true },
  { transformTool: "move", objectPicker:true },
  { booleanOperation:"subtract",booleanPicker:"target" },
  { offsetActive: true },
  { alignActive: true },
  { array: { kind: "radial" }, arrayStage: "center" },
  { pathCopy: { picker: null } },
  { booleanOperation: "subtract", booleanPicker: "cutters" },
  { stitchMode: true, stitchTool: null },
  { stitchMode: true, stitchTool: "link" },
  { stitchMode: true, stitchTool: "continue" },
  { stitchMode: true, stitchTransferPlacement: { phase: "hover" } },
];
test.each(helpContexts)(
  "canvas contexts have one shared navigation footer: %j",
  (context) => {
    const hint = editorHint({ ...base, ...context });
    expect(hint.action.length).toBeLessThan(65);
    for (const id of ["pan", "zoom", "fit"])
      expect(hint.controls.filter((c) => c.id === id)).toHaveLength(1);
    expect(hint.controls.filter((c) => c.id === "scroll")).toHaveLength(
      context.stitchTransferPlacement ? 0 : 1,
    );
    expect(new Set(hint.controls.map((c) => c.id)).size).toBe(
      hint.controls.length,
    );
    expect(hint.controls.some((c) => c.id === "fit-selection")).toBe(false);
    expect(
      editorHint({ ...base, ...context, selected: ["a"] }).controls.filter(
        (c) => c.id === "fit-selection",
      ),
    ).toHaveLength(1);
  },
);
test("field help replaces canvas controls and describes array Enter and Escape precisely", () => {
  const state = {
    ...base,
    array: { kind: "radial" },
    arrayStage: "center" as const,
  };
  const field = editorHint(state, "array", true);
  expect(field.controls.find((c) => c.id === "confirm")?.action).toBe(
    "Confirm point",
  );
  expect(field.controls.find((c) => c.id === "cancel")?.action).toBe(
    "Discard array preview",
  );
  expect(
    editorHint(
      { ...state, arrayHasConfirmedPlacement: true },
      "array",
      true,
    ).controls.find((c) => c.id === "cancel")?.action,
  ).toBe("Restore previous point");
  expect(
    editorHint({ ...state, arrayStage: "review" }, "array", true).controls.find(
      (c) => c.id === "confirm",
    )?.action,
  ).toBe("Apply copies");
  for (const id of ["angles", "axes", "count", "pan", "zoom", "fit"])
    expect(field.controls.some((c) => c.id === id)).toBe(false);
  expect(field.controls.some((c) => c.id === "field-wheel")).toBe(true);
  expect(
    editorHint(base, "property", false).controls.some(
      (c) => c.id === "field-wheel",
    ),
  ).toBe(false);
  expect(
    editorHint(
      { ...base, pathCopy: { picker: null } },
      "path-copy",
      true,
    ).controls.find((c) => c.id === "confirm")?.action,
  ).toBe("Confirm value");
});
test("segment selection explains selecting and editing segments", () => {
  const idle = editorHint({ ...base, mode: "segment-select" });
  expect(idle.action).toBe("Click a segment between crossings or corners.");
  expect(idle.controls.some((row) => row.id === "delete")).toBe(false);
  const chosen = editorHint({ ...base, mode: "segment-select", segmentSelection: [{}] });
  expect(chosen.action).toBe("Press G to move, E to rotate, S to resize or M to mirror.");
  expect(chosen.controls).toEqual(
    expect.arrayContaining([
      { id: "move", gesture: "G", action: "Move (detaches)" },
      { id: "rotate", gesture: "E", action: "Rotate (detaches)" },
      { id: "scale", gesture: "S", action: "Resize (detaches)" },
      { id: "mirror", gesture: "M", action: "Mirror (detaches)" },
      { id: "insert", gesture: "Alt+click edge", action: "Add anchor" },
      { id: "delete", gesture: "Delete / Backspace", action: "Delete segments" },
      { id: "separate", gesture: "Ctrl/⌘+Shift+D", action: "Separate into objects" },
      { id: "variants", gesture: "V / Shift+V", action: "Switch to object selection" },
    ]),
  );
  expect(chosen.controls.filter((row) => row.id === "cancel")).toHaveLength(1);
});
