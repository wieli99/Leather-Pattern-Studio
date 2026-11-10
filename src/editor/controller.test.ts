import { test, expect, vi, afterEach } from "vitest";
import { emptyDocument, parseProject, type Doc } from "../model/project";
vi.mock("./core", () => ({
  Core: class {
    document = emptyDocument();
    revision = 0;
    past: Doc[] = [];
    future: Doc[] = [];
    async request(op: string, revision: number, next?: Doc) {
      if (revision !== this.revision) throw Error("Stale revision");
      if (op === "preview") return { document: next, revision: this.revision };
      if (op === "commit" || op === "load") {
        parseProject(JSON.stringify(next));
        if (JSON.stringify(next) !== JSON.stringify(this.document)) {
          this.past.push(this.document);
          this.document = next!;
          this.future = [];
          this.revision++;
        }
      }
      if (op === "undo" && this.past.length) {
        this.future.push(this.document);
        this.document = this.past.pop()!;
        this.revision++;
      }
      return {
        document: this.document,
        revision: this.revision,
        canUndo: !!this.past.length,
        canRedo: !!this.future.length,
      };
    }
  },
}));
vi.mock("./persistence", () => ({
  ProjectFiles: class {},
  recovery: vi.fn(async () => undefined),
}));
import { Controller } from "./controller";
function editor() {
  const e = new Controller();
  e.ready = true;
  e.grid = false;
  e.objects = false;
  return e;
}
afterEach(() => vi.useRealTimers());
test("cancel discards drawing and transforms without document changes", () => {
  const e = editor();
  e.setTool("rectangle");
  e.pointerDown({ x: 100, y: 100 }, 0, false, false);
  e.pointerUp();
  expect(e.pending).toHaveLength(1);
  e.cancel();
  expect(e.pending).toHaveLength(0);
  expect(e.document.shapes).toHaveLength(0);
  expect(e.canUndo).toBe(false);
});
test("one drawing gesture creates one transaction", async () => {
  vi.useFakeTimers();
  const e = editor();
  e.setTool("rectangle");
  e.pointerDown({ x: 100, y: 100 }, 0, false, false);
  e.pointerUp();
  e.pointerDown({ x: 400, y: 310 }, 0, false, false);
  e.pointerUp();
  await vi.waitFor(() => expect(e.document.shapes).toHaveLength(1));
  expect(e.revision).toBe(1);
  await e.transact("undo");
  expect(e.document.shapes).toHaveLength(0);
});
test("invalid geometry is not committed", async () => {
  const e = editor();
  e.setTool("rectangle");
  e.finish([
    { x: 0, y: 0 },
    { x: 0, y: 10 },
  ]);
  await Promise.resolve();
  expect(e.revision).toBe(0);
  expect(e.message).toContain("positive");
});
test("snapping uses screen-space tolerance and alt override", () => {
  const e = editor();
  e.grid = true;
  e.zoom = 3;
  expect(e.snap({ x: 0.3, y: 0.2 })).toEqual({ x: 0, y: 0 });
  expect(e.snap({ x: 0.3, y: 0.2 }, true)).toEqual({ x: 0.3, y: 0.2 });
  e.grid = false;
  e.objects = true;
  e.document = {
    version: 5,
    shapes: [
      {
        id: "a",
        name: "line",
        kind: "line",
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
        rotation: 0,
        radius: 0,
      },
    ],
  };
  expect(e.snap({ x: 10.2, y: 10.2 })).toEqual({ x: 10, y: 10 });
});
test("cursor anchored zoom preserves world coordinates", () => {
  const e = editor(),
    pixel = { x: 200, y: 300 },
    before = e.world(pixel);
  e.wheel(pixel, 0, -100, true);
  expect(e.world(pixel).x).toBeCloseTo(before.x);
  expect(e.world(pixel).y).toBeCloseTo(before.y);
});
const shape = {
  id: "a",
  name: "Rectangle",
  kind: "rectangle" as const,
  points: [
    { x: 0, y: 0 },
    { x: 40, y: 30 },
  ],
  radius: 0,
  rotation: 0,
};
const click = (e: Controller, p: { x: number; y: number }) => {
  e.pointerDown(p, 0, false, false);
  e.pointerUp(p);
};
test("drag places a sticky rectangle and initial polyline drag ends a line", async () => {
  const e = editor();
  e.setMode("rectangle");
  e.pointerDown({ x: 100, y: 120 }, 0, false, false);
  e.pointerMove({ x: 200, y: 220 }, false);
  e.pointerUp({ x: 200, y: 220 });
  await e.transactionQueue;
  expect(e.document.shapes).toHaveLength(1);
  expect(e.mode).toBe("rectangle");
  e.setMode("polyline");
  e.pointerDown({ x: 300, y: 320 }, 0, false, false);
  e.pointerMove({ x: 400, y: 420 }, false);
  e.pointerUp({ x: 400, y: 420 });
  await e.transactionQueue;
  expect(e.document.shapes).toHaveLength(2);
  expect(e.pending).toHaveLength(0);
  expect(e.document.shapes[1].points).toHaveLength(2);
});
test.each(["polyline", "curve", "control-curve"] as const)(
  "%s double click adds no closing anchors and rejects short paths",
  async (mode) => {
    vi.useFakeTimers();
    const e = editor();
    e.setMode(mode);
    e.pendingHandles = Array.from({ length: 3 }, () => ({
      incoming: { x: -5, y: -10 },
      outgoing: { x: 5, y: 10 },
    }));
    e.pending = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ];
    click(e, { x: 200, y: 200 });
    e.polylineClick(1);
    click(e, { x: 200, y: 200 });
    e.polylineClick(2);
    await e.transactionQueue;
    expect(e.document.shapes[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 0 },
    ]);
    if (mode === "control-curve") {
      expect(e.document.shapes[0].handles).toHaveLength(4);
      expect(e.document.shapes[0].handles![3]).toEqual(
        e.document.shapes[0].handles![0],
      );
    }
    expect(e.pending).toHaveLength(0);
    e.pending = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ];
    click(e, { x: 300, y: 200 });
    e.polylineClick(1);
    click(e, { x: 300, y: 200 });
    e.polylineClick(2);
    expect(e.pending).toHaveLength(2);
    expect(e.message).toContain("three anchors");
  },
);
test("right click flushes last anchor without appending cursor", async () => {
  vi.useFakeTimers();
  const e = editor();
  e.setMode("polyline");
  e.pending = [{ x: 0, y: 0 }];
  click(e, { x: 140, y: 100 });
  e.pointerMove({ x: 300, y: 300 }, false);
  e.pointerDown({ x: 300, y: 300 }, 2, false, false);
  await e.transactionQueue;
  expect(e.document.shapes[0].points).toEqual([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ]);
});
test("Shift polyline constraint survives grid snapping", () => {
  const e = editor();
  e.grid = true;
  e.setMode("polyline");
  e.pending = [{ x: 0.2, y: 0.3 }];
  e.pointerMove(e.screen({ x: 10, y: 8 }), false, false, true);
  expect(e.cursor.x - 0.2).toBeCloseTo(e.cursor.y - 0.3);
});
test("Ctrl interior selection and geometric crossing marquee", () => {
  const e = editor();
  e.document = { version: 5, shapes: [shape] };
  const p = e.screen({ x: 20, y: 15 });
  e.pointerDown(p, 0, false, false);
  e.pointerUp();
  expect(e.selected).toEqual([]);
  e.pointerDown(p, 0, false, false, true);
  e.pointerUp();
  expect(e.selected).toEqual(["a"]);
  e.selected = [];
  e.pointerDown(e.screen({ x: -10, y: -10 }), 0, false, false, true);
  e.pointerMove(e.screen({ x: 5, y: 5 }), false, true);
  e.pointerUp(undefined, false, false, true);
  expect(e.selected).toEqual(["a"]);
});
test.each([
  [false, false, false, 13],
  [false, true, false, 10],
  [false, false, true, 15],
  [true, true, true, 13.2],
])(
  "rotation quantization and one commit",
  async (alt, ctrl, shift, expected) => {
    const e = editor();
    e.document = { version: 5, shapes: [shape] };
    e.selected = ["a"];
    e.activateTransform("rotate");
    const handle = e.handles().find((h) => h.kind === "rotate")!,
      pivot = { x: 20, y: 15 },
      startAngle = Math.atan2(
        handle.point.y - pivot.y,
        handle.point.x - pivot.x,
      ),
      r = 50,
      t = startAngle + (13.2 * Math.PI) / 180;
    e.pointerDown(e.screen(handle.point), 0, false, false);
    e.pointerMove(
      e.screen({ x: pivot.x + r * Math.cos(t), y: pivot.y + r * Math.sin(t) }),
      alt,
      ctrl,
      shift,
    );
    expect(e.preview!.shapes[0].rotation).toBeCloseTo(expected);
    e.pointerUp();
    expect(e.revision).toBe(0);
    await e.applyTransform();
    await e.transactionQueue;
    expect(e.revision).toBe(1);
  },
);
test("live property changes commit once, cancel restores, queued fields retain latest changes", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [shape] });
  e.beginProperty();
  await e.edit("a", { rotation: 10 });
  await e.edit("a", { rotation: 20 });
  expect(e.document.shapes[0].rotation).toBe(0);
  expect(e.preview!.shapes[0].rotation).toBe(20);
  await e.finishProperty();
  expect(e.revision).toBe(2);
  await e.transact("undo");
  expect(e.document.shapes[0].rotation).toBe(0);
  e.beginProperty();
  await e.edit("a", { rotation: 40 });
  await e.finishProperty(true);
  expect(e.document.shapes[0].rotation).toBe(0);
  expect(e.preview).toBeNull();
  e.beginProperty();
  await e.edit("a", { rotation: 50 });
  const first = e.finishProperty();
  e.beginProperty();
  await e.edit("a", { name: "Next" });
  await e.finishProperty();
  await first;
  expect(e.document.shapes[0].rotation).toBe(50);
  expect(e.document.shapes[0].name).toBe("Next");
});
test("configured grid and outline snap use actual geometry", () => {
  const e = editor();
  e.grid = true;
  e.gridSize = 10;
  expect(e.snap({ x: 9, y: 11 })).toEqual({ x: 10, y: 10 });
  e.grid = false;
  e.objects = true;
  e.document = { version: 5, shapes: [shape] };
  expect(e.snap({ x: 7, y: 0.5 }).y).toBeCloseTo(0);
  e.gesture = {
    kind: "move",
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
    original: e.document,
    selection: ["a"],
    pivot: { x: 0, y: 0 },
  };
  expect(e.snap({ x: 7, y: 0.5 })).toEqual({ x: 7, y: 0.5 });
});
test("late property validation cannot resurrect a finished or cancelled preview", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [shape] });
  const original = e.core.request.bind(e.core);
  let resolve!: (value: any) => void;
  vi.spyOn(e.core, "request").mockImplementation((op, revision, next) =>
    op === "preview"
      ? new Promise((r) => {
          resolve = r;
        })
      : original(op, revision, next),
  );
  e.beginProperty();
  const pending = e.edit("a", { rotation: 25 });
  const oldPreview = e.preview!;
  await e.finishProperty(true);
  resolve({
    document: oldPreview,
    revision: e.revision,
    canUndo: true,
    canRedo: false,
  });
  await pending;
  expect(e.preview).toBeNull();
  expect(e.document.shapes[0].rotation).toBe(0);
});
test("invalid property geometry keeps last valid live state", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [shape] });
  e.beginProperty();
  await e.edit("a", { rotation: 12 });
  await e.edit("a", {
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ],
  });
  expect(e.preview!.shapes[0].rotation).toBe(12);
  await e.finishProperty();
  expect(e.document.shapes[0].rotation).toBe(12);
  expect(e.revision).toBe(2);
});
test("move snapping aligns shape anchor instead of pointer grab offset", async () => {
  const e = editor();
  e.document = {
    version: 5,
    shapes: [
      shape,
      {
        ...shape,
        id: "b",
        points: [
          { x: 100, y: 0 },
          { x: 140, y: 30 },
        ],
      },
    ],
  };
  e.objects = true;
  e.selected = ["a"];
  e.activateTransform("move");
  e.pointerDown(e.screen({ x: 10, y: 0 }), 0, false, false);
  e.pointerMove(e.screen({ x: 69, y: 0 }), false);
  expect(e.preview!.shapes[0].points[1].x).toBeCloseTo(100);
  e.cancel();
  expect(e.document.shapes[0].points[1].x).toBe(40);
});
test("saved baseline follows undo and cancelled/failed saves", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [shape] });
  Object.assign(e.files, { save: vi.fn(async () => ({ outcome: "downloaded", name: e.name })) });
  await e.save();
  expect(e.dirty).toBe(false);
  await e.edit("a", { name: "Changed" });
  expect(e.dirty).toBe(true);
  await e.transact("undo");
  expect(e.dirty).toBe(false);
  await e.edit("a", { name: "Again" });
  Object.assign(e.files, { save: vi.fn(async () => ({ outcome: "cancelled", name: e.name })) });
  await e.save();
  expect(e.dirty).toBe(true);
  Object.assign(e.files, {
    save: vi.fn(async () => {
      throw Error("disk full");
    }),
  });
  await e.save();
  expect(e.dirty).toBe(true);
});
test("save completing after new edits does not mark them saved", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [shape] });
  let finish!: (v: { outcome: string; name: string }) => void;
  Object.assign(e.files, {
    save: vi.fn(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    ),
  });
  const saving = e.save();
  await vi.waitFor(() => expect(finish).toBeDefined());
  await e.edit("a", { name: "After save started" });
  finish({ outcome: "downloaded", name: e.name });
  await saving;
  expect(e.dirty).toBe(true);
  await e.transact("undo");
  expect(e.dirty).toBe(false);
});
test("cursor movement preserves the UI snapshot and clears snap feedback on leave", async () => {
  const e = editor();
  e.setMode("rectangle");
  const snapshot = e.uiSnapshot();
  e.pointerMove({ x: 180, y: 210 }, false);
  expect(e.uiSnapshot()).toBe(snapshot);
  e.grid = true;
  e.snap({ x: 1.1, y: 1 });
  expect(e.snapKind).toBe("grid");
  e.leavePointer();
  expect(e.snapTarget).toBeNull();
  expect(e.snapKind).toBeNull();
});
test("baseline comparison ignores worker JSON key ordering", async () => {
  const e = editor();
  e.document = { shapes: [], version: 6 };
  e.notify();
  expect(e.dirty).toBe(false);
});

