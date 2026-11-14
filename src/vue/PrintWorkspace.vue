<script setup lang="ts">
import ToolObjectPicker from "./ToolObjectPicker.vue";
import { objectSelection } from "../model/objectSelection";
import PivotSelector from "./PivotSelector.vue";
import { automaticPivot, type PivotMode } from "../model/pivot";
import ToolRail from "./ToolRail.vue";
import RailButton from "./RailButton.vue";
const appVersion = __APP_VERSION__;
import { Controller } from "../editor/controller";
import { printDocument, applyPrintDocument } from "../model/printDocument";
import { parseProject } from "../model/project";
import { decodeImageFile } from "../editor/imageImport";
import ToolButton from "./ToolButton.vue";
import ModeIcon from "./ModeIcon.vue";
import Viewport from "./Viewport.vue";
import Inspector from "./Inspector.vue";
import ConstructionMeasurements from "./ConstructionMeasurements.vue";
import { drawAnnotation } from "../editor/annotationRenderer";
import FitIcon from "./FitIcon.vue";
import {
  drawRotationGizmo,
  drawPivotPoint,
  drawTransformReadout,
  hitsTransformShaft,
} from "../editor/transformUi";
import { snapCandidates, smartSnap } from "../editor/snapping";
import LengthInput from "./LengthInput.vue";
import ReorderSlot from "./ReorderSlot.vue";
import ReorderFloating from "./ReorderFloating.vue";
import { useReorderDrag, type ReorderDragState } from "./useReorderDrag";
import {
  reorderRoots,
  reorderIds,
  reorderLocation,
  reorderChildren,
  reorderPreview,
  type ReorderDestination,
} from "../model/reorder";
import { movePrintTree } from "../model/printReorder";
import ObjectPreview from "./ObjectPreview.vue";
import LinkIcon from "./LinkIcon.vue";
const hoverPreview = ref<{ id?: string; x: number; y: number }>({ x: 0, y: 0 });
function previewRow(event: PointerEvent, id: string) {
  if (event.buttons) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  hoverPreview.value = { id, x: rect.left, y: rect.top };
}
import {
  computed,
  ref,
  shallowRef,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
} from "vue";
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuPortal,
  ContextMenuContent,
  ContextMenuItem,
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import {
  paperFormats,
  printableSize,
  validatePrintLayouts,
  printArtworkBounds,
  printTree,
  printRows,
  sourceNodes,
  sourceShapeIds,
  findSource,
  importPrintNode,
  unlinkPrintNode,
  resolvedPrintItems,
  printDescendants,
  editPrintTree,
  removePrintNodes,
  transformPrintNodes,
  mirrorPrintNodes,
  resolvePrintShape,
  type PrintLayout,
  type PrintNode,
} from "../model/printLayout";
import {
  bounds,
  hitTest,
  contains,
  boundary,
  distanceToSegment,
} from "../model/geometry";
import { pageSvg, printShapeSvg } from "../editor/printScene";
import { svgImage, selfContainedSvg } from "../editor/printExport";
import type { Point } from "../model/project";
import type { ObjectNode } from "../model/objectTree";
import {
  formatLength,
  parseLength,
  editableLength,
  type UnitMode,
} from "../model/units";
import PrintExport from "./PrintExport.vue";
import PanelSection from "./PanelSection.vue";
import type { SmartGuide } from "../editor/snapping";
import {
  snapRotation,
  unwrapRotation,
  snapRigidMove,
} from "../editor/rigidTransform";
import {
  pageKey,
  pageContents,
  numberedPages,
  deletePrintPages,
  movePrintPage,
} from "../model/printPages";
import { PanelSelection } from "../model/panelSelection";
const panelSelection = new PanelSelection(),
  sourceSelection = new PanelSelection();
const selectedSources = ref<string[]>([]);
const sourceList = ref<HTMLElement>();
function clearSourceSelection() {
  selectedSources.value = [];
  sourceSelection.anchor = undefined;
}
function sourceOutsideDown(event: PointerEvent) {
  if (event.target instanceof Node && !sourceList.value?.contains(event.target))
    clearSourceSelection();
}
const left = defineModel<boolean>("left", { default: true });
const panel = defineModel<boolean>("panel", { default: true });
const bottom = defineModel<boolean>("bottom", { default: true });
const emit = defineEmits<{ active: [value: boolean] }>();
const e = useEditor(),
  active = ref(""),
  selected = ref<string[]>([]),
  canvas = ref<HTMLCanvasElement>();
const layouts = computed(() => e.value.document.printLayouts ?? []);
const layout = computed(() => layouts.value.find((l) => l.id === active.value));
const rows = computed(() => (layout.value ? printRows(layout.value) : []));
const sourceRows = computed(() => {
  const rows: { node: ObjectNode; depth: number }[] = [];
  function visit(nodes: ObjectNode[], depth = 0) {
    for (const node of nodes) {
      rows.push({ node, depth });
      if (node.kind === "group" && !collapsed.value.has(`source:${node.id}`))
        visit(node.children, depth + 1);
    }
  }
  visit(sourceNodes(e.value.document));
  return rows;
});
const collapsed = ref(new Set<string>());
const visibleRows = computed(() => {
  let hideDepth = Infinity;
  return rows.value.filter((row) => {
    if (row.depth <= hideDepth) hideDepth = Infinity;
    if (row.depth > hideDepth) return false;
    if (row.node.kind === "group" && collapsed.value.has(row.node.id))
      hideDepth = row.depth;
    return true;
  });
});
const zoom = ref(2),
  pan = ref({ x: 50, y: 50 }),
  snap = ref(true),
  objectSnap = ref(true),
  tool = ref<"select" | "move" | "rotate" | "mirror">("select");
const views = new Map<
  string,
  { zoom: number; pan: Point; selection: string[] }
>();
const snapOverlay = shallowRef<{ target?: Point; guides: SmartGuide[] }>({
  guides: [],
});
const rotationReadout = shallowRef<{ point: Point; angle: number }>();
const preview = shallowRef<PrintLayout>(),
  error = ref(""),
  exporting = ref(false),
  busy = ref(false);
// This scene adapter uses the shared controller without another history worker.
// Its completed documents are validated and committed by the parent Rust worker.
const drawing: Controller = new Controller({
  request: async (_operation, revision, document) => ({
    document: document ? parseProject(JSON.stringify(document)) : drawing.document,
    revision, canUndo: false, canRedo: false,
  }),
});
const drawingState = useEditor(drawing);
const textViewport = ref<InstanceType<typeof Viewport>>();
const imagePicker = ref<HTMLInputElement>();
let importGeneration = 0;
drawing.ready = true;
drawing.message = "Ready";
drawing.world = worldFromPixel;
drawing.screen = worldPixel;
let syncingDrawing = false;
function syncDrawing() {
  if (!layout.value) return;
  syncingDrawing = true;
  drawing.document = printDocument(editor.document, layout.value);
  drawing.revision = editor.revision;
  drawing.units = layout.value.units;
  drawing.grid = snap.value;
  drawing.objects = objectSnap.value;
  drawing.gridSize = editor.gridSize;
  drawing.zoom = zoom.value;
  drawing.width = canvas.value?.clientWidth ?? 900;
  drawing.height = canvas.value?.clientHeight ?? 600;
  drawing.selected = printDescendants(layout.value, selected.value);
  drawing.selectedGroups = selected.value.filter(id => printRows(layout.value!).some(row => row.node.id === id && row.node.kind === "group"));
  drawing.notify();
  syncingDrawing = false;
}
drawing.commit = async next => {
  const original = layout.value;
  if (!original || busy.value || editor.busy) return false;
  try {
    next = drawing.normalizeTree(parseProject(JSON.stringify(drawing.normalizeTree(next))));
    const value = applyPrintDocument(original, drawing.document, next);
    await save(value);
    if (error.value || active.value !== original.id) return false;
    drawing.document = next;
    drawing.revision = editor.revision;
    drawing.notify();
    return true;
  } catch (reason) {
    error.value = String(reason);
    return false;
  }
};
let lastDrawingSelection = JSON.stringify([drawing.selectedGroups, drawing.selected]);
const stopDrawing = drawing.subscribe(() => {
  const selection = JSON.stringify([drawing.selectedGroups, drawing.selected]);
  if (drawing.mode !== "select") tool.value = "select";
  if (!syncingDrawing && layout.value && selection !== lastDrawingSelection) {
    const current = printDescendants(layout.value, selected.value);
    if (JSON.stringify([...drawing.selected].sort()) !== JSON.stringify([...current].sort())) {
      const covered = new Set(printDescendants(layout.value, drawing.selectedGroups));
      selected.value = [...drawing.selectedGroups, ...drawing.selected.filter(id => !covered.has(id))];
    }
  }
  lastDrawingSelection = selection;
  if (drawing.mode !== "select" && !drawing.propertySession) paintDrawingPreview();
  else { paintDrawingPreview(); void draw(); }
});
watch([layout, selected, zoom, pan, snap, objectSnap], syncDrawing);
async function importLocalImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !layout.value) return;
  const original = editor.document, tab = active.value, generation = importGeneration;
  try {
    const image = await decodeImageFile(file);
    if (editor.document !== original || active.value !== tab || importGeneration !== generation) throw Error("Tab or project changed during image import; please try again");
    syncDrawing();
    syncDrawingView();
    await drawing.insertImage(image);
    selected.value = [...drawing.selected];
  } catch (reason) { error.value = String(reason); }
}
function drawingPixel(event: MouseEvent) {
  syncDrawingView();
  return pixel(event);
}
function syncDrawingView() {
  drawing.zoom = zoom.value;
  drawing.units = layout.value!.units;
  drawing.grid = snap.value;
  drawing.objects = objectSnap.value;
  drawing.gridSize = editor.gridSize;
  const center = worldFromPixel({ x: (canvas.value?.clientWidth ?? 900) / 2, y: (canvas.value?.clientHeight ?? 600) / 2 });
  drawing.width = canvas.value?.clientWidth ?? 900;
  drawing.height = canvas.value?.clientHeight ?? 600;
  drawing.pan = { x: drawing.width / 2 - center.x * drawing.zoom, y: drawing.height / 2 - center.y * drawing.zoom };
}
function editPrintText(event: MouseEvent) {
  syncDrawing();
  const world = worldFromPixel(pixel(event));
  const hit = [...drawing.document.shapes].reverse().find(shape => shape.kind === "text" && !drawing.isHidden(shape.id) && !drawing.isLocked(shape.id) && contains({ ...shape, kind: "rectangle", radius: 0 }, world));
  if (hit) textViewport.value?.beginText(hit.points[0], hit);
  return !!hit;
}
const canManageObjects = computed(
  () =>
    !busy.value && !e.value.busy && tool.value === "select" && !preview.value,
);
const creating = ref(false),
  settingsId = ref(""),
  format = ref("A4"),
  units = ref<UnitMode>("mm"),
  width = ref("210"),
  height = ref("297"),
  margin = ref("10"),
  name = ref(""),
  landscape = ref(false);
const nameEdited = ref(false);
watch(format, (value) => {
  if (!nameEdited.value) name.value = value;
});
const axisLock = ref<"x" | "y">();
const axes = ref<"world" | "local">("local"),
  placingPivot = ref(false),
  customPivot = ref<Point>();
const pivotMode = ref<PivotMode>("bounding-box");
let pivotPlacement: { mode: PivotMode; point: Point | undefined } | undefined;
function beginPivotPlacement() {
  if (choosingObjects.value) return;
  if (!placingPivot.value) pivotPlacement = {mode:pivotMode.value,point:customPivot.value ? {...customPivot.value} : undefined};
  customPivot.value = {...selectionPivot()};
  pivotMode.value = "custom";
  placingPivot.value = true;
  draw();
}
function cancelPivotPlacement() {
  if (!placingPivot.value) return false;
  if (pivotPlacement) { pivotMode.value=pivotPlacement.mode; customPivot.value=pivotPlacement.point; }
  placingPivot.value=false; pivotPlacement=undefined; draw(); return true;
}
function setPivotMode(mode: PivotMode) {
  if (mode === "custom") { beginPivotPlacement(); return; }
  pivotMode.value=mode; placingPivot.value=false; pivotPlacement=undefined;
  if (tool.value !== "mirror") rebaseNumeric();
  draw();
}
function selectionPivot() {
  if (drag?.rotate) return drag.pivot;
  if (pivotMode.value === "custom" && customPivot.value) return customPivot.value;
  const l = preview.value ?? layout.value;
  if (!l) return { x: 0, y: 0 };
  const ids = new Set(printDescendants(l, selected.value));
  const shapes = resolvedPrintItems(editor.document, l)
    .filter((i) => ids.has(i.instance.id))
    .filter(i => !i.shape.stitchParentId || !l.instances.some(instance => ids.has(instance.id) && instance.sourceId === i.shape.stitchParentId))
    .map(i => ({...i.shape,id:i.instance.id,stitchParentId:undefined}));
  return automaticPivot(shapes, pivotMode.value === "median" ? "median" : "bounding-box", l.units) ?? {x:0,y:0};
}
function worldPixel(p: Point) {
  const l = layout.value!;
  const size = printableSize(l),
    column = Math.floor(p.x / size.width),
    row = Math.floor(p.y / size.height);
  return {
    x:
      pan.value.x +
      (column * (l.width + gutter) + l.margin + p.x - column * size.width) *
        zoom.value,
    y:
      pan.value.y +
      (row * (l.height + gutter) + l.margin + p.y - row * size.height) *
        zoom.value,
  };
}
function gizmoAngle() {
  const l =
    tool.value === "mirror"
      ? (numericBase ?? layout.value)
      : (preview.value ?? layout.value);
  const ids = l ? printDescendants(l, selected.value) : [];
  return axes.value === "local" && ids.length === 1
    ? (l!.instances.find((i) => i.id === ids[0])!.rotation * Math.PI) / 180
    : 0;
}
function gizmoAt(p: Point) {
  if (choosingObjects.value) return;
  if (!selected.value.length || !movableSelection().length) return;
  const pivot = worldPixel(selectionPivot()),
    dx = p.x - pivot.x,
    dy = p.y - pivot.y;
  if (tool.value === "mirror") return;
  if (tool.value !== "move" && Math.abs(Math.hypot(dx, dy) - 60) < 9)
    return "rotate";
  if (tool.value === "move") {
    const a = gizmoAngle();
    const x = dx * Math.cos(a) + dy * Math.sin(a),
      y = -dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.hypot(x - 72, y) < 10) return "x";
    if (Math.hypot(x, y + 72) < 10) return "y";
    if (Math.hypot(x, y) < 10) return "move";
    if (hitsTransformShaft({ x, y }, { x: 0, y: 0 }, { x: 72, y: 0 }))
      return "x";
    if (hitsTransformShaft({ x, y }, { x: 0, y: 0 }, { x: 0, y: -72 }))
      return "y";
  }
}
const choosingObjects = ref(false);
let initialToolSelection: string[] | undefined;
const toolObjectCount=computed(()=>layout.value ? printDescendants(layout.value,selected.value).length : 0);
const printSelectionError = computed(() => {
  if (!layout.value) return "Choose at least one object.";
  const ids = new Set(printDescendants(layout.value,selected.value));
  const items = resolvedPrintItems(editor.document,layout.value).filter(i=>ids.has(i.instance.id));
  return !items.length ? "Choose at least one object." : items.some(i=>i.hidden || i.locked) ? "Choose visible, unlocked objects." : "";
});
function updateToolSelection(ids: string[]) {
  const original = layout.value;
  if (!original) return;
  const previous = preview.value;
  const old = new Set(printDescendants(original,selected.value));
  selected.value = ids;
  const next = new Set(printDescendants(original,ids));
  if (previous) {
    const added=[...next].filter(id=>!old.has(id));
    const x=parseLength(moveX.value,original.units) ?? 0, y=parseLength(moveY.value,original.units) ?? 0;
    let candidate=transformPrintNodes(original,added,x*Math.cos(numericOrientation)-y*Math.sin(numericOrientation),x*Math.sin(numericOrientation)+y*Math.cos(numericOrientation),Number(turn.value)||0,numericPivot);
    if (tool.value === "mirror" && activeMirror) {
      const angle=gizmoAngle()+(activeMirror.offset ?? 0);
      const pivot=selectionPivot();
      const line=activeMirror.offset === undefined ? activeMirror.line : [pivot,{x:pivot.x+Math.cos(angle),y:pivot.y+Math.sin(angle)}];
      candidate=mirrorPrintNodes(original,added,line[0],Math.atan2(line[1].y-line[0].y,line[1].x-line[0].x)*180/Math.PI);
    }
    preview.value={...previous,instances:original.instances.map(instance => !next.has(instance.id) ? instance : old.has(instance.id) ? previous.instances.find(p=>p.id===instance.id) ?? instance : candidate.instances.find(p=>p.id===instance.id) ?? instance)};
  }
  if (tool.value !== "mirror") {
    numericBase=preview.value ?? layout.value;
    numericPivot=selectionPivot();
    numericOrientation=gizmoAngle();
    numericBaseValues={x:parseLength(moveX.value,original.units) ?? 0,y:parseLength(moveY.value,original.units) ?? 0,angle:Number(turn.value)||0};
  }
  draw();
}
function toggleObjects() {
  if (choosingObjects.value && printSelectionError.value) return;
  cancelPivotPlacement();
  choosingObjects.value = !choosingObjects.value;
  placingPivot.value=false;
  drag=undefined;
  draw();
}
function chooseTool(value: "select" | "move" | "rotate" | "mirror") {
  if (busy.value || editor.busy || value !== "select" && !!printSelectionError.value) return;
  cancel();
  drawing.setMode("select");
  tool.value = value;
  if (value !== "select") initialToolSelection=[...selected.value];
  axisLock.value = undefined;
  moveX.value = moveY.value = turn.value = "0";
  customPivot.value = undefined;
  numericBase = layout.value;
  numericPivot = selectionPivot();
  numericOrientation = gizmoAngle();
  if (value === "rotate" || value === "mirror")
    customPivot.value = { ...numericPivot };
}
const renameId = ref(""),
  renameValue = ref("");
