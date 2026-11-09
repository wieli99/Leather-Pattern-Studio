<script setup lang="ts">
import { formatArea } from "../model/units";
import { isIndicator, indicatorGeometry } from "../model/indicators";
import { measurementGeometry } from "../model/measurement";
import { shapeArea } from "../model/area";
import { computed, ref } from "vue";
import {
  isPolygon,
  polygonFillets,
  center,
  bounds,
  stretchShape,
  distance,
  moveShape,
  rotateShape,
  shapeMatrix,
  multiply,
  inverse,
  transformShape,
  worldPoints,
  applyMatrix,
  localCenter,
  rotatePoint,
} from "../model/geometry";
import type { Shape } from "../model/project";
import { editor as defaultEditor } from "../editor/instance";
import type { Controller } from "../editor/controller";
import { useEditor } from "./useEditor";
import Field from "./Field.vue";
import PanelSection from "./PanelSection.vue";
const props = defineProps<{ controller?: Controller }>();
const editor = props.controller ?? defaultEditor;
const e = useEditor(editor),
  selected = computed(() => e.value.active),
  s = computed(() => (selected.value.length === 1 ? selected.value[0] : null)),
  a = computed(() => s.value!.points[0]),
  b = computed(() => s.value!.points.at(-1)!),
  c = computed(() => center(s.value!)),
  matrix = computed(() => shapeMatrix(s.value!)),
  angle = computed(
    () => (Math.atan2(matrix.value.b, matrix.value.a) * 180) / Math.PI,
  ),
  width = computed(() =>
    ["curve", "control-curve"].includes(s.value!.kind)
      ? bounds([s.value!]).width
      : Math.abs(b.value.x - a.value.x) *
        Math.hypot(matrix.value.a, matrix.value.b),
  ),
  height = computed(() =>
    ["curve", "control-curve"].includes(s.value!.kind)
      ? bounds([s.value!]).height
      : Math.abs(b.value.y - a.value.y) *
        Math.hypot(matrix.value.c, matrix.value.d),
  ),
  vertices = computed(() => worldPoints(s.value!));