test("selection is inert and transform previews apply once or cancel completely", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [shape] });
  e.selected = ["a"];
  e.pointerDown(e.screen({ x: 0, y: 15 }), 0, false, false);
  e.pointerMove(e.screen({ x: 10, y: 15 }), true);
  e.pointerUp();
  expect(e.preview).toBeNull();
  expect(e.handles().filter(h => h.kind === "vertex")).toHaveLength(4);
  const revision = e.revision;
  e.activateTransform("scale");
  e.setTransformValues({ sx: 2, sy: 0.5 });
  expect(e.document.shapes[0].transform).toBeUndefined();
  expect(e.preview!.shapes[0].transform!.a).toBe(2);
  e.setTransformValues({ sx: 3 });
  expect(e.revision).toBe(revision);
  await e.applyTransform();
  expect(e.revision).toBe(revision + 1);
  expect(e.document.shapes[0].transform!.a).toBe(3);
  e.activateTransform("move");
  e.setTransformValues({ x: 12 });
  e.cancel();
  expect(e.preview).toBeNull();
  expect(e.revision).toBe(revision + 1);
  await e.transact("undo");
  expect(e.document.shapes[0].transform).toBeUndefined();
});
test("invalid factors prevent apply and switching tools discards previews", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [shape] });
  e.selected = ["a"];
  e.activateTransform("scale");
  e.setTransformValues({ sx: 0 });
  expect(e.transformValid).toBe(false);
  await e.applyTransform();
  expect(e.revision).toBe(1);
  e.setTransformValues({ sx: 2 });
  e.activateTransform("rotate");
  expect(e.preview).toBeNull();
  expect(e.transformValues.angle).toBe(0);
  e.setTransformValues({ angle: 20 });
  e.beginProperty();
  expect(e.transformTool).toBe("rotate");
  expect(e.preview).not.toBeNull();
});
test("late transform validation cannot restore a cancelled session", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [shape] });
  e.selected = ["a"];
  const request = e.core.request.bind(e.core);
  let resolve!: (v: any) => void;
  e.core.request = vi.fn((op, rev, doc) =>
    op === "preview"
      ? new Promise((r) => (resolve = r))
      : request(op, rev, doc),
  );
  e.activateTransform("move");
  e.setTransformValues({ x: 10 });
  const next = e.preview!;
  e.cancel();
  resolve({ document: next, revision: e.revision });
  await Promise.resolve();
  await Promise.resolve();
  expect(e.preview).toBeNull();
  expect(e.document.shapes[0].points).toEqual(shape.points);
});

test("repeated move drags accumulate and constrained local motion survives snapping", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [{ ...shape, rotation: 30 }] });
  e.selected = ["a"];
  e.activateTransform("move");
  e.setOrientation("local");
  for (let i = 0; i < 2; i++) {
    const h = e.handles().find((h) => h.axis === "x")!;
    e.pointerDown(e.screen(h.point), 0, false, true);
    e.pointerMove(
      e.screen({
        x: h.point.x + 10 * Math.cos(Math.PI / 6),
        y: h.point.y + 10 * Math.sin(Math.PI / 6),
      }),
      true,
    );
    e.pointerUp();
  }
  expect(e.transformValues.x).toBeCloseTo(20);
  expect(e.transformValues.y).toBeCloseTo(0);
  expect(e.revision).toBe(1);
  await e.applyTransform();
  expect(e.revision).toBe(2);
});
test("multi-selection stretching uses one world pivot and pivot changes preserve the preview", async () => {
  const e = editor();
  await e.commit({
    version: 5,
    shapes: [shape, { ...shape, id: "b", rotation: 45 }],
  });
  e.selected = ["a", "b"];
  e.activateTransform("scale");
  e.setTransformValues({ sx: 2, sy: 0.5 });
  const before = JSON.stringify(e.preview);
  e.setPivot({ x: 0, y: 0 });
  expect(JSON.stringify(e.preview)).toBe(before);
  e.setTransformValues({ sx: 1.5, sy: 1 });
  expect(e.preview!.shapes.every((s) => s.transform)).toBe(true);
  e.cancel();
  expect(e.document.shapes.every((s) => !s.transform)).toBe(true);
});

test("outside clicks and interrupted drags keep transform sessions active", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [shape] });
  e.selected = ["a"];
  e.activateTransform("rotate");
  e.setTransformValues({ angle: 30 });
  expect(e.gizmoAngle).toBeCloseTo(30);
  const preview = e.preview;
  e.pointerDown(e.screen({ x: 500, y: 500 }), 0, false, false);
  e.pointerUp();
  expect(e.preview).toBe(preview);
  expect(e.transformTool).toBe("rotate");
  e.pauseGesture();
  expect(e.preview).toBe(preview);
  e.beginProperty();
  expect(e.transformTool).toBe("rotate");
  await e.applyTransform();
  e.activateTransform("move");
  expect(e.transformOrientation).toBe("local");
  expect(e.gizmoAngle).toBeCloseTo(30);
  e.setOrientation("world");
  expect(e.gizmoAngle).toBe(0);
});

test("arrow shafts are draggable at different zoom levels and local orientations", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [{ ...shape, rotation: 35 }] });
  e.selected = ["a"];
  e.activateTransform("move");
  for (const zoom of [1, 8]) {
    e.zoom = zoom;
    for (const axis of ["x", "y"]) {
      const h = e.handles().find((h) => h.axis === axis)!;
      const p = {
        x: e.transformPivot.x + (h.point.x - e.transformPivot.x) * 0.5,
        y: e.transformPivot.y + (h.point.y - e.transformPivot.y) * 0.5,
      };
      expect(e.handleAt(p)?.axis).toBe(axis);
    }
  }
});
test("move snap feedback keeps a stable source anchor and respects axis constraints", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [shape] });
  e.selected = ["a"];
  e.grid = true;
  e.activateTransform("move");
  const h = e.handles().find((h) => !h.axis)!;
  e.pointerDown(e.screen(h.point), 0, false, false);
  e.pointerMove(e.screen({ x: h.point.x + 1, y: h.point.y + 1 }), false);
  const source = e.gesture!.snapAnchor;
  expect(source).toBeDefined();
  e.pointerMove(e.screen({ x: h.point.x + 1.1, y: h.point.y + 1.1 }), false);
  expect(e.gesture!.snapAnchor).toBe(source);
  e.cancel();
  e.activateTransform("move");
  const x = e.handles().find((h) => h.axis === "x")!;
  e.pointerDown(e.screen(x.point), 0, false, false);
  e.pointerMove(e.screen({ x: x.point.x + 2, y: x.point.y + 1 }), false);
  expect(e.snapTarget).toBeNull();
});

test("curve drawing previews stay outside history and completion is one transaction", async () => {
  const e = editor();
  e.setMode("curve");
  e.addPoint({ x: 0, y: 0 });
  e.addPoint({ x: 10, y: 20 });
  e.addPoint({ x: 30, y: 0 });
  expect(e.document.shapes).toHaveLength(0);
  expect(e.constructionPreview?.kind).toBe("curve");
  e.finish();
  await vi.waitFor(() => expect(e.revision).toBe(1));
  expect(e.document.shapes[0].points).toHaveLength(3);
  await e.transact("undo");
  expect(e.document.shapes).toHaveLength(0);
});
test("control curve drag creates mirrored handles, click creates corners, switching cancels", async () => {
  const e = editor();
  e.setMode("control-curve");
  const a = { x: 100, y: 100 },
    b = { x: 160, y: 150 },
    end = { x: 300, y: 200 };
  e.pointerDown(a, 0, false, false);
  e.pointerMove(b, true);
  e.pointerUp(b, true);
  expect(e.pendingHandles[0].incoming.x).toBe(-e.pendingHandles[0].outgoing.x);
  expect(e.pendingHandles[0].outgoing.x).not.toBe(0);
  e.pointerDown(end, 0, false, true);
  e.pointerUp(end, true);
  expect(e.pendingHandles[1].outgoing).toEqual({ x: 0, y: 0 });
  e.pointerDown(end, 2, false, true);
  await vi.waitFor(() => expect(e.revision).toBe(1));
  expect(e.document.shapes[0].kind).toBe("control-curve");
  e.addPoint({ x: 10, y: 20 });
  e.setMode("rectangle");
  expect(e.pending).toHaveLength(0);
  expect(e.pendingHandles).toHaveLength(0);
  expect(e.revision).toBe(1);
});
test("curve duplicate clicks and invalid short paths do not create extra anchors or commits", async () => {
  const e = editor();
  e.setMode("curve");
  e.addPoint({ x: 0, y: 0 });
  e.finish();
  expect(e.revision).toBe(0);
  e.addPoint({ x: 10, y: 10 });
  e.addPoint({ x: 10, y: 10 });
  e.finish();
  await vi.waitFor(() => expect(e.revision).toBe(1));
  expect(e.document.shapes[0].points).toHaveLength(2);
});
test("selected Bézier handles mirror when edited and cancellation restores original", async () => {
  const e = editor();
  e.setMode("control-curve");
  e.addPoint({ x: 0, y: 0 });
  e.addPoint({ x: 100, y: 0 });
  e.pendingHandles[0] = {
    incoming: { x: -10, y: 0 },
    outgoing: { x: 10, y: 0 },
  };
  e.finish();
  await vi.waitFor(() => expect(e.revision).toBe(1));
  e.setMode("select");
  const original = JSON.stringify(e.document);
  const h = e
    .handles()
    .find((h) => h.vertex === 0 && h.handleSide === "outgoing")!;
  e.pointerDown(e.screen(h.point), 0, false, false);
  e.pointerMove(e.screen({ x: 20, y: 30 }), true);
  expect(e.preview!.shapes[0].handles![0]).toEqual({
    incoming: { x: -10, y: 0 },
    outgoing: { x: 20, y: 30 },
  });
  e.cancel();
  expect(JSON.stringify(e.document)).toBe(original);
  expect(e.revision).toBe(1);
  e.pointerDown(e.screen(h.point), 0, false, false);
  e.pointerMove(e.screen({ x: 20, y: 30 }), true);
  e.pointerUp();
  await vi.waitFor(() => expect(e.revision).toBe(2));
  await e.transact("undo");
  expect(JSON.stringify(e.document)).toBe(original);
});

test("curve anchor editing preserves attached handle vectors and commits once", async () => {
  const e = editor();
  e.setMode("control-curve");
  e.addPoint({ x: 0, y: 0 });
  e.addPoint({ x: 100, y: 0 });
  e.pendingHandles[0] = {
    incoming: { x: -10, y: -20 },
    outgoing: { x: 10, y: 20 },
  };
  e.finish();
  await vi.waitFor(() => expect(e.revision).toBe(1));
  e.setMode("select");
  e.pointerDown(e.screen({ x: 0, y: 0 }), 0, false, false);
  e.pointerMove(e.screen({ x: 15, y: 10 }), true);
  e.pointerUp();
  await vi.waitFor(() => expect(e.revision).toBe(2));
  expect(e.document.shapes[0].points[0]).toEqual({ x: 15, y: 10 });
  expect(e.document.shapes[0].handles![0]).toEqual({
    incoming: { x: -10, y: -20 },
    outgoing: { x: 10, y: 20 },
  });
});

test.each(["curve", "control-curve"] as const)(
  "%s retains the Move gizmo alongside editable points",
  async (mode) => {
    const e = editor();
    e.setMode(mode);
    e.addPoint({ x: 0, y: 0 });
    e.addPoint({ x: 100, y: 40 });
    e.finish();
    await vi.waitFor(() => expect(e.revision).toBe(1));
    e.activateTransform("move");
    const handles = e.handles();
    expect(handles.filter((h) => h.kind === "move")).toHaveLength(3);
    expect(handles.some((h) => h.kind === "move" && h.axis === "x")).toBe(true);
    expect(handles.some((h) => h.kind === "move" && h.axis === "y")).toBe(true);
    expect(
      handles.filter((h) => h.kind === "vertex" && !h.handleSide),
    ).toHaveLength(2);
    const x = handles.find((h) => h.kind === "move" && h.axis === "x")!;
    e.pointerDown(e.screen(x.point), 0, false, true);
    e.pointerMove(e.screen({ x: x.point.x + 10, y: x.point.y + 20 }), true);
    e.pointerUp();
    expect(e.transformValues.x).toBeCloseTo(10);
    expect(e.transformValues.y).toBeCloseTo(0);
    await e.applyTransform();
    expect(e.document.shapes[0].points[0]).toEqual({ x: 10, y: 0 });
    expect(e.revision).toBe(2);
  },
);

