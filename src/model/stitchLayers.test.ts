import { expect, test } from "vitest";
import { parseProject, type Doc, type Shape } from "./project";
import { defaultStitchSettings, stitchDistances } from "./stitch";
import { stitchEdges, stitchGeometry, extractStitchEdge, reconcileStitches, type StitchGroup } from "./stitchGeometry";
import { detachTransfer, makeTransfer, pieceFrame, receivingWarnings, copyStitchData, holeTouchesEdge, receivingStitches, resolvedStitchGroups } from "./stitchLayers";
import { moveShape, worldCubics, applyMatrix, shapeMatrix, localCenter } from "./geometry";
import type { StitchTransfer } from "../generated/StitchTransfer";
const line: Shape={id:"master",name:"Master",kind:"line",points:[{x:0,y:5},{x:100,y:5}],rotation:0,radius:0};
const receiver: Shape={id:"receiver",name:"Receiver",kind:"rectangle",points:[{x:200,y:0},{x:250,y:20}],rotation:0,radius:0};
function run(id="run"): StitchGroup { return {id,shapeId:line.id,edges:[stitchEdges(line)[0].key],side:1,closed:false,settings:{...defaultStitchSettings,inset:0,style:"round",roundDiameter:.8,spacing:10,holeCount:3,alignment:"start"}}; }
function transfer(): StitchTransfer {
 const relative=(shape: Shape,points:{x:number;y:number}[])=>points.map(p=>({x:p.x-localCenter(shape).x,y:p.y-localCenter(shape).y}));
 return {id:"layer",masterId:"run",targetId:"receiver",masterPoints:relative(line,[{x:0,y:5},{x:10,y:5}]),targetPoints:relative(receiver,[{x:200,y:5},{x:210,y:5}]),visible:true};
}
function document(group=run()): Doc {return {version:20,shapes:[line,receiver],stitchGroups:[group],stitchTransfers:[transfer()]};}

test("fixed counts preserve pitch, support one hole, and reject fractional or excessive counts",()=>{
 expect(stitchDistances(100,{...run().settings,holeCount:2,spacing:3.38})).toEqual([0,3.38]);
 expect(stitchDistances(100,{...run().settings,holeCount:1,alignment:"center"})).toEqual([50]);
 expect(()=>stitchDistances(10,{...run().settings,holeCount:3})).toThrow(/does not fit/);
 expect(()=>stitchDistances(100,{...run().settings,holeCount:1.5})).toThrow(/whole number/);
});

test("continuations use the previous last hole plus gap and propagate upstream count edits",()=>{
 const first=run(); first.settings.holeCount=2; first.settings.spacing=3.38;
 const second: StitchGroup={...run("second"),continuation:{previousId:first.id,gap:5},settings:{...first.settings,holeCount:2}};
 expect(stitchGeometry(line,second,[first,second]).distances[0]).toBeCloseTo(8.38);
 expect(stitchGeometry(line,second,[first,second]).distances[1]).toBeCloseTo(11.76);
 first.settings.holeCount=3;
 expect(stitchGeometry(line,second,[first,second]).distances[0]).toBeCloseTo(11.76);
 expect(()=>parseProject(JSON.stringify({version:20,shapes:[line],stitchGroups:[{...first,continuation:{previousId:second.id,gap:2}},second]}))).toThrow(/continuation/i);
});

test("receiving holes inherit master positions, clipping and overrides without recentering",()=>{
 const master=run(); master.settings.alignment="center"; master.holeOverrides={"2":{...master.settings,roundDiameter:2}};
 const doc=document(master), result=receivingStitches(doc,transfer());
 expect(result.included).toBe(2); expect(result.excluded).toBe(1); expect(result.edgeHits).toContain(2);
 const holes=stitchGeometry(receiver,result.group).holes;
 expect(holes.map(h=>h.point.x)).toEqual([240,250]);
 expect(result.group.holeOverrides!["2"].roundDiameter).toBe(2);
 const loaded=parseProject(JSON.stringify(doc));
 expect(loaded.version).toBe(22);
 expect(loaded.stitchTransfers![0].pose).toBeDefined();
 const migrated=receivingStitches(loaded,loaded.stitchTransfers![0]);
 expect(stitchGeometry(receiver,migrated.group).holes).toEqual(holes);
});

