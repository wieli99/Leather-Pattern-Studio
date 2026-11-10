import type { Doc, Point, Shape } from "./project";
import type { StitchTransfer } from "../generated/StitchTransfer";
import { applyMatrix, inverse, shapeMatrix, localCenter, multiply, identity, distance, distanceToSegment } from "./geometry";
import { stitchGeometry, stitchEdges, stitchClosed, resolveStitchRun, type StitchGroup } from "./stitchGeometry";
import { stitchMarks, type StitchSettings } from "./stitch";

export function validateStitchTransfers(input: unknown, shapes: Shape[], groups: StitchGroup[]): StitchTransfer[] {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 10000) throw Error("Invalid stitching transfers");
  const ids = new Set<string>(), pairs = new Set<string>();
  return numberStitchTransfers(input.map(t => {
    const master = groups.find(g => g.id === t?.masterId);
    const target = shapes.find(s => s.id === t?.targetId);
    const pair = JSON.stringify([t?.placementId ?? t?.id, t?.masterId, t?.targetId]);
    if (!t || typeof t.id !== "string" || !t.id || ids.has(t.id) || groups.some(g => g.id===t.id) || pairs.has(pair) || !master || !target || target.stitchOnly || !stitchClosed(target) || target.id === (shapes.find(s=>s.id===master.shapeId)?.stitchParentId ?? master.shapeId) || typeof t.visible !== "boolean") throw Error("Invalid stitching transfer");
    ids.add(t.id); pairs.add(pair);
    if (t.pose) {
      if (typeof t.placementId!=="string" || !t.placementId || !Number.isFinite(t.pose.angle) || !Number.isFinite(t.pose.offset?.x) || !Number.isFinite(t.pose.offset?.y)) throw Error("Invalid transfer placement");
    } else for (const points of [t.masterPoints,t.targetPoints]) {
      if (!Array.isArray(points) || points.length!==2 || points.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.y)) || distance(points[0],points[1])<1e-7) throw Error("Invalid legacy transfer registration");
    }
    return { id:t.id,masterId:t.masterId,targetId:t.targetId,visible:t.visible,number:t.number,placementId:t.placementId ?? t.id,...(t.pose ? {pose:{offset:{...t.pose.offset},angle:t.pose.angle}} : {}),masterPoints:t.masterPoints ?? [],targetPoints:t.targetPoints ?? [] };
  }));
}

export function holeAppearance(group: StitchGroup, index: number): StitchSettings {
  return group.holeOverrides?.[String(index + 1)] ?? group.settings;
}
export function holeMark(settings: StitchSettings) {
  const base = stitchMarks[settings.style];
  const scale = settings.style === "flat" ? (settings.flatLength ?? base.width) / base.width : 1;
  return { width: settings.style === "round" ? (settings.roundDiameter ?? base.width) : base.width * scale, height: base.height * scale, angle: base.angle };
}

export function hitStitchHole(group: StitchGroup,index: number,hole: {point:Point;angle:number},point:Point,tolerance:number) {
  const appearance=holeAppearance(group,index),mark=holeMark(appearance),angle=hole.angle+(group.settings.reversed ? -mark.angle : mark.angle);
  const dx=point.x-hole.point.x,dy=point.y-hole.point.y,x=Math.cos(angle)*dx+Math.sin(angle)*dy,y=-Math.sin(angle)*dx+Math.cos(angle)*dy;
  if(appearance.style==="round")return Math.hypot(x,y)<=mark.width/2+tolerance;
  if(appearance.style==="japanese")return Math.abs(x)/(mark.width/2)+Math.abs(y)/(mark.height/2)<=1+tolerance/Math.min(mark.width/2,mark.height/2);
  return Math.abs(x)<=mark.width/2+tolerance && Math.abs(y)<=mark.height/2+tolerance;
}