test("Alt-click inserts once in Select and can drag existing anchors", async () => {
  const e = editor();
  e.setMode("polyline");
  e.addPoint({ x: 0, y: 0 });
  e.addPoint({ x: 100, y: 0 });
  e.finish();
  await vi.waitFor(() => expect(e.revision).toBe(1));
  e.setMode("select");
  const id = e.document.shapes[0].id;
  e.selected = [];
  e.pointerDown(e.screen({ x: 50, y: 0 }), 0, false, true);
  e.pointerUp();
  await vi.waitFor(() => expect(e.revision).toBe(2));
  expect(e.mode).toBe("select");
  expect(e.selected).toEqual([id]);
  expect(e.document.shapes[0].points).toHaveLength(3);
  e.pointerDown(e.screen({ x: 50, y: 0 }), 0, false, true);
  expect(e.gesture?.kind).toBe("vertex");
  e.pointerUp();
  expect(e.revision).toBe(2);
  e.pointerDown(e.screen({ x: 50, y: 0 }), 0, false, true);
  e.pointerMove(e.screen({ x: 50, y: 20 }), true);
  e.pointerUp();
  await vi.waitFor(() => expect(e.revision).toBe(3));
  expect(e.document.shapes[0].points).toHaveLength(3);
  expect(e.document.shapes[0].points[1]).toEqual({ x: 50, y: 20 });
  e.pointerDown(e.screen({ x: 50, y: 100 }), 0, false, true);
  expect(e.gesture).toBeNull();
  expect(e.revision).toBe(3);
  expect(e.selected).toEqual([id]);
});

test("anchor indicator follows Alt eligibility without committing", async () => {
  const e = editor();
  e.setMode("polyline");
  e.addPoint({ x: 0, y: 0 });
  e.addPoint({ x: 100, y: 0 });
  e.finish();
  await vi.waitFor(() => expect(e.revision).toBe(1));
  e.setMode("select");
  e.pointerMove(e.screen({ x: 50, y: 2 }), false);
  expect(e.anchorIndicator).toBeNull();
  e.setAnchorModifier(true);
  expect(e.anchorIndicator!.x).toBeCloseTo(50, 4);
  expect(e.anchorIndicator!.y).toBeCloseTo(0);
  expect(e.revision).toBe(1);
  e.setAnchorModifier(false);
  expect(e.anchorIndicator).toBeNull();
  e.pointerMove(e.screen({ x: 0, y: 0 }), true);
  expect(e.anchorIndicator).toBeNull();
  e.pointerMove(e.screen({ x: 50, y: 0 }), true);
  e.leavePointer();
  expect(e.anchorIndicator).toBeNull();
});

test("moving a closed curve seam keeps both endpoints linked", async () => {
  const e = editor();
  e.setMode("control-curve");
  for (const p of [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 0 },
  ])
    e.addPoint(p);
  e.finish();
  await vi.waitFor(() => expect(e.revision).toBe(1));
  e.setMode("select");
  e.selected = [e.document.shapes[0].id];
  e.pointerDown(e.screen({ x: 0, y: 0 }), 0, false, false);
  e.pointerMove(e.screen({ x: 10, y: 10 }), true);
  e.pointerUp();
  await vi.waitFor(() => expect(e.revision).toBe(2));
  expect(e.document.shapes[0].points[0]).toEqual(
    e.document.shapes[0].points.at(-1),
  );
});

test("measurement modifier changes do not create document history", () => {
  const e = new Controller();
  const document = e.document;
  expect(e.measurementsVisible).toBe(false);
  e.setMeasurementModifier(true);
  expect(e.measurementsVisible).toBe(true);
  e.setMeasurementModifier(false);
  expect(e.measurementsVisible).toBe(false);
  expect(e.document).toBe(document);
});

test("every grouped mode cycles both ways and remembers its last variant", async () => {
  const { variants } = await import("./construction");
  const e = editor();
  for (const group of Object.keys(variants) as (keyof typeof variants)[]) {
    const modes = variants[group];
    e.setMode(modes[0]);
    for (let i = 0; i < modes.length; i++) {
      expect(e.mode).toBe(modes[i]);
      e.cycle(group);
    }
    expect(e.mode).toBe(modes[0]);
    e.cycle(group, -1);
    expect(e.mode).toBe(modes[modes.length - 1]);
    e.setMode("select");
    e.cycle(group);
    expect(e.mode).toBe(modes[modes.length - 1]);
  }
});

test("object center snap shows both reference axes and clears on bypass", () => {
  const e = editor();
  e.objects = true;
  e.document.shapes = [
    {
      id: "center",
      name: "Rectangle",
      kind: "rectangle",
      points: [
        { x: 10, y: 10 },
        { x: 50, y: 30 },
      ],
      rotation: 0,
      radius: 0,
    },
  ];
  expect(e.snap({ x: 30.1, y: 20.1 })).toEqual({ x: 30, y: 20 });
  expect(e.smartGuides.map((g) => [g.axis, g.coordinate, g.objectId])).toEqual([
    ["x", 30, "center"],
    ["y", 20, "center"],
  ]);
  e.snap({ x: 30, y: 20 }, true);
  expect(e.smartGuides).toEqual([]);
  expect(e.snap({ x: 30.1, y: 60 })).toEqual({ x: 30, y: 60 });
  expect(e.smartGuides).toHaveLength(1);
  e.objects = false;
  e.grid = false;
  expect(e.snap({ x: 30.1, y: 60 })).toEqual({ x: 30.1, y: 60 });
  e.snap({ x: 30, y: 20 });
  expect(e.smartGuides).toEqual([]);
});

test.each(["rectangle", "rectangle-center", "ellipse", "polygon-box"] as const)(
  "Shift makes %s square",
  (mode) => {
    const e = editor();
    e.setMode(mode);
    e.pending = [{ x: 2, y: 3 }];
    const p = e.drawingPoint({ x: -8, y: 7 }, true, true);
    expect(p).toEqual({ x: -8, y: 13 });
  },
);
test.each([
  "circle",
  "circle-two",
  "polygon",
  "ellipse-center",
  "arc",
  "arc-three",
  "curve",
  "control-curve",
] as const)("Shift constrains %s direction", (mode) => {
  const e = editor();
  e.setMode(mode);
  e.pending = [{ x: 0, y: 0 }];
  const p = e.drawingPoint({ x: 10, y: 8 }, true, true);
  expect(p.x).toBeCloseTo(p.y);
  expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.hypot(10, 8));
});

test.each(["rectangle", "rectangle-center"] as const)(
  "Shift couples one dimension in %s",
  (mode) => {
    const e = editor();
    e.setMode(mode);
    e.pending = [{ x: 0, y: 0 }];
    e.measurementLocks = { Width: 20 };
    const point = e.drawingPoint({ x: 30, y: 40 }, true, true);
    const p = e.constrainMeasurement(point);
    expect(Math.abs(p.x)).toBe(Math.abs(p.y));
    expect(p.x).toBe(mode === "rectangle-center" ? 10 : 20);
    e.measurementLocks.Height = 30;
    expect(e.constrainMeasurement(point).y).toBe(
      mode === "rectangle-center" ? 15 : 30,
    );
  },
);
test("Shift release refreshes rectangle without pointer movement", () => {
  const e = editor();
  e.setMode("rectangle");
  e.pending = [{ x: 0, y: 0 }];
  e.pointerMove(e.screen({ x: 30, y: 40 }), true, false, true);
  expect(e.cursor.x).toBe(e.cursor.y);
  e.setDrawingModifier(false);
  expect(e.cursor.x).toBeCloseTo(30);
  expect(e.cursor.y).toBeCloseTo(40);
});

test("ruler guideline persists after release with final modifier increments", async () => {
  const e = editor();
  e.rulers = true;
  e.objects = false;
  e.width = 800;
  e.height = 600;
  e.pan = { x: 0, y: 0 };
  e.zoom = 1;
  const idleUi = e.uiSnapshot();
  e.pointerDown({ x: 100, y: 10 }, 0, false, false);
  expect(e.uiSnapshot()).not.toBe(idleUi);
  const draggingUi = e.uiSnapshot();
  e.pointerMove({ x: 100, y: 123.4 }, false);
  expect(e.uiSnapshot()).toBe(draggingUi);
  expect(e.guideDrag?.coordinate).toBe(123);
  e.updateGuideModifiers(false, true, false);
  expect(e.guideDrag?.coordinate).toBe(120);
  e.updateGuideModifiers(false, false, true);
  expect(e.guideDrag?.coordinate).toBe(125);
  e.pointerUp({ x: 100, y: 127.3 }, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(e.document.guides?.[0].coordinate).toBe(127.3);
});

test("guideline snaps explain object alignment and clear feedback", () => {
  const e = editor();
  e.objects = true;
  e.zoom = 1;
  e.pan = { x: 0, y: 0 };
  e.document.shapes = [
    {
      id: "r",
      name: "Rectangle 1",
      kind: "rectangle",
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 200 },
      ],
      radius: 0,
      rotation: 0,
    },
  ];
  e.guideDrag = { id: "g", axis: "y", coordinate: 0 };
  e.pointerMove({ x: 500, y: 151 }, false);
  expect(e.guideSnapLabel).toBe("Horizontal center · Rectangle 1");
  expect(e.snapTarget?.y).toBe(150);
  e.updateGuideModifiers(true, false, false);
  expect(e.guideSnapLabel).toBe("");
  expect(e.snapTarget).toBeNull();
});

test.each(["x", "y"] as const)(
  "Shift changes %s guideline increments without refreshing the drawing preview",
  (axis) => {
    const e = editor();
    e.setMode("rectangle");
    e.objects = false;
    e.rulers = true;
    e.pan = { x: 0, y: 0 };
    e.zoom = 1;
    // Seed a previous drawing position, distinct from the guideline drag.
    e.pointerMove({ x: 40, y: 60 }, false);
    e.pointerDown(
      axis === "x" ? { x: 10, y: 100 } : { x: 100, y: 10 },
      0,
      false,
      false,
    );
    e.pointerMove({ x: 123.4, y: 123.4 }, false);
    expect(e.guideDrag?.coordinate).toBe(123);
    // Match Viewport's keydown/keyup order with a stationary pointer.
    for (const shift of [true, false, true]) {
      e.updateGuideModifiers(false, false, shift);
      e.setAnchorModifier(false);
      e.setDrawingModifier(shift);
      e.setMeasurementModifier(false);
      expect(e.guideDrag?.coordinate).toBe(shift ? 125 : 123);
      expect(e.pending).toEqual([]);
    }
  },
);

test("corner drag previews independently, survives Ctrl release and cancels", () => {
  const e = editor();
  e.document = {
    version: 7,
    shapes: [
      {
        id: "r",
        name: "Rectangle",
        kind: "rectangle",
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 20 },
        ],
        radius: 0,
        rotation: 0,
      },
    ],
  };
  e.selected = ["r"];
  expect(e.cornerHandles()).toHaveLength(0);
  e.transformTool = "corner";
  const h = e.cornerHandles()[0];
  e.pointerDown(e.screen(h.point), 0, false, false, true);
  expect(e.gesture?.kind).toBe("corner");
  e.setMeasurementModifier(false);
  e.pointerMove(
    e.screen({ x: h.point.x + 3, y: h.point.y + 3 }),
    false,
    false,
    false,
  );
  expect(e.preview?.shapes[0].cornerRadii?.[0]).toBeGreaterThan(0);
  expect(e.document.shapes[0].cornerRadii).toBeUndefined();
  e.pointerMove(
    e.screen({ x: h.point.x + 3, y: h.point.y + 3 }),
    true,
    false,
    true,
  );
  expect(e.preview?.shapes[0].cornerRadii).toBeUndefined();
  expect(e.preview?.shapes[0].radius).toBeCloseTo(10);
  e.cancel();
  expect(e.preview).toBeNull();
  expect(e.document.shapes[0].radius).toBe(0);
});

test("selecting a corner preserves a fractional radius without dragging", () => {
  const e = editor();
  e.document = {
    version: 7,
    shapes: [
      {
        id: "r",
        name: "Rectangle",
        kind: "rectangle",
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 20 },
        ],
        radius: 2.3,
        rotation: 0,
      },
    ],
  };
  e.selected = ["r"];
  e.transformTool = "corner";
  const h = e.cornerHandles()[0];
  e.pointerDown(e.screen(h.point), 0, false, false, true);
  e.updateCornerModifiers(false, false, false);
  expect(e.preview?.shapes[0].radius).toBeCloseTo(2.3);
  expect(e.preview?.shapes[0].cornerRadii).toBeUndefined();
  expect(e.selectedCorner).toEqual({ shapeId: "r", index: 0 });
  e.cancel();
});