test("layout moves preserve registered holes relative to receiving geometry",()=>{
 const doc=document();
 const before=receivingStitches(doc,transfer());
 const moved={...doc,shapes:[moveShape(line,50,60),moveShape(receiver,-30,40)]};
 // Local references stay unchanged: moveShape composes transforms instead of changing registration.
 const after=receivingStitches(moved,transfer());
 const points=stitchGeometry(moved.shapes[1],after.group).holes;
 expect(points[0].point.x).toBeCloseTo(stitchGeometry(receiver,before.group).holes[0].point.x-30);
 expect(points[0].point.y).toBeCloseTo(45);
});

test("registration rejects scaling and retained invalid registration is reported",()=>{
 const doc=document(), bad={...transfer(),targetPoints:[{x:-25,y:-5},{x:-5,y:-5}]};
 expect(()=>receivingStitches(doc,bad)).toThrow(/repositioning/g);
 const invalid={...doc,stitchTransfers:[bad]};
 expect(resolvedStitchGroups(invalid)).toHaveLength(1);
 expect(receivingWarnings(invalid)[0].message).toMatch(/repositioning/g);
 expect(receivingWarnings(doc)).toHaveLength(0);
});

test("copying a receiver alone freezes holes, copying both keeps the relationship",()=>{
 const copied=copyStitchData(document(),new Set(["receiver"]));
 expect(copied.groups[0].holes).toBeUndefined();
 expect(stitchGeometry(copied.shapes[0],copied.groups[0]).holes).toHaveLength(3);
 expect(copyStitchData(document(),new Set(["receiver"])).transfers).toHaveLength(0);
 expect(copyStitchData(document(),new Set(["receiver","master"])).transfers).toHaveLength(1);
});

test("edge warnings inspect the physical hole outline",()=>{
 expect(holeTouchesEdge(receiver,{x:200.3,y:5},0,{...run().settings,roundDiameter:.8})).toBe(true);
 expect(holeTouchesEdge(receiver,{x:201,y:5},0,{...run().settings,roundDiameter:.8})).toBe(false);
});

test("edge extraction preserves exact Bezier controls and transformed rounded arcs",()=>{
 const curve: Shape={...line,kind:"control-curve",points:[{x:0,y:0},{x:20,y:10},{x:40,y:0}],handles:[{incoming:{x:0,y:0},outgoing:{x:5,y:10}},{incoming:{x:-5,y:0},outgoing:{x:5,y:0}},{incoming:{x:-5,y:10},outgoing:{x:0,y:0}}]};
 const copy=extractStitchEdge(curve,stitchEdges(curve)[0].key);
 expect(worldCubics(copy)[0]).toEqual(worldCubics(curve)[0]);
 const rounded={...receiver,radius:3,rotation:24,transform:{a:1.2,b:.1,c:.2,d:1,e:10,f:5}};
 const edge=stitchEdges(rounded).find(e=>e.key.includes(":corner:"))!;
 const arc=extractStitchEdge(rounded,edge.key);
 expect(arc.kind).toBe("arc");
 expect(stitchEdges(arc)[0].points[0].x).toBeCloseTo(edge.points[0].x,8);
 expect(stitchEdges(arc)[0].points.at(-1)!.y).toBeCloseTo(edge.points.at(-1)!.y,8);
 expect(applyMatrix(shapeMatrix(arc),arc.points[1]).x).toBeCloseTo(edge.points[0].x,8);
});

test("100 mm pocket holes remain centered on the pocket when projected through a 110 mm backing",()=>{
 const pocket:Shape={...receiver,id:"pocket",points:[{x:0,y:0},{x:100,y:40}]};
 const backing:Shape={...receiver,id:"backing",points:[{x:200,y:0},{x:310,y:40}]};
 const master:StitchGroup={...run(),shapeId:pocket.id,edges:["rectangle:2:edge:1"],settings:{...defaultStitchSettings,spacing:3.38,inset:3,alignment:"center"}};
 const layer:StitchTransfer={id:"layer",masterId:master.id,targetId:backing.id,visible:true,masterPoints:[{x:-50,y:-20},{x:50,y:-20}],targetPoints:[{x:-50,y:-20},{x:50,y:-20}]};
 const doc:Doc={version:20,shapes:[pocket,backing],stitchGroups:[master],stitchTransfers:[layer]};
 const source=stitchGeometry(pocket,master).holes;
 const projected=stitchGeometry(backing,receivingStitches(doc,layer).group).holes;
 expect(projected).toHaveLength(source.length);
 projected.forEach((hole,index)=>{expect(hole.point.x-205).toBeCloseTo(source[index].point.x,8);expect(hole.point.y).toBeCloseTo(source[index].point.y,8);});
 const independent=stitchGeometry(backing,{...master,shapeId:backing.id}).holes;
 expect(independent.map(h=>h.point.x)).not.toEqual(projected.map(h=>h.point.x));
});