type BoundarySegment = readonly [Point,Point];
const materialBoundaries = new WeakMap<Shape,BoundarySegment[]>();
function materialBoundary(shape: Shape) {
  let segments=materialBoundaries.get(shape);
  if (!segments) {
    segments=stitchEdges(shape).flatMap(edge=>edge.points.slice(1).map((b,index)=>[edge.points[index],b] as const));
    materialBoundaries.set(shape,segments);
  }
  return segments;
}
type MaterialIndex={segments:BoundarySegment[];x:number;y:number;width:number;height:number;rows:number[][];cells:Map<string,number[]>};
const materialIndices=new WeakMap<Shape,MaterialIndex>();
function materialIndex(shape:Shape):MaterialIndex {
 const cached=materialIndices.get(shape);if(cached)return cached;
 const segments=materialBoundary(shape);let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
 for(const [a,b] of segments)for(const p of [a,b]){x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}
 const index:MaterialIndex={segments,x,y,width:Math.max(1e-9,right-x),height:Math.max(1e-9,bottom-y),rows:Array.from({length:64},()=>[]),cells:new Map()};
 const cell=(v:number,start:number,size:number,count:number)=>Math.max(0,Math.min(count-1,Math.floor((v-start)/size*count)));
 segments.forEach(([a,b],i)=>{
  for(let row=cell(Math.min(a.y,b.y),y,index.height,64);row<=cell(Math.max(a.y,b.y),y,index.height,64);row++)index.rows[row].push(i);
  for(let cx=cell(Math.min(a.x,b.x),x,index.width,16);cx<=cell(Math.max(a.x,b.x),x,index.width,16);cx++)for(let cy=cell(Math.min(a.y,b.y),y,index.height,16);cy<=cell(Math.max(a.y,b.y),y,index.height,16);cy++){const key=`${cx},${cy}`;const bucket=index.cells.get(key) ?? [];bucket.push(i);index.cells.set(key,bucket);}
 });
 materialIndices.set(shape,index);return index;
}
function nearbyMaterial(index:MaterialIndex,left:number,top:number,right:number,bottom:number) {
 if(left>index.x+index.width || right<index.x || top>index.y+index.height || bottom<index.y)return [];
 const cell=(v:number,start:number,size:number)=>Math.max(0,Math.min(15,Math.floor((v-start)/size*16)));
 const ids=new Set<number>();
 for(let x=cell(left,index.x,index.width);x<=cell(right,index.x,index.width);x++)for(let y=cell(top,index.y,index.height);y<=cell(bottom,index.y,index.height);y++)for(const id of index.cells.get(`${x},${y}`) ?? [])ids.add(id);
 return [...ids].map(id=>index.segments[id]);
}
/** Exact boundary tests use spatial candidates; ray parity uses a cached Y bucket. */
export function materialContains(shape:Shape,point:Point) {
 const index=materialIndex(shape);
 if(point.x<index.x-1e-7 || point.x>index.x+index.width+1e-7 || point.y<index.y-1e-7 || point.y>index.y+index.height+1e-7)return false;
 if(nearbyMaterial(index,point.x-1e-7,point.y-1e-7,point.x+1e-7,point.y+1e-7).some(([a,b])=>distanceToSegment(point,a,b)<=1e-7))return true;
 const row=Math.max(0,Math.min(63,Math.floor((point.y-index.y)/index.height*64)));let inside=false;
 for(const id of index.rows[row]){const [a,b]=index.segments[id];if((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}
 return inside;
}

/** Material boundary check includes the physical footprint, not just the hole center. */
export function holeTouchesEdge(shape: Shape, point: Point, angle: number, settings: StitchSettings, reversed = false): boolean {
  if (!stitchClosed(shape)) return false;
  if (!materialContains(shape, point)) return true;
  const mark = holeMark(settings);
  const radius=Math.hypot(mark.width,mark.height)/2+.003;
  const edges=nearbyMaterial(materialIndex(shape),point.x-radius,point.y-radius,point.x+radius,point.y+radius);
  if (settings.style === "round") return edges.some(([a, b]) => distanceToSegment(point, a, b) <= mark.width / 2 + .002);
  const rotation = angle + (reversed ? -mark.angle : mark.angle);
  const local = settings.style === "japanese"
    ? [{ x: -mark.width / 2, y: 0 }, { x: 0, y: -mark.height / 2 }, { x: mark.width / 2, y: 0 }, { x: 0, y: mark.height / 2 }]
    : [{ x: -mark.width / 2, y: -mark.height / 2 }, { x: mark.width / 2, y: -mark.height / 2 }, { x: mark.width / 2, y: mark.height / 2 }, { x: -mark.width / 2, y: mark.height / 2 }];
  const vertices = local.map(p => ({ x: point.x + Math.cos(rotation) * p.x - Math.sin(rotation) * p.y, y: point.y + Math.sin(rotation) * p.x + Math.cos(rotation) * p.y }));
  if (vertices.some(p => !materialContains(shape, p))) return true;
  const cross = (a: Point, b: Point, c: Point) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  return vertices.some((a, i) => {
    const b = vertices[(i + 1) % vertices.length];
    return edges.some(([c, d]) => (cross(a,b,c)*cross(a,b,d) <= 0 && cross(c,d,a)*cross(c,d,b) <= 0 && Math.max(Math.min(a.x,b.x), Math.min(c.x,d.x)) <= Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x)) + .002 && Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)) <= Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y)) + .002) || distanceToSegment(c,a,b) <= .002 || distanceToSegment(d,a,b) <= .002);
  });
}

