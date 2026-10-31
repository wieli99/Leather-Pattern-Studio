<script setup lang="ts">
import { measurementGeometry } from "../model/measurement";
import { shapeArea } from "../model/area";
import { computed } from "vue";
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
import { editor } from "../editor/instance";
import { useEditor } from "./useEditor";
import Field from "./Field.vue";
import PanelSection from "./PanelSection.vue";
const e = useEditor(),
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
function size(axis: "x" | "y", v: string) {
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
    <Field label="Name" :value="s.name" @commit="edit({ name: $event })" />
    <template v-if="s.kind === 'text'">
      <Field
        label="Text"
        :value="s.text ?? ''"
        @commit="edit({ text: $event })"
      />
      <Field
        label="Font size"
        :value="s.fontSize ?? 5"
        @commit="edit({ fontSize: +$event })"
      />
    </template>
    </PanelSection>
    <PanelSection class="property-section" section-key="geometry" title="Geometry" :level="3" :disabled="editor.isLocked(s.id)">
      <p class="geometry-units">mm unless indicated</p>
    <div class="field-row">
      <Field
        label="Position X"
        :value="+c.x.toFixed(1)"
        @commit="position('x', $event)"
      />
      <Field
        label="Position Y"
        :value="+c.y.toFixed(1)"
        @commit="position('y', $event)"
      />
    </div>
    <div
      v-if="['rectangle', 'ellipse', 'curve', 'control-curve'].includes(s.kind)"
      class="field-row"
    >
      <Field
        label="Width"
        :value="+width.toFixed(1)"
        :min="0.001"
        @commit="size('x', $event)"
      />
      <Field
        label="Height"
        :value="+height.toFixed(1)"
        :min="0.001"
        @commit="size('y', $event)"
      />
    </div>
    <Field
      v-if="s.kind === 'circle' || s.kind === 'arc'"
      :label="s.transform ? 'Radius (local)' : 'Radius'"
      :value="+distance(a, b).toFixed(1)"
      :min="0.001"
      @commit="radius"
    />
    <Field
      v-if="s.kind === 'arc'"
      label="Sweep (degrees)"
      :value="s.sweep ?? 0"
      :min="-360"
      :max="360"
      @commit="edit({ sweep: +$event })"
    />
    <Field
      label="Rotation (degrees)"
      :value="+angle.toFixed(1)"
      @commit="edit(rotateShape(s, +$event - angle, c))"
    />
    <template v-if="s.kind === 'measurement'">
      <Field
        label="Offset (mm)"
        :value="measurementGeometry(s).offset"
        @commit="edit({ measurementOffset: +$event / measurementGeometry(s).offsetScale })"
      />
      <div class="field">
        <span>Distance (mm)</span>
        <output aria-label="Distance (mm)">{{ measurementGeometry(s).length.toFixed(2) }}</output>
      </div>
    </template>
    <div v-if="area !== null" class="field">
      <span>Area (mm²)</span>
      <output role="note" aria-label="Area (mm²)">{{ area.toFixed(2) }}</output>
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
      <Field label="Outline opacity (%)" :value="(s.strokeOpacity ?? 1) * 100"
        :min="0" :max="100" :step="1"
        @commit="edit({ strokeOpacity: +$event / 100 })" />
    </div>
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
        <Field label="Fill opacity (%)" :value="(s.fillOpacity ?? 0.05) * 100"
          :min="0" :max="100" :step="1"
          @commit="fill({ fillOpacity: +$event / 100 })" />
      </div>
    </template>
    <button :disabled="!e.ready || !!e.transformTool || e.stitchMode"
      @click="edit({ fillColor: undefined, fillOpacity: undefined, fillMode: undefined, strokeColor: undefined, strokeOpacity: undefined })">Reset styling</button>
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
        <Field
          :label="`Vertex ${i + 1} X`"
          :value="point.x"
          @commit="vertex(i, 'x', $event)"
        />
        <Field
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
</style>
