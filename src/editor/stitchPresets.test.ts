import { expect, test } from "vitest";
import { readStitchPresets, writeStitchPresets } from "./stitchPresets";
import { defaultStitchSettings } from "../model/stitch";

test("browser presets persist independently and invalid libraries cannot replace them", () => {
  const data=new Map<string,string>();
  const storage={getItem:(key:string)=>data.get(key) ?? null,setItem:(key:string,value:string)=>{data.set(key,value);}};
  expect(readStitchPresets(storage)).toEqual([]);
  const presets=[{name:"Pocket iron",settings:{...defaultStitchSettings,spacing:3.38}}];
  writeStitchPresets(presets,storage);
  expect(readStitchPresets(storage)).toEqual(presets);
  expect(()=>writeStitchPresets([...presets,...presets],storage)).toThrow(/name/);
  expect(()=>writeStitchPresets([{...presets[0],settings:{...defaultStitchSettings,spacing:0}}],storage)).toThrow();
  expect(readStitchPresets(storage)).toEqual(presets);
});


test("preset backups round trip and merge without replacing conflicting settings",async()=>{
 const {exportStitchPresetBackup,parseStitchPresetBackup,mergeStitchPresets}=await import("./stitchPresets");
 const one=[{name:"Iron",settings:{...defaultStitchSettings,spacing:3}}];
 expect(parseStitchPresetBackup(exportStitchPresetBackup(one))).toEqual(one);
 expect(mergeStitchPresets(one,one)).toHaveLength(1);
 expect(mergeStitchPresets(one,[{name:"Iron",settings:{...defaultStitchSettings,spacing:4}}]).map(p=>p.name)).toEqual(["Iron","Iron (2)"]);
 expect(()=>parseStitchPresetBackup('{"version":99}')).toThrow();
});