/** Rigid piece frame preserves physical dimensions while stripping layout translation/rotation. */
export function pieceFrame(shape: Shape) {
  const matrix=shapeMatrix(shape), center=applyMatrix(matrix,localCenter(shape));
  const angle=Math.atan2(matrix.b,matrix.a),c=Math.cos(angle),sn=Math.sin(angle);
  return { center,angle,matrix:{a:c,b:sn,c:-sn,d:c,e:center.x,f:center.y} };
}
export function stitchPiece(doc: Doc,group: StitchGroup): Shape {
  const shape=doc.shapes.find(s=>s.id===group.shapeId);
  if (!shape) throw Error("Missing stitch source");
  return doc.shapes.find(s=>s.id===shape.stitchParentId) ?? shape;
}
export function transferMapping(doc: Doc,transfer: StitchTransfer) {
  const master=doc.stitchGroups?.find(g=>g.id===transfer.masterId);
  const target=doc.shapes.find(s=>s.id===transfer.targetId);
  if (!master || !target) throw Error("A transfer source or receiving piece no longer exists.");
  const source=stitchPiece(doc,master),sf=pieceFrame(source),tf=pieceFrame(target);
  if (transfer.pose) {
    const b=applyMatrix(tf.matrix,transfer.pose.offset);
    const rotation=tf.angle+transfer.pose.angle*Math.PI/180-sf.angle;
    return {master,source,target,a:[sf.center],b:[b],rotation};
  }
  // Compatibility reader only. New placements never collect or store point pairs.
  const sc=localCenter(source),tc=localCenter(target);
  const a=(transfer.masterPoints ?? []).map(p=>applyMatrix(shapeMatrix(source),{x:p.x+sc.x,y:p.y+sc.y}));
  const b=(transfer.targetPoints ?? []).map(p=>applyMatrix(shapeMatrix(target),{x:p.x+tc.x,y:p.y+tc.y}));
  if (a.length!==2 || b.length!==2 || distance(a[0],a[1])<1e-7 || Math.abs(distance(a[0],a[1])-distance(b[0],b[1]))>1e-5) throw Error("This legacy transfer needs repositioning. Remove it and transfer the selected stitching again.");
  return {master,source,target,a,b,rotation:Math.atan2(b[1].y-b[0].y,b[1].x-b[0].x)-Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x)};
}
export function makeTransfer(doc: Doc,masterId: string,target: Shape,center: Point,rotation: number,placementId: string): StitchTransfer {
  const master=doc.stitchGroups!.find(g=>g.id===masterId)!,sf=pieceFrame(stitchPiece(doc,master)),tf=pieceFrame(target);
  return {id:crypto.randomUUID(),placementId,number:doc.stitchTransfers?.find(t=>t.placementId===placementId)?.number,masterId,targetId:target.id,visible:true,pose:{offset:applyMatrix(inverse(tf.matrix),center),angle:rotation+ (sf.angle-tf.angle)*180/Math.PI},masterPoints:[],targetPoints:[]};
}
function mappingMatrix(a: Point,b: Point,rotation: number) {
  const c=Math.cos(rotation),sn=Math.sin(rotation);
  return {a:c,b:sn,c:-sn,d:c,e:b.x-c*a.x+sn*a.y,f:b.y-sn*a.x-c*a.y};
}
function computeReceivingStitches(doc: Doc, transfer: StitchTransfer) {
  const mapping=transferMapping(doc,transfer),{master,source,target,a,b,rotation}=mapping;
  const targetMatrix=shapeMatrix(target),targetCenter=localCenter(target);
  const cos=Math.cos(rotation),sin=Math.sin(rotation),inv=inverse(targetMatrix);
  const guide=doc.shapes.find(s=>s.id===master.shapeId)!;
  const geometry=stitchGeometry(guide,master,doc.stitchGroups),sourceHoles=geometry.holes;
  const keptIndices: number[]=[];
  const holes: NonNullable<StitchGroup["holes"]> = [], holeOverrides: NonNullable<StitchGroup["holeOverrides"]> = {}, edgeHits: number[] = [];
  sourceHoles.forEach((hole, index) => {
    const dx=hole.point.x-a[0].x, dy=hole.point.y-a[0].y;
    const point={x:b[0].x+cos*dx-sin*dy,y:b[0].y+sin*dx+cos*dy}, angle=hole.angle+rotation;
    if (!materialContains(target,point)) return;
    keptIndices.push(index);
    const local = applyMatrix(inv, point);
    const direction = applyMatrix(inv,{ x:point.x+Math.cos(angle), y:point.y+Math.sin(angle) });
    holes.push({ point:{x:local.x-targetCenter.x,y:local.y-targetCenter.y}, angle:Math.atan2(direction.y-local.y,direction.x-local.x) });
    const appearance = holeAppearance(master,index);
    if (master.holeOverrides?.[String(index+1)]) holeOverrides[String(holes.length)] = appearance;
    if (holeTouchesEdge(target,point,angle,appearance,master.settings.reversed)) edgeHits.push(holes.length);
  });
  const group: StitchGroup = { id:transfer.id, shapeId:target.id, edges:[], side:1, settings:{...master.settings}, closed:false, holes, holeOverrides };
  return { group, source, target, included:holes.length, excluded:sourceHoles.length-holes.length, edgeHits, keptIndices, geometry, guide, registration:{ a,b,rotation } };
}