const moveX = ref("0"),
  moveY = ref("0"),
  turn = ref("0");
let numericBase: PrintLayout | undefined,
  numericPivot: Point = { x: 0, y: 0 },
  numericOrientation = 0,
  updatingNumeric = false,
  numericBaseValues={x:0,y:0,angle:0};
watch(
  [moveX, moveY, turn],
  () => {
    if (updatingNumeric || tool.value === "select" || !numericBase) return;
    const x = parseLength(moveX.value, numericBase.units),
      y = parseLength(moveY.value, numericBase.units),
      angle = String(turn.value).trim() ? Number(turn.value) : NaN;
    if (x === null || y === null || !Number.isFinite(angle)) {
      error.value = "Enter finite distances and rotation";
      return;
    }
    error.value = "";
    preview.value = transformPrintNodes(
      numericBase,
      movableSelection(),
      (x-numericBaseValues.x) * Math.cos(numericOrientation) - (y-numericBaseValues.y) * Math.sin(numericOrientation),
      (x-numericBaseValues.x) * Math.sin(numericOrientation) + (y-numericBaseValues.y) * Math.cos(numericOrientation),
      angle-numericBaseValues.angle,
      numericPivot,
    );
    draw();
  },
  { flush: "sync" },
);
function rebaseNumeric() {
  numericBaseValues={x:0,y:0,angle:0};
  if (tool.value === "mirror") {
    numericOrientation = gizmoAngle();
    refreshPrintMirror();
    return;
  }
  numericBase = preview.value ?? layout.value;
  numericPivot = selectionPivot();
  numericOrientation = gizmoAngle();
  updatingNumeric = true;
  moveX.value = moveY.value = turn.value = "0";
  updatingNumeric = false;
}
watch(axes, rebaseNumeric);
let observer: ResizeObserver | undefined,
  unsubscribe: (() => void) | undefined,
  generation = 0;
let drag:
  | {
      pixel: Point;
      world: Point;
      original: PrintLayout;
      ids: string[];
      pan: Point;
      rotate: boolean;
      marquee: boolean;
      axis?: "x" | "y";
      lastAngle?: number;
      accumulated?: number;
      snapAnchor?: Point;
      numericStart?: { x: number; y: number; angle: number };
      pivot: Point;
    }
  | undefined;
const selectedPages = ref<string[]>([]),
  controlHeld = ref(false);
const listedPages = computed(() =>
  layout.value ? pageContents(e.value.document, layout.value) : [],
);
const pageDragState = shallowRef<ReorderDragState>();
const pageDestination = ref<string>();
let pageGesture:
  | {
      source: { column: number; row: number };
      pixel: Point;
      original: PrintLayout;
      dragged: boolean;
      selection: string[];
      image: string;
    }
  | undefined;
function pageThumbnail(page: { column: number; row: number }, l: PrintLayout) {
  const image = document.createElement("canvas");
  image.width = 140;
  image.height = Math.round((140 * l.height) / l.width);
  const ctx = image.getContext("2d")!,
    el = canvas.value!,
    p = pagePosition(page, l);
  const ratio = el.width / el.clientWidth;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.drawImage(
    el,
    (pan.value.x + p.x * zoom.value) * ratio,
    (pan.value.y + p.y * zoom.value) * ratio,
    l.width * zoom.value * ratio,
    l.height * zoom.value * ratio,
    0,
    0,
    image.width,
    image.height,
  );
  return image.toDataURL();
}
function paperAt(p: Point, l: PrintLayout) {
  const x = (p.x - pan.value.x) / zoom.value,
    y = (p.y - pan.value.y) / zoom.value;
  return l.pages.find((page) => {
    const q = pagePosition(page, l);
    return x >= q.x && x <= q.x + l.width && y >= q.y && y <= q.y + l.height;
  });
}
function controlUp(event: KeyboardEvent) {
  if (!event.ctrlKey) {
    controlHeld.value = false;
    draw();
  }
}
function clearControl() {
  controlHeld.value = false;
  cancel();
}
let marqueePixel: Point | undefined;
function cancel() {
  if (initialToolSelection) { selected.value=initialToolSelection; initialToolSelection=undefined; }
  void drawing.finishProperty(true);
  drawing.cancel();
  drawing.setMode("select");
  textViewport.value?.cancelText();
  rotationReadout.value = undefined;
  if (moveFrame) cancelAnimationFrame(moveFrame);
  moveFrame = 0;
  pendingMove = undefined;
  snapOverlay.value = { guides: [] };
  error.value = "";
  numericBase = undefined;
  numericBaseValues={x:0,y:0,angle:0};
  updatingNumeric = true;
  moveX.value = moveY.value = turn.value = "0";
  updatingNumeric = false;
  tool.value = "select";
  choosingObjects.value=false;
  customPivot.value = undefined;
  pivotMode.value = "bounding-box";
  pivotPlacement = undefined;
  mirrorHover.value = undefined;
  activeMirror = undefined;
  hoverHandle.value = undefined;
  placingPivot.value = false;
  if (sourcePointer || sourceImport) sourceEnd();
  if (pageGesture) selectedPages.value = pageGesture.selection;
  pageGesture = undefined;
  pageDragState.value = undefined;
  pageDestination.value = undefined;
  drag = undefined;
  marqueePixel = undefined;
  preview.value = undefined;
  void draw();
}
async function switchTab(id: string) {
  if (id === active.value) return;
  importGeneration++;
  clearSourceSelection();
  cancel();
  if (editor.propertySession) await editor.finishProperty();
  editor.cancel();
  views.set(active.value, {
    zoom: zoom.value,
    pan: { ...pan.value },
    selection: [...selected.value],
  });
  active.value = id;
  const view = views.get(id);
  zoom.value = view?.zoom ?? 2;
  pan.value = view?.pan ?? { x: 50, y: 50 };
  selected.value = view?.selection ?? [];
  selectedPages.value = [];
  editor.printLayoutActive = !!id;
  emit("active", !!id);
  await nextTick();
  if (id && !view) fit();
  void draw();
}
watch(
  () => e.value.projectEpoch,
  () => {
    importGeneration++;
    cancel();
    active.value = "";
    selected.value = [];
    selectedSources.value = [];
    selectedPages.value = [];
    controlHeld.value = false;
    panelSelection.anchor = sourceSelection.anchor = undefined;
    views.clear();
    exporting.value = false;
    emit("active", false);
  },
);
watch(layout, async (value) => {
  if (!value && active.value) {
    active.value = "";
    editor.printLayoutActive = false;
    emit("active", false);
  }
  if (value)
    selected.value = selected.value.filter((id) =>
      rows.value.some((r) => r.node.id === id),
    );
  await nextTick();
  void draw();
});
async function save(value: PrintLayout) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (
      !(await editor.commit({
        ...editor.document,
        printLayouts: layouts.value.map((l) => (l.id === value.id ? value : l)),
      }))
    )
      throw Error(editor.message);
  } catch (reason) {
    error.value = String(reason);
  } finally {
    busy.value = false;
    void draw();
  }
}
function openCreate() {
  settingsId.value = "";
  format.value = "A4";
  units.value = editor.units;
  width.value = editableLength(210, units.value);
  height.value = editableLength(297, units.value);
  margin.value = editableLength(10, units.value);
  name.value = "A4";
  nameEdited.value = false;
  landscape.value = false;
  error.value = "";
  creating.value = true;
}
function openSettings(id = active.value) {
  const l = layouts.value.find((l) => l.id === id);
  if (!l) return;
  settingsId.value = l.id;
  format.value = "Custom";
  units.value = l.units;
  width.value = editableLength(l.width, l.units);
  height.value = editableLength(l.height, l.units);
  margin.value = editableLength(l.margin, l.units);
  name.value = l.name;
  nameEdited.value = true;
  landscape.value = l.width > l.height;
  creating.value = true;
}
function changeUnits(next: UnitMode) {
  const previous = units.value;
  for (const field of [width, height, margin]) {
    const value = parseLength(field.value, previous);
    if (value !== null) field.value = editableLength(value, next);
  }
  units.value = next;
}
async function create() {
  error.value = "";
  try {
    const preset = paperFormats[format.value as keyof typeof paperFormats];
    let w: number | null = preset?.[0] ?? parseLength(width.value, units.value),
      h: number | null = preset?.[1] ?? parseLength(height.value, units.value);
    const m = parseLength(margin.value, units.value);
    if (w === null || h === null || m === null)
      throw Error("Enter valid paper dimensions and margin");
    if (landscape.value !== w > h) [w, h] = [h, w];
    printableSize({ width: w, height: h, margin: m });
    if (settingsId.value) {
      const old = layouts.value.find((l) => l.id === settingsId.value)!;
      await save({
        ...old,
        name: name.value.trim() || old.name,
        width: w,
        height: h,
        margin: m,
        units: units.value,
      });
      if (error.value) return;
    } else {
      const id = crypto.randomUUID(),
        base = format.value;
      let label = name.value.trim() || base;
      let count = 2;
      while (layouts.value.some((l) => l.name === label))
        label = `${base} ${count++}`;
      const value: PrintLayout = {
        id,
        name: label,
        width: w,
        height: h,
        margin: m,
        units: units.value,
        pages: [{ column: 0, row: 0 }],
        instances: [],
        tree: [],
      };
      if (
        !(await editor.commit({
          ...editor.document,
          printLayouts: [...layouts.value, value],
        }))
      )
        return;
      await switchTab(id);
    }
    creating.value = false;
  } catch (reason) {
    error.value = String(reason);
  }
}
async function deleteLayout(id = active.value) {
  const l = layouts.value.find((l) => l.id === id);
  if (!l) return;
  if (!window.confirm(`Delete print layout “${l.name}”?`)) return;
  await editor.commit({
    ...editor.document,
    printLayouts: layouts.value.filter((p) => p.id !== l.id),
  });
  if (active.value === id) await switchTab("");
}
async function importSource(id: string) {
  const l = layout.value;
  if (!l) return;
  cancel();
  const size = printableSize(l),
    p = worldFromPixel({
      x: (canvas.value?.clientWidth ?? 400) / 2,
      y: (canvas.value?.clientHeight ?? 400) / 2,
    });
  const cell = {
    column: Math.floor(p.x / size.width),
    row: Math.floor(p.y / size.height),
  };
  const target =
    l.pages.find(
      (page) => page.column === cell.column && page.row === cell.row,
    ) ?? l.pages[0];
  try {
    await save(
      importPrintNode(
        editor.document,
        l,
        id,
        (target.column + 0.5) * size.width,
        (target.row + 0.5) * size.height,
      ),
    );
  } catch (reason) {
    error.value = String(reason);
  }
}
let tabSession:
  | { id: string; revision: number; document: typeof editor.document }
  | undefined;