test("corner tool accumulates edits and applies one undoable transaction", async () => {
  const e = editor();
  const doc: Doc = {
    version: 7,
    shapes: [
      {
        id: "r",
        name: "Rectangle",
        kind: "rectangle",
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 20 },
        ],
        radius: 0,
        rotation: 0,
      },
    ],
  };
  await e.transact("load", doc);
  e.selected = ["r"];
  await e.activateTransform("corner");
  e.selectedCorner = { shapeId: "r", index: 0 };
  e.setCornerValue(4);
  e.selectedCorner = { shapeId: "r", index: 1 };
  e.setCornerValue(6);
  expect(e.document.shapes[0].cornerRadii).toBeUndefined();
  expect(e.preview?.shapes[0].cornerRadii?.slice(0, 2)).toEqual([4, 6]);
  await e.applyTransform();
  expect(e.document.shapes[0].cornerRadii?.slice(0, 2)).toEqual([4, 6]);
  await e.transact("undo");
  expect(e.document.shapes[0].radius).toBe(0);
  expect(e.document.shapes[0].cornerRadii).toBeUndefined();
});

test("corner tool uses Ctrl over Shift and combines Alt with coarse steps", () => {
  const e = editor();
  e.document = {
    version: 7,
    shapes: [
      {
        id: "r",
        name: "Rectangle",
        kind: "rectangle",
        points: [
          { x: 0, y: 0 },
          { x: 200, y: 200 },
        ],
        radius: 0,
        rotation: 0,
      },
    ],
  };
  e.selected = ["r"];
  e.transformTool = "corner";
  const h = e.cornerHandles()[0],
    p = e.screen({ x: h.point.x + 2, y: h.point.y + 2 });
  e.pointerDown(e.screen(h.point), 0, false, false);
  e.pointerMove(p, false, false, false);
  expect(e.preview?.shapes[0].cornerRadii?.[0]).toBe(7);
  e.pointerMove(p, false, false, true);
  expect(e.preview?.shapes[0].cornerRadii?.[0]).toBe(5);
  e.pointerMove(p, false, true, true);
  expect(e.preview?.shapes[0].cornerRadii?.[0]).toBe(10);
  e.pointerMove(p, true, true, true);
  expect(e.preview?.shapes[0].radius).toBe(10);
  expect(e.preview?.shapes[0].cornerRadii).toBeUndefined();
  e.cancel();
  expect(e.document.shapes[0].radius).toBe(0);
});

test("stitch previews, master settings, split, deletion and undo use document transactions", async () => {
  const e = editor();
  await e.commit({
    ...emptyDocument(),
    shapes: [
      {
        id: "stitched",
        name: "Rounded",
        kind: "rectangle",
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 30 },
        ],
        radius: 8,
        rotation: 0,
      },
    ],
  });
  e.selected = ["stitched"];
  e.activateStitch();
  e.pointerMove(e.screen({ x: 0, y: 15 }), false);
  expect(e.stitchHover?.edges).toEqual(["rectangle:2:edge:0"]);
  expect(e.stitchGroups).toHaveLength(0);
  e.stitchClick({ x: 0, y: 15 }, false);
  await vi.waitFor(() => expect(e.stitchGroups).toHaveLength(1));
  const first = e.stitchGroups[0];
  e.setStitchSettings({ ...first.settings, style: "round", roundDiameter: 2.3, flatLength: 4.1 });
  expect(e.stitchGroups[0].settings.roundDiameter).toBe(2.3);
  e.setStitchSettings({ ...e.stitchGroups[0].settings, roundDiameter: 3.2 });
  expect(e.stitchGroups[0].settings.roundDiameter).toBe(3.2);
  expect(e.stitchGroups[0].settings.flatLength).toBe(4.1);
  e.setStitchSettings({ ...first.settings, spacing: 5, style: "japanese" });
  expect(e.stitchGroups[0].settings.spacing).toBe(5);
  e.setStitchSettings({ ...first.settings, spacing: 5, style: "japanese" });
  await e.applyStitch();
  e.activateStitch();
  e.stitchClick({ x: 2.34314575, y: 2.34314575 }, false);
  await vi.waitFor(() => expect(e.stitchGroups).toHaveLength(2));
  e.stitchSelected = [first.id, e.stitchGroups[1].id];
  await e.mergeStitches();
  expect(e.stitchGroups).toHaveLength(1);
  expect(e.stitchGroups[0].edges).toHaveLength(2);
  expect(e.stitchGroups[0].settings.spacing).toBe(5);
  await e.splitStitches();
  expect(e.stitchGroups).toHaveLength(2);
  expect(e.stitchGroups.every((g) => g.settings.style === "japanese")).toBe(
    true,
  );
  await e.applyStitch();
  e.cancel();
  await e.commit({ ...e.document, shapes: [] });
  expect(e.stitchGroups).toHaveLength(0);
  await e.transact("undo");
  expect(e.stitchGroups).toHaveLength(2);
});

test("a stitched loop can open at a junction, split again, and duplicate with its source", async () => {
  const e = editor();
  const shape = {
    id: "loop",
    name: "Loop",
    kind: "rectangle" as const,
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 30 },
    ],
    radius: 8,
    rotation: 0,
  };
  const { stitchEdges, stitchGeometry, insideStitchSide } =
    await import("../model/stitchGeometry");
  const { defaultStitchSettings } = await import("../model/stitch");
  const g = {
    id: "loop-stitch",
    shapeId: shape.id,
    edges: stitchEdges(shape).map((e) => e.key),
    side: insideStitchSide(shape),
    settings: { ...defaultStitchSettings },
    closed: true,
  };
  await e.commit({ ...emptyDocument(), shapes: [shape], stitchGroups: [g] });
  e.selected = [shape.id];
  e.activateStitch();
  e.stitchSelected = [g.id];
  await e.splitStitches(3);
  expect(e.stitchGroups).toHaveLength(1);
  expect(e.stitchGroups[0].closed).toBe(false);
  expect(e.stitchGroups[0].edges[0]).toBe(g.edges[3]);
  expect(stitchGeometry(e.document.shapes[0], e.stitchGroups[0]).closed).toBe(
    false,
  );
  await e.splitStitches(2);
  expect(e.stitchGroups).toHaveLength(2);
  await e.applyStitch();
  e.duplicate();
  await vi.waitFor(() => expect(e.document.shapes).toHaveLength(2));
  expect(e.stitchGroups).toHaveLength(4);
  expect(new Set(e.stitchGroups.map((g) => g.id)).size).toBe(4);
  expect(
    e.stitchGroups.filter((g) => g.shapeId === e.document.shapes[1].id),
  ).toHaveLength(2);
});

test("Shift placement joins both matching neighbors and refuses conflicting settings", async () => {
  const e = editor();
  const { stitchEdges, insideStitchSide } =
    await import("../model/stitchGeometry");
  const { defaultStitchSettings } = await import("../model/stitch");
  const shape = {
    id: "auto",
    name: "Auto",
    kind: "rectangle" as const,
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 30 },
    ],
    radius: 8,
    rotation: 0,
  };
  const keys = stitchEdges(shape).map((e) => e.key);
  const base = {
    shapeId: shape.id,
    side: insideStitchSide(shape),
    settings: { ...defaultStitchSettings },
    closed: false,
  };
  await e.commit({
    ...emptyDocument(),
    shapes: [shape],
    stitchGroups: [
      { ...base, id: "first", edges: [keys[0]] },
      { ...base, id: "second", edges: [keys[2]] },
    ],
  });
  const target = { ...base, id: "preview", edges: [keys[1]] };
  const joined = e.stitchPlacement(target, true);
  expect(joined.next.edges).toEqual(keys.slice(0, 3));
  expect(joined.absorbed).toHaveLength(2);
  expect(e.stitchPlacement(target, false).absorbed).toHaveLength(0);
  await e.commit({
    ...e.document,
    stitchGroups: e.stitchGroups.map((g) =>
      g.id === "second" ? { ...g, settings: { ...g.settings, spacing: 5 } } : g,
    ),
  });
  expect(() => e.stitchPlacement(target, true)).toThrow("different settings");
  expect(e.stitchGroups).toHaveLength(2);
});

test("stitch session cancel restores the original and apply commits once", async () => {
  const e = editor();
  const shape = {
    id: "session",
    name: "Session",
    kind: "rectangle" as const,
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 30 },
    ],
    radius: 0,
    rotation: 0,
  };
  await e.commit({ ...emptyDocument(), shapes: [shape] });
  const revision = e.revision;
  e.selected = [shape.id];
  e.activateStitch();
  e.stitchClick({ x: 0, y: 15 }, false);
  await vi.waitFor(() => expect(e.stitchGroups).toHaveLength(1));
  expect(e.revision).toBe(revision);
  e.cancel();
  expect(e.stitchGroups).toHaveLength(0);
  e.activateStitch();
  e.stitchClick({ x: 0, y: 15 }, false);
  await vi.waitFor(() => expect(e.stitchGroups).toHaveLength(1));
  await e.applyStitch();
  expect(e.stitchMode).toBe(true);
  expect(e.revision).toBe(revision + 1);
  expect(e.stitchGroups).toHaveLength(1);
  await e.transact("undo");
  expect(e.stitchGroups).toHaveLength(0);
});

test("rounded stitch preview survives repeated radius changes and cancels atomically", async () => {
  const e = editor();
  const shape = {
    id: "rounded",
    name: "Rounded",
    kind: "rectangle" as const,
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 30 },
    ],
    radius: 0,
    rotation: 0,
  };
  const { defaultStitchSettings } = await import("../model/stitch");
  await e.commit({
    ...emptyDocument(),
    shapes: [shape],
    stitchGroups: [
      {
        id: "g",
        shapeId: shape.id,
        edges: [0, 1, 2, 3].map((i) => `rectangle:2:edge:${i}`),
        side: 1,
        closed: true,
        settings: { ...defaultStitchSettings },
      },
    ],
  });
  e.selected = [shape.id];
  await e.activateTransform("corner");
  e.selectedCorner = { shapeId: shape.id, index: 0 };
  for (const radius of [8, 0, 10, 8]) {
    e.setCornerValue(radius, true);
    expect(e.transformError).toBe("");
    expect(e.preview?.stitchGroups?.[0].edges).toHaveLength(radius ? 8 : 4);
  }
  e.cancel();
  expect(e.stitchGroups[0].edges).toHaveLength(4);
  await e.activateTransform("corner");
  e.selectedCorner = { shapeId: shape.id, index: 0 };
  e.setCornerValue(8, true);
  await e.applyTransform();
  expect(e.stitchGroups[0].edges).toHaveLength(8);
  await e.transact("undo");
  expect(e.stitchGroups[0].edges).toHaveLength(4);
});

test("visible stitch paths select at large inset and zoom without a selected parent", async () => {
  const e = editor();
  const { defaultStitchSettings } = await import("../model/stitch");
  await e.commit({
    ...emptyDocument(),
    shapes: [
      {
        id: "pick",
        name: "Pick",
        kind: "rectangle",
        points: [
          { x: 0, y: 0 },
          { x: 80, y: 60 },
        ],
        radius: 0,
        rotation: 0,
      },
    ],
    stitchGroups: [
      {
        id: "row",
        shapeId: "pick",
        edges: ["rectangle:2:edge:0"],
        side: 1,
        closed: false,
        settings: { ...defaultStitchSettings, inset: 10 },
      },
    ],
  });
  e.zoom = 10;
  e.selected = [];
  expect(e.stitchLineAt({ x: 10, y: 30 })?.id).toBe("row");
  e.pointerDown(e.screen({ x: 10, y: 30 }), 0, false, false);
  expect(e.stitchMode).toBe(true);
  expect(e.stitchSelected).toEqual(["row"]);
  expect(e.selected).toEqual(["pick"]);
  e.stitchClick({ x: 10, y: 30 }, true);
  expect(e.stitchSelected).toEqual([]);
  e.stitchClick({ x: 10, y: 30 }, false);
  expect(e.stitchSelected).toEqual(["row"]);
});

test("stitch placement accepts a wider screen-space distance at every zoom", async () => {
  const e = editor();
  await e.commit({
    ...emptyDocument(),
    shapes: [
      {
        id: "wide",
        name: "Wide",
        kind: "line",
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        radius: 0,
        rotation: 0,
      },
    ],
  });
  e.selected = ["wide"];
  e.activateStitch();
  for (const zoom of [1, 3, 10]) {
    e.zoom = zoom;
    expect(e.stitchTarget({ x: 50, y: 20 / zoom })?.id).toBe("preview");
    expect(e.stitchTarget({ x: 50, y: 20 / zoom })?.side).toBe(1);
    expect(e.stitchTarget({ x: 50, y: -20 / zoom })?.side).toBe(-1);
    expect(e.stitchTarget({ x: 50, y: 26 / zoom })).toBeNull();
  }
  e.stitchClick({ x: 50, y: 20 / e.zoom }, false);
  await vi.waitFor(() => expect(e.stitchGroups).toHaveLength(1));
});

test("delayed recovery excludes pending stitching and inspector edits cannot change its source", async () => {
  vi.useFakeTimers();
  const e = editor();
  const shape = {
    id: "safe",
    name: "Safe",
    kind: "line" as const,
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ],
    radius: 0,
    rotation: 0,
  };
  await e.commit({ ...emptyDocument(), shapes: [shape] });
  e.selected = [shape.id];
  e.activateStitch();
  e.stitchClick({ x: 20, y: 0 }, false);
  expect(e.stitchGroups).toHaveLength(1);
  await e.edit(shape.id, { name: "Changed" });
  expect(e.document.shapes[0].name).toBe("Safe");
  await vi.advanceTimersByTimeAsync(301);
  const { recovery } = await import("./persistence");
  expect(
    vi.mocked(recovery).mock.calls.at(-1)?.[0]?.document.stitchGroups,
  ).toEqual([]);
  e.cancel();
});