test("closed Bezier receiving pieces clip against their actual material boundary",()=>{
 const curve:Shape={...receiver,kind:"control-curve",points:[{x:200,y:0},{x:250,y:0},{x:250,y:20},{x:200,y:20},{x:200,y:0}],handles:Array.from({length:5},()=>({incoming:{x:0,y:0},outgoing:{x:0,y:0}}))};
 const doc={...document(),shapes:[line,curve]};
 const result=receivingStitches(doc,transfer());
 expect(result.included).toBe(3);
 expect(result.excluded).toBe(0);
 expect(result.edgeHits).toContain(1);
});

test("native detached runs preserve transferred holes and support new spacing/inset",()=>{
 const doc=document(),placement=makeTransfer(doc,"run",receiver,{x:250,y:5},0,"placement");
 const before=receivingStitches(doc,placement),data=detachTransfer(doc,placement);
 expect(data.groups[0].holes).toBeUndefined();
 expect(data.shapes[0].kind).toBe("line");
 const after=stitchGeometry(data.shapes[0],data.groups[0]);
 expect(after.holes.map(h=>h.point.x)).toEqual([200,210,220]);
 expect(after.holes).toHaveLength(before.included);
 const edited={...data.groups[0],settings:{...data.groups[0].settings,spacing:8,inset:2}};
 expect(stitchGeometry(data.shapes[0],edited).holes.map(h=>h.point.x)).toEqual([200,208,216]);
 expect(stitchGeometry(data.shapes[0],edited).holes[0].point.y).toBeCloseTo(7);
 const loaded=parseProject(JSON.stringify({...doc,shapes:[...doc.shapes,...data.shapes],stitchGroups:[...doc.stitchGroups!,...data.groups],stitchTransfers:[]}));
 expect(loaded.shapes.find(s=>s.id===data.shapes[0].id)?.stitchParentId).toBe(receiver.id);
});

test("each placement is independent and repeated source/receiver pairs are supported",()=>{
 const doc=document(),one=makeTransfer(doc,"run",receiver,{x:250,y:5},0,"one"),two=makeTransfer(doc,"run",receiver,{x:250,y:10},0,"two");
 const loaded=parseProject(JSON.stringify({...doc,stitchTransfers:[one,two]}));
 expect(loaded.stitchTransfers).toHaveLength(2);
 expect(stitchGeometry(receiver,receivingStitches(loaded,loaded.stitchTransfers![0]).group).holes[0].point.y).toBe(5);
 expect(stitchGeometry(receiver,receivingStitches(loaded,loaded.stitchTransfers![1]).group).holes[0].point.y).toBe(10);
});

test("format-20 detached snapshots get editable paths without moving their initial holes",()=>{
 const snapshot=receivingStitches(document(),transfer()).group;
 const loaded=parseProject(JSON.stringify({version:20,shapes:[receiver],stitchGroups:[snapshot]}));
 const group=loaded.stitchGroups![0],guide=loaded.shapes.find(s=>s.id===group.shapeId)!;
 expect(guide.stitchOnly).toBe(true);expect(guide.stitchParentId).toBe(receiver.id);
 expect(stitchGeometry(guide,group).holes.map(h=>h.point.x)).toEqual([200,210,220]);
 expect(parseProject(JSON.stringify(loaded))).toEqual(loaded);
});


test("detaching a concave receiver preserves separated clipped runs",()=>{
 const source={...line,points:[{x:0,y:5},{x:80,y:5}]};
 const target:Shape={...receiver,kind:"polyline",points:[{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:60,y:10},{x:60,y:0},{x:80,y:0},{x:80,y:20},{x:0,y:20},{x:0,y:0}]};
 const group={...run(),settings:{...run().settings,holeCount:9}};
 const doc:Doc={version:21,shapes:[source,target],stitchGroups:[group]};
 const transfer=makeTransfer(doc,group.id,target,{x:40,y:5},0,"concave");
 const before=stitchGeometry(target,receivingStitches(doc,transfer).group).holes;
 const detached=detachTransfer(doc,transfer);
 expect(detached.groups).toHaveLength(2);
 const after=detached.groups.flatMap(g=>stitchGeometry(detached.shapes[0],g).holes);
 expect(after.map(h=>h.point)).toEqual(before.map(h=>h.point));
});