type ReceivingGeometry = ReturnType<typeof computeReceivingStitches>;
// Document and shape snapshots are immutable, like the geometry caches they use.
const receivingCache = new WeakMap<Doc,WeakMap<StitchTransfer,ReceivingGeometry | Error>>();
export function receivingStitches(doc: Doc,transfer: StitchTransfer): ReceivingGeometry {
  let cache=receivingCache.get(doc);
  if (!cache) { cache=new WeakMap(); receivingCache.set(doc,cache); }
  const saved=cache.get(transfer);
  if (saved instanceof Error) throw saved;
  if (saved) return saved;
  try { const result=computeReceivingStitches(doc,transfer); cache.set(transfer,result); return result; }
  catch (reason) { if (reason instanceof Error) cache.set(transfer,reason); throw reason; }
}
export function receivingWarnings(doc: Doc) {
  return (doc.stitchTransfers ?? []).flatMap(transfer=>{
    try { receivingStitches(doc,transfer); return []; }
    catch (reason) { return [{ id:transfer.id,masterId:transfer.masterId,targetId:transfer.targetId,message:String(reason) }]; }
  });
}

/** Resolve live relationships for rendering and printing. */
export function resolvedStitchGroups(doc: Doc): StitchGroup[] {
  const groups = (doc.stitchGroups ?? []).map(g => {
    const source = doc.shapes.find(s => s.id === g.shapeId);
    if (!source || !g.continuation) return g;
    try { return resolveStitchRun(source,g,doc.stitchGroups ?? []); } catch { return g; }
  });
  for (const transfer of doc.stitchTransfers ?? []) {
    if (!transfer.visible) continue;
    try { const result = receivingStitches(doc,transfer); if (result.included) groups.push(result.group); } catch { /* The toolbox reports retained invalid registrations. */ }
  }
  return groups;
}