test("path conversion cancels or commits as one transaction", async () => {
  const e = editor();
  await e.commit({
    ...emptyDocument(),
    shapes: [
      {
        id: "p",
        name: "Path",
        kind: "polyline",
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 30 },
        ],
        radius: 0,
        rotation: 0,
      },
    ],
  });
  e.selected = ["p"];
  e.activateStitch();
  await e.convertPathToStitch();
  expect(e.document.shapes[0].stitchOnly).toBe(true);
  expect(e.stitchGroups[0].edges).toHaveLength(2);
  expect(e.stitchGroups[0].settings.inset).toBe(0);
  e.cancel();
  expect(e.document.shapes[0].stitchOnly).toBeUndefined();
  expect(e.stitchGroups).toHaveLength(0);
  e.activateStitch();
  await e.convertPathToStitch();
  await e.applyStitch();
  expect(parseProject(JSON.stringify(e.document)).shapes[0].stitchOnly).toBe(
    true,
  );
  await e.transact("undo");
  expect(e.document.shapes[0].stitchOnly).toBeUndefined();
  expect(e.stitchGroups).toHaveLength(0);
});

test("trim activation and cancellation update the toolbar subscription", () => {
  const e = editor();
  const initial = e.uiSnapshot();
  e.activateTrim();
  expect(e.trimMode).toBe(true);
  const active = e.uiSnapshot();
  expect(active).not.toBe(initial);
  e.pointerMove({ x: 100, y: 100 }, false);
  expect(e.uiSnapshot()).toBe(active);
  e.cancel();
  expect(e.trimMode).toBe(false);
  expect(e.uiSnapshot()).not.toBe(active);
});

test("mirror activation waits for a target and cancellation clears the preview", async () => {
  const e = editor();
  e.document.shapes = [shape];
  e.selected = [shape.id];
  const original = JSON.stringify(e.document);
  await e.activateTransform("mirror");
  expect(e.preview).toBeNull();
  expect(e.transformValid).toBe(false);
  e.setMirrorAxis("x");
  expect(e.preview).not.toBeNull();
  expect(JSON.stringify(e.document)).toBe(original);
  e.cancel();
  expect(e.preview).toBeNull();
  expect(e.mirrorAxis).toBeNull();
  expect(JSON.stringify(e.document)).toBe(original);
});

test("stitch links combine equal counts and prune after unlink or deletion", async () => {
  const e = editor();
  const shapes = ["a", "b", "c"].map((id, i) => ({
    id, name: id, kind: "line" as const,
    points: [{x: 0, y: i * 20}, {x: 40, y: i * 20}],
    radius: 0, rotation: 0,
  }));
  await e.commit({...emptyDocument(), shapes, stitchGroups: shapes.map(s => ({
    id: s.id, shapeId: s.id, edges: ["line:2:edge:0"], side: 1,
    settings: {style: "round", spacing: 4, inset: 0, alignment: "center"}, closed: false,
  }))});
  e.stitchSelected = ["a", "b"];
  await e.linkStitches();
  expect(e.document.stitchLinks).toEqual([{id: 1, members: ["a", "b"]}]);
  e.stitchSelected = ["b", "c"];
  await e.linkStitches();
  expect(e.document.stitchLinks?.[0].members.sort()).toEqual(["a", "b", "c"]);
  e.stitchSelected = ["a"];
  await e.linkStitches(true);
  expect(e.document.stitchLinks?.[0].members.sort()).toEqual(["b", "c"]);
  e.stitchSelected = ["b"];
  await e.deleteStitches();
  expect(e.document.stitchLinks).toEqual([]);
});

test("linking rejects unequal hole counts without changing memberships", async () => {
  const e = editor();
  const shapes = ["a", "b"].map((id, i) => ({
    id, name: id, kind: "line" as const,
    points: [{x: 0, y: i * 20}, {x: 40 + i * 20, y: i * 20}],
    radius: 0, rotation: 0,
  }));
  await e.commit({...emptyDocument(), shapes, stitchGroups: shapes.map(s => ({
    id: s.id, shapeId: s.id, edges: ["line:2:edge:0"], side: 1,
    settings: {style: "round", spacing: 4, inset: 0, alignment: "center"}, closed: false,
  }))});
  e.stitchSelected = ["a", "b"];
  expect(e.stitchLinkReason).toContain("same number");
  await e.linkStitches();
  expect(e.stitchError).toContain("same number");
  expect(e.document.stitchLinks).toEqual([]);
});

test("selected stitching reports pair differences and ignores no-op unlink", async () => {
  const e = editor();
  const shapes = ["a", "b", "c"].map((id, i) => ({
    id, name: id, kind: "line" as const,
    points: [{x: 0, y: i * 20}, {x: 40 + i * 4, y: i * 20}], radius: 0, rotation: 0,
  }));
  await e.commit({...emptyDocument(), shapes, stitchGroups: shapes.map(s => ({
    id: s.id, shapeId: s.id, edges: ["line:2:edge:0"], side: 1, closed: false,
    settings: {style: "round", spacing: 4, inset: 0, alignment: "center"},
  }))});
  e.stitchSelected = ["a"];
  expect(e.canUnlinkStitches).toBe(false);
  expect(e.stitchHoleInfo).toBe("11 holes");
  const commit = vi.spyOn(e, "commit");
  await e.linkStitches(true);
  expect(commit).not.toHaveBeenCalled();
  await e.commit({...e.document, stitchLinks: [{id: 1, members: ["a", "b"]}]});
  expect(e.canUnlinkStitches).toBe(true);
  expect(e.stitchHoleInfo).toBe("11 holes · 1 missing");
  e.stitchSelected = ["b"];
  expect(e.stitchHoleInfo).toBe("12 holes · 1 too many");
  await e.commit({...e.document, stitchLinks: [{id: 1, members: ["a", "b", "c"]}]});
  expect(e.stitchHoleInfo).toBe("12 holes");
});

test("renaming disconnects files and requires saving without changing geometry", () => {
  const e = editor();
  const document = e.document;
  e.files.handle = { name: e.name };
  e.rename("  Wallet  ");
  expect(e.name).toBe("Wallet.leather.json");
  expect(e.files.handle).toBeNull();
  expect(e.dirty).toBe(true);
  expect(e.document).toBe(document);
  e.rename(" ");
  expect(e.name).toBe("Wallet.leather.json");
  e.fileBusy = true;
  e.rename("Other");
  expect(e.name).toBe("Wallet.leather.json");
});

test('merge previews, cancels, and commits one selected object', async () => {
  const e = editor();
  const shape = (id: string, x: number) => ({id, name:id, kind:'rectangle' as const, points:[{x,y:0},{x:x+10,y:10}], radius:0, rotation:0});
  await e.commit({...e.document, shapes:[shape('a',0),shape('b',5)]});
  e.selected = ['a','b'];
  const original = JSON.stringify(e.document);
  e.activateMerge();
  expect(e.preview?.shapes).toHaveLength(1);
  expect(JSON.stringify(e.document)).toBe(original);
  e.cancel();
  expect(e.preview).toBeNull();
  expect(e.selected).toEqual(['a','b']);
  e.activateMerge();
  await e.applyTrim();
  expect(e.document.shapes).toHaveLength(1);
  expect(e.selected).toEqual(['a']);
  await e.transact('undo');
  expect(e.document.shapes).toHaveLength(2);
});

test("rectangle corner dragging converts only on commit and can be cancelled", async () => {
  const e = editor();
  e.setMode("rectangle");
  e.addPoint({ x: 0, y: 0 });
  e.addPoint({ x: 40, y: 30 });
  await vi.waitFor(() => expect(e.revision).toBe(1));
  e.setMode("select");
  const corner = e.handles().find(h => h.vertex === 0)!;
  e.pointerDown(e.screen(corner.point), 0, false, true);
  e.pointerUp();
  expect(e.document.shapes[0].kind).toBe("rectangle");
  e.pointerDown(e.screen(corner.point), 0, false, true);
  e.pointerMove(e.screen({ x: -10, y: -5 }), true);
  expect(e.preview!.shapes[0].kind).toBe("polyline");
  e.cancel();
  expect(e.document.shapes[0].kind).toBe("rectangle");
  e.pointerDown(e.screen(corner.point), 0, false, true);
  e.pointerMove(e.screen({ x: -10, y: -5 }), true);
  e.pointerUp();
  await vi.waitFor(() => expect(e.revision).toBe(2));
  expect(e.document.shapes[0].points[0]).toEqual({ x: -10, y: -5 });
  expect(e.document.shapes[0].points[4]).toEqual({ x: -10, y: -5 });
});

test("curved trim previews cancel, accumulate and commit as one undo step", async () => {
  const e = editor();
  const circle = {
    id: "circle",
    name: "Circle",
    kind: "circle" as const,
    points: [
      { x: 40, y: 40 },
      { x: 60, y: 40 },
    ],
    radius: 0,
    rotation: 0,
  };
  const line = {
    id: "cut",
    name: "Cut",
    kind: "line" as const,
    points: [
      { x: 40, y: 10 },
      { x: 40, y: 70 },
    ],
    radius: 0,
    rotation: 0,
  };
  const { stitchEdges } = await import("../model/stitchGeometry");
  await e.commit({
    ...emptyDocument(),
    shapes: [circle, line],
    stitchGroups: [
      {
        id: "stitch",
        shapeId: circle.id,
        edges: stitchEdges(circle).map((edge) => edge.key),
        side: 1,
        closed: true,
        settings: { style: "round", spacing: 4, inset: 2, alignment: "center" },
      },
    ],
  });
  const original = JSON.stringify(e.document);
  e.activateTrim();
  e.pointerMove(e.screen({ x: 60, y: 40 }), false);
  expect(e.trimHighlight!.length).toBeGreaterThan(2);
  const beforeCut = e.uiSnapshot();
  e.pointerDown(e.screen({ x: 60, y: 40 }), 0, false, false);
  expect(e.uiSnapshot()).not.toBe(beforeCut);
  expect(e.trimDraft!.shapes[0].kind).toBe("arc");
  expect(e.trimDraft!.stitchGroups ?? []).toHaveLength(0);
  const validDraft = e.uiSnapshot();
  e.transformError = "Invalid geometry";
  expect(e.uiSnapshot()).not.toBe(validDraft);
  e.transformError = "";
  expect(JSON.stringify(e.document)).toBe(original);
  e.cancel();
  expect(JSON.stringify(e.document)).toBe(original);
  e.activateTrim();
  e.pointerDown(e.screen({ x: 60, y: 40 }), 0, false, false);
  e.pointerDown(e.screen({ x: 20, y: 40 }), 0, false, false);
  expect(e.trimDraft!.shapes).toHaveLength(1);
  await e.applyTrim();
  expect(e.document.shapes).toHaveLength(1);
  await e.transact("undo");
  expect(JSON.stringify(e.document)).toBe(original);
});

test("Trim synchronizes drawing mode and hides removed selection handles", async () => {
  const e = editor();
  await e.commit({
    ...emptyDocument(),
    shapes: [
      {
        id: "c",
        name: "Circle",
        kind: "circle",
        points: [
          { x: 40, y: 40 },
          { x: 60, y: 40 },
        ],
        radius: 0,
        rotation: 0,
      },
    ],
  });
  e.setMode("circle");
  e.selected = ["c"];
  e.activateTrim();
  expect(e.mode).toBe("select");
  expect(e.tool).toBe("select");
  e.pointerDown(e.screen({ x: 60, y: 40 }), 0, false, false);
  expect(e.active).toHaveLength(0);
  expect(e.handles()).toEqual([]);
  e.cancel();
  expect(e.active).toHaveLength(1);
  expect(e.mode).toBe("select");
  e.activateTrim();
  e.pointerDown(e.screen({ x: 60, y: 40 }), 0, false, false);
  await e.applyTrim();
  expect(e.selected).toEqual([]);
  expect(e.mode).toBe("select");
});

test("clipboard preserves cursor offsets across viewports and snapshots copied geometry", async () => {
  const source = editor();
  await source.commit({ version: 11, shapes: [{
    id: "source", name: "Original", kind: "rectangle",
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }], radius: 0, rotation: 0,
  }] });
  source.selected = ["source"];
  source.pointerMove(source.screen({ x: 5, y: 7 }), false);
  const text = source.copyObjects()!;
  source.document.shapes[0].points[0].x = 99;
  const target = editor();
  target.pan = { x: -35, y: 82 };
  target.zoom = 7;
  target.pointerMove(target.screen({ x: -2.5, y: 12.5 }), false);
  await target.pasteObjects(text);
  expect(target.document.shapes[0].points).toEqual([
    { x: 2.5, y: 25.5 }, { x: 22.5, y: 45.5 },
  ]);
  expect(target.selected).toEqual([target.document.shapes[0].id]);
  expect(target.selected[0]).not.toBe("source");
  await target.pasteObjects(text);
  expect(target.document.shapes).toHaveLength(2);
  expect(target.document.shapes[1].id).not.toBe(target.document.shapes[0].id);
  await target.transact("undo");
  expect(target.document.shapes).toHaveLength(1);
});
test("clipboard ignores unrelated text and requires an idle canvas pointer", async () => {
  const e = editor();
  expect(e.copyObjects()).toBeNull();
  e.pointerMove({ x: 100, y: 100 }, false);
  await e.pasteObjects("ordinary text");
  expect(e.document.shapes).toHaveLength(0);
  e.leavePointer();
  expect(e.canUseClipboard).toBe(false);
  e.pointerMove({ x: 100, y: 100 }, false);
  e.busy = true;
  expect(e.canUseClipboard).toBe(false);
});

