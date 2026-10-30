import { beforeEach, expect, test, vi } from "vitest";
const editor = vi.hoisted(() => ({
  space: false,
  tool: "select",
  selected: ["a"],
  transformTool: null,
  mode: "select",
  cycle: vi.fn(),
  activateTransform: vi.fn(),
  fit: vi.fn(),
  setTool: vi.fn(),
  save: vi.fn(),
}));
vi.mock("../editor/instance", () => ({ editor }));
import { handleShortcut } from "./shortcuts";
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