const tabIndex = ref<number | null>(null);
let suppressTabClick = false;
const tabDrag = useReorderDrag({
  activate() {
    suppressTabClick = true;
  },
  current: () =>
    !!tabSession &&
    tabSession.document === editor.document &&
    tabSession.revision === editor.revision &&
    !busy.value &&
    !editor.busy,
  horizontal: true,
  scroll: () => document.querySelector<HTMLElement>(".print-tabs"),
  move(event) {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el?.closest(".print-tabs")) {
      tabIndex.value = null;
      return false;
    }
    if (el.closest("[data-reorder-slot]")) return tabIndex.value !== null;
    const candidates = layouts.value.filter((l) => l.id !== tabSession?.id);
    const tab = el.closest<HTMLElement>("[data-print-tab]");
    if (tab?.dataset.printTab === tabSession?.id)
      return tabIndex.value !== null;
    if (tab) {
      const b = tab.getBoundingClientRect();
      tabIndex.value =
        candidates.findIndex((l) => l.id === tab.dataset.printTab) +
        (event.clientX > b.left + b.width / 2 ? 1 : 0);
    } else {
      const rects = Array.from(
        document.querySelectorAll<HTMLElement>("[data-print-tab]"),
      );
      const next = rects.find(
        (t) =>
          event.clientX < t.getBoundingClientRect().left + t.offsetWidth / 2,
      );
      tabIndex.value = next
        ? candidates.findIndex((l) => l.id === next.dataset.printTab)
        : candidates.length;
    }
    return true;
  },
  drop() {
    if (!tabSession || tabIndex.value === null) return;
    const next = layouts.value.filter((l) => l.id !== tabSession!.id);
    next.splice(
      tabIndex.value,
      0,
      layouts.value.find((l) => l.id === tabSession!.id)!,
    );
    if (next.every((l, i) => l.id === layouts.value[i].id)) return;
    cancel();
    void editor.commit({ ...editor.document, printLayouts: next });
  },
  end() {
    tabSession = undefined;
    tabIndex.value = null;
    setTimeout(() => {
      suppressTabClick = false;
    }, 0);
  },
});
const tabDragState = tabDrag.state;
const tabEntries = computed(() => {
  const entries: (
    | { key: string; tab: PrintLayout; slot: false }
    | { key: string; slot: true }
  )[] = layouts.value
    .filter((l) => !tabDragState.value || l.id !== tabSession?.id)
    .map((tab) => ({ key: tab.id, tab, slot: false }));
  if (tabDragState.value && tabIndex.value !== null)
    entries.splice(tabIndex.value, 0, { key: "__tab-slot", slot: true });
  return entries;
});
function tabDown(event: PointerEvent, id: string) {
  if (event.button !== 0 || busy.value || editor.busy) return;
  tabDrag.cancel();
  const b = (event.currentTarget as HTMLElement).getBoundingClientRect();
  tabDrag.start(event, {
    width: b.width,
    height: b.height,
    label: layouts.value.find((l) => l.id === id)!.name,
    count: 1,
  });
  tabSession = { id, revision: editor.revision, document: editor.document };
  tabIndex.value = layouts.value.findIndex((l) => l.id === id);
}
function tabEnd() {
  tabDrag.cancel();
}
async function tabKey(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".print-tabs [role=tab]"),
  );
  const current = tabs.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  event.preventDefault();
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  await switchTab(index === 0 ? "" : layouts.value[index - 1].id);
  tabs[index].focus();
}
function toggleCollapse(id: string) {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}
function select(id: string, event?: MouseEvent, canvasClick = false) {
  if (tool.value !== "select") {
    if (choosingObjects.value) updateToolSelection(canvasClick ? objectSelection(selected.value,id,!!event?.shiftKey) : panelSelection.select(visibleRows.value.map(r=>r.node.id),selected.value,id,event));
    return;
  }
  drawing.cancel();
  customPivot.value = undefined;
  selected.value = canvasClick
    ? event && (event.shiftKey || event.ctrlKey || event.metaKey)
      ? selected.value.includes(id)
        ? selected.value.filter((i) => i !== id)
        : [...selected.value, id]
      : [id]
    : panelSelection.select(
        visibleRows.value.map((r) => r.node.id),
        selected.value,
        id,
        event,
      );
  draw();
}
function openPrintObjectMenu(id: string) {
  if (!canManageObjects.value || editor.busy) return;
  if (!selected.value.includes(id)) select(id);
}
function selectSource(id: string, event: MouseEvent) {
  selectedSources.value = sourceSelection.select(
    sourceRows.value.map((r) => r.node.id),
    selectedSources.value,
    id,
    event,
  );
}
function importAt(l: PrintLayout, ids: string[], point: Point) {
  const roots = ids.filter(
    (id) =>
      !ids.some(
        (parent) =>
          parent !== id &&
          (() => {
            const n = findSource(sourceNodes(editor.document), parent);
            return n?.kind === "group" && !!findSource(n.children, id);
          })(),
      ),
  );
  const entries = roots.map((id) => {
    const node = findSource(sourceNodes(editor.document), id);
    if (!node) throw Error("Source no longer exists");
    const shapes = editor.document.shapes.filter((s) =>
      sourceShapeIds(node).includes(s.id),
    );
    return {
      id,
      shapes,
      box: shapes.length
        ? bounds(shapes, l.units)
        : { x: 0, y: 0, width: 0, height: 0 },
    };
  });
  const shapes = entries.flatMap((e) => e.shapes),
    whole = shapes.length
      ? bounds(shapes, l.units)
      : { x: 0, y: 0, width: 0, height: 0 };
  let next = l;
  for (const e of entries)
    next = importPrintNode(
      editor.document,
      next,
      e.id,
      point.x + e.box.x + e.box.width / 2 - whole.x - whole.width / 2,
      point.y + e.box.y + e.box.height / 2 - whole.y - whole.height / 2,
    );
  return next;
}
let sourceImport:
  | {
      original: PrintLayout;
      document: typeof editor.document;
      base: PrintLayout;
      ids: string[];
    }
  | undefined;
let sourcePointer:
  | { pointerId: number; x: number; y: number; ids: string[] }
  | undefined;
let suppressSourceClick = false;
function sourceDown(event: PointerEvent, id: string) {
  if (event.button !== 0 || busy.value || editor.busy) return;
  if (sourcePointer || sourceImport) sourceEnd();
  sourcePointer = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    ids: selectedSources.value.includes(id) ? [...selectedSources.value] : [id],
  };
  window.addEventListener("pointermove", sourceMove);
  window.addEventListener("pointerup", sourceUp);
  window.addEventListener("pointercancel", sourceEnd);
  window.addEventListener("keydown", sourceKey);
  window.addEventListener("pointerdown", sourceCancelButton);
}
function sourceKey(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    sourceEnd();
  }
}
function sourceCancelButton(event: PointerEvent) {
  if (event.button === 2) sourceEnd();
}
function sourcePlacement(event: MouseEvent) {
  if (
    !sourceImport ||
    !canvas.value ||
    sourceImport.document !== editor.document ||
    sourceImport.original !== layout.value
  )
    return;
  const p = pixel(event),
    rect = canvas.value.getBoundingClientRect();
  if (
    p.x < 0 ||
    p.y < 0 ||
    p.x > rect.width ||
    p.y > rect.height ||
    !paperAt(p, sourceImport.original)
  )
    return;
  const point = worldFromPixel(p);
  snapOverlay.value = { guides: [] };
  const placement =
    snap.value && !event.altKey
      ? pageCenterSnap(sourceImport.base, sourceImport.ids, point.x, point.y)
      : { dx: point.x, dy: point.y };
  return transformPrintNodes(
    sourceImport.base,
    sourceImport.ids,
    placement.dx,
    placement.dy,
    0,
  );
}
function sourceMove(event: PointerEvent) {
  const pointer = sourcePointer;
  if (!pointer || event.pointerId !== pointer.pointerId) return;
  if (!sourceImport) {
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6)
      return;
    const ids = pointer.ids;
    // Reset transform state without detaching the active source listeners.
    sourcePointer = undefined;
    cancel();
    sourcePointer = pointer;
    selectedSources.value = ids;
    hoverPreview.value.id = undefined;
    const l = layout.value;
    if (!l) {
      sourceEnd();
      return;
    }
    try {
      const base = importAt(l, ids, { x: 0, y: 0 });
      sourceImport = {
        original: l,
        document: editor.document,
        base,
        ids: printTree(base)
          .filter((n) => !printTree(l).some((old) => old.id === n.id))
          .map((n) => n.id),
      };
    } catch (reason) {
      sourceEnd();
      error.value = String(reason);
      return;
    }
  }
  event.preventDefault();
  if (
    sourceImport.document !== editor.document ||
    sourceImport.original !== layout.value
  ) {
    sourceEnd();
    return;
  }
  preview.value = sourcePlacement(event);
  draw();
}
function sourceEnd() {
  sourcePointer = undefined;
  sourceImport = undefined;
  preview.value = undefined;
  window.removeEventListener("pointermove", sourceMove);
  window.removeEventListener("pointerup", sourceUp);
  window.removeEventListener("pointercancel", sourceEnd);
  window.removeEventListener("keydown", sourceKey);
  window.removeEventListener("pointerdown", sourceCancelButton);
  draw();
}
async function sourceUp(event: PointerEvent) {
  if (!sourcePointer || event.pointerId !== sourcePointer.pointerId) return;
  const dragging = !!sourceImport,
    next = sourcePlacement(event);
  sourceEnd();
  if (dragging) {
    suppressSourceClick = true;
    setTimeout(() => {
      suppressSourceClick = false;
    }, 0);
  }
  if (next) {
    preview.value = next;
    await save(next);
    if (preview.value === next) preview.value = undefined;
    draw();
  }
}
function nodeName(node: PrintNode) {
  if (node.kind === "group") return node.name;
  const item = layout.value?.instances.find((i) => i.id === node.id);
  return (
    item?.name ??
    item?.snapshot?.shape.name ??
    editor.document.shapes.find((s) => s.id === item?.sourceId)?.name ??
    "Object"
  );
}
function isUnlinked(node: PrintNode) {
  return node.kind === "group" ? !!node.unlinked
    : !!layout.value?.instances.find((i) => i.id === node.id)?.snapshot;
}
function unlinkHint(node: PrintNode) {
  return isUnlinked(node)
    ? "Unlinked. Cannot be re-linked; use Undo to restore the link."
    : "Unlink from Model. Use Undo to restore the link.";
}
function unlink(node: PrintNode) {
  if (!canManageObjects.value || !layout.value || isUnlinked(node)) return;
  try {
    void save(unlinkPrintNode(editor.document, layout.value, node.id));
  } catch (reason) {
    error.value = String(reason);
  }
}
function editState(id: string, key: "hidden" | "locked") {
  if (!canManageObjects.value) return;
  const l = layout.value;
  if (!l) return;
  const node = rows.value.find((r) => r.node.id === id)?.node;
  if (!node) return;
  if (node.kind === "group")
    void save({
      ...l,
      tree: editPrintTree(printTree(l), id, (n) =>
        n.kind === "group" ? { ...n, [key]: !n[key] } : n,
      ),
    });
  else
    void save({
      ...l,
      instances: l.instances.map((i) =>
        i.id === id ? { ...i, [key]: !i[key] } : i,
      ),
    });
}
function movableSelection() {
  const l = layout.value;
  if (!l) return [];
  return selected.value.filter((id) => {
    const descendants = new Set(printDescendants(l, [id]));
    return !rows.value.some(
      (r) => r.locked && (r.node.id === id || descendants.has(r.node.id)),
    );
  });
}
function deleteSelection() {
  if (!canManageObjects.value) return;
  const l = layout.value;
  if (!l) return;
  const ids = movableSelection();
  void save(removePrintNodes(l, ids));
  selected.value = [];
}
function renameStart(node: PrintNode) {
  if (!canManageObjects.value) return;
  if (rows.value.find((r) => r.node.id === node.id)?.locked) return;
  renameId.value = node.id;
  renameValue.value = nodeName(node);
}
function renameFinish() {
  if (!canManageObjects.value) return;
  const l = layout.value,
    id = renameId.value,
    value = renameValue.value.trim();
  renameId.value = "";
  if (!l || !value) return;
  void save({
    ...l,
    instances: l.instances.map((i) =>
      i.id === id ? { ...i, name: value } : i,
    ),
    tree: editPrintTree(printTree(l), id, (n) =>
      n.kind === "group" ? { ...n, name: value } : n,
    ),
  });
}
function duplicate() {
  if (!canManageObjects.value) return;
  const l = layout.value;
  if (!l) return;
  const selectedIds = new Set(selected.value),
    instances = [...l.instances],
    newIds: string[] = [];
  function copy(node: PrintNode): PrintNode {
    const id = crypto.randomUUID();
    if (node.kind === "instance") {
      const old = l!.instances.find((i) => i.id === node.id)!;
      instances.push({ ...old, id, x: old.x + 10, y: old.y + 10 });
    }
    newIds.push(id);
    return node.kind === "instance"
      ? { kind: "instance", id }
      : {
          ...structuredClone(node),
          id,
          x: node.x + 10,
          y: node.y + 10,
          children: node.children.map(copy),
        };
  }
  const roots: PrintNode[] = [];
  function visit(nodes: PrintNode[]) {
    for (const node of nodes) {
      if (selectedIds.has(node.id)) roots.push(copy(node));
      else if (node.kind === "group") visit(node.children);
    }
  }
  visit(printTree(l));
  void save({ ...l, instances, tree: [...printTree(l), ...roots] });
  selected.value = newIds;
}
function newGroup() {
  if (!canManageObjects.value) return;
  const l = layout.value;
  if (!l) return;
  const ids = new Set(movableSelection());
  const id = crypto.randomUUID();
  let grouped = false;
  function group(nodes: PrintNode[]): PrintNode[] {
    const chosen = nodes.filter((n) => ids.has(n.id));
    if (chosen.length && !grouped) {
      grouped = true;
      return [
        ...nodes.filter((n) => !ids.has(n.id)),
        {
          kind: "group",
          id,
          name: "Group",
          x: 0,
          y: 0,
          rotation: 0,
          children: chosen,
        },
      ];
    }
    return nodes.map((n) =>
      n.kind === "group" ? { ...n, children: group(n.children) } : n,
    );
  }
  const tree = group(printTree(l));
  if (grouped) {
    void save({ ...l, tree });
    selected.value = [id];
  }
}
function applyTransform() {
  if (choosingObjects.value || printSelectionError.value) return;
  flushMove();
  const next = preview.value;
  if (!next) {
    cancel();
    return;
  }
  if (error.value) return;
  initialToolSelection=undefined;
  void save(next).then(() => {
    if (error.value) return;
    preview.value = undefined;
    cancel();
    draw();
  });
}
let printSession:
  | { ids: string[]; revision: number; layout: PrintLayout }
  | undefined;