test("group tree moves reject stale revisions and grouping preserves effective locks", async () => {
  const e = editor();
  await e.commit({ version: 13, shapes: ["a", "b"].map((id, i) => ({ id, name: id, kind: "rectangle", points: [{x: i * 20,y: 0}, {x: i * 20 + 10,y: 10}], radius: 0, rotation: 0 })) });
  e.selected = ["a", "b"];
  const id = await e.newGroup(true);
  expect(id).toBeTruthy();
  expect(e.tree).toHaveLength(1);
  await e.toggleGroupState(id!, "locked");
  expect(e.selectionLocked).toBe(true);
  const revision = e.revision;
  await e.movePanelItems(["a"], null, 0, revision - 1);
  expect(e.revision).toBe(revision);
  await e.movePanelItems(["a"], null, 0);
  expect(e.isLocked("a")).toBe(false);
  expect(e.isLocked("b")).toBe(true);
  await e.ungroup(id!);
  expect(e.isLocked("b")).toBe(false);
});

test("clipboard round trips nested and empty groups with unlocked copies", async () => {
  const source = editor();
  await source.commit({ version: 13, shapes: [{ id: "a", name: "A", kind: "rectangle", points: [{x: 0,y: 0}, {x: 10,y: 10}], radius: 0, rotation: 0 }] });
  source.selected = ["a"];
  const inner = await source.newGroup(true);
  const outer = await source.newGroup(true);
  await source.toggleGroupState(outer!, "locked");
  source.pointerMove({x: 100,y: 100}, false);
  const text = source.copyObjects()!;
  const target = editor(); target.pointerMove({x: 200,y: 200}, false);
  await target.pasteObjects(text);
  expect(target.tree[0].kind).toBe("group");
  const copied = target.tree[0];
  if (copied.kind !== "group") throw Error("Expected copied group");
  expect(copied.id).not.toBe(outer);
  expect(copied.locked).toBe(false);
  expect(copied.children[0].kind).toBe("group");
  expect(target.document.shapes).toHaveLength(1);
  expect(target.selectionLocked).toBe(false);
  const empty = editor();
  await empty.newGroup();
  empty.pointerMove({x: 100,y: 100}, false);
  await target.pasteObjects(empty.copyObjects()!);
  expect(target.tree).toHaveLength(2);
  expect(target.tree[0]).toHaveProperty("children", []);
});

test("group deletion is atomic and duplication preserves subtrees", async () => {
  const e = editor();
  await e.commit({ version: 13, shapes: ["a", "b"].map((id, i) => ({ id, name: id, kind: "rectangle", points: [{x: i * 20,y: 0}, {x: i * 20 + 10,y: 10}], radius: 0, rotation: 0 })) });
  e.selected = ["a", "b"];
  const group = await e.newGroup(true);
  await e.toggleGroupState(group!, "locked");
  e.delete();
  await e.transactionQueue;
  expect(e.document.shapes).toHaveLength(2);
  await e.duplicate();
  expect(e.tree).toHaveLength(2);
  expect(e.document.shapes).toHaveLength(4);
  const copied = e.tree[0];
  expect(copied.kind).toBe("group");
  expect(e.selectedGroups).toEqual([]);
  if (copied.kind !== "group") throw Error("Expected group");
  e.selectGroup(copied.id);
  expect(e.selectionLocked).toBe(false);
  e.delete(); await e.transactionQueue;
  expect(e.document.shapes).toHaveLength(2);
  expect(e.tree).toHaveLength(1);
});

test("hidden group outlines are excluded from mirror references", async () => {
  const e = editor();
  await e.commit({ version: 13, shapes: [{ id: "r", name: "Rectangle", kind: "rectangle", points: [{x: 20,y: 20}, {x: 100,y: 70}], radius: 0, rotation: 0 }] });
  e.selected = ["r"];
  const group = await e.newGroup(true);
  e.transformOriginal = e.document;
  expect(e.mirrorTargetAt({x: 20,y: 40})?.axis).toBe("edge");
  await e.toggleGroupState(group!, "hidden");
  expect(e.mirrorTargetAt({x: 20,y: 40})?.axis).not.toBe("edge");
});

test("outline tools reject text without cancelling and allow mixed selections", () => {
  const e = editor();
  e.document.shapes = [{ ...shape, id: "text", kind: "text", text: "Label" }, shape];
  e.selected = ["text"];
  e.transformTool = "move";
  expect(e.canTrim).toBe(false);
  expect(e.canStitch).toBe(false);
  e.activateTrim();
  e.activateStitch();
  expect(e.transformTool).toBe("move");
  expect(e.trimMode).toBe(false);
  expect(e.stitchMode).toBe(false);
  expect(e.canUndo).toBe(false);
  e.selected = ["text", shape.id];
  expect(e.canTrim).toBe(true);
  expect(e.canStitch).toBe(true);
  e.document = {
    ...e.document,
    shapes: e.document.shapes.map((s) =>
      s.id === shape.id ? { ...s, locked: true } : s,
    ),
  };
  expect(e.canTrim).toBe(false);
  expect(e.canStitch).toBe(false);
});

test('measurement commits once after three points and supports exact signed offset and cancellation', async () => {
  const e = editor();
  e.setMode('measurement');
  e.addPoint({x:0,y:0});
  e.addPoint({x:40,y:0});
  expect(e.document.shapes).toHaveLength(0);
  expect(e.measurementFields).toEqual(['Offset']);
  e.measurementLocks.Offset = -15;
  e.addPoint({x:20,y:50});
  await vi.waitFor(() => expect(e.document.shapes).toHaveLength(1));
  expect(e.document.shapes[0].measurementOffset).toBe(-15);
  await e.transact('undo');
  expect(e.document.shapes).toHaveLength(0);
  e.addPoint({x:0,y:0});
  e.addPoint({x:0,y:0});
  expect(e.pending).toHaveLength(1);
  e.cancel();
  expect(e.pending).toHaveLength(0);
  expect(e.document.shapes).toHaveLength(0);
});

test("indicators support both placement gestures and one undo step", async () => {
  for (const mode of ["arrow", "arrow-head", "crosshair", "size-square", "size-ruler"] as const) {
    for (const drag of [false,true]) {
      const e=editor(); e.setMode(mode);
      const a={x:100,y:100}, b={x:200,y:180};
      e.pointerDown(a,0,false,false);
      if (drag) { e.pointerMove(b,false,false); e.pointerUp(b); }
      else { e.pointerUp(a); e.pointerMove(b,false,false); e.pointerDown(b,0,false,false); e.pointerUp(b); }
      await vi.waitFor(()=>expect(e.document.shapes).toHaveLength(1));
      expect(e.document.shapes[0].kind).toBe(mode);
      expect(e.mode).toBe(mode);
      await e.transact("undo");
      expect(e.document.shapes).toHaveLength(0);
    }
  }
});

test("cancel and switching modes discard pending indicators",()=>{
  const e=editor(); e.setMode("crosshair");
  e.pointerDown({x:100,y:100},0,false,false); e.pointerUp();
  expect(e.pending).toHaveLength(1);
  e.cancel(); expect(e.pending).toHaveLength(0);
  e.pointerDown({x:100,y:100},0,false,false); e.pointerUp();
  e.setMode("size-ruler");
  expect(e.pending).toHaveLength(0); expect(e.document.shapes).toHaveLength(0);
});

test("square guides constrain numeric resizing for the whole selection", async()=>{
  const e=editor(); e.setMode("size-square");
  e.finish([{x:0,y:0},{x:20,y:10}]);
  await vi.waitFor(()=>expect(e.document.shapes).toHaveLength(1));
  e.setMode("select");
  e.selected=[e.document.shapes[0].id];
  await e.activateTransform("scale");
  e.setTransformValues({sx:2});
  expect(e.transformValues.sx).toBe(2);
  expect(e.transformValues.sy).toBe(2);
  expect(e.transformError).toBe("");
  expect(e.canTrim).toBe(false); expect(e.canStitch).toBe(false);
});

test("measurement tool angles snap in eight directions without changing square placement",()=>{
  const e=editor();
  for (const mode of ["arrow","arrow-head","crosshair","size-ruler","measurement"] as const) {
    e.setMode(mode); e.pending=[{x:10,y:20}];
    for(let i=0;i<8;i++) {
      const angle=i*Math.PI/4+0.1;
      const p=e.drawingPoint({x:10+30*Math.cos(angle),y:20+30*Math.sin(angle)},true,true);
      expect(p.x).toBeCloseTo(10+30*Math.cos(i*Math.PI/4));
      expect(p.y).toBeCloseTo(20+30*Math.sin(i*Math.PI/4));
    }
    const raw={x:37,y:29};
    expect(e.drawingPoint(raw,true,false)).toEqual(raw);
  }
  e.setMode("measurement"); e.pending=[{x:0,y:0},{x:20,y:10}];
  expect(e.drawingPoint({x:30,y:18},true,true)).toEqual({x:30,y:18});
});

test("initialization accepts the current worker document version", async () => {
  const e = new Controller();
  await e.initialize();
  expect(e.ready).toBe(true);
  expect(e.document.version).toBe(emptyDocument().version);
  expect(e.message).not.toContain("expects document version");
});

test("initialization rejects a stale worker document version", async () => {
  const e = new Controller();
  vi.spyOn(e.core, "request").mockResolvedValue({document:{...emptyDocument(),version:15},revision:0,canUndo:false,canRedo:false});
  await e.initialize();
  expect(e.ready).toBe(false);
  expect(e.message).toContain("expects document version 21, but geometry worker returned 15");
});

test("unit preferences leave document, grid and history unchanged", () => {
  const e = editor();
  const document = JSON.stringify(e.document), revision = e.revision, dirty = e.dirty;
  const grid = e.gridSize;
  for (const units of ["in-fractional", "in-decimal", "mm"] as const) {
    const before = e.uiSnapshot();
    e.units = units;
    e.preferences();
    expect(e.uiSnapshot()).not.toBe(before);
    expect(JSON.stringify(e.document)).toBe(document);
    expect(e.revision).toBe(revision);
    expect(e.dirty).toBe(dirty);
    expect(e.gridSize).toBe(grid);
  }
});

test("annotation selection bounds and reset pivots follow displayed units", async () => {
  const { construct } = await import("./construction");
  const { bounds } = await import("../model/geometry");
  for (const kind of ["measurement", "size-ruler"] as const) {
    const e = editor();
    const shape = { ...construct(kind, [{x:0,y:0},{x:50.8,y:0},{x:10,y:12}]), id: "annotation", name: "Annotation" };
    e.document = { ...emptyDocument(), shapes: [shape] };
    e.selected = [shape.id];
    for (const units of ["mm", "in-fractional", "in-decimal"] as const) {
      e.units = units;
      const expected = bounds([shape], units);
      expect(e.selectionBounds).toEqual(expected);
      e.resetPivot();
      expect(e.transformPivot).toEqual({x:expected.x + expected.width/2, y:expected.y + expected.height/2});
    }
  }
});

test("selection tools require idle drawing and a committed selection", () => {
  const e = editor();
  e.setTool("rectangle");
  expect(e.selectionToolsAvailable).toBe(false);
  e.selected = ["shape"];
  expect(e.selectionToolsAvailable).toBe(true);
  e.pending = [{ x: 0, y: 0 }];
  expect(e.selectionToolsAvailable).toBe(false);
  e.pending = [];
  e.drawingDown = { pixel: { x: 0, y: 0 }, point: { x: 0, y: 0 }, initial: true };
  expect(e.selectionToolsAvailable).toBe(false);
  e.drawingDown = null;
  e.busy = true;
  expect(e.selectionToolsAvailable).toBe(false);
});

test('print view commits preserve sources across worker serialization and reject geometry edits', async()=>{
 const e=new Controller();await e.initialize();
 await e.commit({...e.document,shapes:[{id:'source',name:'Source',kind:'rectangle',points:[{x:0,y:0},{x:40,y:20}],radius:0,rotation:0}]});
 e.printLayoutActive=true;
 const print={id:'layout',name:'A4',width:210,height:297,margin:10,units:'mm' as const,pages:[{column:0,row:0}],instances:[],tree:[]};
 expect(await e.commit({...e.document,printLayouts:[print]})).toBe(true);
 expect(await e.commit({...e.document,shapes:e.document.shapes.map(s=>({...s,radius:2}))})).toBe(false);
 expect(e.document.shapes[0].radius).toBe(0);
});