function isSharp(shape: Shape, index: number) {
  const handles = shape.handles?.[index];
  return (
    !!handles &&
    [handles.incoming, handles.outgoing].every((v) => v.x === 0 && v.y === 0)
  );
}
function defaultFillColor() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--shape").trim();
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.fillStyle = value;
  return ctx.fillStyle;
}
function fill(changes: Partial<Shape>) {
  edit({
    fillColor: s.value?.fillColor ?? defaultFillColor(),
    fillOpacity: s.value?.fillOpacity ?? 0.05,
    ...changes,
  });
}
const area = computed(() => (s.value ? shapeArea(s.value) : null));
const edit = (changes: Partial<Shape>) => {
  if (s.value) {
    const next = { ...s.value, ...changes };
    if (isPolygon(next))
      changes.radius = Math.min(next.radius, polygonFillets(next).max);
    void editor.edit(s.value.id, changes);
  }
};
function position(axis: "x" | "y", v: string) {
  edit(
    moveShape(
      s.value!,
      axis === "x" ? +v - c.value.x : 0,
      axis === "y" ? +v - c.value.y : 0,
    ),
  );
}
function indicatorSize(value: string) {
  const shape = s.value!;
  const current = indicatorGeometry(shape).size;
  if (+value > 0 && current > 0) {
    if (shape.kind === "arrow-head") { const local = distance(shape.points[0],shape.points[1]); const world = indicatorGeometry(shape).length; edit({headSize:+value * local/world}); }
    else edit(stretchShape(shape,+value/current,+value/current,c.value));
  }
}
const imageAspectLocked = ref(true);
function size(axis: "x" | "y", v: string) {
  if (s.value!.kind === "image" && imageAspectLocked.value) {
    const factor = +v / (axis === "x" ? width.value : height.value);
    edit(stretchShape(s.value!,factor,factor,c.value));
    return;
  }
  if (["curve", "control-curve"].includes(s.value!.kind)) {
    const length = axis === "x" ? width.value : height.value;
    if (length > 0)
      edit(
        stretchShape(
          s.value!,
          axis === "x" ? +v / length : 1,
          axis === "y" ? +v / length : 1,
          c.value,
        ),
      );
    return;
  }
  if (s.value!.transform) {
    const f = +v / (axis === "x" ? width.value : height.value),
      m = matrix.value,
      local = {
        a: axis === "x" ? f : 1,
        b: 0,
        c: 0,
        d: axis === "y" ? f : 1,
        e: 0,
        f: 0,
      };
    const origin = {
      x: (a.value.x + b.value.x) / 2,
      y: (a.value.y + b.value.y) / 2,
    };
    local.e = origin.x * (1 - local.a);
    local.f = origin.y * (1 - local.d);
    edit(transformShape(s.value!, multiply(multiply(m, local), inverse(m))));
    return;
  }
  const length = Math.abs(b.value[axis] - a.value[axis]);
  if (!length) return;
  const factor = +v / length,
    points = s.value!.points.map((p) => ({
      ...p,
      [axis]: c.value[axis] + (p[axis] - c.value[axis]) * factor,
    }));
  edit({
    points,
    radius:
      s.value!.kind === "rectangle"
        ? Math.min(
            s.value!.radius,
            Math.abs(points[1].x - points[0].x) / 2,
            Math.abs(points[1].y - points[0].y) / 2,
          )
        : s.value!.radius,
  });
}
function radius(v: string) {
  const f = +v / distance(a.value, b.value);
  edit({
    points: [
      a.value,
      {
        x: a.value.x + (b.value.x - a.value.x) * f,
        y: a.value.y + (b.value.y - a.value.y) * f,
      },
    ],
  });
}
function vertex(i: number, axis: "x" | "y", v: string) {
  const original = s.value!,
    point = { ...vertices.value[i], [axis]: +v };
  const local = applyMatrix(inverse(matrix.value), point);
  const closed =
    original.kind === "polyline" &&
    distance(original.points[0], original.points.at(-1)!) < 1e-9;
  const next = {
    ...original,
    points: original.points.map((p, j) =>
      j === i ||
      (closed &&
        (i === 0 || i === original.points.length - 1) &&
        (j === 0 || j === original.points.length - 1))
        ? local
        : p,
    ),
  };
  const c = localCenter(next),
    rotated = rotatePoint(c, localCenter(original), original.rotation);
  edit({
    ...next,
    points: next.points.map((p) => ({
      x: p.x + rotated.x - c.x,
      y: p.y + rotated.y - c.y,
    })),
  });
}
</script>
<template>
  <p v-if="e.transformTool || e.stitchMode">
    Apply or cancel to edit properties.
  </p>
  <fieldset v-if="s" class="object-properties">
    <PanelSection class="property-section" section-key="object" title="Object" :level="3" :disabled="editor.isLocked(s.id)">
    <Field :controller="editor" label="Name" :value="s.name" @commit="edit({ name: $event })" />
    <template v-if="s.kind === 'text'">
      <label class="field"><span>Font</span><select aria-label="Font" :value="s.fontFamily ?? 'sans'" @change="edit({ fontFamily: ($event.target as HTMLSelectElement).value })"><option value="sans">Sans-serif</option><option value="serif">Serif</option><option value="mono">Monospace</option></select></label>
      <div class="field">
        <span id="text-formatting-label">Style</span>
        <div class="text-formatting" role="group" aria-labelledby="text-formatting-label">
          <button type="button" aria-label="Bold" title="Bold"
            :aria-pressed="s.bold ?? false" @click="edit({ bold: !s.bold })">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 4h7a4 4 0 0 1 0 8H6z M6 12h8a4 4 0 0 1 0 8H6z" />
            </svg>
          </button>
          <button type="button" aria-label="Italic" title="Italic"
            :aria-pressed="s.italic ?? false" @click="edit({ italic: !s.italic })">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 4h10 M4 20h10 M15 4 9 20" />
            </svg>
          </button>
          <button type="button" aria-label="Underline" title="Underline"
            :aria-pressed="s.underline ?? false" @click="edit({ underline: !s.underline })">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 3v8a6 6 0 0 0 12 0V3 M4 21h16" />
            </svg>
          </button>
          <button type="button" aria-label="Strikethrough" title="Strikethrough"
            :aria-pressed="s.strikethrough ?? false" @click="edit({ strikethrough: !s.strikethrough })">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 5c-2-3-12-3-12 2 0 2 2 3 6 4 M6 18c2 3 12 3 12-2 0-1-1-2-3-3 M3 12h18" />
            </svg>
          </button>
        </div>
      </div>
      <label class="field"><span>Alignment</span><select aria-label="Alignment" :value="s.textAlign ?? 'left'" @change="edit({ textAlign: ($event.target as HTMLSelectElement).value })"><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></label>
      <Field :controller="editor" label="Line spacing" :value="s.lineSpacing ?? 1.2" @commit="edit({ lineSpacing: +$event })" />
      <Field :controller="editor" dimension
        label="Font size"
        :value="s.fontSize ?? 5"
        @commit="edit({ fontSize: +$event })"
      />
    </template>
    </PanelSection>
    <PanelSection class="property-section" section-key="geometry" title="Geometry" :level="3" :disabled="editor.isLocked(s.id)">
      <p class="geometry-units">{{ e.unitSymbol }} unless indicated</p>
    <div class="field-row">
      <Field :controller="editor" dimension
        label="Position X"
        :value="c.x"
        @commit="position('x', $event)"
      />
      <Field :controller="editor" dimension
        label="Position Y"
        :value="c.y"
        @commit="position('y', $event)"
      />
    </div>
    <div
      v-if="['image', 'rectangle', 'ellipse', 'curve', 'control-curve'].includes(s.kind)"
      class="field-row"
    >
      <Field :controller="editor" dimension
        label="Width"
        :value="width"
        :min="0.001"
        @commit="size('x', $event)"
      />
      <Field :controller="editor" dimension
        label="Height"
        :value="height"
        :min="0.001"
        @commit="size('y', $event)"
      />
    </div>
    <Field :controller="editor" dimension
      v-if="s.kind === 'circle' || s.kind === 'arc'"
      :label="s.transform ? 'Radius (local)' : 'Radius'"
      :value="distance(a, b)"
      :min="0.001"
      @commit="radius"
    />
    <Field
        :controller="editor"
      v-if="s.kind === 'arc'"
      label="Sweep (degrees)"
      :value="s.sweep ?? 0"
      :min="-360"
      :max="360"
      @commit="edit({ sweep: +$event })"
    />
    <Field
        :controller="editor"
      label="Rotation (degrees)"
      :value="+angle.toFixed(1)"
      @commit="edit(rotateShape(s, +$event - angle, c))"
    />
    <template v-if="isIndicator(s.kind)">
      <Field :controller="editor" dimension :label="s.kind === 'size-square' ? 'Side length (mm)' : s.kind === 'crosshair' ? 'Overall size (mm)' : s.kind === 'arrow-head' ? 'Head size (mm)' : 'Length (mm)'"
        :value="indicatorGeometry(s).size" :min="0.001" @commit="indicatorSize" />
      <Field :controller="editor" dimension v-if="s.kind === 'arrow'" label="Head size (local mm)"
        :value="s.headSize ?? 3" :min="0.001" @commit="edit({headSize:+$event})" />
    </template>
    <label v-if="s.kind === 'image'"><input v-model="imageAspectLocked" type="checkbox" /> Lock aspect ratio</label>
    <Field :controller="editor" v-if="s.kind === 'image'" label="Image opacity (%)" :value="(s.fillOpacity ?? 1) * 100" :min="0" :max="100" @commit="edit({ fillOpacity: +$event / 100 })" />
    <template v-if="s.kind === 'measurement'">
      <Field :controller="editor" dimension
        label="Offset (mm)"
        :value="measurementGeometry(s).offset"
        @commit="edit({ measurementOffset: +$event / measurementGeometry(s).offsetScale })"
      />
      <div class="field">
        <span>Distance ({{ e.unitSymbol }})</span>
        <output :aria-label="`Distance (${e.unitSymbol})`">{{ e.units === 'mm' ? measurementGeometry(s).length.toFixed(2) : e.formatLength(measurementGeometry(s).length) }}</output>
      </div>
    </template>
    <div v-if="area !== null" class="field">
      <span>Area ({{ e.unitSymbol }}²)</span>
      <output role="note" :aria-label="`Area (${e.unitSymbol}²)`">{{ formatArea(area, e.units) }}</output>
    </div>
    </PanelSection>
    <PanelSection class="property-section" section-key="appearance" title="Appearance" :level="3" :disabled="editor.isLocked(s.id)">
    <div class="field-row">
      <label class="field">
        <span>Outline color</span>
        <input type="color" aria-label="Outline color"
          :disabled="!e.ready || !!e.transformTool || e.stitchMode"
          :value="s.strokeColor ?? defaultFillColor()"
          @focus="editor.beginProperty()"
          @input="edit({ strokeColor: ($event.target as HTMLInputElement).value })"
          @blur="editor.finishProperty()"
          @keydown.esc.stop="editor.finishProperty(true)" />
      </label>
      <Field :controller="editor" label="Outline opacity (%)" :value="(s.strokeOpacity ?? 1) * 100"
        :min="0" :max="100" :step="1"
        @commit="edit({ strokeOpacity: +$event / 100 })" />
    </div>
    <Field :controller="editor" dimension v-if="s.kind !== 'text'" label="Outline width (mm)" :value="s.strokeWidth ?? 0.35" :min="0.001" @commit="edit({strokeWidth:+$event})" />
    <template v-if="area !== null">
      <label class="field">
        <span>Fill mode</span>
        <select aria-label="Fill mode" :value="s.fillMode ?? 'solid'"
          :disabled="!e.ready || !!e.transformTool || e.stitchMode"
          @change="edit({ fillMode: ($event.target as HTMLSelectElement).value })">
          <option value="solid">Solid</option>
          <option value="skiving">Skiving</option>
          <option value="glueing">Glueing</option>
          <option value="cutout">Cutout</option>
        </select>
      </label>
      <div class="field-row">
        <label class="field">
          <span>Fill color</span>
          <input type="color" aria-label="Fill color"
            :value="s.fillColor ?? defaultFillColor()"
            :disabled="!e.ready || !!e.transformTool || e.stitchMode"
            @focus="editor.beginProperty()"
            @input="fill({ fillColor: ($event.target as HTMLInputElement).value })"
            @blur="editor.finishProperty()"
            @keydown.esc.stop="editor.finishProperty(true)" />
        </label>
        <Field :controller="editor" label="Fill opacity (%)" :value="(s.fillOpacity ?? 0.05) * 100"
          :min="0" :max="100" :step="1"
          @commit="fill({ fillOpacity: +$event / 100 })" />
      </div>
    </template>
    <button :disabled="!e.ready || !!e.transformTool || e.stitchMode"
      @click="edit({ fillColor: undefined, fillOpacity: undefined, fillMode: undefined, strokeColor: undefined, strokeOpacity: undefined, strokeWidth: undefined })">Reset styling</button>
    </PanelSection>
    <fieldset :disabled="editor.isLocked(s.id)" class="vertex-properties">
    <details
      v-if="['measurement', 'line', 'polyline', 'curve', 'control-curve'].includes(s.kind)"
    >
      <summary>Vertex coordinates</summary>
      <div v-for="(point, i) in vertices" :key="i" class="field-row">
        <div
          v-if="s.kind === 'control-curve' && s.handles"
          class="anchor-toggle"
          role="group"
          :aria-label="`Vertex ${i + 1} corner type`"
        >
          <button
            type="button"
            :aria-pressed="isSharp(s, i)"
            @click="!isSharp(s, i) && editor.makeAnchorSharp(s.id, i)"
          >
            Sharp
          </button>
          <button
            type="button"
            :aria-pressed="!isSharp(s, i)"
            @click="isSharp(s, i) && editor.toggleAnchorSmooth(s.id, i)"
          >
            Smooth
          </button>
        </div>
        <Field :controller="editor" dimension
          :label="`Vertex ${i + 1} X`"
          :value="point.x"
          @commit="vertex(i, 'x', $event)"
        />
        <Field :controller="editor" dimension
          :label="`Vertex ${i + 1} Y`"
          :value="point.y"
          @commit="vertex(i, 'y', $event)"
        />
      </div>
    </details>
    </fieldset>
  </fieldset>
  <template v-else>
    <h2>Selection</h2>
    <p>
      {{
        selected.length ? `${selected.length} objects selected` : "No selection"
      }}
    </p>
  </template>
  <div v-if="selected.length" class="actions">
    <button :disabled="!e.ready" @click="editor.duplicate()">Duplicate</button>
    <button :disabled="!e.ready || editor.selectionLocked" @click="editor.delete()">Delete</button>
  </div>
</template>

<style scoped>
.object-properties,
.vertex-properties { border: 0; padding: 0; margin: 0; min-width: 0; }
.text-formatting {
  display: flex;
  gap: 4px;
}
.text-formatting button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 5px;
}
.text-formatting button[aria-pressed="true"] {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  border-color: var(--accent);
}
</style>