const printTarget = ref<ReorderDestination | null>(null);
const printTargetRow = ref("");
let suppressPrintClick = false;
const printDrag = useReorderDrag({
  activate() {
    hoverPreview.value.id = undefined;
    suppressPrintClick = true;
  },
  current: () =>
    !!printSession &&
    printSession.revision === editor.revision &&
    printSession.layout === layout.value &&
    canManageObjects.value,
  scroll: () => document.querySelector<HTMLElement>(".print-list"),
  move: printMove,
  drop() {
    if (!printSession || !printTarget.value) return;
    const next = movePrintTree(
      printSession.layout,
      printSession.ids,
      printTarget.value,
    );
    if (
      JSON.stringify(printTree(next)) !==
      JSON.stringify(printTree(printSession.layout))
    )
      void save(next);
  },
  end() {
    printSession = undefined;
    printTarget.value = null;
    printTargetRow.value = "";
    setTimeout(() => {
      suppressPrintClick = false;
    }, 0);
  },
});
const printDragState = printDrag.state;
const printRemoved = computed(() =>
  printDragState.value && printSession
    ? reorderIds(reorderRoots(printTree(printSession.layout), printSession.ids))
    : new Set<string>(),
);
const printPreviewRows = computed(() =>
  reorderPreview(
    visibleRows.value,
    printRemoved.value,
    printDragState.value ? printTarget.value : null,
    layout.value ? printTree(layout.value) : [],
  ),
);
function printDown(event: PointerEvent, id: string) {
  if (
    event.button !== 0 ||
    !canManageObjects.value ||
    !(event.target as HTMLElement).closest(".print-object-name")
  )
    return;
  printDrag.cancel();
  const l = layout.value!;
  const roots = reorderRoots(
    printTree(l),
    selected.value.includes(id) ? movableSelection() : [id],
  );
  const moved = reorderIds(roots);
  if (!roots.length || rows.value.some((r) => r.locked && moved.has(r.node.id)))
    return;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const height = Array.from(
    document.querySelectorAll<HTMLElement>("[data-print-row]"),
  )
    .filter((el) => moved.has(el.dataset.printRow!))
    .reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
  printDrag.start(event, {
    width: box.width,
    height: Math.max(28, height),
    count: roots.length,
    label: nodeName(roots[0]),
  });
  printSession = {
    ids: roots.map((n) => n.id),
    revision: editor.revision,
    layout: l,
  };
  printTarget.value = reorderLocation(printTree(l), roots[0].id)!;
}
function printMove(event: PointerEvent): boolean {
  const session = printSession;
  if (!session) return false;
  const element = document.elementFromPoint(event.clientX, event.clientY);
  if (element?.closest("[data-reorder-slot]")) return !!printTarget.value;
  const tree = printTree(session.layout),
    moving = new Set(session.ids);
  let destination: ReorderDestination | null = null;
  const rowEl = element?.closest<HTMLElement>("[data-print-row]");
  printTargetRow.value = "";
  if (rowEl) {
    const id = rowEl.dataset.printRow!,
      row = rows.value.find((r) => r.node.id === id)!;
    if (reorderIds(reorderRoots(tree, session.ids)).has(id))
      return !!printTarget.value;
    const location = reorderLocation(tree, id)!;
    const b = rowEl.getBoundingClientRect(),
      fraction = (event.clientY - b.top) / b.height;
    if (event.clientX < b.left + row.depth * 14)
      destination = {
        parent: null,
        index: tree.filter((n) => !moving.has(n.id)).length,
      };
    else {
      const inside =
        row.node.kind === "group" && fraction >= 0.25 && fraction <= 0.75;
      const parent = inside ? id : location.parent;
      let index = inside
        ? reorderChildren(tree, parent).length
        : location.index + (fraction > 0.5 ? 1 : 0);
      index -= reorderChildren(tree, parent)
        .slice(0, index)
        .filter((n) => moving.has(n.id)).length;
      destination = { parent, index };
    }
    printTargetRow.value = id;
  } else if (element?.closest(".print-list"))
    destination = {
      parent: null,
      index: tree.filter((n) => !moving.has(n.id)).length,
    };
  if (destination) {
    try {
      movePrintTree(session.layout, session.ids, destination);
    } catch {
      destination = null;
    }
  }
  printTarget.value = destination;
  return !!destination;
}
const gutter = 12;
function pagePosition(page: { column: number; row: number }, l: PrintLayout) {
  return {
    x: page.column * (l.width + gutter),
    y: page.row * (l.height + gutter),
  };
}
function worldFromPixel(pixel: Point): Point {
  const l = layout.value;
  if (!l) return pixel;
  const size = printableSize(l),
    x = (pixel.x - pan.value.x) / zoom.value,
    y = (pixel.y - pan.value.y) / zoom.value;
  const column = Math.floor(x / (l.width + gutter)),
    row = Math.floor(y / (l.height + gutter));
  return {
    x:
      column * size.width +
      Math.max(
        0,
        Math.min(size.width, x - column * (l.width + gutter) - l.margin),
      ),
    y:
      row * size.height +
      Math.max(
        0,
        Math.min(size.height, y - row * (l.height + gutter) - l.margin),
      ),
  };
}
function isPrintablePixel(pixel: Point, l: PrintLayout) {
  const x = (pixel.x - pan.value.x) / zoom.value,
    y = (pixel.y - pan.value.y) / zoom.value;
  const column = Math.floor(x / (l.width + gutter)),
    row = Math.floor(y / (l.height + gutter));
  const localX = x - column * (l.width + gutter),
    localY = y - row * (l.height + gutter);
  return (
    l.pages.some((p) => p.column === column && p.row === row) &&
    localX >= l.margin &&
    localX <= l.width - l.margin &&
    localY >= l.margin &&
    localY <= l.height - l.margin
  );
}
function pixel(event: MouseEvent) {
  const rect = canvas.value!.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
const pageButtons = computed(() => {
  if (!controlHeld.value || pageDragState.value) return [];
  const l = preview.value ?? layout.value;
  if (!l) return [];
  const result: {
    column: number;
    row: number;
    x: number;
    y: number;
    label: string;
  }[] = [];
  for (const page of l.pages) {
    const p = pagePosition(page, l);
    for (const [dx, dy, label] of [
      [-1, 0, "left"],
      [1, 0, "right"],
      [0, -1, "above"],
      [0, 1, "below"],
    ] as const) {
      const column = page.column + dx,
        row = page.row + dy;
      if (l.pages.some((p) => p.column === column && p.row === row)) continue;
      result.push({
        column,
        row,
        x:
          pan.value.x +
          (p.x +
            (dx < 0
              ? -gutter / 2
              : dx > 0
                ? l.width + gutter / 2
                : l.width / 2)) *
            zoom.value,
        y:
          pan.value.y +
          (p.y +
            (dy < 0
              ? -gutter / 2
              : dy > 0
                ? l.height + gutter / 2
                : l.height / 2)) *
            zoom.value,
        label: `Add page ${label} ${page.column},${page.row}`,
      });
    }
  }
  return result;
});
function addPage(column: number, row: number) {
  const l = layout.value;
  if (l && !l.pages.some((p) => p.column === column && p.row === row))
    void save({ ...l, pages: [...l.pages, { column, row }] });
}
function deletePage(page: { column: number; row: number }) {
  if (!layout.value || busy.value) return;
  try {
    void save(deletePrintPages(editor.document, layout.value, [pageKey(page)]));
    selectedPages.value = [];
  } catch (reason) {
    error.value = String(reason);
  }
}
const documentArtwork = new WeakMap<
  typeof editor.document,
  Map<
    string,
    {
      image: Promise<HTMLImageElement>;
      box: { x: number; y: number; width: number; height: number };
    }
  >
>();
const artworkImages = new Map<
  string,
  {
    image: Promise<HTMLImageElement>;
    box: { x: number; y: number; width: number; height: number };
  }
>();
function artworkImage(
  doc: typeof editor.document,
  l: PrintLayout,
  source: (typeof editor.document.shapes)[number],
) {
  let documentCache = documentArtwork.get(doc);
  if (!documentCache) {
    documentCache = new Map();
    documentArtwork.set(doc, documentCache);
  }
  const sourceKey = `${l.units}:${source.id}`;
  const existing = documentCache.get(sourceKey);
  if (existing) return existing;
  const canonical = resolvePrintShape(source, {
    id: source.id,
    sourceId: source.id,
    x: 0,
    y: 0,
    rotation: 0,
  });
  const content = printShapeSvg(doc, canonical, source.id, l);
  const key = `${l.units}:${content}`;
  let cached = artworkImages.get(key);
  if (!cached) {
    const b = printArtworkBounds(doc, l, { shape: canonical, source });
    const box = {
      x: b.x - 1,
      y: b.y - 1,
      width: Math.max(1, b.width + 2),
      height: Math.max(1, b.height + 2),
    };
    const rasterScale = Math.min(4, 4096 / Math.max(box.width, box.height));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${box.width * rasterScale}" height="${box.height * rasterScale}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}"><defs></defs>${content}</svg>`;
    cached = { box, image: selfContainedSvg(svg).then(svgImage) };
    artworkImages.set(key, cached);
    if (artworkImages.size > 512)
      artworkImages.delete(artworkImages.keys().next().value!);
  }
  documentCache.set(sourceKey, cached);
  return cached;
}
const previewCanvas = ref<HTMLCanvasElement>();
function paintDrawingPreview() {
  const el = previewCanvas.value, l = layout.value;
  if (!el || !l || !canvas.value) return;
  const dpr = devicePixelRatio || 1;
  const width = Math.round(canvas.value.clientWidth * dpr), height = Math.round(canvas.value.clientHeight * dpr);
  if (el.width !== width) el.width = width;
  if (el.height !== height) el.height = height;
  const ctx = el.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width / dpr, height / dpr);
  const shape = drawing.constructionPreview;
  if (drawing.mode !== "select" && clipboardPixel && !drawing.editingTextId) {
    const p = worldPixel(drawing.cursor);
    ctx.strokeStyle = "#e6b07c"; ctx.lineWidth = 1;
    ctx.beginPath();
    const radius = drawing.mode === "text" ? 3 * zoom.value : 6;
    ctx.moveTo(p.x, p.y - radius); ctx.lineTo(p.x, p.y + radius);
    if (drawing.mode !== "text") { ctx.moveTo(p.x - radius, p.y); ctx.lineTo(p.x + radius, p.y); }
    ctx.stroke();
  }
  if (!shape) return;
  const size = printableSize(l);
  for (const page of l.pages) {
    const p = pagePosition(page, l);
    ctx.save();
    ctx.translate(pan.value.x, pan.value.y); ctx.scale(zoom.value, zoom.value);
    ctx.beginPath(); ctx.rect(p.x + l.margin, p.y + l.margin, size.width, size.height); ctx.clip();
    ctx.translate(p.x + l.margin - page.column * size.width, p.y + l.margin - page.row * size.height);
    ctx.strokeStyle = shape.strokeColor ?? "#111"; ctx.lineWidth = shape.strokeWidth ?? 0.35;
    ctx.globalAlpha = 0.7;
    drawAnnotation(ctx, shape, l.units);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#e6b07c"; ctx.lineWidth = 1 / zoom.value;
    ctx.setLineDash([4 / zoom.value, 4 / zoom.value]);
    for (const guide of drawing.smartGuides) {
      ctx.beginPath();
      if (guide.axis === "x") { ctx.moveTo(guide.coordinate, guide.bounds.y); ctx.lineTo(guide.coordinate, guide.bounds.y + guide.bounds.height); }
      else { ctx.moveTo(guide.bounds.x, guide.coordinate); ctx.lineTo(guide.bounds.x + guide.bounds.width, guide.coordinate); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "#e6b07c";
    for (const point of drawing.pending) { ctx.beginPath(); ctx.arc(point.x, point.y, 3 / zoom.value, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}
const pageImages = new Map<string, Promise<HTMLImageElement>>();
let scheduledFrame = 0;
function draw() {
  paintDrawingPreview();
  generation++;
  if (scheduledFrame) return;
  scheduledFrame = requestAnimationFrame(() => {
    scheduledFrame = 0;
    void paintFrame();
  });
}
async function paintFrame() {
  const token = ++generation,
    l = preview.value ?? (layout.value && drawing.propertySession && drawing.preview ? applyPrintDocument(layout.value, drawing.document, drawing.preview) : layout.value),
    el = canvas.value;
  if (!l || !el || !el.clientWidth) return;
  const doc = editor.document,
    rect = el.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  const buffer = document.createElement("canvas");
  buffer.width = Math.round(rect.width * dpr);
  buffer.height = Math.round(rect.height * dpr);
  const ctx = buffer.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.translate(pan.value.x, pan.value.y);
  ctx.scale(zoom.value, zoom.value);
  try {
    const resolved = resolvedPrintItems(doc, l);
    const resources = await Promise.all(
      resolved.map(async (item) => {
        const resource = artworkImage(doc, l, item.source);
        return { ...item, box: resource.box, bitmap: await resource.image };
      }),
    );
    if (token !== generation) return;
    for (const page of l.pages) {
      const p = pagePosition(page, l);
      if (
        pan.value.x + (p.x + l.width) * zoom.value < 0 ||
        pan.value.y + (p.y + l.height) * zoom.value < 0 ||
        pan.value.x + p.x * zoom.value > rect.width ||
        pan.value.y + p.y * zoom.value > rect.height
      )
        continue;
      if (pageGesture?.dragged && pageDestination.value === pageKey(page)) {
        ctx.save();
        ctx.strokeStyle = "#d28d40";
        ctx.lineWidth = 2 / zoom.value;
        ctx.setLineDash([8 / zoom.value, 5 / zoom.value]);
        ctx.strokeRect(p.x, p.y, l.width, l.height);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(p.x, p.y, l.width, l.height);
      const sizeForArtwork = printableSize(l);
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        p.x + l.margin,
        p.y + l.margin,
        sizeForArtwork.width,
        sizeForArtwork.height,
      );
      ctx.clip();
      ctx.translate(
        p.x + l.margin - page.column * sizeForArtwork.width,
        p.y + l.margin - page.row * sizeForArtwork.height,
      );
      for (const item of resources) {
        if (item.hidden || item.instance.id === drawing.editingTextId) continue;
        ctx.save();
        ctx.translate(item.instance.x, item.instance.y);
        ctx.rotate((item.instance.rotation * Math.PI) / 180);
        if (item.instance.mirrored) ctx.scale(1, -1);
        ctx.drawImage(
          item.bitmap,
          item.box.x,
          item.box.y,
          item.box.width,
          item.box.height,
        );
        ctx.restore();
      }
      ctx.restore();
      // Assembly marks depend on crossings, but their image stays stable while an edge remains crossed.
      const decoration = pageSvg(doc, l, page, true, resolved);
      let decorationImage = pageImages.get(decoration);
      if (!decorationImage) {
        decorationImage = selfContainedSvg(decoration).then(svgImage);
        pageImages.set(decoration, decorationImage);
        if (pageImages.size > 64)
          pageImages.delete(pageImages.keys().next().value!);
      }
      const decorationBitmap = await decorationImage;
      if (token !== generation) return;
      ctx.drawImage(decorationBitmap, p.x, p.y, l.width, l.height);
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 1 / zoom.value;
      ctx.strokeRect(p.x, p.y, l.width, l.height);
      if (selectedPages.value.includes(pageKey(page))) {
        ctx.save();
        ctx.strokeStyle = "#d28d40";
        ctx.lineWidth = 3 / zoom.value;
        ctx.strokeRect(p.x, p.y, l.width, l.height);
        ctx.restore();
      }
      if (controlHeld.value) {
        ctx.save();
        ctx.fillStyle = "#111";
        ctx.font = `bold ${20 / zoom.value}px sans-serif`;
        ctx.fillText(
          String(
            numberedPages(l).findIndex(
              (candidate) => pageKey(candidate) === pageKey(page),
            ) + 1,
          ),
          p.x + 8 / zoom.value,
          p.y + 25 / zoom.value,
        );
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = "#aaa";
      ctx.setLineDash([2 / zoom.value, 3 / zoom.value]);
      ctx.strokeRect(
        p.x + l.margin,
        p.y + l.margin,
        l.width - 2 * l.margin,
        l.height - 2 * l.margin,
      );
      ctx.restore();
      const size = printableSize(l);
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x + l.margin, p.y + l.margin, size.width, size.height);
      ctx.clip();
      ctx.translate(
        p.x + l.margin - page.column * size.width,
        p.y + l.margin - page.row * size.height,
      );
      ctx.strokeStyle = "#ba772e";
      ctx.lineWidth = 1.5 / zoom.value;
      const selectedIds = new Set(
        printDescendants(l, sourceImport ? sourceImport.ids : selected.value),
      );
      for (const i of resolved) {
        if (i.hidden || !selectedIds.has(i.instance.id)) continue;
        const b = printArtworkBounds(editor.document, l, i);
        ctx.strokeRect(b.x, b.y, b.width, b.height);
      }
      ctx.restore();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(el),
      background = css.getPropertyValue("--panel").trim() || "#20252c",
      foreground = css.getPropertyValue("--text").trim() || "#ddd";
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, rect.width, 20);
    ctx.fillRect(0, 0, 20, rect.height);
    ctx.fillStyle = foreground;
    ctx.strokeStyle = foreground;
    ctx.font = "10px sans-serif";
    ctx.lineWidth = 0.5;
    const base = l.units === "mm" ? 10 : 25.4,
      step =
        base *
        Math.pow(
          l.units === "mm" ? 10 : 2,
          Math.ceil(
            Math.log(55 / (zoom.value * base)) /
              Math.log(l.units === "mm" ? 10 : 2),
          ),
        ),
      size = printableSize(l);
    for (const column of new Set(l.pages.map((p) => p.column))) {
      const left =
        pan.value.x + (column * (l.width + gutter) + l.margin) * zoom.value;
      const start = column * size.width;
      for (
        let value = Math.ceil(start / step) * step;
        value <= start + size.width;
        value += step
      ) {
        const x = left + (value - start) * zoom.value;
        if (x < 20 || x > rect.width) continue;
        ctx.beginPath();
        ctx.moveTo(x, 14);
        ctx.lineTo(x, 20);
        ctx.stroke();
        ctx.fillText(formatLength(value, l.units), x + 3, 11);
      }
    }
    for (const row of new Set(l.pages.map((p) => p.row))) {
      const top =
        pan.value.y + (row * (l.height + gutter) + l.margin) * zoom.value;
      const start = row * size.height;
      for (
        let value = Math.ceil(start / step) * step;
        value <= start + size.height;
        value += step
      ) {
        const y = top + (value - start) * zoom.value;
        if (y < 20 || y > rect.height - 28) continue;
        ctx.beginPath();
        ctx.moveTo(14, y);
        ctx.lineTo(20, y);
        ctx.stroke();
        ctx.save();
        ctx.translate(11, y - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(formatLength(value, l.units), 0, 0);
        ctx.restore();
      }
    }
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 20, 20);
    ctx.fillStyle = foreground;
    ctx.fillText(l.units === "mm" ? "mm" : "in", 2, 12);
    if (snapOverlay.value.target) {
      const target = snapOverlay.value.target,
        p = worldPixel(target);
      ctx.save();
      ctx.strokeStyle = css.getPropertyValue("--accent").trim() || "#e6b07c";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (const guide of snapOverlay.value.guides) {
        const a = worldPixel(
            guide.axis === "x"
              ? { x: guide.coordinate, y: Math.min(guide.bounds.y, target.y) }
              : { x: Math.min(guide.bounds.x, target.x), y: guide.coordinate },
          ),
          b = worldPixel(
            guide.axis === "x"
              ? {
                  x: guide.coordinate,
                  y: Math.max(guide.bounds.y + guide.bounds.height, target.y),
                }
              : {
                  x: Math.max(guide.bounds.x + guide.bounds.width, target.x),
                  y: guide.coordinate,
                },
          );
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (tool.value === "mirror" && selected.value.length) {
      const pivot = selectionPivot(),
        angle = gizmoAngle();
      ctx.save();
      ctx.strokeStyle = "#1d4ed8";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 1;
      ctx.setLineDash([5, 5]);
      for (const offset of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
        const dx = Math.cos(angle + offset) * 1000,
          dy = Math.sin(angle + offset) * 1000;
        const origin = worldPixel(pivot);
        const a = { x: origin.x - dx, y: origin.y - dy },
          b = { x: origin.x + dx, y: origin.y + dy };
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (activeMirror && tool.value === "mirror" && !choosingObjects.value) {
      const [a, b] =
        activeMirror.offset === undefined
          ? activeMirror.line.map(worldPixel)
          : axisPixels(activeMirror.offset);
      ctx.save();
      ctx.strokeStyle = "#be123c";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
    if (
      mirrorHover.value &&
      tool.value === "mirror" &&
      !placingPivot.value &&
      !choosingObjects.value &&
      !editor.space
    ) {
      const projected =
        hoverMirrorOffset === undefined
          ? mirrorHover.value.map(worldPixel)
          : axisPixels(hoverMirrorOffset);
      const [a, b] = projected;
      ctx.strokeStyle = css.getPropertyValue("--canvas").trim();
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    if (
      tool.value === "mirror" &&
      selected.value.length &&
      movableSelection().length
    ) {
      drawPivotPoint(
        ctx,
        worldPixel(selectionPivot()),
        1,
        css.getPropertyValue("--accent").trim() || "#e6b07c",
      );
    }
    if (
      selected.value.length &&
      movableSelection().length &&
      !choosingObjects.value &&
      tool.value !== "mirror"
    ) {
      const p = worldPixel(selectionPivot());
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = css.getPropertyValue("--accent").trim() || "#e6b07c";
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1.5;
      if (tool.value !== "move") {
        drawRotationGizmo(
          ctx,
          { x: 0, y: 0 },
          1,
          tool.value === "rotate"
            ? Number(turn.value) || 0
            : (drag?.accumulated ?? 0),
          hoverHandle.value === "rotate",
          css.getPropertyValue("--accent").trim() || "#e6b07c",
          foreground,
        );
      } else {
        ctx.rotate(gizmoAngle());
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(72, 0);
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -72);
        ctx.moveTo(64, -5);
        ctx.lineTo(72, 0);
        ctx.lineTo(64, 5);
        ctx.moveTo(-5, -64);
        ctx.lineTo(0, -72);
        ctx.lineTo(5, -64);
        ctx.stroke();
        ctx.fillRect(-4, -4, 8, 8);
      }
      ctx.restore();
    }
    if (rotationReadout.value) {
      drawTransformReadout(
        ctx,
        rotationReadout.value.point,
        `${rotationReadout.value.angle.toFixed(1)}°`,
        background,
        css.getPropertyValue("--accent").trim() || "#e6b07c",
      );
    }
    if (drag?.marquee && marqueePixel) {
      ctx.strokeStyle = css.getPropertyValue("--accent").trim() || "#e6b07c";
      ctx.fillStyle = ctx.strokeStyle;
      const x = Math.min(drag.pixel.x, marqueePixel.x),
        y = Math.min(drag.pixel.y, marqueePixel.y),
        w = Math.abs(marqueePixel.x - drag.pixel.x),
        h = Math.abs(marqueePixel.y - drag.pixel.y);
      ctx.globalAlpha = 0.12;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeRect(x, y, w, h);
    }
    if (drawing.mode !== "select" && clipboardPixel && !drawing.editingTextId && !drag) {
      const point = worldPixel(drawing.cursor);
      ctx.save();
      ctx.strokeStyle = css.getPropertyValue("--preview").trim() || "#e6b07c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (drawing.mode === "text") {
        ctx.moveTo(point.x, point.y - 3 * zoom.value);
        ctx.lineTo(point.x, point.y + 3 * zoom.value);
      } else {
        for (const sign of [-1, 1]) {
          ctx.moveTo(point.x + sign * 2, point.y); ctx.lineTo(point.x + sign * 6, point.y);
          ctx.moveTo(point.x, point.y + sign * 2); ctx.lineTo(point.x, point.y + sign * 6);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
    if (token !== generation || el !== canvas.value) return;
    if (el.width !== buffer.width) el.width = buffer.width;
    if (el.height !== buffer.height) el.height = buffer.height;
    const front = el.getContext("2d")!;
    front.setTransform(1, 0, 0, 1, 0, 0);
    front.clearRect(0, 0, el.width, el.height);
    front.drawImage(buffer, 0, 0);
  } catch (reason) {
    if (token === generation) error.value = String(reason);
  }
}
const hoverHandle = ref<string>();
const printCursor = computed(() =>
  drawingState.value.mode !== "select"
    ? "none"
    : placingPivot.value
    ? "crosshair"
    : mirrorHover.value && tool.value === "mirror"
      ? "pointer"
      : hoverHandle.value === "rotate"
        ? "grab"
        : hoverHandle.value
          ? "move"
          : undefined,
);
let hoverMirrorOffset: number | undefined;
let activeMirror: { offset?: number; line: [Point, Point] } | undefined;
function axisPixels(offset: number): [Point, Point] {
  const p = worldPixel(selectionPivot()),
    a = gizmoAngle() + offset;
  const length =
    Math.max(
      canvas.value?.clientWidth ?? 1000,
      canvas.value?.clientHeight ?? 1000,
    ) * 2;
  return [
    { x: p.x - Math.cos(a) * length, y: p.y - Math.sin(a) * length },
    { x: p.x + Math.cos(a) * length, y: p.y + Math.sin(a) * length },
  ];
}
function refreshPrintMirror() {
  if (!numericBase || !activeMirror) return;
  const pivot = selectionPivot(),
    angle = gizmoAngle() + (activeMirror.offset ?? 0);
  const line =
    activeMirror.offset === undefined
      ? activeMirror.line
      : [pivot, { x: pivot.x + Math.cos(angle), y: pivot.y + Math.sin(angle) }];
  preview.value = mirrorPrintNodes(
    numericBase,
    movableSelection(),
    line[0],
    (Math.atan2(line[1].y - line[0].y, line[1].x - line[0].x) * 180) / Math.PI,
  );
  draw();
}
const mirrorHover = shallowRef<[Point, Point]>();
function mirrorTarget(
  p: Point,
  screen = worldPixel(p),
): [Point, Point] | undefined {
  const base = numericBase ?? layout.value;
  if (!base) return;
  const pivot = selectionPivot(),
    angle = gizmoAngle();
  const candidates: {
    line: [Point, Point];
    distance: number;
    offset?: number;
  }[] = [];
  for (const item of resolvedPrintItems(editor.document, base)) {
    if (item.hidden) continue;
    for (const line of boundary(item.shape, base.units).lines) {
      if (Math.hypot(line[1].x - line[0].x, line[1].y - line[0].y) > 1e-9)
        candidates.push({ line, distance: distanceToSegment(p, ...line) });
    }
  }
  if (Math.hypot(p.x - pivot.x, p.y - pivot.y) > 8 / zoom.value) {
    for (const offset of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
      const dx = Math.cos(angle + offset),
        dy = Math.sin(angle + offset);
      candidates.push({
        line: [
          { x: pivot.x - dx * 1000, y: pivot.y - dy * 1000 },
          { x: pivot.x + dx * 1000, y: pivot.y + dy * 1000 },
        ],
        offset,
        distance:
          Math.abs(
            (screen.x - worldPixel(pivot).x) * dy -
              (screen.y - worldPixel(pivot).y) * dx,
          ) / zoom.value,
      });
    }
  }
  const best = candidates
    .filter((c) => c.distance <= 8 / zoom.value)
    .sort((a, b) => a.distance - b.distance)[0];
  hoverMirrorOffset = best?.offset;
  return best?.line;
}
function applyMirror(line: [Point, Point]) {
  if (!numericBase || !movableSelection().length) return;
  activeMirror = { line, offset: hoverMirrorOffset };
  refreshPrintMirror();
}
function contextMenu(event: MouseEvent) {
  if (!event.altKey) {
    if (tool.value === "select") cancel();
    else applyTransform();
    return;
  }
  if (busy.value || editor.busy || !layout.value) return;
  cancel();
  const l = layout.value,
    p = pixel(event),
    world = worldFromPixel(p);
  if (!isPrintablePixel(p, l)) return;
  const hit = [...resolvedPrintItems(editor.document, l)]
    .reverse()
    .find(
      (i) =>
        !i.hidden &&
        (hitTest(i.shape, world, 5 / zoom.value, l.units) ||
          contains(i.shape, world)),
    );
  if (!hit || hit.locked) return;
  void save(
    mirrorPrintNodes(
      l,
      [hit.instance.id],
      { x: hit.instance.x, y: hit.instance.y },
      hit.instance.rotation + (event.ctrlKey ? 0 : 90),
    ),
  );
}
function pageCenterSnap(
  base: PrintLayout,
  ids: string[],
  dx: number,
  dy: number,
) {
  const affected = new Set(printDescendants(base, ids));
  const shapes = resolvedPrintItems(editor.document, base)
    .filter((i) => affected.has(i.instance.id) && !i.hidden)
    .map((i) => i.shape);
  if (!shapes.length) return { dx, dy };
  const b = bounds(shapes, base.units),
    size = printableSize(base),
    tolerance = 8 / zoom.value;
  const center = { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy };
  const page = base.pages
    .map((p) => ({
      x: (p.column + 0.5) * size.width,
      y: (p.row + 0.5) * size.height,
    }))
    .sort(
      (a, b) =>
        Math.hypot(a.x - center.x, a.y - center.y) -
        Math.hypot(b.x - center.x, b.y - center.y),
    )[0];
  const guides: SmartGuide[] = [];
  const region = {
    x: page.x - size.width / 2,
    y: page.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
  if (!drag?.axis && Math.abs(center.x - page.x) <= tolerance) {
    dx += page.x - center.x;
    guides.push({
      axis: "x",
      coordinate: page.x,
      bounds: region,
      objectId: "print-page",
      alignment: "center",
    });
  }
  if (!drag?.axis && Math.abs(center.y - page.y) <= tolerance) {
    dy += page.y - center.y;
    guides.push({
      axis: "y",
      coordinate: page.y,
      bounds: region,
      objectId: "print-page",
      alignment: "center",
    });
  }
  if (guides.length)
    snapOverlay.value = {
      target: { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy },
      guides,
    };
  return { dx, dy };
}
function down(event: PointerEvent) {
  if (busy.value || editor.busy) return;
  if (event.button !== 0 && event.button !== 1) return;
  canvas.value!.focus();
  canvas.value!.setPointerCapture(event.pointerId);
  const p = pixel(event),
    world = worldFromPixel(p),
    l = preview.value ?? layout.value!;
  if (choosingObjects.value && event.button === 0 && !editor.space) {
    const hit = [...resolvedPrintItems(editor.document,layout.value!)].reverse().find(item => !item.hidden && !item.locked && (hitTest(item.shape,world,5/zoom.value,layout.value!.units) || contains(item.shape.kind === "text" ? {...item.shape,kind:"rectangle",radius:0} : item.shape,world)));
    updateToolSelection(objectSelection(selected.value,hit?.instance.id,event.shiftKey));
    if (!hit) drag={pixel:p,world,original:layout.value!,ids:[],pan:{...pan.value},rotate:false,marquee:true,pivot:selectionPivot(),numericStart:{x:0,y:0,angle:0}};
    return;
  }
  if (drawing.mode !== "select" && event.button === 0 && !editor.space) {
    if (!isPrintablePixel(p, l)) return;
    syncDrawingView();
    if (drawing.mode === "text") {
      event.preventDefault();
      if (editPrintText(event)) return;
    }
    drawing.pointerDown(p, event.button, event.shiftKey, event.altKey, event.ctrlKey);
    return;
  }
  if (placingPivot.value) {
    let pivot = world;
    if (!event.altKey) {
      const shapes = resolvedPrintItems(editor.document, l)
        .filter((i) => !i.hidden)
        .map((i) => i.shape);
      const candidates = objectSnap.value
        ? shapes
            .flatMap(snapCandidates)
            .map((c) => c.point)
            .filter(
              (q) => Math.hypot(q.x - world.x, q.y - world.y) <= 8 / zoom.value,
            )
            .sort(
              (a, b) =>
                Math.hypot(a.x - world.x, a.y - world.y) -
                Math.hypot(b.x - world.x, b.y - world.y),
            )
        : [];
      const aligned = objectSnap.value
        ? smartSnap(world, shapes, 8 / zoom.value)
        : { point: world, guides: [] };
      pivot =
        candidates[0] ??
        (aligned.guides.length
          ? aligned.point
          : snap.value
            ? {
                x: Math.round(world.x / editor.gridSize) * editor.gridSize,
                y: Math.round(world.y / editor.gridSize) * editor.gridSize,
              }
            : world);
    }
    customPivot.value = pivot;
    pivotMode.value = "custom";
    pivotPlacement = undefined;
    mirrorHover.value = undefined;
    if (tool.value !== "mirror") rebaseNumeric();
    placingPivot.value = false;
    draw();
    return;
  }
  if (
    tool.value === "mirror" &&
    selected.value.length &&
    event.button === 0 &&
    !editor.space
  ) {
    const target = mirrorTarget(world, p);
    if (target) applyMirror(target);
    return;
  }
  const handle = gizmoAt(p);
  if (handle) {
    if (handle === "rotate" && !customPivot.value)
      customPivot.value = selectionPivot();
    drag = {
      pixel: p,
      world,
      original: l,
      ids: movableSelection(),
      pan: { ...pan.value },
      rotate: handle === "rotate",
      axis: handle === "x" || handle === "y" ? handle : axisLock.value,
      marquee: false,
      pivot: selectionPivot(),
      numericStart: {
        x: parseLength(moveX.value, l.units) ?? 0,
        y: parseLength(moveY.value, l.units) ?? 0,
        angle: Number(turn.value) || 0,
      },
    };
    draw();
    return;
  }
  const hit = [...resolvedPrintItems(editor.document, l)]
    .reverse()
    .find(
      (i) =>
        isPrintablePixel(p, l) &&
        !i.hidden &&
        !i.locked &&
        (hitTest(i.shape, world, 5 / zoom.value, l.units) ||
          contains(
            i.shape.kind === "text"
              ? { ...i.shape, kind: "rectangle", radius: 0 }
              : i.shape,
            world,
          )),
    );
  const front = resolvedPrintItems(editor.document, l).some(
    (i) =>
      !i.hidden &&
      (hitTest(i.shape, world, 5 / zoom.value, l.units) ||
        contains(
          i.shape.kind === "text"
            ? { ...i.shape, kind: "rectangle", radius: 0 }
            : i.shape,
          world,
        )) &&
      isPrintablePixel(p, l),
  );
  const paper = paperAt(p, l);
  if (event.ctrlKey && !front && paper && event.button === 0) {
    const original = layout.value!;
    cancel();
    controlHeld.value = true;
    selected.value = [];
    pageGesture = {
      source: paper,
      pixel: p,
      original,
      dragged: false,
      selection: [...selectedPages.value],
      image: pageThumbnail(paper, original),
    };
    draw();
    return;
  }
  selectedPages.value = [];
  if (
    tool.value !== "select" &&
    !selected.value.length &&
    hit &&
    event.button === 0 &&
    !editor.space
  ) {
    selected.value = [hit.instance.id];
    customPivot.value = undefined;
    rebaseNumeric();
    draw();
    return;
  }
  if (
    tool.value !== "select" &&
    (!hit || !printDescendants(l, selected.value).includes(hit.instance.id))
  )
    return;
  if (event.button === 0 && !editor.space && hit) {
    if (tool.value === "select") select(hit.instance.id, event, true);
  } else if (event.button === 0 && !editor.space && !event.shiftKey)
    selected.value = [];
  const ids =
    hit && event.button === 0 && !editor.space ? movableSelection() : [];
  const items = l.instances.filter((i) =>
    printDescendants(l, ids).includes(i.id),
  );
  const pivot = selectionPivot();
  drag = {
    pixel: p,
    world,
    original: l,
    ids: [...ids],
    pan: { ...pan.value },
    rotate: false,
    axis: axisLock.value,
    marquee: !hit && event.button === 0 && !editor.space,
    pivot,
    numericStart: {
      x: parseLength(moveX.value, l.units) ?? 0,
      y: parseLength(moveY.value, l.units) ?? 0,
      angle: Number(turn.value) || 0,
    },
  };
  void draw();
}
let pendingMove: PointerEvent | undefined,
  moveFrame = 0;
function flushMove() {
  if (moveFrame) cancelAnimationFrame(moveFrame);
  moveFrame = 0;
  const event = pendingMove;
  pendingMove = undefined;
  if (event) moveNow(event);
}
function move(event: PointerEvent) {
  clipboardPixel = pixel(event);
  pendingMove = event;
  if (!moveFrame) moveFrame = requestAnimationFrame(flushMove);
}
function moveNow(event: PointerEvent) {
  if (drawing.mode !== "select" && !drag) {
    drawing.pointerMove(drawingPixel(event), event.altKey, event.ctrlKey, event.shiftKey);
    snapOverlay.value = { target: drawing.snapTarget ?? undefined, guides: drawing.smartGuides };
    return;
  }
  hoverHandle.value = placingPivot.value ? undefined : gizmoAt(pixel(event));
  if (
    tool.value === "mirror" &&
    !drag &&
    !placingPivot.value &&
    !editor.space
  ) {
    mirrorHover.value = mirrorTarget(
      worldFromPixel(pixel(event)),
      pixel(event),
    );
    draw();
  }
  if (pageGesture) {
    const p = pixel(event),
      g = pageGesture;
    if (Math.hypot(p.x - g.pixel.x, p.y - g.pixel.y) < 6 && !g.dragged) return;
    g.dragged = true;
    pageDragState.value = {
      x: event.clientX,
      y: event.clientY,
      width: 156,
      height: 28,
      label: `Page ${numberedPages(g.original).findIndex((p) => pageKey(p) === pageKey(g.source)) + 1}`,
      count: 1,
      valid: false,
      image: g.image,
    };
    if (
      p.x < 20 ||
      p.y < 20 ||
      p.x > canvas.value!.clientWidth ||
      p.y > canvas.value!.clientHeight
    ) {
      preview.value = undefined;
      pageDestination.value = undefined;
      selectedPages.value = g.selection;
      draw();
      return;
    }
    const l = g.original;
    const dx = (p.x - g.pixel.x) / zoom.value,
      dy = (p.y - g.pixel.y) / zoom.value;
    const axis =
      Math.abs(dx / (l.width + gutter)) >= Math.abs(dy / (l.height + gutter))
        ? "x"
        : "y";
    const target = {
      column: g.source.column + Math.round(dx / (l.width + gutter)),
      row: g.source.row + Math.round(dy / (l.height + gutter)),
    };
    try {
      preview.value = movePrintPage(editor.document, l, g.source, target, axis);
      pageDestination.value = pageKey(target);
      pageDragState.value = { ...pageDragState.value!, valid: true };
      error.value = "";
      selectedPages.value = [pageKey(target)];
    } catch (reason) {
      preview.value = undefined;
      selectedPages.value = g.selection;
      pageDestination.value = undefined;
      error.value = String(reason);
    }
    draw();
    return;
  }
  if (!drag) return;
  const p = pixel(event);
  if (drag.marquee) {
    marqueePixel = p;
    void draw();
    return;
  }
  if (!drag.ids.length) {
    pan.value = {
      x: drag.pan.x + p.x - drag.pixel.x,
      y: drag.pan.y + p.y - drag.pixel.y,
    };
    void draw();
    return;
  }
  snapOverlay.value = { guides: [] };
  const world = worldFromPixel(p);
  let dx = world.x - drag.world.x,
    dy = world.y - drag.world.y,
    angle = 0;
  if (drag.rotate) {
    const theta = Math.atan2(world.y - drag.pivot.y, world.x - drag.pivot.x);
    drag.accumulated =
      (drag.accumulated ?? 0) +
      unwrapRotation(
        drag.lastAngle ??
          Math.atan2(drag.world.y - drag.pivot.y, drag.world.x - drag.pivot.x),
        theta,
      );
    drag.lastAngle = theta;
    angle = snapRotation(drag.accumulated, event);
    rotationReadout.value = {
      point: p,
      angle: (drag.numericStart?.angle ?? 0) + angle,
    };
    dx = dy = 0;
  } else {
    if (!event.altKey) {
      const items = resolvedPrintItems(editor.document, drag.original).filter(
        (i) => !i.hidden,
      );
      const result = snapRigidMove(
        items.map((i) => i.shape),
        printDescendants(drag.original, drag.ids),
        { x: dx, y: dy },
        {
          grid: snap.value,
          objects: objectSnap.value,
          gridSize: editor.gridSize,
          tolerance: 8 / zoom.value,
          anchor: drag.snapAnchor,
        },
      );
      const centered =
        snap.value && !result.objectSnapped
          ? pageCenterSnap(
              drag.original,
              drag.ids,
              result.delta.x,
              result.delta.y,
            )
          : { dx: result.delta.x, dy: result.delta.y };
      dx = centered.dx;
      dy = centered.dy;
      drag.snapAnchor = result.anchor;
      if (!snapOverlay.value.guides.length)
        snapOverlay.value = { target: result.target, guides: result.guides };
    }
  }
  if (drag.axis) {
    snapOverlay.value = { guides: [] };
    const a = gizmoAngle(),
      ux = drag.axis === "x" ? Math.cos(a) : -Math.sin(a),
      uy = drag.axis === "x" ? Math.sin(a) : Math.cos(a),
      distance = dx * ux + dy * uy;
    dx = distance * ux;
    dy = distance * uy;
  }
  if (tool.value !== "select") {
    updatingNumeric = true;
    const base = drag.numericStart ?? { x: 0, y: 0, angle: 0 },
      a = numericOrientation;
    moveX.value = editableLength(
      base.x + dx * Math.cos(a) + dy * Math.sin(a),
      drag.original.units,
    );
    moveY.value = editableLength(
      base.y - dx * Math.sin(a) + dy * Math.cos(a),
      drag.original.units,
    );
    turn.value = String(base.angle + angle);
    updatingNumeric = false;
  }
  preview.value = transformPrintNodes(
    drag.original,
    drag.ids,
    dx,
    dy,
    angle,
    drag.pivot,
  );
  void draw();
}
async function up(event?: PointerEvent) {
  flushMove();
  if (drawing.mode !== "select" && event && !drag) {
    drawing.pointerUp(drawingPixel(event), event.altKey, event.shiftKey, event.ctrlKey);
    return;
  }
  rotationReadout.value = undefined;
  snapOverlay.value = { guides: [] };
  if (pageGesture) {
    const g = pageGesture,
      next = preview.value;
    pageGesture = undefined;
    pageDragState.value = undefined;
    pageDestination.value = undefined;
    if (!g.dragged) {
      const key = pageKey(g.source);
      selectedPages.value = selectedPages.value.includes(key)
        ? selectedPages.value.filter((k) => k !== key)
        : [...selectedPages.value, key];
      draw();
      return;
    }
    if (next && JSON.stringify(next) !== JSON.stringify(g.original)) {
      await save(next);
      selectedPages.value = [];
    }
    preview.value = undefined;
    draw();
    return;
  }

  if (!drag) return;
  if (drag.marquee && marqueePixel) {
    const end = worldFromPixel(marqueePixel),
      start = drag.world;
    const rect = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
    const ids = resolvedPrintItems(editor.document, drag.original)
      .filter((i) => {
        if (i.hidden || i.locked) return false;
        const b = printArtworkBounds(editor.document, drag!.original, i);
        return (
          b.x <= rect.x + rect.width &&
          b.x + b.width >= rect.x &&
          b.y <= rect.y + rect.height &&
          b.y + b.height >= rect.y
        );
      })
      .map((i) => i.instance.id);
    if (choosingObjects.value) updateToolSelection([...new Set([...selected.value,...ids])]);
    else selected.value = [...new Set([...selected.value, ...ids])];
  }

  const next = preview.value,
    original = drag?.original;
  if (next && drag && !drag.rotate && customPivot.value) {
    const id = printDescendants(drag.original, drag.ids)[0],
      before = drag.original.instances.find((i) => i.id === id),
      after = next.instances.find((i) => i.id === id);
    if (before && after)
      customPivot.value = {
        x: customPivot.value.x + after.x - before.x,
        y: customPivot.value.y + after.y - before.y,
      };
  }
  drag = undefined;
  marqueePixel = undefined;
  if (tool.value !== "select") {
    draw();
    return;
  }
  if (
    next &&
    original === editor.document.printLayouts?.find((l) => l.id === next.id)
  ) {
    // Keep the final pointer preview visible until the worker accepts the commit.
    await save(next);
    if (preview.value === next) preview.value = undefined;
    draw();
  } else cancel();
}
function wheel(event: WheelEvent) {
  if (drawing.mode === "measurement" && event.shiftKey) {
    if (event.deltaY) drawing.adjustConstructionCount(event.deltaY < 0 ? 1 : -1);
    return;
  }
  if (!event.ctrlKey && !event.metaKey) {
    pan.value = {
      x: pan.value.x - event.deltaX,
      y: pan.value.y - event.deltaY,
    };
    draw();
    return;
  }
  const p = pixel(event),
    old = zoom.value;
  zoom.value = Math.max(
    0.1,
    Math.min(20, old * Math.exp(-event.deltaY * 0.002)),
  );
  pan.value = {
    x: p.x - ((p.x - pan.value.x) * zoom.value) / old,
    y: p.y - ((p.y - pan.value.y) * zoom.value) / old,
  };
  void draw();
}
function fit() {
  const l = layout.value,
    el = canvas.value;
  if (!l || !el) return;
  const positions = l.pages.map((p) => pagePosition(p, l));
  const x = Math.min(...positions.map((p) => p.x)),
    y = Math.min(...positions.map((p) => p.y)),
    w = Math.max(...positions.map((p) => p.x)) + l.width - x,
    h = Math.max(...positions.map((p) => p.y)) + l.height - y;
  zoom.value = Math.max(
    0.05,
    Math.min((el.clientWidth - 80) / w, (el.clientHeight - 80) / h),
  );
  pan.value = {
    x: (el.clientWidth - w * zoom.value) / 2 - x * zoom.value,
    y: (el.clientHeight - h * zoom.value) / 2 - y * zoom.value,
  };
  void draw();
}
let clipboardPixel: Point | undefined;
function printClipboard(event: ClipboardEvent) {
  const target = event.target as HTMLElement;
  if (
    !layout.value ||
    !clipboardPixel ||
    !canManageObjects.value ||
    drag ||
    pageGesture ||
    sourcePointer ||
    event.defaultPrevented ||
    target.closest?.("input,textarea,select,[contenteditable=true]") ||
    document.querySelector("[role=dialog]")
  )
    return;
  syncDrawing();
  drawing.pointerMove(clipboardPixel, true, false, false);
  if (event.type === "copy") {
    const text = drawing.copyObjects();
    if (text) { event.clipboardData?.setData("text/plain", text); event.preventDefault(); }
  } else {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text.includes('"leather-pattern-designer-clipboard"')) return;
    event.preventDefault();
    void drawing.pasteObjects(text).then(() => {
      selected.value = [...drawing.selectedGroups, ...drawing.selected];
      draw();
    });
  }
}
function keyboard(event: KeyboardEvent) {
  if (layout.value && event.key === "Control") {
    controlHeld.value = true;
    draw();
  }
  if (
    !layout.value ||
    event.defaultPrevented ||
    event.isComposing ||
    document.querySelector("[role=dialog]")
  )
    return;
  const target = event.target as HTMLElement;
  if (target.closest("input,textarea,select,[contenteditable=true]")) return;
  const mod = event.ctrlKey || event.metaKey,
    key = event.key.toLowerCase();
  if (mod && key === "s") {
    event.preventDefault();
    cancel();
    void editor.save();
    return;
  }
  if (mod && (key === "z" || key === "y")) {
    event.preventDefault();
    cancel();
    void editor.transact(event.shiftKey || key === "y" ? "redo" : "undo");
    return;
  }
  if (!target.closest(".print-workspace")) return;
  if (drawing.mode === "measurement" && !mod && (key === "arrowup" || key === "arrowdown")) {
    event.preventDefault();
    drawing.adjustConstructionCount(key === "arrowup" ? 1 : -1);
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    editor.space = true;
    return;
  }
  if (!mod && (key === "t" || key === "d" || key === "a")) {
    event.preventDefault();
    syncDrawing();
    if (key === "t") drawing.setMode("text");
    else drawing.cycle(key === "a" ? "drawing" : "measurement", event.shiftKey ? -1 : 1);
    return;
  }
  if (drawing.mode !== "select" && key === "enter") { event.preventDefault(); drawing.confirmMeasurement(); return; }
  if (drawing.mode !== "select" && key === "backspace" && drawing.pending.length) {
    event.preventDefault(); drawing.pending = drawing.pending.slice(0, -1); drawing.notify(); return;
  }
  if (key === "enter" && tool.value !== "select") {
    event.preventDefault();
    applyTransform();
    return;
  }
  if ((key === "x" || key === "y") && tool.value === "move") {
    axisLock.value = key;
    if (drag) drag.axis = key;
    draw();
    return;
  }
  if (key === "escape") {
    if (cancelPivotPlacement()) return;
    cancel();
    tool.value = "select";
    return;
  }
  if (mod && key === "a") {
    event.preventDefault();
    if (tool.value !== "select") {
      if (choosingObjects.value) updateToolSelection(rows.value.filter(r=>!r.hidden && !r.locked).map(r=>r.node.id));
      return;
    }
    selected.value = rows.value
      .filter((r) => !r.hidden && !r.locked)
      .map((r) => r.node.id);
    void draw();
    return;
  }
  if (mod && (key === "c" || key === "v")) return;
  if (mod && key === "d") {
    event.preventDefault();
    duplicate();
    return;
  }
  if (mod && key === "g") {
    event.preventDefault();
    newGroup();
    return;
  }
  if (key === "delete" || key === "backspace") {
    event.preventDefault();
    if (selectedPages.value.length) {
      try {
        void save(
          deletePrintPages(editor.document, layout.value, selectedPages.value),
        );
        selectedPages.value = [];
      } catch (reason) {
        error.value = String(reason);
      }
    } else deleteSelection();
    return;
  }
  if (key === "f") {
    event.preventDefault();
    fit();
    return;
  }
  if (!mod && !event.shiftKey && key === "g") chooseTool("move");
  if (!mod && !event.shiftKey && key === "e") chooseTool("rotate");
  if (!mod && !event.shiftKey && key === "m") chooseTool("mirror");
  if (!mod && !event.shiftKey && key === "v") {
    if (tool.value !== "select") beginPivotPlacement();
    else chooseTool("select");
  }
  if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
    event.preventDefault();
    if (!canManageObjects.value) return;
    const step =
      (layout.value.units === "mm" ? 1 : 25.4 / 16) * (event.shiftKey ? 10 : 1);
    void save(
      transformPrintNodes(
        layout.value,
        movableSelection(),
        key === "arrowleft" ? -step : key === "arrowright" ? step : 0,
        key === "arrowup" ? -step : key === "arrowdown" ? step : 0,
        0,
      ),
    );
  }
}
onMounted(() => {
  observer = new ResizeObserver(() => void draw());
  unsubscribe = editor.subscribe(() => {
    if (sourceImport && sourceImport.document !== editor.document) sourceEnd();
    if (
      pageGesture &&
      editor.document.printLayouts?.find((l) => l.id === active.value) !==
        pageGesture.original
    ) {
      cancel();
      error.value = "Layout changed during page movement; try again";
    }
    if (
      drag &&
      editor.document.printLayouts?.find((l) => l.id === active.value) !==
        drag.original
    )
      cancel();
    void draw();
  });
  window.addEventListener("pointerdown", sourceOutsideDown, true);
  window.addEventListener("keydown", keyboard);
  window.addEventListener("copy", printClipboard);
  window.addEventListener("paste", printClipboard);
  window.addEventListener("blur", clearControl);
  window.addEventListener("keyup", controlUp);
});
watch(canvas, (el) => {
  observer?.disconnect();
  if (el) {
    observer?.observe(el);
    void draw();
  }
});
onUnmounted(() => {
  stopDrawing();
  tabEnd();
  printDrag.cancel();
  sourceEnd();
  if (moveFrame) cancelAnimationFrame(moveFrame);
  generation++;
  cancelAnimationFrame(scheduledFrame);
  observer?.disconnect();
  unsubscribe?.();
  window.removeEventListener("pointerdown", sourceOutsideDown, true);
  window.removeEventListener("keydown", keyboard);
  window.removeEventListener("copy", printClipboard);
  window.removeEventListener("paste", printClipboard);
  window.removeEventListener("blur", clearControl);
  window.removeEventListener("keyup", controlUp);
  editor.printLayoutActive = false;
});
defineExpose({
  openExport: () => {
    if (layout.value) exporting.value = true;
  },
});
</script>
<template>
  <ObjectPreview v-bind="hoverPreview" :units="layout?.units" />
  <ReorderFloating :state="printDragState" />
  <ReorderFloating :state="tabDragState" />
  <ReorderFloating :state="pageDragState" />
  <TransitionGroup
    :css="false"
    name="reorder"
    tag="div"
    class="print-tabs"
    role="tablist"
    aria-label="Workspace views"
    @keydown="tabKey"
  >
    <button
      key="grid"
      role="tab"
      :aria-selected="!layout"
      @click="switchTab('')"
    >
      Model
    </button>
    <template v-for="entry in tabEntries" :key="entry.key">
      <ReorderSlot
        v-if="entry.slot"
        :height="tabDragState?.height ?? 28"
        :width="tabDragState?.width"
      />
      <ContextMenuRoot
        v-for="tab in entry.slot ? [] : [entry.tab]"
        :key="tab.id"
      >
        <ContextMenuTrigger as-child>
          <button
            role="tab"
            :data-print-tab="tab.id"
            :aria-selected="active === tab.id"
            :draggable="false"
            @dragstart.prevent
            @pointerdown="tabDown($event, tab.id)"
            @click="!suppressTabClick && switchTab(tab.id)"
          >
            {{ tab.name }}
          </button>
        </ContextMenuTrigger>
        <ContextMenuPortal
          ><ContextMenuContent class="object-context-menu">
            <ContextMenuItem
              :disabled="busy || e.busy"
              @select="openSettings(tab.id)"
              >Layout settings</ContextMenuItem
            >
            <ContextMenuItem
              :disabled="busy || e.busy"
              @select="deleteLayout(tab.id)"
              >Delete layout</ContextMenuItem
            >
          </ContextMenuContent></ContextMenuPortal
        >
      </ContextMenuRoot>
    </template>
    <button
      key="create"
      aria-label="Create print layout"
      :disabled="!e.ready || busy"
      @click="openCreate"
    >
      +
    </button>
  </TransitionGroup>
  <DialogRoot v-model:open="creating"
    ><DialogPortal
      ><DialogOverlay class="print-dialog-overlay" /><DialogContent
        class="print-dialog"
        ><DialogTitle>{{
          settingsId ? "Print layout settings" : "Create print layout"
        }}</DialogTitle
        ><DialogDescription
          >Choose physical paper dimensions, print margins, and display
          units.</DialogDescription
        >
        <form @submit.prevent="create">
          <label
            >Name
            <input
              v-model="name"
              @input="nameEdited = true"
              maxlength="200"
              placeholder="Use paper format" /></label
          ><label
            >Format
            <select v-model="format" aria-label="Format">
              <option v-for="(_, key) in paperFormats" :key="key">
                {{ key }}
              </option>
              <option>Custom</option>
            </select></label
          >
          <label
            >Units
            <select
              :value="units"
              aria-label="Units"
              @change="
                changeUnits(
                  ($event.target as HTMLSelectElement).value as UnitMode,
                )
              "
            >
              <option value="mm">Millimetres</option>
              <option value="in-decimal">Decimal inches</option>
              <option value="in-fractional">Fractional inches</option>
            </select></label
          >
          <template v-if="format === 'Custom'"
            ><label>Paper width <input v-model="width" required /></label
            ><label
              >Paper height
              <input v-model="height" required /></label></template
          ><label>Margin <input v-model="margin" required /></label>
          <div
            class="orientation-segments"
            role="group"
            aria-label="Paper orientation"
          >
            <button
              v-for="wide in [false, true]"
              :key="String(wide)"
              type="button"
              :aria-label="wide ? 'Landscape' : 'Portrait'"
              :title="wide ? 'Landscape' : 'Portrait'"
              :aria-pressed="landscape === wide"
              @click="landscape = wide"
            >
              <svg
                width="30"
                height="30"
                viewBox="0 0 30 30"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                aria-hidden="true"
              >
                <rect
                  :x="wide ? 3 : 7"
                  :y="wide ? 7 : 3"
                  :width="wide ? 24 : 16"
                  :height="wide ? 16 : 24"
                  rx="1"
                />
                <path
                  :d="wide ? 'M7 12H23M7 17H23' : 'M11 10H19M11 15H19M11 20H19'"
                />
              </svg>
            </button>
          </div>
          <p v-if="error" role="alert">{{ error }}</p>
          <div class="print-actions">
            <DialogClose type="button">Cancel</DialogClose
            ><button :disabled="busy">
              {{ settingsId ? "Apply settings" : "Create" }}
            </button>
          </div>
        </form></DialogContent
      ></DialogPortal
    ></DialogRoot
  >
  <section v-if="layout" class="print-workspace" aria-label="Print workspace">
    <ToolRail v-if="left" aria-label="Print tools">
      <RailButton
        v-for="value in ['select', 'move', 'rotate', 'mirror'] as const"
        :key="value"
        :shortcut="({ select: 'V', move: 'G', rotate: 'E', mirror: 'M' })[value]"
        :aria-keyshortcuts="({ select: 'v', move: 'g', rotate: 'e', mirror: 'm' })[value]"
        :aria-pressed="drawingState.mode === 'select' && tool === value"
        :title="
          value === 'select'
            ? 'Select (V)'
            : value === 'move'
              ? 'Move (G)'
              : value === 'rotate'
                ? 'Rotate (E)'
                : 'Mirror (M)'
        "
        :aria-label="
          value === 'select'
            ? 'Select (V)'
            : value === 'move'
              ? 'Move (G)'
              : value === 'rotate'
                ? 'Rotate (E)'
                : 'Mirror (M)'
        "
        :disabled="value !== 'select' && !!printSelectionError"
        @click="chooseTool(value)"
      >
        <span class="tool-icon">
          <ModeIcon v-if="value === 'select'" mode="select" />
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path :d="value === 'move'
              ? 'M3 12H21M12 3V21M3 12L7 8M3 12L7 16M21 12L17 8M21 12L17 16M12 3L8 7M12 3L16 7M12 21L8 17M12 21L16 17'
              : value === 'rotate'
                ? 'M19 8A8 8 0 1 0 20 16M19 3V9H13'
                : 'M12 2V22M9 5L3 19H9ZM15 5L21 19H15Z'" />
          </svg>
        </span>
      </RailButton>
      <div class="rail-divider" role="separator" />
      <ToolButton :controller="drawing" :tool="{ id: 'text', key: 'T', label: 'Text' }" />
      <ToolButton :controller="drawing" :tool="{ id: 'measurement', key: 'D', label: 'Measurements' }" />
      <ToolButton :controller="drawing" :tool="{ id: 'arrow', key: 'A', label: 'Drawing tools' }" />
      <RailButton aria-label="Import image" title="Import image" :disabled="!e.ready || busy" @click="imagePicker?.click()"><span class="tool-icon"><ModeIcon mode="image" /></span></RailButton>
      <input ref="imagePicker" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" hidden @change="importLocalImage" />
      <div class="rail-divider" role="separator" />
      <RailButton
        title="Undo (Ctrl/⌘+Z)"
        aria-label="Undo"
        :disabled="!e.canUndo || busy"
        @click="
          cancel();
          editor.transact('undo');
        "
      >
        ↶
      </RailButton>
      <RailButton
        title="Redo (Ctrl/⌘+Shift+Z)"
        aria-label="Redo"
        :disabled="!e.canRedo || busy"
        @click="
          cancel();
          editor.transact('redo');
        "
      >
        ↷
      </RailButton>
      <RailButton title="Fit (F)" aria-label="Fit" @click="fit">
        <span class="tool-icon"><FitIcon /></span>
      </RailButton>
    </ToolRail>
    <div class="print-canvas">
      <button
        class="edge-tab edge-left"
        :aria-label="left ? 'Hide tools' : 'Show tools'"
        :aria-expanded="left"
        @click="left = !left"
      >
        {{ left ? "‹" : "›" }}
      </button>
      <button
        class="edge-tab edge-right"
        :aria-label="panel ? 'Hide inspector' : 'Show inspector'"
        :aria-expanded="panel"
        @click="drawing.finishProperty(); panel = !panel"
      >
        {{ panel ? "›" : "‹" }}
      </button>
      <button
        class="edge-tab edge-bottom"
        :class="{ 'above-status': bottom }"
        :aria-label="bottom ? 'Hide status bar' : 'Show status bar'"
        :aria-expanded="bottom"
        @click="bottom = !bottom"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            :d="bottom ? 'M3 4L6 7L9 4' : 'M3 8L6 5L9 8'"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
      </button>
      <canvas ref="previewCanvas" class="drawing-preview" aria-hidden="true" />
      <Viewport ref="textViewport" :controller="drawing" text-only />
      <ConstructionMeasurements :controller="drawing" />
      <canvas
        ref="canvas"
        aria-label="Print layout canvas"
        tabindex="0"
        @pointerenter="clipboardPixel = pixel($event)"
        @pointerleave="
          clipboardPixel = undefined;
          hoverHandle = undefined;
          mirrorHover = undefined;
          draw();
        "
        :style="{
          cursor: pageDragState
            ? pageDragState.valid
              ? 'grabbing'
              : 'not-allowed'
            : printCursor,
        }"
        @dblclick="editPrintText"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="!sourceImport && cancel()"
        @lostpointercapture="(drag || pageGesture) && cancel()"
        @wheel.prevent="wheel"
        @contextmenu.prevent="contextMenu"
      />
      <button
        v-for="(button, index) in pageButtons"
        :key="`${button.column}:${button.row}:${index}`"
        class="add-paper"
        :style="{ left: `${button.x}px`, top: `${button.y}px` }"
        :aria-label="button.label"
        :disabled="busy"
        @click="addPage(button.column, button.row)"
      >
        +
      </button>
      <template v-if="controlHeld && !pageDragState">
        <button
          v-for="page in layout.pages"
          :key="`delete:${pageKey(page)}`"
          class="delete-paper"
          :style="{
            left: `${pan.x + (pagePosition(page, layout).x + layout.width) * zoom - 16}px`,
            top: `${pan.y + pagePosition(page, layout).y * zoom + 16}px`,
          }"
          :aria-label="`Delete page ${page.column},${page.row}`"
          :disabled="busy"
          @click.stop="deletePage(page)"
        >
          ×
        </button>
      </template>
      <div
        v-if="tool !== 'select'"
        class="print-transform transform-options"
        @keydown.enter.prevent="applyTransform"
        @keydown.esc.stop.prevent="cancelPivotPlacement() || cancel()"
      >
        <strong>{{
          tool === "move" ? "Move" : tool === "rotate" ? "Rotate" : "Mirror"
        }}</strong>
        <ToolObjectPicker :count="toolObjectCount" :choosing="choosingObjects" :error="choosingObjects ? printSelectionError : undefined" @toggle="toggleObjects" /><hr>
        <p v-if="error" role="alert">{{ error }}</p>
        <small>{{
          tool === "move"
            ? "Drag the gizmo or enter X/Y distances to move the selection."
            : tool === "rotate"
              ? "Drag the rotation ring or enter an angle to rotate the selection."
              : "Click an axis or straight outline edge on the canvas to mirror."
        }}</small>
        <div class="transform-inputs">
          <label v-if="tool === 'move'"
            >Move X
            <LengthInput
              fixed
              :units="layout.units"
              :value="parseLength(moveX, layout.units) ?? 0"
              aria-label="Print move X"
              @commit="error = ''; moveX = editableLength($event, layout.units)"
              @invalid="error = 'Enter a valid distance'" /></label
          ><label v-if="tool === 'move'"
            >Move Y
            <LengthInput
              fixed
              :units="layout.units"
              :value="parseLength(moveY, layout.units) ?? 0"
              aria-label="Print move Y"
              @commit="error = ''; moveY = editableLength($event, layout.units)"
              @invalid="error = 'Enter a valid distance'" /></label
          ><label v-if="tool === 'rotate'"
            >Rotate °
            <LengthInput scalar :step="1" :value="Number(turn)" aria-label="Print rotation" @commit="error = ''; turn = String($event)" @invalid="error = 'Enter a finite rotation'" /></label>
        </div>
        <label
          >Axes<select v-model="axes">
            <option value="local">Local</option>
            <option value="world">World</option>
          </select></label
        >
        <PivotSelector :disabled="choosingObjects" :mode="pivotMode" :placing="placingPivot" @change="setPivotMode" @cancel="cancelPivotPlacement" />
        <div class="actions tool-popup-footer">
          <button
            :disabled="choosingObjects || !selected.length || busy || !!error || !preview"
            @click="applyTransform"
          >
            Apply</button
          ><button @click="cancel">Cancel</button>
        </div>
      </div>
      <div v-if="bottom" class="print-status">
        <span
          >{{ formatLength(layout.width, layout.units) }} ×
          {{ formatLength(layout.height, layout.units) }}
          {{ layout.units === "mm" ? "mm" : "in" }} ·
          {{ layout.pages.length }} pages</span
        >
        <div class="center-settings">
          <label><input type="checkbox" v-model="snap" />Grid snap</label
          ><label
            ><input type="checkbox" v-model="objectSnap" />Object snap</label
          >
        </div>
        <span style="margin-left: auto">{{ Math.round(zoom * 100) }}%</span>
        <span class="app-version" title="Application version">v{{ appVersion }}</span>
      </div>
    </div>
    <aside v-if="panel" aria-label="Print objects and settings">
      <p v-if="!creating && !error && tool === 'select' && drawingState.message !== 'Ready'" role="status">{{ drawingState.message }}</p>
      <PanelSection
        section-key="print-grid-objects"
        title="Model objects"
        class="sidebar-section print-object-section"
      >
        <div ref="sourceList" class="print-list" aria-label="Model source objects">
          <div
            v-for="row in sourceRows"
            :key="row.node.id"
            :style="{ paddingLeft: `${row.depth * 14}px` }"
            :draggable="false"
            @pointerenter="previewRow($event, row.node.id)"
            @pointerleave="hoverPreview.id = undefined"
            @dragstart.prevent
            @pointerdown="
              $event.target === $event.currentTarget &&
              sourceDown($event, row.node.id)
            "
          >
            <button
              v-if="row.node.kind === 'group'"
              :aria-label="`Toggle ${row.node.name}`"
              @click="toggleCollapse(`source:${row.node.id}`)"
            >
              {{ collapsed.has(`source:${row.node.id}`) ? "▸" : "▾" }}</button
            ><button
              class="print-object-name"
              :aria-pressed="selectedSources.includes(row.node.id)"
              :draggable="false"
              @dragstart.prevent
              @pointerdown="sourceDown($event, row.node.id)"
              @click="!suppressSourceClick && selectSource(row.node.id, $event)"
            >
              {{
                row.node.kind === "group"
                  ? row.node.name
                  : e.document.shapes.find((s) => s.id === row.node.id)?.name
              }}</button
            ><button
              :aria-label="`Import ${row.node.kind === 'group' ? row.node.name : e.document.shapes.find((s) => s.id === row.node.id)?.name}`"
              :disabled="busy"
              @click="importSource(row.node.id)"
            >
              Import
            </button>
          </div>
          <p v-if="!sourceRows.length">
            Create objects on Model, then import them here.
          </p>
        </div>
      </PanelSection>
      <PanelSection
        section-key="print-instances"
        title="Print objects"
        class="sidebar-section print-object-section"
      >
        <TransitionGroup
          :css="false"
          name="reorder"
          tag="div"
          class="print-list"
          aria-label="Print object tree"
          @click.capture="
            suppressPrintClick &&
            ($event.preventDefault(), $event.stopPropagation())
          "
        >
          <template v-for="entry in printPreviewRows" :key="entry.key">
            <ReorderSlot
              v-if="entry.slot"
              :height="printDragState?.height ?? 28"
              :depth="entry.depth"
              :indent="14"
            />
            <div
              v-for="row in entry.slot ? [] : [entry.row]"
              :key="row.node.id"
              :data-print-row="row.node.id"
              class="print-row"
              :class="{
                'print-selected': selected.includes(row.node.id),
                'print-hidden': row.hidden,
                'print-drop-target':
                  !!printDragState && printTargetRow === row.node.id,
              }"
              :style="{ paddingLeft: `${row.depth * 14}px` }"
              :draggable="false"
              @dragstart.prevent
              @pointerdown="printDown($event, row.node.id)"
            >
              <button
                v-if="row.node.kind === 'group'"
                :aria-label="`Expand ${nodeName(row.node)}`"
                @click="toggleCollapse(row.node.id)"
              >
                {{ collapsed.has(row.node.id) ? "▸" : "▾" }}</button
              ><input
                v-if="renameId === row.node.id"
                v-model="renameValue"
                autofocus
                @keydown.enter="renameFinish"
                @blur="renameFinish"
                @keydown.esc="renameId = ''"
              /><ContextMenuRoot v-else>
                <ContextMenuTrigger
                  as-child
                  @contextmenu="openPrintObjectMenu(row.node.id)"
                >
                  <button
                    class="print-object-name"
                    :aria-pressed="selected.includes(row.node.id)"
                    @click="select(row.node.id, $event)"
                    @dblclick="renameStart(row.node)"
                  >
                    {{ nodeName(row.node) }}
                  </button>
                </ContextMenuTrigger>
                <ContextMenuPortal
                  ><ContextMenuContent
                    class="object-context-menu"
                    @keydown.esc.stop
                  >
                    <ContextMenuItem
                      :disabled="!canManageObjects || !selected.length"
                      @select="duplicate"
                      >Duplicate</ContextMenuItem
                    >
                    <ContextMenuItem
                      :disabled="
                        !canManageObjects || !movableSelection().length
                      "
                      @select="newGroup"
                      >Group</ContextMenuItem
                    >
                    <ContextMenuItem
                      :disabled="
                        !canManageObjects || !movableSelection().length
                      "
                      @select="deleteSelection"
                      >Delete</ContextMenuItem
                    >
                  </ContextMenuContent></ContextMenuPortal
                > </ContextMenuRoot
              ><button
                :aria-label="`${row.hidden ? 'Show' : 'Hide'} print ${nodeName(row.node)}`"
                :disabled="!canManageObjects"
                @click="editState(row.node.id, 'hidden')"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path d="M2 12Q12 0 22 12Q12 24 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  <path v-if="row.hidden" d="M3 3L21 21" />
                </svg></button
              ><button
                :aria-label="`${row.locked ? 'Unlock' : 'Lock'} print ${nodeName(row.node)}`"
                :disabled="!canManageObjects"
                @click="editState(row.node.id, 'locked')"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <rect
                    x="5"
                    y="10"
                    width="14"
                    height="11"
                    rx="2"
                    :fill="row.locked ? 'currentColor' : 'none'"
                  />
                  <path
                    :d="
                      row.locked
                        ? 'M8 10V6a4 4 0 018 0v4'
                        : 'M8 10V6a4 4 0 018 0'
                    "
                  />
                </svg>
              </button>
              <span
                v-if="row.node.kind === 'instance' || row.node.sourceId || row.node.unlinked"
                class="print-link-control"
                role="group"
                :title="unlinkHint(row.node)"
                :aria-label="isUnlinked(row.node) ? unlinkHint(row.node) : undefined"
                :tabindex="isUnlinked(row.node) ? 0 : undefined"
                @pointerdown.stop
              >
                <button
                  :aria-label="`${isUnlinked(row.node) ? 'Unlinked' : 'Unlink'} print ${nodeName(row.node)}`"
                  :disabled="!canManageObjects || isUnlinked(row.node)"
                  @click.stop="unlink(row.node)"
                ><LinkIcon :broken="isUnlinked(row.node)" /></button>
              </span>
            </div>
          </template>
          <div
            v-if="printDragState"
            key="end"
            class="print-end-drop"
            aria-label="Move to end of Print objects"
          />
          <p v-if="!rows.length" key="empty">
            Import objects or folders from Model.
          </p>
        </TransitionGroup>
      </PanelSection>
      <section class="sidebar-section" aria-label="Pages">
        <h2>Pages</h2>
        <p>
          Hold Ctrl and drag blank paper on the canvas to move a page to an
          insertion edge. Pages with spanning artwork cannot move.
        </p>
        <ul class="page-contents">
          <li v-for="entry in listedPages" :key="pageKey(entry.page)">
            Page {{ entry.number }}
            <ul>
              <li v-for="item in entry.items" :key="item.instance.id">
                {{ item.instance.name ?? item.source.name
                }}<span v-if="item.hidden"> (hidden)</span>
              </li>
            </ul>
          </li>
        </ul>
      </section>
      <Inspector v-if="drawingState.active.length && drawingState.active.every(s => layout?.instances.find(i => i.id === s.id)?.snapshot)" :controller="drawing" />
      <p v-if="error && (tool === 'select' || !selected.length)" role="alert">
        {{ error }}
      </p>
      <p class="print-help">
        Drag to move. Select Rotate and drag to rotate; Rotation snaps to 1°,
        Shift 5°, Ctrl 10°; Alt rotates freely. Space-drag pans. Alt bypasses
        snapping. Source geometry stays linked until you unlink it in Print objects.
      </p>
    </aside>
  </section>
  <PrintExport
    v-if="layout"
    :open="exporting"
    :document="e.document"
    :layout="layout"
    :revision="e.revision"
    @close="exporting = false"
  />
</template>
<style>
.print-dialog-overlay {
  position: fixed;
  inset: 0;
  background: #0008;
  z-index: 100;
}
.print-dialog {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 101;
  background: var(--panel, #20252c);
  color: var(--text, #eee);
  padding: 24px;
  border: 1px solid var(--border, #666);
  border-radius: 8px;
  max-height: 90vh;
  overflow: auto;
  width: min(480px, 94vw);
  box-shadow: 0 12px 50px #0008;
}
.print-dialog form {
  display: grid;
  gap: 12px;
}
.print-dialog label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.print-dialog input,
.print-dialog select {
  max-width: 240px;
}
.print-dialog input,
.print-dialog select {
  background-color: var(--canvas, #151a20);
  color: var(--text, #eee);
  border: 1px solid var(--border, #666);
  border-radius: 4px;
  padding: 6px;
}
</style>
<style scoped>
.delete-paper {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 3;
}
.orientation-segments {
  justify-self: end;
  display: flex;
  gap: 0;
  width: max-content;
  border: 1px solid var(--border);
  border-radius: 5px;
  overflow: hidden;
}
.orientation-segments button {
  border-radius: 0;
  padding: 6px 12px;
}
.orientation-segments button[aria-pressed="true"] {
  background: color-mix(in srgb, var(--accent) 25%, var(--panel));
  color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.print-object-section {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  min-height: 0;
}
.print-object-section :deep([id^="inspector-content"]) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.page-contents {
  font-size: 12px;
  padding-left: 18px;
}
.page-contents ul {
  padding-left: 16px;
}
.page-contents li {
  margin: 4px 0;
}
.print-end-drop {
  min-height: 36px;
  margin: 4px;
}
.print-object-name {
  touch-action: none;
}
.print-tabs [data-print-tab] {
  touch-action: none;
  user-select: none;
  white-space: nowrap;
  flex-shrink: 0;
}
.print-tabs {
  display: flex;
  gap: 4px;
  padding: 6px;
  overflow-x: auto;
  flex-shrink: 0;
}
.print-tabs [aria-selected="true"] {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
.print-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
}
.print-canvas {
  position: relative;
  flex: 1;
  min-width: 0;
  background: var(--canvas);
  overflow: hidden;
}
.print-canvas .drawing-preview { z-index: 1; pointer-events: none; }
.print-canvas canvas {
  position: absolute;
  inset: 0;
}
aside {
  width: 340px;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--panel, #20252c);
}
h3 {
  margin: 0;
}
.print-list {
  min-height: 140px;
  max-height: 230px;
  overflow: auto;
  border: 1px solid var(--border, #555);
  border-radius: 4px;
}
.print-list > p {
  margin: 12px;
}
.print-list > div {
  display: flex;
  align-items: center;
  gap: 3px;
  min-height: 34px;
}
.print-list span,
.print-object-name {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.print-list .print-link-control {
  display: inline-flex;
  flex: none;
  overflow: visible;
}
.print-list button {
  font-size: 12px;
  padding: 5px;
  background: transparent;
}
.print-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.print-actions button {
  font-size: 12px;
}
.print-object-name[aria-pressed="true"] {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}
.print-selected {
  background: #b57c3233;
}
.print-hidden {
  opacity: 0.6;
}
.add-paper {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  line-height: 16px;
  z-index: 2;
}
.print-transform {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
}
.print-transform label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.edge-bottom.above-status {
  bottom: 32px;
}
.print-status {
  min-height: 32px;
  box-sizing: border-box;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 6px 10px;
  background: var(--panel, #20252c);
  font-size: 11px;
}
.print-status label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.print-help {
  font-size: 12px;
  opacity: 0.8;
}
</style>
