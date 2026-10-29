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
    version: 4,
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
test("polyline double click adds no closing anchors and rejects short paths", async () => {
  vi.useFakeTimers();
  const e = editor();
  e.setMode("polyline");
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
});
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
  e.document = { version: 4, shapes: [shape] };
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
    e.document = { version: 4, shapes: [shape] };
    e.selected = ["a"];
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
    await e.transactionQueue;
    expect(e.revision).toBe(1);
  },
);
test("live property changes commit once, cancel restores, queued fields retain latest changes", async () => {
  const e = editor();
  await e.commit({ version: 4, shapes: [shape] });
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
  e.document = { version: 4, shapes: [shape] };
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
  await e.commit({ version: 4, shapes: [shape] });
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
  await e.commit({ version: 4, shapes: [shape] });
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
    version: 4,
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
  e.pointerDown(e.screen({ x: 10, y: 0 }), 0, false, false);
  e.pointerMove(e.screen({ x: 69, y: 0 }), false);
  expect(e.preview!.shapes[0].points[1].x).toBeCloseTo(100);
  e.cancel();
  expect(e.document.shapes[0].points[1].x).toBe(40);
});
test("saved baseline follows undo and cancelled/failed saves", async () => {
  const e = editor();
  await e.commit({ version: 4, shapes: [shape] });
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
  await e.commit({ version: 4, shapes: [shape] });
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
  e.document = { shapes: [], version: 4 };
  e.notify();
  expect(e.dirty).toBe(false);
});