test("detached guides follow receiving piece moves and disappear with their piece",()=>{
 const doc=document(),data=detachTransfer(doc,transfer());
 const initial={...doc,shapes:[...doc.shapes,...data.shapes],stitchGroups:[...doc.stitchGroups!,...data.groups],stitchTransfers:[]};
 const moved=reconcileStitches({...initial,shapes:initial.shapes.map(s=>s.id===receiver.id ? moveShape(s,15,25) : s)},initial);
 const guide=moved.shapes.find(s=>s.id===data.shapes[0].id)!;
 const hole=stitchGeometry(guide,data.groups[0]).holes[0];
 expect(hole.point.x).toBeCloseTo(215);expect(hole.point.y).toBeCloseTo(30);
 const deleted=reconcileStitches({...initial,shapes:initial.shapes.filter(s=>s.id!==receiver.id)},initial);
 expect(deleted.shapes.some(s=>s.stitchParentId===receiver.id)).toBe(false);
 expect(deleted.stitchGroups).toHaveLength(1);
});


test("moving a rectangle corner preserves attached logical edges",async()=>{
 const {cornerPoints}=await import("./geometry");
 const points=cornerPoints(receiver),source={...receiver};
 const group={...run(),shapeId:source.id,edges:[stitchEdges(source)[0].key]};
 const previous:Doc={version:21,shapes:[source],stitchGroups:[group]};
 const moved={...source,kind:"polyline" as const,points:[...points.map((p,i)=>i===0 ? {x:p.x+5,y:p.y+3} : p),{x:points[0].x+5,y:points[0].y+3}]};
 const reconciled=reconcileStitches({...previous,shapes:[moved]},previous);
 expect(reconciled.stitchGroups).toHaveLength(1);
 expect(reconciled.stitchGroups![0].id).toBe(group.id);
 expect(reconciled.stitchGroups![0].edges[0]).toContain("polyline");
});

test("continuations support Auto count without moving their first hole",()=>{
 const first=run();first.settings.spacing=3.38;first.settings.holeCount=2;
 const next={...run("auto"),continuation:{previousId:first.id,gap:5},settings:{...first.settings,holeCount:undefined}};
 const geometry=stitchGeometry(line,next,[first,next]);
 expect(geometry.distances[0]).toBeCloseTo(8.38);expect(geometry.holes.length).toBeGreaterThan(2);
});

test("standalone closed stitching guides have no material warning, while material pieces do",async()=>{
 const {stitchEdgeContacts}=await import("./stitchLayers");
 const shape={...receiver,stitchOnly:true};
 const group={...run(),shapeId:shape.id,edges:[stitchEdges(shape)[0].key],settings:{...run().settings,holeCount:undefined,inset:0}};
 expect(stitchEdgeContacts({version:21,shapes:[shape],stitchGroups:[group]},shape,group).size).toBe(0);
 const material={...shape,stitchOnly:false};
 expect(stitchEdgeContacts({version:21,shapes:[material],stitchGroups:[group]},material,group).size).toBeGreaterThan(0);
});

test("transfer numbers are shared per placement and survive deleting earlier placements",async()=>{
 const {numberStitchTransfers,copyTransferPlacements}=await import("./stitchLayers");
 const one={...transfer(),placementId:"first",number:1};
 const two={...transfer(),id:"second",placementId:"second",number:2};
 const receiverTwo={...one,id:"another-receiver",targetId:"other"};
 expect(numberStitchTransfers([one,receiverTwo,two]).map(t=>t.number)).toEqual([1,1,2]);
 expect(numberStitchTransfers([two])[0].number).toBe(2);
 expect(copyTransferPlacements([one,two],[one,receiverTwo]).map(t=>t.number)).toEqual([3,3]);
 expect(()=>numberStitchTransfers([one,{...two,number:1}])).toThrow(/number/);
 const loaded=parseProject(JSON.stringify(document()));expect(loaded.stitchTransfers![0].number).toBe(1);
 expect(parseProject(JSON.stringify(loaded))).toEqual(loaded);
});
