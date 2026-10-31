import { beforeEach, expect, test, vi } from "vitest";
const editor = vi.hoisted(() => ({
  space: false,
  tool: "select",
  selected: ["a"],
  transformTool: null,
  mode: "select",
  cycle: vi.fn(),
  activateTransform: vi.fn(),
  activateStitch: vi.fn(),
  activateTrim: vi.fn(),
  activateMerge: vi.fn(),
  fit: vi.fn(),
  setTool: vi.fn(),
  save: vi.fn(),
  duplicate: vi.fn(),
  canUseClipboard: true,
  copyObjects: vi.fn(() => "clipboard snapshot"),
  pasteObjects: vi.fn(),
}));
vi.mock("../editor/instance", () => ({ editor }));
import { handleShortcut, handleClipboard } from "./shortcuts";
// The dispatcher only needs element identity and closest() for its focus guard.
class ElementStub {
  constructor(
    public tagName = "CANVAS",
    private editable = false,
  ) {}
  closest() {
    return this.editable ? this : null;
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("HTMLElement", ElementStub);
  vi.stubGlobal("document", { querySelector: () => null });
});
function press(key: string, overrides: Record<string, unknown> = {}) {
  const event = {
    key,
    code: key,
    target: new ElementStub(),
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    getModifierState: () => false,
    preventDefault: vi.fn(),
    ...overrides,
  };
  handleShortcut(event as unknown as KeyboardEvent, vi.fn());
  return event;
}
test("all groups cycle forward and backward with a selection", () => {
  for (const [key, group] of [
    ["r", "rectangle"],
    ["c", "circle"],
    ["p", "polyline"],
    ["h", "polygon"],
  ]) {
    press(key);
    expect(editor.cycle).toHaveBeenLastCalledWith(group, 1);
    press(key, { shiftKey: true });
    expect(editor.cycle).toHaveBeenLastCalledWith(group, -1);
  }
  expect(editor.activateTransform).not.toHaveBeenCalled();
});
test("E rotates and browser Find does not fit", () => {
  press("e");
  expect(editor.activateTransform).toHaveBeenCalledWith("rotate");
  press("f", { ctrlKey: true });
  expect(editor.fit).not.toHaveBeenCalled();
  press("F", { shiftKey: true });
  expect(editor.fit).toHaveBeenCalledWith(true);
});
test("controls, composition, repeats and handled events suppress tools", () => {
  for (const overrides of [
    { target: new ElementStub("BUTTON") },
    { target: new ElementStub("INPUT", true) },
    { isComposing: true },
    { repeat: true },
    { defaultPrevented: true },
    { altKey: true },
  ])
    press("r", overrides);
  expect(editor.cycle).not.toHaveBeenCalled();
});

test("native clipboard writes snapshots and leaves text fields alone", () => {
  const clipboardData = { setData: vi.fn(), getData: vi.fn(() => '{"format":"leather-pattern-designer-clipboard"}') };
  const event = {
    type: "copy", target: new ElementStub(), clipboardData,
    defaultPrevented: false, preventDefault: vi.fn(),
  };
  handleClipboard(event as unknown as ClipboardEvent);
  expect(clipboardData.setData).toHaveBeenCalledWith("text/plain", "clipboard snapshot");
  handleClipboard({ ...event, type: "paste" } as unknown as ClipboardEvent);
  expect(editor.pasteObjects).toHaveBeenCalledOnce();
  vi.clearAllMocks();
  handleClipboard({ ...event, target: new ElementStub("INPUT", true) } as unknown as ClipboardEvent);
  expect(editor.copyObjects).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});

test("I stitches, K trims, J merges, and M still mirrors", () => {
  press("i");
  press("k");
  press("j");
  press("m");
  expect(editor.activateStitch).toHaveBeenCalledOnce();
  expect(editor.activateTrim).toHaveBeenCalledOnce();
  expect(editor.activateMerge).toHaveBeenCalledOnce();
  expect(editor.activateTransform).toHaveBeenCalledWith("mirror");
});

test("selection tool shortcuts respect focus, modifiers and selection", () => {
  for (const key of ["i", "k", "j"]) {
    for (const overrides of [
      { target: new ElementStub("INPUT", true) },
      { target: new ElementStub("BUTTON") },
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { repeat: true },
      { isComposing: true },
      { defaultPrevented: true },
    ]) press(key, overrides);
  }
  editor.selected = [];
  for (const key of ["i", "k", "j"]) press(key);
  editor.selected = ["a"];
  editor.tool = "rectangle";
  for (const key of ["i", "k", "j"]) press(key);
  editor.tool = "select";
  expect(editor.activateStitch).not.toHaveBeenCalled();
  expect(editor.activateTrim).not.toHaveBeenCalled();
  expect(editor.activateMerge).not.toHaveBeenCalled();
});

test("D selects Measurement without taking over text fields or modified shortcuts", () => {
  press("d");
  expect(editor.cycle).toHaveBeenLastCalledWith("indicator", 1);
  vi.clearAllMocks();
  press("d", { target: new ElementStub("INPUT", true) });
  press("d", { ctrlKey: true });
  press("d", { metaKey: true });
  expect(editor.setTool).not.toHaveBeenCalled();
  expect(editor.duplicate).toHaveBeenCalledTimes(2);
});
