<script setup lang="ts">
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
  printArtworkBounds,
  printTree,
  printRows,
  sourceNodes,
  sourceShapeIds,
  findSource,
  importPrintNode,
  resolvedPrintItems,
  printDescendants,
  editPrintTree,
  removePrintNodes,
  transformPrintNodes,
  type PrintLayout,
  type PrintNode,
} from "../model/printLayout";
import { bounds, hitTest, contains } from "../model/geometry";
import { pageSvg } from "../editor/printScene";
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
import { PanelSelection } from "../model/panelSelection";
const panelSelection=new PanelSelection(),sourceSelection=new PanelSelection();
const selectedSources=ref<string[]>([]);
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
  tool = ref<"select" | "move" | "rotate">("select");
const views = new Map<
  string,
  { zoom: number; pan: Point; selection: string[] }
>();
const preview = shallowRef<PrintLayout>(),
  error = ref(""),
  exporting = ref(false),
  busy = ref(false);
const creating = ref(false),
  settingsId = ref(""),
  format = ref("A4"),
  units = ref<UnitMode>("mm"),
  width = ref("210"),
  height = ref("297"),
  margin = ref("10"),
  name = ref(""),
  landscape = ref(false);
const nameEdited=ref(false);
watch(format,value=>{if(!nameEdited.value)name.value=value;});
const renameId = ref(""),
  renameValue = ref("");
const moveX = ref("0"),
  moveY = ref("0"),
  turn = ref("0");
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
      pivot: Point;
    }
  | undefined;