test('print overflow rejects a source edit without a partial document or history entry',async()=>{
 const e=new Controller();await e.initialize();
 const shape={id:'source',name:'Source',kind:'rectangle' as const,points:[{x:0,y:0},{x:40,y:20}],radius:0,rotation:0};
 await e.commit({...e.document,shapes:[shape],printLayouts:[{id:'layout',name:'A4',width:210,height:297,margin:10,units:'mm',pages:[{column:0,row:0}],instances:[{id:'copy',sourceId:'source',x:95,y:100,rotation:0}]}]});
 const original=e.document,revision=e.revision;
 expect(await e.commit({...original,shapes:[{...shape,points:[{x:0,y:0},{x:1e6,y:1e6}]}]})).toBe(false);
 expect(e.document).toEqual(original);expect(e.revision).toBe(revision);expect(e.message).toContain('500');
});

test("Fit restores the default view on an empty grid without changing history", () => {
  const e = editor();
  const initial = { zoom: e.zoom, pan: { ...e.pan } };
  const document = e.document;
  const notify = vi.spyOn(e, "notify");
  e.wheel({ x: 400, y: 300 }, 0, -500, true);
  e.wheel({ x: 400, y: 300 }, 120, 160, false);
  notify.mockClear();
  e.fit();
  expect({ zoom: e.zoom, pan: e.pan }).toEqual(initial);
  expect(notify).toHaveBeenCalled();
  expect(e.document).toBe(document);
  expect(e.canUndo).toBe(false);
});

test.each([1, 2, 5])("panning preserves tools and selection for %i objects", (count) => {
  const e = editor();
  e.selected = Array.from({ length: count }, (_, i) => String(i));
  e.selectedGroups = ["group"];
  const selection = [...e.selected];
  const document = e.document;
  const revision = e.revision;
  for (const space of [false, true]) {
    e.space = space;
    e.pointerDown({ x: 300, y: 300 }, space ? 0 : 1, false, false);
    expect(e.selectionToolsAvailable).toBe(true);
    e.pointerMove({ x: 320, y: 330 }, false);
    expect(e.selectionToolsAvailable).toBe(true);
    e.pointerUp();
    expect(e.selectionToolsAvailable).toBe(true);
    expect(e.selected).toEqual(selection);
    expect(e.selectedGroups).toEqual(["group"]);
  }
  expect(e.document).toBe(document);
  expect(e.revision).toBe(revision);
});

function runFixture() {
  const shape: import("../model/project").Shape={id:"run-source",name:"Source",kind:"line",points:[{x:0,y:5},{x:100,y:5}],radius:0,rotation:0};
  const group: import("../model/stitchGeometry").StitchGroup={id:"counted",shapeId:shape.id,edges:["line:2:edge:0"],side:1,closed:false,settings:{style:"round",roundDiameter:.8,spacing:3.38,inset:0,alignment:"start",startClearance:0,endClearance:0,holeCount:2}};
  return {shape,group};
}

test("counted continuations move together, freeze after preceding-run deletion, and cancel atomically",async()=>{
 const e=editor(), {shape,group}=runFixture();
 await e.commit({version:20,shapes:[shape],stitchGroups:[group]});
 const revision=e.revision;
 e.activateStitch(); e.stitchSelected=[group.id];
 await e.continueStitchRun();
 const second=e.stitchGroups[1];
 expect(e.stitchGeometry(shape,second).distances[0]).toBeCloseTo(6.76);
 e.setContinuationGap(5);
 await vi.waitFor(()=>expect(e.stitchGroups[1].continuation?.gap).toBe(5));
 e.stitchSelected=[group.id];
 e.setStitchSettings({...group.settings,holeCount:3});
 expect(e.stitchGeometry(shape,e.stitchGroups[1]).distances[0]).toBeCloseTo(11.76);
 await e.deleteStitches();
 expect(e.stitchGroups).toHaveLength(1);
 expect(e.stitchGroups[0].continuation).toBeUndefined();
 expect(e.stitchGeometry(shape,e.stitchGroups[0]).distances[0]).toBeCloseTo(11.76);
 expect(e.revision).toBe(revision);
 e.escapeStitch();
 expect(e.stitchMode).toBe(true);
 expect(e.stitchGroups).toHaveLength(1);
 expect(e.stitchGroups[0].id).toBe(group.id);
});

test("receiving-layer registration, detach, save and undo preserve hole positions",async()=>{
 const e=editor(), {shape,group}=runFixture();
 const receiver: import("../model/project").Shape={id:"receiving",name:"Receiving",kind:"rectangle",points:[{x:200,y:0},{x:250,y:20}],radius:0,rotation:0};
 await e.commit({version:20,shapes:[shape,receiver],stitchGroups:[group]});
 e.activateStitch(); e.stitchSelected=[group.id];
 e.beginStitchTransfer();
 e.updateStitchTransfer({x:250,y:5},true);
 e.stitchTransferPlacement!.phase="placed";
 await e.placeStitchTransfer();
 expect(e.document.stitchTransfers).toHaveLength(1);
 const id=e.document.stitchTransfers![0].id;
 await e.removeStitchTransfer(id,true);
 expect(e.document.stitchTransfers).toHaveLength(0);
 const detached=e.stitchGroups.find(g=>g.id!==group.id)!;
 const guide=e.document.shapes.find(s=>s.id===detached.shapeId)!;
 expect(guide.stitchParentId).toBe(receiver.id);
 expect(detached.holes).toBeUndefined();
 expect(e.stitchGeometry(guide,detached).holes[0].point.x).toBeCloseTo(200);
 await e.applyStitch();
 await e.transact("undo");
 expect(e.document.stitchTransfers).toHaveLength(1);
 expect(e.stitchGroups).toHaveLength(1);
});

test("Shift-click selects multiple individual holes without changing line settings",async()=>{
 const e=editor(), {shape,group}=runFixture();
 await e.commit({version:20,shapes:[shape],stitchGroups:[group]});
 e.activateStitch();
 e.stitchClick({x:0,y:5},false,false,true);
 e.stitchClick({x:3.38,y:5},true,false,true);
 expect(e.stitchHoleNumbers).toEqual([1,2]);
 e.stitchClick({x:0,y:5},true,false,true);
 expect(e.stitchHoleNumbers).toEqual([2]);
 expect(e.stitchGroups[0].settings).toEqual(group.settings);
});

test("a failed Apply retains the staged stitching session for correction",async()=>{
 const e=editor(), {shape,group}=runFixture();
 await e.commit({version:20,shapes:[shape],stitchGroups:[group]});
 e.activateStitch(); e.stitchSelected=[group.id];
 e.setStitchSettings({...group.settings,holeCount:3});
 const baseline=e.stitchOriginal;
 e.message="Worker refused the operation";
 vi.spyOn(e,"commit").mockResolvedValueOnce(false);
 await e.applyStitch();
 expect(e.stitchMode).toBe(true);
 expect(e.stitchOriginal).toBe(baseline);
 expect(e.stitchGroups[0].settings.holeCount).toBe(3);
 expect(e.stitchError).toContain("Worker refused");
});

test("Alt replaces, Alt+Shift adds object stitching, and transfer rejects multiple source pieces",async()=>{
 const e=editor(),{shape,group}=runFixture();
 const other={...shape,id:"other",points:[{x:0,y:25},{x:100,y:25}]};
 const second={...group,id:"other-line",shapeId:other.id};
 await e.commit({version:21,shapes:[shape,other],stitchGroups:[group,second]});
 e.activateStitch();e.stitchSelected=[second.id];
 e.stitchClick({x:50,y:5},false,true);
 expect(e.stitchSelected).toEqual([group.id]);
 e.stitchClick({x:50,y:25},true,true);
 expect(e.stitchSelected).toEqual([group.id,second.id]);
 expect(e.transferStitchReason).toContain("one source piece");
});

test("transfer preview rotates with shared modifiers and places all eligible pieces in one transaction",async()=>{
 const e=editor(),{shape,group}=runFixture();
 const pieces=["backing","lining"].map(id=>({id,name:id,kind:"rectangle" as const,points:[{x:200,y:0},{x:300,y:20}],radius:0,rotation:0}));
 await e.commit({version:21,shapes:[shape,...pieces],stitchGroups:[group]});
 const revision=e.revision;
 e.activateStitch();e.stitchSelected=[group.id];e.beginStitchTransfer();
 e.updateStitchTransfer({x:250,y:10},true);
 const pixel=e.screen({x:250,y:10});
 e.wheel(pixel,0,-100,true,{ctrlKey:true,altKey:true});
 expect(e.stitchTransferPlacement?.angle).toBe(0);
 expect(e.zoom).toBeGreaterThan(3);
 e.wheel(pixel,0,100,true,{ctrlKey:true,altKey:true});
 expect(e.stitchTransferPlacement?.angle).toBe(0);
 expect(e.stitchTransferPreview.transfers).toHaveLength(2);
 e.stitchTransferPlacement!.phase="placed";
 await e.placeStitchTransfer();
 expect(e.document.stitchTransfers).toHaveLength(2);
 expect(e.revision).toBe(revision+1);
 expect(e.stitchTransferPlacement).toBeNull();
 expect(e.message).toContain("backing");expect(e.message).toContain("lining");
 await e.transact("undo");expect(e.document.stitchTransfers ?? []).toHaveLength(0);
});

test("Ctrl-click picks the painted area of a large hole at high zoom",async()=>{
 const e=editor(),{shape,group}=runFixture();group.settings.roundDiameter=5;
 await e.commit({version:21,shapes:[shape],stitchGroups:[group]});e.zoom=100;
 e.activateStitch();e.stitchClick({x:-2.4,y:5},false,false,true);
 expect(e.stitchHoleSelection).toEqual([{groupId:group.id,number:1}]);
});

test("a rejected transfer keeps staged edits and the preview without committing history",async()=>{
 const e=editor(),{shape,group}=runFixture();
 const target={id:"target",name:"Target",kind:"rectangle" as const,points:[{x:200,y:0},{x:300,y:20}],radius:0,rotation:0};
 const other={...group,id:"not-selected",settings:{...group.settings,inset:3,startClearance:30}};
 await e.commit({version:21,shapes:[shape,target],stitchGroups:[group,other]});
 e.activateStitch();e.stitchSelected=[group.id];e.setStitchSettings({...group.settings,holeCount:3});
 e.beginStitchTransfer();e.updateStitchTransfer({x:250,y:10},true);
 expect(e.stitchTransferPreview.transfers.map(t=>t.masterId)).toEqual([group.id]);
 const revision=e.revision,baseline=e.stitchOriginal;
 const request=e.core.request.bind(e.core);
 vi.spyOn(e.core,"request").mockImplementation((op,...args)=>op==="commit" ? Promise.reject(Error("Worker refused")) : request(op,...args));
 e.stitchTransferPlacement!.phase="placed";
 await e.placeStitchTransfer();
 expect(e.revision).toBe(revision);expect(e.stitchTransferPlacement).not.toBeNull();
 expect(e.stitchOriginal).toBe(baseline);expect(e.stitchGroups[0].settings.holeCount).toBe(3);
 expect(e.document.stitchTransfers ?? []).toHaveLength(0);
});

test("copying a receiver retains editable detached guides and remaps their parent",async()=>{
 const {detachTransfer,makeTransfer}=await import("../model/stitchLayers");
 const source=editor(),{shape,group}=runFixture();
 const receiver={id:"receiver",name:"Receiver",kind:"rectangle" as const,points:[{x:200,y:0},{x:300,y:20}],radius:0,rotation:0};
 const doc:Doc={version:21,shapes:[shape,receiver],stitchGroups:[group]};
 const detached=detachTransfer(doc,makeTransfer(doc,group.id,receiver,{x:250,y:10},0,"placement"));
 await source.commit({...doc,shapes:[...doc.shapes,...detached.shapes],stitchGroups:[group,...detached.groups]});
 source.selected=[receiver.id];source.pointerMove(source.screen({x:200,y:0}),false);
 const copied=source.copyObjects()!;
 const target=editor();target.pointerMove(target.screen({x:0,y:0}),false);
 await target.pasteObjects(copied);
 expect(target.document.shapes).toHaveLength(2);
 const guide=target.document.shapes.find(s=>s.stitchParentId)!;
 const piece=target.document.shapes.find(s=>s.id===guide.stitchParentId)!;
 expect(piece.id).not.toBe(receiver.id);
 const run=target.stitchGroups[0];expect(run.holes).toBeUndefined();
 expect(target.stitchGeometry(guide,run).holes[0].point.x).toBeCloseTo(0);
 expect(target.stitchGeometry(guide,{...run,settings:{...run.settings,spacing:4}}).holes[1].point.x).toBeCloseTo(4);
});

test("contextual tools preview, switch without history, and apply once",async()=>{
 const e=editor(),{shape,group}=runFixture();
 const other={...shape,id:"other",points:[{x:0,y:25},{x:100,y:25}]};
 const second={...group,id:"second",shapeId:other.id};
 await e.commit({version:21,shapes:[shape,other],stitchGroups:[group,second]});
 const revision=e.revision;
 e.activateStitch();e.stitchSelected=[group.id,second.id];
 await e.activateStitchTool("link");
 expect(e.stitchTool).toBe("link");expect(e.document.stitchLinks).toHaveLength(1);
 expect(e.revision).toBe(revision);
 await e.activateStitchTool("delete");
 expect(e.document.stitchLinks ?? []).toHaveLength(0);expect(e.stitchGroups).toHaveLength(0);
 expect(e.revision).toBe(revision);
 e.cancelStitchOperation();expect(e.stitchGroups).toHaveLength(2);expect(e.stitchTool).toBeNull();
 expect(e.stitchSelected).toEqual([group.id,second.id]);
 await e.activateStitchTool("link");await e.applyStitch();
 expect(e.revision).toBe(revision+1);expect(e.stitchTool).toBeNull();
 expect(e.stitchMode).toBe(true);expect(e.document.stitchLinks).toHaveLength(1);
 await e.transact("undo");expect(e.document.stitchLinks ?? []).toHaveLength(0);
});

