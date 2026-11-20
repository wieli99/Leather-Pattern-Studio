<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { readSvgText } from "../editor/svgImportCompatibility";
import { editor } from "../editor/instance";
import { decodeImageFile } from "../editor/imageImport";
import { svgShapePath } from "../editor/printScene";
import {
  applyDetectedStitches,
  parseVectorSvg,
  type VectorImport,
} from "../editor/vectorImport";
import { contourShape } from "../model/compound";
import { detectSvgStitches } from "../model/detectSvgStitches";
import ModeIcon from "./ModeIcon.vue";
import RailButton from "./RailButton.vue";
import { useEditor } from "./useEditor";

const e = useEditor();
const picker = ref<HTMLInputElement>();
const reviewOpen = defineModel<boolean>("reviewOpen", { required: true });
const result = shallowRef<VectorImport>();
const reading = ref(false);
const submitting = ref(false);
const mode = ref<"editable" | "image">("editable");
const detect = ref(true);
const conversionError = ref("");
const importError = ref("");
const stale = ref(false);
let trigger: HTMLElement | undefined;
let svgFile: File | undefined;
const snapshot = () => ({
  document: editor.document,
  revision: editor.revision,
  epoch: editor.projectEpoch,
});
let source = snapshot();
const detectedRuns = computed(() => result.value && detectSvgStitches(result.value.shapes, result.value.tree, result.value.stitchExcludedIds));
const detection = computed(() => detect.value && mode.value === "editable" ? detectedRuns.value : undefined);
const highlighted = computed(
  () => new Set(detection.value?.runs.flatMap((run) => run.sourceIds) ?? []),
);
const highlightedContours = computed(() => {
  const shapes = new Map(result.value?.shapes.map(shape => [shape.id, shape]));
  return detection.value?.runs.flatMap(({ sourceContours }) => {
    if (!sourceContours) return [];
    const shape = shapes.get(sourceContours.shapeId)!;
    return sourceContours.indices.map(index => ({
      key: `${shape.id}:${index}`,
      path: svgShapePath(contourShape(shape, shape.contours![index])),
    }));
  }) ?? [];
});
const holeCount = computed(
  () =>
    detection.value?.runs.reduce((count, run) => count + run.holes.length, 0) ??
    0,
);
const previewBox = computed(() => {
  const b = result.value?.bounds;
  if (!b) return "0 0 100 100";
  const margin = Math.max(b.width, b.height, 1) * 0.04;
  return `${b.x - margin} ${b.y - margin} ${b.width + 2 * margin} ${b.height + 2 * margin}`;
});
function checkSource() {
  if (
    source.document !== editor.document ||
    source.revision !== editor.revision ||
    source.epoch !== editor.projectEpoch
  ) {
    stale.value = true;
    throw Error("Project changed during import. Cancel and try again.");
  }
  if (
    !editor.ready ||
    editor.printLayoutActive ||
    editor.busy ||
    editor.pendingDocument ||
    editor.fileBusy
  )
    throw Error("Finish the current operation on Model and try again.");
}
async function importImage(file: File) {
  const image = await decodeImageFile(file);
  checkSource();
  if (!(await editor.insertImage(image)))
    throw Error(editor.message || "Could not import image.");
}
async function read(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || reading.value || submitting.value || reviewOpen.value) return;
  source = snapshot();
  reading.value = true;
  try {
    if (file.type !== "image/svg+xml" && !/\.svg$/i.test(file.name)) {
      await importImage(file);
      return;
    }
    svgFile = file;
    result.value = undefined;
    mode.value = "editable";
    detect.value = true;
    stale.value = false;
    conversionError.value = "";
    importError.value = "";
    try {
      if (file.size > 10 * 1024 * 1024) throw Error("SVG exceeds 10 MiB");
      result.value = parseVectorSvg(await readSvgText(file));
    } catch (error) {
      conversionError.value =
        error instanceof Error ? error.message : String(error);
    }
    checkSource();
    reviewOpen.value = true;
  } catch (error) {
    editor.fail(error);
  } finally {
    reading.value = false;
  }
}
function setOpen(open: boolean) {
  if (!submitting.value) reviewOpen.value = open;
}
function restoreFocus(event: Event) {
  event.preventDefault();
  trigger?.focus();
  svgFile = undefined;
  result.value = undefined;
}
async function insert() {
  if (!svgFile || submitting.value) return;
  submitting.value = true;
  importError.value = "";
  try {
    checkSource();
    if (mode.value === "image") await importImage(svgFile);
    else {
      if (!result.value?.shapes.length) return;
      const converted = applyDetectedStitches(
        result.value,
        detection.value?.runs ?? [],
      );
      if (
        !(await editor.insertVector(
          converted,
          svgFile.name.replace(/\.svg$/i, ""),
          source,
        ))
      )
        throw Error(editor.message || "Could not import editable SVG.");
    }
    reviewOpen.value = false;
  } catch (error) {
    importError.value = error instanceof Error ? error.message : String(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <input
    ref="picker"
    aria-label="Image file"
    type="file"
    accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
    hidden
    @change="read"
  />
  <RailButton
    title="Import image"
    aria-label="Import image"
    :disabled="!e.ready || e.busy || e.fileBusy || reading || submitting"
    @click="
      trigger = $event.currentTarget as HTMLElement;
      picker?.click();
    "
  >
    <span class="tool-icon"><ModeIcon mode="image" /></span>
  </RailButton>
  <DialogRoot :open="reviewOpen" @update:open="setOpen">
    <DialogPortal>
      <DialogOverlay class="image-import-overlay" />
      <DialogContent
        class="image-import-dialog"
        @close-auto-focus="restoreFocus"
        @interact-outside.prevent
      >
        <DialogTitle>Import SVG</DialogTitle>
        <DialogDescription>{{ svgFile?.name }}</DialogDescription>
        <form @submit.prevent="insert">
          <fieldset :disabled="submitting" class="import-modes">
            <legend>Import mode</legend>
            <label
              ><input
                v-model="mode"
                type="radio"
                value="editable"
                @change="!stale && (importError = '')"
              />
              Convert to editable geometry</label
            >
            <label
              ><input
                v-model="mode"
                type="radio"
                value="image"
                @change="!stale && (importError = '')"
              />
              Import as image</label
            >
          </fieldset>
          <template v-if="mode === 'editable'">
            <p v-if="conversionError" role="alert">{{ conversionError }}</p>
            <template v-if="result">
              <p v-if="result.shapes.length">
                Artwork: {{ result.bounds.width.toFixed(2) }} ×
                {{ result.bounds.height.toFixed(2) }} mm. SVG page:
                {{ result.width.toFixed(2) }} ×
                {{ result.height.toFixed(2) }} mm.
              </p>
              <p v-else>No supported geometry to import.</p>
              <label v-if="result.shapes.length"
                ><input
                  v-model="detect"
                  type="checkbox"
                  :disabled="submitting"
                />
                Detect stitching lines</label
              >
              <p v-if="detection" aria-live="polite">
                {{
                  detection.warning ??
                  `${detection.runs.length} stitching lines detected · ${holeCount} holes`
                }}
              </p>
              <p v-if="detection?.runs.length">
                DXF export skips converted stitching. Turn off Detect stitching
                lines to keep the original marks as cut outlines.
              </p>
              <svg
                v-if="result.shapes.length"
                class="vector-preview"
                :viewBox="previewBox"
                role="img"
                aria-label="Imported geometry preview"
              >
                <path
                  v-for="shape in result.shapes"
                  :key="shape.id"
                  :d="svgShapePath(shape)"
                  :fill="
                    highlighted.has(shape.id)
                      ? '#006dce'
                      : (shape.fillColor ?? 'none')
                  "
                  :fill-opacity="
                    highlighted.has(shape.id) ? 0.7 : shape.fillOpacity
                  "
                  :fill-rule="shape.kind === 'compound' ? 'evenodd' : 'nonzero'"
                  :stroke="
                    highlighted.has(shape.id)
                      ? '#006dce'
                      : (shape.strokeColor ?? '#333')
                  "
                  :stroke-opacity="
                    highlighted.has(shape.id)
                      ? 1
                      : (shape.strokeOpacity ?? 1)
                  "
                  stroke-width="1"
                  vector-effect="non-scaling-stroke"
                />
                <path
                  v-for="contour in highlightedContours"
                  :key="contour.key"
                  :d="contour.path"
                  data-detected-stitch-contour
                  fill="#006dce"
                  stroke="#006dce"
                  stroke-width="1"
                  vector-effect="non-scaling-stroke"
                />
                <path
                  v-for="run in detection?.runs"
                  :key="run.shape.id"
                  :d="svgShapePath(run.shape)"
                  data-detected-stitch-line
                  fill="none"
                  stroke="#006dce"
                  stroke-width="1.5"
                  stroke-dasharray="4 2"
                  vector-effect="non-scaling-stroke"
                />
              </svg>
              <ul v-if="result.warnings.length" aria-label="Import warnings">
                <li v-for="warning in result.warnings" :key="warning">
                  {{ warning }}
                </li>
              </ul>
            </template>
          </template>
          <p v-if="importError" role="alert">{{ importError }}</p>
          <div class="actions">
            <DialogClose type="button" :disabled="submitting"
              >Cancel</DialogClose
            >
            <button
              type="submit"
              :disabled="
                submitting ||
                stale ||
                e.busy ||
                e.fileBusy ||
                (mode === 'editable' && !result?.shapes.length)
              "
            >
              Import
            </button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.image-import-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: #0008;
}
.image-import-dialog {
  position: fixed;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  z-index: 101;
  width: min(540px, 94vw);
  max-height: 90vh;
  overflow: auto;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 12px 50px #0008;
}
.image-import-dialog h2 {
  margin-top: 0;
}
.image-import-dialog form {
  display: grid;
  gap: 12px;
}
.image-import-dialog p,
.image-import-dialog ul {
  margin: 0;
}
.image-import-dialog p,
.image-import-dialog label,
.image-import-dialog li {
  font-size: 13px;
  line-height: 1.5;
}
.image-import-dialog .actions {
  margin-top: 4px;
}
.import-modes {
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 5px;
}
.import-modes label {
  display: block;
}
.vector-preview {
  display: block;
  width: 100%;
  height: 220px;
  background: repeating-conic-gradient(#a4a8ae 0% 25%, #c9cdd2 0% 50%) 0 0 / 16px 16px;
  border-radius: 6px;
}
</style>