/** Copying a receiving piece alone creates independent editable stitching paths. */
export function copyStitchData(doc: Doc, shapeIds: Set<string>, preserveExternal=false) {
  const ids=new Set([...shapeIds,...doc.shapes.filter(s=>s.stitchParentId && shapeIds.has(s.stitchParentId)).map(s=>s.id)]);
  const groups = (doc.stitchGroups ?? []).filter(g => ids.has(g.shapeId));
  const groupIds = new Set(groups.map(g => g.id));
  const independent = groups.map(g => g.continuation && !groupIds.has(g.continuation.previousId)
    ? resolveStitchRun(doc.shapes.find(s => s.id === g.shapeId)!,g,doc.stitchGroups ?? []) : g);
  const transfers: StitchTransfer[] = [];
  const shapes:Shape[]=[];
  for (const t of doc.stitchTransfers ?? []) {
    if (!shapeIds.has(t.targetId)) continue;
    if (groupIds.has(t.masterId) || preserveExternal) transfers.push(t);
    else {
      try {if(!receivingStitches(doc,t).included)continue;const data=detachTransfer(doc,t);shapes.push(...data.shapes);independent.push(...data.groups);}catch{/* A receiver-only copy preserves visible geometry, not broken source dependencies. */}
    }
  }
  return { groups:independent, transfers, shapes };
}

/** Detach retains native guide geometry and exactly the visible contiguous runs. */
export function detachTransfer(doc: Doc,transfer: StitchTransfer) {
  const result=receivingStitches(doc,transfer);
  if (!result.included) throw Error("This transfer has no included holes to detach.");
  const {master,source,target,a,b,rotation}=transferMapping(doc,transfer);
  const original=doc.shapes.find(s=>s.id===master.shapeId)!;
  const guide: Shape={...original,id:crypto.randomUUID(),name:`${target.name} stitching`,stitchOnly:true,stitchParentId:target.id,hidden:false,locked:false,rotation:0,transform:multiply(mappingMatrix(a[0],b[0],rotation),shapeMatrix(original))};
  const ranges: number[][]=[];
  for (const index of result.keptIndices) {
    const last=ranges.at(-1);
    if (last && index===last.at(-1)!+1) last.push(index); else ranges.push([index]);
  }
  const groups: StitchGroup[]=ranges.map(indices=>{
    const holeOverrides: NonNullable<StitchGroup["holeOverrides"]>={};
    indices.forEach((index,i)=>{const appearance=master.holeOverrides?.[String(index+1)];if(appearance)holeOverrides[String(i+1)]={...appearance};});
    return {...master,id:crypto.randomUUID(),shapeId:guide.id,closed:false,continuation:undefined,holes:undefined,holeOverrides,settings:{...master.settings,holeCount:indices.length,alignment:"start",startClearance:result.geometry.distances[indices[0]],endClearance:0}};
  });
  if (master.holes) {
    const points=result.group.holes!.map(h=>({point:applyMatrix(shapeMatrix(target),{x:h.point.x+localCenter(target).x,y:h.point.y+localCenter(target).y}),angle:h.angle+Math.atan2(shapeMatrix(target).b,shapeMatrix(target).a)}));
    const inv=inverse(shapeMatrix(guide)),center=localCenter(guide);
    const group=groups[0]; group.holes=points.map(h=>{const p=applyMatrix(inv,h.point);return {point:{x:p.x-center.x,y:p.y-center.y},angle:h.angle-Math.atan2(shapeMatrix(guide).b,shapeMatrix(guide).a)};});
    group.settings={...group.settings,holeCount:undefined};
    return {shapes:[guide],groups:[group]};
  }
  return {shapes:[guide],groups};
}

/** Promote old fixed-hole records to editable native paths without changing their initial placement. */
export function migrateDetachedGuides(shapes: Shape[],groups: StitchGroup[]) {
  const added: Shape[]=[];
  for (const group of groups) {
    const parent=shapes.find(s=>s.id===group.shapeId)!;
    if (!group.holes || parent.stitchParentId) continue;
    const geometry=stitchGeometry(parent,group),points=geometry.holes.map(h=>h.point);
    const spacing=group.settings.spacing;
    const guidePoints=points.length>1 ? points : [
      {x:points[0].x-Math.cos(geometry.holes[0].angle)*spacing/2,y:points[0].y-Math.sin(geometry.holes[0].angle)*spacing/2},
      {x:points[0].x+Math.cos(geometry.holes[0].angle)*spacing/2,y:points[0].y+Math.sin(geometry.holes[0].angle)*spacing/2}];
    const guide: Shape={id:crypto.randomUUID(),name:`${parent.name} stitching`,kind:"polyline",points:guidePoints,radius:0,rotation:0,stitchOnly:true,stitchParentId:parent.id};
    const center=localCenter(guide);
    group.shapeId=guide.id;group.edges=stitchEdges(guide).map(e=>e.key);group.closed=false;group.continuation=undefined;
    group.settings={...group.settings,holeCount:undefined,inset:0,startClearance:0,endClearance:0,alignment:"start"};
    group.holes=geometry.holes.map(h=>({point:{x:h.point.x-center.x,y:h.point.y-center.y},angle:h.angle}));
    added.push(guide);
  }
  shapes.push(...added);
  return added;
}

