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
  recovery: async () => undefined,
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
  Object.assign(e.files, { save: vi.fn(async () => "downloaded") });
  await e.save();
  expect(e.dirty).toBe(false);
  await e.edit("a", { name: "Changed" });
  expect(e.dirty).toBe(true);
  await e.transact("undo");
  expect(e.dirty).toBe(false);
  await e.edit("a", { name: "Again" });
  Object.assign(e.files, { save: vi.fn(async () => "cancelled") });
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
  let finish!: (v: string) => void;
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
  finish("downloaded");
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
  expect(e.handles()).toEqual([]);
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
    incoming: { x: -20, y: -30 },
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

test("Alt-click inserts once in Select and ignores empty space and existing anchors", async () => {
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
  e.pointerDown(e.screen({ x: 50, y: 100 }), 0, false, true);
  expect(e.gesture).toBeNull();
  expect(e.revision).toBe(2);
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
  e.smart = true;
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
  e.smart = false;
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
  e.smart = false;
  e.width = 800;
  e.height = 600;
  e.pan = { x: 0, y: 0 };
  e.zoom = 1;
  e.pointerDown({ x: 100, y: 10 }, 0, false, false);
  e.pointerMove({ x: 100, y: 123.4 }, false);
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
  e.smart = false;
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
    e.smart = false;
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
