<script setup lang="ts">
import { formatArea } from "../model/units";
import { isIndicator, indicatorGeometry } from "../model/indicators";
import { hasStyledOutline } from "../model/outlineStyle";
import { measurementGeometry } from "../model/measurement";
import { shapeArea } from "../model/area";
import { computed, ref } from "vue";
import {
  center,
  bounds,
  distance,
  shapeMatrix,
  inverse,
  worldPoints,
  applyMatrix,
  localCenter,
  rotatePoint,
} from "../model/geometry";
import type { Shape } from "../model/project";
import { clampFillets, type PropertyId } from "../model/propertySetters";
import { bindingFor } from "../model/bindings";
import type { UnitMode } from "../model/units";
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
  vertices = computed(() => worldPoints(s.value!)),
  segmentLength = computed(() =>
    e.value.segmentSelection.reduce(
      (sum, segment) =>
        sum + segment.points.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - segment.points[i].x, p.y - segment.points[i].y), 0),
      0,
    ),
  );
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
  if (s.value) void editor.edit(s.value.id, clampFillets(s.value, changes));
};
const imageAspectLocked = ref(true);
/** Shared with variable-driven updates so both paths change geometry identically. */
function property(id: PropertyId, v: string, formula: string | null = null, unit: UnitMode = e.value.units) {
  if (s.value)
    void editor.editProperty(s.value.id, id, +v, formula, unit, { aspectLocked: imageAspectLocked.value });
}
const link = (id: PropertyId) => bindingFor(s.value, id);
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
  <p v-if="e.array || e.pathCopy || e.transformTool || e.stitchMode || e.booleanOperation">
    Apply or cancel to edit properties.
  </p>
  <fieldset v-if="s" class="object-properties" :disabled="!!e.array || !!e.booleanOperation || !!e.pathCopy">
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
      <Field :controller="editor" label="Line spacing" :value="s.lineSpacing ?? 1.2" linkable :binding="link('lineSpacing')" @commit="(v, f, u) => property('lineSpacing', v, f, u)" />
      <Field :controller="editor" dimension
        label="Font size"
        :value="s.fontSize ?? 5"
        linkable :binding="link('fontSize')" @commit="(v, f, u) => property('fontSize', v, f, u)"
      />
    </template>
    </PanelSection>
    <PanelSection class="property-section" section-key="geometry" title="Geometry" :level="3" :disabled="editor.isLocked(s.id)">
      <p class="geometry-units">{{ e.unitSymbol }} unless indicated</p>
    <div class="field-row">
      <Field :controller="editor" dimension
        label="Position X"
        :value="c.x"
        linkable :binding="link('x')" @commit="(v, f, u) => property('x', v, f, u)"
      />
      <Field :controller="editor" dimension
        label="Position Y"
        :value="c.y"
        linkable :binding="link('y')" @commit="(v, f, u) => property('y', v, f, u)"
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
        linkable :binding="link('width')" @commit="(v, f, u) => property('width', v, f, u)"
      />
      <button v-if="s.kind === 'image'" type="button" class="aspect-ratio-lock"
        aria-label="Lock aspect ratio" :aria-pressed="imageAspectLocked"
        :title="imageAspectLocked ? 'Unlink width and height' : 'Link width and height'"
        :disabled="!e.ready || !!e.transformTool || e.stitchMode"
        @click="imageAspectLocked = !imageAspectLocked">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
          stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <template v-if="imageAspectLocked">
            <path d="M10 8H6a4 4 0 0 0 0 8h4 M14 8h4a4 4 0 0 1 0 8h-4 M8 12h8" />
          </template>
          <template v-else>
            <rect x="1" y="8.5" width="9" height="7" rx="3.5" />
            <rect x="14" y="8.5" width="9" height="7" rx="3.5" />
          </template>
        </svg>
      </button>
      <Field :controller="editor" dimension
        label="Height"
        :value="height"
        :min="0.001"
        linkable :binding="link('height')" @commit="(v, f, u) => property('height', v, f, u)"
      />
    </div>
    <Field :controller="editor" dimension
      v-if="s.kind === 'circle' || s.kind === 'arc'"
      :label="s.transform ? 'Radius (local)' : 'Radius'"
      :value="distance(a, b)"
      :min="0.001"
      linkable :binding="link('radius')" @commit="(v, f, u) => property('radius', v, f, u)"
    />
    <Field
        :controller="editor"
      v-if="s.kind === 'arc'"
      label="Sweep (degrees)"
      :value="s.sweep ?? 0"
      :min="-360"
      :max="360"
      linkable :binding="link('sweep')" @commit="(v, f, u) => property('sweep', v, f, u)"
    />
    <Field
        :controller="editor"
      label="Rotation (degrees)"
      :value="+angle.toFixed(1)"
      linkable :binding="link('rotation')" @commit="(v, f, u) => property('rotation', v, f, u)"
    />
    <template v-if="isIndicator(s.kind)">
      <Field :controller="editor" dimension :label="s.kind === 'size-square' ? 'Side length (mm)' : s.kind === 'crosshair' ? 'Overall size (mm)' : s.kind === 'arrow-head' ? 'Head size (mm)' : 'Length (mm)'"
        :value="indicatorGeometry(s).size" :min="0.001" linkable :binding="link('indicatorSize')" @commit="(v, f, u) => property('indicatorSize', v, f, u)" />
      <Field :controller="editor" dimension v-if="s.kind === 'arrow'" label="Head size (local mm)"
        :value="s.headSize ?? 3" :min="0.001" linkable :binding="link('headSize')" @commit="(v, f, u) => property('headSize', v, f, u)" />
    </template>
    <Field :controller="editor" v-if="s.kind === 'image'" label="Image opacity (%)" :value="(s.fillOpacity ?? 1) * 100" :min="0" :max="100" @commit="edit({ fillOpacity: +$event / 100 })" />
    <template v-if="s.kind === 'measurement'">
      <Field :controller="editor" label="Sections" :value="s.measurementSections ?? 1" :min="1" :max="100" linkable :binding="link('measurementSections')" @commit="(v, f, u) => property('measurementSections', v, f, u)" />
      <Field :controller="editor" dimension
        label="Offset (mm)"
        :value="measurementGeometry(s).offset"
        linkable :binding="link('measurementOffset')" @commit="(v, f, u) => property('measurementOffset', v, f, u)"
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
    <Field :controller="editor" dimension v-if="s.kind !== 'text'" label="Outline width (mm)" :value="s.strokeWidth ?? 0.35" :min="0.001" linkable :binding="link('strokeWidth')" @commit="(v, f, u) => property('strokeWidth', v, f, u)" />
    <label v-if="hasStyledOutline(s.kind)" class="field">
      <span>Outline style</span>
      <select aria-label="Outline style" :value="s.strokeStyle ?? 'solid'"
        :disabled="!e.ready || !!e.transformTool || e.stitchMode"
        @change="edit({ strokeStyle: ($event.target as HTMLSelectElement).value })">
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
        <option value="dotted">Dotted</option>
      </select>
    </label>
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
  <template v-else-if="e.segmentMode">
    <h2>Segments</h2>
    <p v-if="e.segmentSelection.length">
      {{ e.segmentSelection.length === 1 ? "1 segment" : `${e.segmentSelection.length} segments` }} selected,
      {{ editor.formatLength(segmentLength) }} {{ editor.unitSymbol }} total
    </p>
    <p v-else>Click a segment, or drag to select several.</p>
  </template>
  <template v-else>
    <h2>Selection</h2>
    <p>
      {{
        selected.length ? `${selected.length} objects selected` : "No selection"
      }}
    </p>
  </template>
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
.field-row > .aspect-ratio-lock {
  flex: 0 0 28px;
  display: grid;
  place-items: center;
  height: 32px;
  margin-top: 19px;
  padding: 4px;
}
.text-formatting button[aria-pressed="true"],
.aspect-ratio-lock[aria-pressed="true"] {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  border-color: var(--accent);
}
</style>
