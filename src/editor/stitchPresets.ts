import type { StitchPreset } from "../generated/StitchPreset";
import { validateStitchSettings } from "../model/stitch";

const libraryKey = "leather-stitch-presets";
type PresetStorage = Pick<Storage, "getItem" | "setItem">;

function validate(presets: unknown): asserts presets is StitchPreset[] {
  if (!Array.isArray(presets) || presets.length > 1000) throw Error("Invalid preset library.");
  const names = new Set<string>();
  for (const preset of presets) {
    if (typeof preset?.name !== "string" || !preset.name.trim() || preset.name.length > 200 || names.has(preset.name)) throw Error("Invalid preset name.");
    validateStitchSettings(preset.settings);
    names.add(preset.name);
  }
}

export function readStitchPresets(storage: PresetStorage = localStorage): StitchPreset[] {
  const presets: unknown = JSON.parse(storage.getItem(libraryKey) ?? "[]");
  validate(presets);
  return presets;
}

export function writeStitchPresets(presets: StitchPreset[], storage: PresetStorage = localStorage) {
  validate(presets);
  storage.setItem(libraryKey, JSON.stringify(presets));
}


export function exportStitchPresetBackup(presets:StitchPreset[]) {
  validate(presets);return JSON.stringify({format:"leather-stitch-presets",version:1,presets},null,2);
}
export function parseStitchPresetBackup(text:string):StitchPreset[] {
  const value=JSON.parse(text);
  if(value?.format!=="leather-stitch-presets" || value.version!==1)throw Error("Unsupported preset backup.");
  validate(value.presets);return value.presets;
}
export function mergeStitchPresets(existing:StitchPreset[],incoming:StitchPreset[]):StitchPreset[] {
  const result=structuredClone(existing);
  for(const preset of incoming) {
    if(result.some(p=>p.name===preset.name && JSON.stringify(p.settings)===JSON.stringify(preset.settings)))continue;
    let name=preset.name,index=2;
    while(result.some(p=>p.name===name))name=`${preset.name.slice(0,180)} (${index++})`;
    result.push({...preset,name});
  }
  validate(result);return result;
}