let marqueePixel: Point | undefined;
function cancel() {
  drag = undefined;
  marqueePixel = undefined;
  preview.value = undefined;
  void draw();
}
async function switchTab(id: string) {
  if (id === active.value) return;
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
  editor.printLayoutActive = !!id;
  emit("active", !!id);
  await nextTick();
  void draw();
}
watch(
  () => e.value.projectEpoch,
  () => {
    cancel();
    active.value = "";
    selected.value = [];
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
  nameEdited.value=false;
  landscape.value = false;
  error.value = "";
  creating.value = true;
}
function openSettings() {
  const l = layout.value;
  if (!l) return;
  settingsId.value = l.id;
  format.value = "Custom";
  units.value = l.units;
  width.value = editableLength(l.width, l.units);
  height.value = editableLength(l.height, l.units);
  margin.value = editableLength(l.margin, l.units);
  name.value = l.name;
  nameEdited.value=true;
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
    if (landscape.value !== (w > h)) [w, h] = [h, w];
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
async function deleteLayout() {
  const l = layout.value;
  if (!l) return;
  if (!window.confirm(`Delete print layout “${l.name}”?`)) return;
  await editor.commit({
    ...editor.document,
    printLayouts: layouts.value.filter((p) => p.id !== l.id),
  });
  await switchTab("");
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
function select(id:string,event?:MouseEvent){selected.value=panelSelection.select(visibleRows.value.map(r=>r.node.id),selected.value,id,event);void draw();}
function selectSource(id:string,event:MouseEvent){selectedSources.value=sourceSelection.select(sourceRows.value.map(r=>r.node.id),selectedSources.value,id,event);}
function sourceDrag(event:DragEvent,id:string){if(!selectedSources.value.includes(id))selectedSources.value=[id];event.dataTransfer?.setData('application/x-leather-source',JSON.stringify(selectedSources.value));}
async function importDrop(event:DragEvent){
  const l=layout.value;if(!l||!event.dataTransfer)return;
  try{const ids:unknown=JSON.parse(event.dataTransfer.getData('application/x-leather-source'));if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))return;const p=pixel(event);if(!isPrintablePixel(p,l))return;const world=worldFromPixel(p);let next=l;const roots=ids.filter(id=>!ids.some(parent=>{if(parent===id)return false;const node=findSource(sourceNodes(editor.document),parent);return node?.kind==='group'&&!!findSource(node.children,id);}));for(const id of roots)next=importPrintNode(editor.document,next,id,world.x,world.y);await save(next);}catch(reason){error.value=String(reason);}
}
function nodeName(node: PrintNode) {
  if (node.kind === "group") return node.name;
  const item = layout.value?.instances.find((i) => i.id === node.id);
  return (
    item?.name ??
    editor.document.shapes.find((s) => s.id === item?.sourceId)?.name ??
    "Object"
  );
}
function editState(id: string, key: "hidden" | "locked") {
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
  const l = layout.value;
  if (!l) return;
  const ids = movableSelection();
  void save(removePrintNodes(l, ids));
  selected.value = [];
}
function renameStart(node: PrintNode) {
  if (rows.value.find((r) => r.node.id === node.id)?.locked) return;
  renameId.value = node.id;
  renameValue.value = nodeName(node);
}
function renameFinish() {
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
  const l = layout.value;
  if (!l) return;
  const x = parseLength(moveX.value, l.units),
    y = parseLength(moveY.value, l.units),
    angle = Number(turn.value);
  if (x === null || y === null || !Number.isFinite(angle)) {
    error.value = "Enter finite distances and rotation";
    return;
  }
  const ids = movableSelection();
  void save(transformPrintNodes(l, ids, x, y, angle));
  moveX.value = moveY.value = turn.value = "0";
}
const dragged = ref("");
function drop(target: string, inside: boolean) {
  const l = layout.value,
    id = dragged.value;
  dragged.value = "";
  if (!l || !id || id === target) return;
  const node = rows.value.find((r) => r.node.id === id)?.node;
  if (!node || rows.value.find((r) => r.node.id === id)?.locked) return;
  const movedNode: PrintNode = node;
  const children = printDescendants(l, [id]);
  if (children.includes(target)) return;
  // Keep live imports as self-contained subtrees while allowing free reordering inside them.
  function owner(
    nodes: PrintNode[],
    targetId: string,
    current = "",
  ): string | undefined {
    for (const n of nodes) {
      if (n.id === targetId) return current;
      if (n.kind === "group") {
        const result = owner(n.children, targetId, n.sourceId ? n.id : current);
        if (result !== undefined) return result;
      }
    }
  }
  const destination = rows.value.find((r) => r.node.id === target)?.node;
  const targetOwner = !target
    ? ""
    : inside && destination?.kind === "group" && destination.sourceId
      ? destination.id
      : owner(printTree(l), target);
  if (owner(printTree(l), id) !== targetOwner) {
    error.value =
      "Move linked children within their imported folder; duplicate to make a separate copy.";
    return;
  }
  let tree = editPrintTree(printTree(l), id, () => null);
  if (target === "") tree.push(movedNode);
  else if (inside)
    tree = editPrintTree(tree, target, (n) =>
      n.kind === "group" ? { ...n, children: [...n.children, movedNode] } : n,
    );
  else {
    function insert(nodes: PrintNode[]): PrintNode[] {
      return nodes.flatMap((n) =>
        n.id === target
          ? [movedNode, n]
          : [n.kind === "group" ? { ...n, children: insert(n.children) } : n],
      );
    }
    tree = insert(tree);
  }
  void save({ ...l, tree });
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
function removePage(column: number, row: number) {
  const l = layout.value;
  if (!l || l.pages.length === 1) return;
  const size = printableSize(l);
  const occupied = resolvedPrintItems(editor.document, l).some((i) => {
    if (i.hidden) return false;
    const b = printArtworkBounds(editor.document, l, i);
    return (
      b.x < (column + 1) * size.width &&
      b.x + b.width > column * size.width &&
      b.y < (row + 1) * size.height &&
      b.y + b.height > row * size.height
    );
  });
  if (occupied) {
    error.value = "Move or hide artwork before removing this page";
    return;
  }
  void save({
    ...l,
    pages: l.pages.filter((p) => p.column !== column || p.row !== row),
  });
}
const pageImages = new Map<string, Promise<HTMLImageElement>>();
let scheduledFrame = 0;
function draw() {
  generation++;
  if (scheduledFrame) return;
  scheduledFrame = requestAnimationFrame(() => { scheduledFrame = 0; void paintFrame(); });
}
async function paintFrame() {
  const token = ++generation,
    l = preview.value ?? layout.value,
    el = canvas.value;
  if (!l || !el || !el.clientWidth) return;
  const doc = editor.document,
    rect = el.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  const buffer = document.createElement('canvas');
  buffer.width = Math.round(rect.width * dpr);
  buffer.height = Math.round(rect.height * dpr);
  const ctx = buffer.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.translate(pan.value.x, pan.value.y);
  ctx.scale(zoom.value, zoom.value);
  try {
    for (const page of l.pages) {
      const p = pagePosition(page, l);
      if (
        pan.value.x + (p.x + l.width) * zoom.value < 0 ||
        pan.value.y + (p.y + l.height) * zoom.value < 0 ||
        pan.value.x + p.x * zoom.value > rect.width ||
        pan.value.y + p.y * zoom.value > rect.height
      )
        continue;
      ctx.fillStyle = "#fff";
      ctx.fillRect(p.x, p.y, l.width, l.height);
      const svg = pageSvg(doc, l, page);
      let image = pageImages.get(svg);
      if (!image) {
        image = selfContainedSvg(svg).then(svgImage);
        pageImages.set(svg, image);
        if (pageImages.size > 8)
          pageImages.delete(pageImages.keys().next().value!);
      }
      const bitmap = await image;
      if (token !== generation) return;
      ctx.drawImage(bitmap, p.x, p.y, l.width, l.height);
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 1 / zoom.value;
      ctx.strokeRect(p.x, p.y, l.width, l.height);
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
      const selectedIds = new Set(printDescendants(l, selected.value));
      for (const i of resolvedPrintItems(doc, l)) {
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
    if(token !== generation || el !== canvas.value)return;
    if(el.width!==buffer.width)el.width=buffer.width;
    if(el.height!==buffer.height)el.height=buffer.height;
    const front=el.getContext('2d')!;front.setTransform(1,0,0,1,0,0);front.clearRect(0,0,el.width,el.height);front.drawImage(buffer,0,0);
  } catch (reason) {
    if (token === generation) error.value = String(reason);
  }
}
function down(event: PointerEvent) {
  if (event.button !== 0 && event.button !== 1) return;
  canvas.value!.focus();
  canvas.value!.setPointerCapture(event.pointerId);
  const p = pixel(event),
    world = worldFromPixel(p),
    l = layout.value!;
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
  if (event.button === 0 && !editor.space && hit) {
    if (!printDescendants(l, selected.value).includes(hit.instance.id))
      select(hit.instance.id, event);
  } else if (event.button === 0 && !editor.space && !event.shiftKey)
    selected.value = [];
  const ids =
    hit && event.button === 0 && !editor.space ? movableSelection() : [];
  const items = l.instances.filter((i) =>
    printDescendants(l, ids).includes(i.id),
  );
  const pivot = {
    x: items.reduce((s, i) => s + i.x, 0) / (items.length || 1),
    y: items.reduce((s, i) => s + i.y, 0) / (items.length || 1),
  };
  drag = {
    pixel: p,
    world,
    original: l,
    ids: [...ids],
    pan: { ...pan.value },
    rotate: tool.value === "rotate",
    marquee: !hit && event.button === 0 && !editor.space,
    pivot,
  };
  void draw();
}
function move(event: PointerEvent) {
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
  const world = worldFromPixel(p);
  let dx = world.x - drag.world.x,
    dy = world.y - drag.world.y,
    angle = 0;
  if (drag.rotate) {
    angle =
      ((Math.atan2(world.y - drag.pivot.y, world.x - drag.pivot.x) -
        Math.atan2(drag.world.y - drag.pivot.y, drag.world.x - drag.pivot.x)) *
        180) /
      Math.PI;
    if (event.shiftKey) angle = Math.round(angle / 15) * 15;
    dx = dy = 0;
  } else {
    if (snap.value && !event.altKey) {
      const grid = editor.gridSize;
      dx = Math.round(dx / grid) * grid;
      dy = Math.round(dy / grid) * grid;
    }
    if (event.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (objectSnap.value && !event.altKey) {
      const affected = new Set(printDescendants(drag.original, drag.ids)),
        moving = drag.original.instances.find((i) => affected.has(i.id));
      if (moving) {
        const other = drag.original.instances.filter(
          (i) => !affected.has(i.id) && !i.hidden,
        );
        for (const i of other) {
          if (Math.abs(i.x - moving.x - dx) < 5 / zoom.value)
            dx = i.x - moving.x;
          if (Math.abs(i.y - moving.y - dy) < 5 / zoom.value)
            dy = i.y - moving.y;
        }
      }
    }
  }
  preview.value = transformPrintNodes(drag.original, drag.ids, dx, dy, angle);
  void draw();
}
async function up() {
  if (drag?.marquee && marqueePixel) {
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
    selected.value = [...new Set([...selected.value, ...ids])];
  }

  const next = preview.value,
    original = drag?.original;
  cancel();
  if (
    next &&
    original === editor.document.printLayouts?.find((l) => l.id === next.id)
  )
    await save(next);
}
function wheel(event: WheelEvent) {
  const p = pixel(event),
    old = zoom.value;
  zoom.value = Math.max(
    0.1,
    Math.min(20, old * Math.exp(-event.deltaY * 0.001)),
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
function keyboard(event: KeyboardEvent) {
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
  if (event.code === "Space") {
    event.preventDefault();
    editor.space = true;
    return;
  }
  if (key === "escape") {
    cancel();
    selected.value = [];
    tool.value = "select";
    return;
  }
  if (mod && key === "a") {
    event.preventDefault();
    selected.value = rows.value
      .filter((r) => !r.hidden && !r.locked)
      .map((r) => r.node.id);
    void draw();
    return;
  }
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
    deleteSelection();
    return;
  }
  if (key === "f") {
    event.preventDefault();
    fit();
    return;
  }
  if (key === "g") tool.value = "move";
  if (key === "e") tool.value = "rotate";
  if (key === "v") tool.value = "select";
  if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
    event.preventDefault();
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
    if (
      drag &&
      editor.document.printLayouts?.find((l) => l.id === active.value) !==
        drag.original
    )
      cancel();
    void draw();
  });
  window.addEventListener("keydown", keyboard);
  window.addEventListener("blur", cancel);
});
watch(canvas, (el) => {
  observer?.disconnect();
  if (el) {
    observer?.observe(el);
    void draw();
  }
});
onUnmounted(() => {
  generation++;
  cancelAnimationFrame(scheduledFrame);
  observer?.disconnect();
  unsubscribe?.();
  window.removeEventListener("keydown", keyboard);
  window.removeEventListener("blur", cancel);
  editor.printLayoutActive = false;
});
defineExpose({
  openExport: () => {
    if (layout.value) exporting.value = true;
  },
});
</script>
<template>
  <div
    class="print-tabs"
    role="tablist"
    aria-label="Workspace views"
    @keydown="tabKey"
  >
    <button role="tab" :aria-selected="!layout" @click="switchTab('')">
      Grid</button
    ><button
      v-for="tab in layouts"
      :key="tab.id"
      role="tab"
      :aria-selected="active === tab.id"
      @click="switchTab(tab.id)"
    >
      {{ tab.name }}</button
    ><button
      aria-label="Create print layout"
      :disabled="!e.ready || busy"
      @click="openCreate"
    >
      +
    </button>
  </div>
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
              v-model="name" @input="nameEdited=true"
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
          ><label>Margin <input v-model="margin" required /></label
          ><button type="button" :aria-label="landscape?'Landscape orientation; switch to portrait':'Portrait orientation; switch to landscape'" @click="landscape=!landscape"><svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" aria-hidden="true"><rect :x="landscape?3:7" :y="landscape?7:3" :width="landscape?24:16" :height="landscape?16:24" rx="1"/></svg>{{landscape?'Landscape':'Portrait'}}</button>
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
    <nav aria-label="Print tools">
      <button
        v-for="value in ['select', 'move', 'rotate'] as const"
        :key="value"
        :aria-pressed="tool === value"
        :title="
          value === 'select'
            ? 'Select (V)'
            : value === 'move'
              ? 'Move (G)'
              : 'Rotate (E)'
        "
        :aria-label="
          value === 'select'
            ? 'Select (V)'
            : value === 'move'
              ? 'Move (G)'
              : 'Rotate (E)'
        "
        @click="tool = value"
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path
            :d="
              value === 'select'
                ? 'M5 3L19 12L12 14L9 21Z'
                : value === 'move'
                  ? 'M3 12H21M12 3V21M3 12L7 8M3 12L7 16M21 12L17 8M21 12L17 16M12 3L8 7M12 3L16 7M12 21L8 17M12 21L16 17'
                  : 'M19 8A8 8 0 1 0 20 16M19 3V9H13'
            "
          />
        </svg></button
      ><button
        :disabled="!e.canUndo || busy"
        @click="
          cancel();
          editor.transact('undo');
        "
      >
        Undo</button
      ><button
        :disabled="!e.canRedo || busy"
        @click="
          cancel();
          editor.transact('redo');
        "
      >
        Redo</button
      ><button @click="fit">Fit</button>
    </nav>
    <div class="print-canvas">
      <canvas
        ref="canvas"
        aria-label="Print layout canvas" @dragover.prevent @drop.prevent="importDrop"
        tabindex="0"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="cancel"
        @lostpointercapture="drag && cancel()"
        @wheel.prevent="wheel"
        @contextmenu.prevent
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
      <div v-if="selected.length" class="print-transform">
        <label>Move X <input v-model="moveX" aria-label="Print move X" /></label
        ><label
          >Move Y <input v-model="moveY" aria-label="Print move Y" /></label
        ><label
          >Rotate °
          <input
            v-model="turn"
            type="number"
            aria-label="Print rotation" /></label
        ><button :disabled="busy" @click="applyTransform">Apply</button>
      </div>
      <div class="print-status">
        <span
          >{{ formatLength(layout.width, layout.units) }} ×
          {{ formatLength(layout.height, layout.units) }}
          {{ layout.units === "mm" ? "mm" : "in" }} ·
          {{ layout.pages.length }} pages</span
        ><label><input type="checkbox" v-model="snap" />Grid snap</label
        ><label><input type="checkbox" v-model="objectSnap" />Object snap</label
        ><span>{{ Math.round(zoom * 100) }}%</span>
      </div>
    </div>
    <aside aria-label="Print objects and settings">
      <div class="print-actions">
        <button @click="openSettings">Layout settings</button
        ><button @click="deleteLayout">Delete layout</button>
      </div>
      <h3>Grid objects</h3>
      <div class="print-list" aria-label="Grid source objects">
        <div
          v-for="row in sourceRows"
          :key="row.node.id"
          :style="{ paddingLeft: `${row.depth * 14}px` }"
          draggable="true" @dragstart="sourceDrag($event,row.node.id)"
        >
          <button
            v-if="row.node.kind === 'group'"
            :aria-label="`Toggle ${row.node.name}`"
            @click="toggleCollapse(`source:${row.node.id}`)"
          >
            {{ collapsed.has(`source:${row.node.id}`) ? "▸" : "▾" }}</button
          ><button class="print-object-name" :aria-pressed="selectedSources.includes(row.node.id)" @click="selectSource(row.node.id,$event)">{{
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
          Create objects on Grid, then import them here.
        </p>
      </div>
      <h3>Print objects</h3>
      <div class="print-actions">
        <button :disabled="!selected.length || busy" @click="duplicate">
          Duplicate</button
        ><button :disabled="!selected.length || busy" @click="newGroup">
          Group</button
        ><button :disabled="!selected.length || busy" @click="deleteSelection">
          Delete
        </button>
      </div>
      <div
        class="print-list"
        aria-label="Print object tree"
        @dragover.prevent
        @drop.prevent="drop('', true)"
      >
        <div
          v-for="row in visibleRows"
          :key="row.node.id"
          class="print-row"
          :class="{
            'print-selected': selected.includes(row.node.id),
            'print-hidden': row.hidden,
          }"
          :style="{ paddingLeft: `${row.depth * 14}px` }"
          :draggable="!row.locked"
          @dragstart="dragged = row.node.id"
          @dragend="dragged = ''"
          @dragover.prevent.stop
          @drop.prevent.stop="drop(row.node.id, row.node.kind === 'group')"
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
          /><button
            v-else
            class="print-object-name"
            :aria-pressed="selected.includes(row.node.id)"
            @click="select(row.node.id, $event)"
            @dblclick="renameStart(row.node)"
          >
            {{ nodeName(row.node) }}</button
          ><button
            :aria-label="`${row.hidden ? 'Show' : 'Hide'} print ${nodeName(row.node)}`"
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
                  row.locked ? 'M8 10V6a4 4 0 018 0v4' : 'M8 10V6a4 4 0 018 0'
                "
              />
            </svg>
          </button>
        </div>
        <p v-if="!rows.length">Import objects or folders from Grid.</p>
      </div>
      <details>
        <summary>Pages</summary>
        <div v-for="page in layout.pages" :key="`${page.column},${page.row}`">
          {{ page.column }}, {{ page.row }}
          <button
            :disabled="layout.pages.length === 1"
            @click="removePage(page.column, page.row)"
          >
            Remove empty page
          </button>
        </div>
      </details>
      <p v-if="error" role="alert">{{ error }}</p>
      <p class="print-help">
        Drag to move. Select Rotate and drag to rotate; Shift snaps to 15°.
        Space-drag pans. Alt bypasses snapping. Source geometry remains linked.
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
  background: var(--canvas, #151a20);
  color: var(--text, #eee);
  border: 1px solid var(--border, #666);
  border-radius: 4px;
  padding: 6px;
}
.print-dialog select {
  appearance: none;
  background-color: var(--input);
  padding-right: 26px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4l3 3 3-3' stroke='%2395a5b4' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 7px center;
}
</style>
<style scoped>
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
.print-canvas canvas {
  position: absolute;
  inset: 0;
}
.print-workspace nav {
  padding: 8px 4px;
}
.print-workspace nav button {
  font-size: 11px;
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
  flex: 1;
  overflow: auto;
  border: 1px solid var(--border, #555);
  border-radius: 4px;
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
.print-list button {
  font-size: 11px;
  padding: 5px;
}
.print-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.print-actions button {
  font-size: 12px;
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
  display: flex;
  gap: 8px;
  align-items: end;
  background: var(--panel, #20252c);
  padding: 8px;
  border-radius: 6px;
}
.print-transform label {
  display: grid;
  font-size: 11px;
  gap: 4px;
}
.print-transform input {
  width: 76px;
  color: var(--text);
  background: var(--canvas);
  border: 1px solid var(--border, #666);
}
.print-status {
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
  gap: 4px;
}
.print-help {
  font-size: 12px;
  opacity: 0.8;
}
</style>