/** Flatten guide-backed stitching for a receiving piece's print instances. */
export function stitchingOnPiece(doc: Doc,sourceId: string) {
  return resolvedStitchGroups(doc).flatMap(group=>{
    const guide=doc.shapes.find(s=>s.id===group.shapeId)!;
    if (group.shapeId===sourceId) return [group];
    if (guide?.stitchParentId!==sourceId) return [];
    const target=doc.shapes.find(s=>s.id===sourceId)!,matrix=shapeMatrix(target),inv=inverse(matrix),center=localCenter(target);
    const holes=stitchGeometry(guide,group,doc.stitchGroups).holes.map(h=>{
      const p=applyMatrix(inv,h.point),q=applyMatrix(inv,{x:h.point.x+Math.cos(h.angle),y:h.point.y+Math.sin(h.angle)});
      return {point:{x:p.x-center.x,y:p.y-center.y},angle:Math.atan2(q.y-p.y,q.x-p.x)};
    });
    return [{...group,shapeId:sourceId,edges:[],holes,continuation:undefined}];
  });
}


export function stitchMaterial(doc:Doc,shape:Shape) {
 const material=shape.stitchParentId ? doc.shapes.find(s=>s.id===shape.stitchParentId) : shape;
 return material && !material.stitchOnly && stitchClosed(material) ? material : undefined;
}
const edgeContactCache=new WeakMap<Doc,WeakMap<StitchGroup,Set<number>>>();
export function stitchEdgeContacts(doc:Doc,shape:Shape,group:StitchGroup) {
 let cache=edgeContactCache.get(doc);if(!cache){cache=new WeakMap();edgeContactCache.set(doc,cache);}
 const saved=cache.get(group);if(saved)return saved;
 const hits=new Set<number>(),material=stitchMaterial(doc,shape);
 if(material)stitchGeometry(shape,group,doc.stitchGroups).holes.forEach((hole,index)=>{if(holeTouchesEdge(material,hole.point,hole.angle,holeAppearance(group,index),group.settings.reversed))hits.add(index);});
 cache.set(group,hits);return hits;
}


/** Preview documents append relationships without changing source geometry. */
export function shareReceivingGeometry(from:Doc,to:Doc,transfers:StitchTransfer[]) {
 if(from.shapes!==to.shapes || from.stitchGroups!==to.stitchGroups)return;
 const original=receivingCache.get(from);if(!original)return;
 const cache=new WeakMap<StitchTransfer,ReceivingGeometry|Error>();
 for(const transfer of transfers){const result=original.get(transfer);if(result)cache.set(transfer,result);}
 receivingCache.set(to,cache);
}


/** Number placements, retaining stored numbers when other placements are removed. */
export function numberStitchTransfers(transfers:StitchTransfer[]):StitchTransfer[] {
 const numbers=new Map<string,number>(),placements=new Map<number,string>();
 for(const t of transfers)if(t.number!=null){
  const key=t.placementId ?? t.id,n=t.number;
  if(!Number.isInteger(n)||n<1||n>4294967295||numbers.has(key)&&numbers.get(key)!==n||placements.has(n)&&placements.get(n)!==key)throw Error("Invalid transfer number");
  numbers.set(key,n);placements.set(n,key);
 }
 let next=Math.max(0,...placements.keys());
 return transfers.map(t=>{const key=t.placementId ?? t.id;if(!numbers.has(key))numbers.set(key,++next);return {...t,number:numbers.get(key)!};});
}
export function copyTransferPlacements(existing:StitchTransfer[],copies:StitchTransfer[]):StitchTransfer[] {
 const placements=new Map<string,{id:string;number:number}>();let next=Math.max(0,...existing.map(t=>t.number ?? 0));
 return copies.map(t=>{const key=t.placementId ?? t.id;let placement=placements.get(key);if(!placement){placement={id:crypto.randomUUID(),number:++next};placements.set(key,placement);}return {...t,placementId:placement.id,number:placement.number};});
}