test("switching tools drops dimensions, while selecting an active tool keeps its preview",async()=>{
 const e=editor(),{shape,group}=runFixture();
 await e.commit({version:21,shapes:[shape],stitchGroups:[group]});
 e.activateStitch();e.stitchSelected=[group.id];e.setStitchSettings({...group.settings,spacing:4});
 await e.activateStitchTool("line");expect(e.stitchGroups[0].settings.spacing).toBe(4);
 await e.activateStitchTool("continue");expect(e.stitchGroups[0].settings.spacing).toBe(3.38);
 expect(e.stitchGroups).toHaveLength(2);expect(e.stitchTool).toBe("continue");
 e.cancelStitchOperation();expect(e.stitchGroups).toHaveLength(1);
 expect(e.stitchToolReason("split")).toContain("full-length");
});

test("split preview changes rebuild from the unsplit baseline and failed Apply retains the tool",async()=>{
 const e=editor();
 const shape={id:"path",name:"Path",kind:"polyline" as const,points:[{x:0,y:0},{x:50,y:0},{x:50,y:50},{x:100,y:50}],radius:0,rotation:0};
 const {stitchEdges}=await import("../model/stitchGeometry");
 const {group}=runFixture();
 const merged={...group,shapeId:shape.id,edges:stitchEdges(shape).map(e=>e.key),settings:{...group.settings,holeCount:undefined}};
 await e.commit({version:21,shapes:[shape],stitchGroups:[merged]});
 e.activateStitch();e.stitchSelected=[group.id];await e.activateStitchTool("split");
 expect(e.stitchGroups).toHaveLength(3);
 e.stitchSplitMethod="junction";e.stitchSplitJunction=1;await e.previewStitchOperation();
 expect(e.stitchGroups).toHaveLength(2);
 const request=e.core.request.bind(e.core);
 vi.spyOn(e.core,"request").mockImplementation((op,...args)=>op==="commit" ? Promise.reject(Error("Refused")) : request(op,...args));
 await e.applyStitch();expect(e.stitchTool).toBe("split");expect(e.stitchGroups).toHaveLength(2);
 expect(e.stitchError).toContain("Refused");
 e.cancelStitchOperation();expect(e.stitchGroups).toHaveLength(1);
});

test("a geometry exception leaves the contextual operation cancellable without partial state",async()=>{
 const e=editor(),{shape,group}=runFixture();
 await e.commit({version:21,shapes:[shape],stitchGroups:[group]});
 const revision=e.revision;e.activateStitch();e.stitchSelected=[group.id];
 vi.spyOn(e,"deleteStitches").mockRejectedValueOnce(Error("Invalid continuation geometry"));
 await e.activateStitchTool("delete");
 expect(e.stitchError).toContain("Invalid continuation geometry");
 expect(e.stitchTool).toBe("delete");expect(e.stitchToolPending).toBe(false);
 expect(e.canApplyStitchTool).toBe(false);expect(e.stitchGroups).toHaveLength(1);expect(e.revision).toBe(revision);
 e.cancelStitchOperation();expect(e.stitchError).toBe("");expect(e.stitchSelected).toEqual([group.id]);
});

test("merge accepts three lines in selection order and refuses a disconnected intermediate chain",async()=>{
 const {stitchEdges}=await import("../model/stitchGeometry");
 const {defaultStitchSettings}=await import("../model/stitch");
 const e=editor();
 const shape={id:"multi",name:"Multi",kind:"polyline" as const,points:[{x:0,y:0},{x:50,y:0},{x:50,y:50},{x:100,y:50}],radius:0,rotation:0};
 const groups=stitchEdges(shape).map((edge,i)=>({id:`line${i}`,shapeId:shape.id,edges:[edge.key],side:1 as const,closed:false,settings:{...defaultStitchSettings,inset:0}}));
 await e.commit({version:21,shapes:[shape],stitchGroups:groups});
 e.activateStitch();e.stitchSelected=groups.map(g=>g.id);await e.activateStitchTool("merge");
 expect(e.stitchError).toBe("");expect(e.stitchGroups).toHaveLength(1);expect(e.stitchGroups[0].edges).toHaveLength(3);
 e.cancelStitchOperation();e.stitchSelected=[groups[0].id,groups[2].id,groups[1].id];
 await e.activateStitchTool("merge");expect(e.stitchError).toMatch(/connected/);expect(e.stitchGroups).toHaveLength(3);
});

test("transfer preview and render document reuse one immutable result per pose",async()=>{
 const e=editor(),{shape,group}=runFixture();
 const receiver={id:"receiver",name:"Receiver",kind:"rectangle" as const,points:[{x:200,y:0},{x:300,y:20}],radius:0,rotation:0};
 await e.commit({version:21,shapes:[shape,receiver],stitchGroups:[group]});
 e.activateStitch();e.stitchSelected=[group.id];e.beginStitchTransfer();e.updateStitchTransfer({x:250,y:10},true);
 const preview=e.stitchTransferPreview,render=e.stitchTransferRenderDocument;
 for(let i=0;i<100;i++){expect(e.stitchTransferPreview).toBe(preview);expect(e.stitchTransferRenderDocument).toBe(render);}
 e.updateStitchTransfer({x:251,y:10},true);expect(e.stitchTransferPreview).not.toBe(preview);
 expect(e.stitchTransferPreview.transfers[0].id).toBe(preview.transfers[0].id);
});

test("Continue run stages an invalid default gap for correction and keeps Auto available",async()=>{
 const e=editor(),{shape,group}=runFixture();group.settings.holeCount=2;
 group.settings.spacing=40;
 await e.commit({version:21,shapes:[shape],stitchGroups:[group]});e.activateStitch();e.stitchSelected=[group.id];
 await e.activateStitchTool("continue");
 expect(e.stitchGroups).toHaveLength(2);e.setContinuationGap(100);expect(e.stitchError).not.toBe("");
 e.setContinuationGap(5);await vi.waitFor(()=>expect(e.stitchError).toBe(""));
 const continued=e.stitchGroups[1];e.setStitchSettings({...continued.settings,spacing:5,holeCount:undefined});
 expect(e.stitchError).toBe("");expect(e.stitchGeometry(shape,e.stitchGroups[1]).holes.length).toBeGreaterThan(1);
});

test("pointer bursts coalesce and a cancelled placement rejects queued input",async()=>{
 const e=editor(),{shape,group}=runFixture();await e.commit({version:21,shapes:[shape],stitchGroups:[group]});
 e.activateStitch();e.stitchSelected=[group.id];e.beginStitchTransfer();
 const callbacks:FrameRequestCallback[]=[];vi.stubGlobal("requestAnimationFrame",(cb:FrameRequestCallback)=>{callbacks.push(cb);return 1;});
 try {
  e.queueStitchTransferPointer({x:20,y:20},true);e.queueStitchTransferPointer({x:30,y:30},true);
  expect(callbacks).toHaveLength(1);callbacks.shift()!(0);expect(e.stitchTransferPlacement?.center).toEqual({x:30,y:30});
  e.queueStitchTransferPointer({x:40,y:40},true);e.cancelStitchOperation();callbacks.shift()!(0);expect(e.stitchTransferPlacement).toBeNull();
 }finally{vi.unstubAllGlobals();}
});

test("transfer left-click stages, freezes and repositions without history until Apply",async()=>{
 const e=editor(),{shape,group}=runFixture();
 const receiver={id:"receiver",name:"Receiver",kind:"rectangle" as const,points:[{x:200,y:0},{x:300,y:30}],radius:0,rotation:0};
 await e.commit({version:21,shapes:[shape,receiver],stitchGroups:[group]});const revision=e.revision;
 e.activateStitch();e.stitchSelected=[group.id];e.beginStitchTransfer();
 expect(e.canApplyStitchTool).toBe(false);
 await e.placeStitchTransfer();expect(e.revision).toBe(revision);expect(e.stitchTransferPlacement?.phase).toBe("hover");
 e.stitchClick({x:250,y:10},false,true);expect(e.stitchTransferPlacement?.phase).toBe("placed");
 expect(e.revision).toBe(revision);expect(e.document.stitchTransfers ?? []).toHaveLength(0);
 e.queueStitchTransferPointer({x:50,y:50},true);expect(e.stitchTransferPlacement?.center).toEqual({x:250,y:10});
 e.wheel({x:10,y:10},0,100,false,{altKey:true});expect(e.stitchTransferPlacement?.center).toEqual({x:250,y:10});
 const angle=e.stitchTransferPlacement!.angle;e.wheel({x:50,y:50},0,-100,true);
 expect(e.stitchTransferPlacement?.angle).toBe(angle);expect(e.stitchTransferPlacement?.center).toEqual({x:250,y:10});
 e.stitchClick({x:255,y:15},false,true);expect(e.document.stitchTransfers ?? []).toHaveLength(0);
 await e.applyStitch();expect(e.revision).toBe(revision+1);expect(e.document.stitchTransfers).toHaveLength(1);
});

test("Auto-filled rectangle sections cannot start Continue run",async()=>{
 const e=editor(),{group}=runFixture();
 const shape={id:"rectangle",name:"Rectangle",kind:"rectangle" as const,points:[{x:0,y:0},{x:100,y:40}],radius:0,rotation:0};
 await e.commit({version:21,shapes:[shape],stitchGroups:[{...group,shapeId:shape.id,edges:["rectangle:2:edge:1"],settings:{...group.settings,inset:3,holeCount:undefined}}]});
 e.activateStitch();e.stitchSelected=[group.id];expect(e.stitchToolReason("continue")).toContain("fixed hole count");
 await e.activateStitchTool("continue");expect(e.stitchGroups).toHaveLength(1);
});

test("focus loss preserves construction points and locks without committing", () => {
  const e = editor();
  e.pending = [{ x: 10, y: 20 }];
  const pending = e.pending;
  e.measurementLocks = { width: 25 };
  const revision = e.revision;
  e.space = true;
  e.drawingShift = true;
  e.pauseGesture();
  e.pauseGesture();
  e.pointerUp();
  expect(e.pending).toBe(pending);
  expect(e.measurementLocks).toEqual({ width: 25 });
  expect(e.revision).toBe(revision);
  expect(e.space).toBe(false);
  expect(e.drawingShift).toBe(false);
});

test("focus loss preserves stitching sessions and their draft", () => {
  const e = editor();
  e.activateStitch();
  const original = e.stitchOriginal;
  const draft = e.stitchDraft;
  e.pauseGesture();
  expect(e.stitchMode).toBe(true);
  expect(e.stitchOriginal).toBe(original);
  expect(e.stitchDraft).toBe(draft);
});

test("a rejected property preview cannot overwrite the status after its field commits", async () => {
  const e = editor();
  await e.commit({ version: 5, shapes: [shape] });
  let rejectPreview!: (error: Error) => void;
  const request = e.core.request.bind(e.core);
  vi.spyOn(e.core, "request").mockImplementation((op, revision, next) =>
    op === "preview"
      ? new Promise((_, reject) => { rejectPreview = reject; })
      : request(op, revision, next),
  );
  e.beginProperty();
  const preview = e.edit("a", { rotation: 20 });
  await e.finishProperty();
  const message = e.message;
  rejectPreview(Error("Stale document revision"));
  await preview;
  expect(e.message).toBe(message);
  expect(e.document.shapes[0].rotation).toBe(20);
  expect(e.preview).toBeNull();
});


test("measurement drag sets endpoints without committing, including release without movement events", async () => {
  for (const move of [false, true]) {
    const e = editor();
    e.setMode("measurement");
    const a = {x:100,y:100}, b = {x:200,y:100};
    e.pointerDown(a,0,false,false);
    if (move) {
      e.pointerMove(b,false);
      expect(e.pending).toHaveLength(1);
      expect(e.constructionPreview).not.toBeNull();
    }
    e.pointerUp(b);
    expect(e.pending).toHaveLength(2);
    expect(e.measurementFields).toEqual(["Offset"]);
    expect(e.document.shapes).toHaveLength(0);
    e.measurementLocks.Offset = 12;
    e.confirmMeasurement();
    await vi.waitFor(() => expect(e.document.shapes).toHaveLength(1));
    expect(e.document.shapes[0].measurementOffset).toBe(12);
    await e.transact("undo");
    expect(e.document.shapes).toHaveLength(0);
  }
});

test("measurement short clicks and cancelled drags leave no committed shapes", () => {
  const e = editor();
  e.setMode("measurement");
  e.pointerDown({x:100,y:100},0,false,false);
  e.pointerUp({x:101,y:100});
  expect(e.pending).toHaveLength(1);
  e.cancel();
  e.pointerDown({x:100,y:100},0,false,false);
  e.pointerMove({x:200,y:150},false);
  e.cancel();
  e.pointerUp({x:200,y:150});
  expect(e.pending).toHaveLength(0);
  expect(e.document.shapes).toHaveLength(0);
});
