import type { Point, Shape } from "../model/project";
import { anchors, bounds, distance, nearestOutline } from "../model/geometry";
import { snapCandidates, smartSnap, type SmartGuide } from "./snapping";
/** Shared modifier policy for Model and print rotation gestures. */
export function snapRotation(
  angle: number,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean },
) {
  const step = modifiers.ctrlKey ? 10 : modifiers.shiftKey ? 5 : 1;
  return modifiers.altKey ? angle : Math.round(angle / step) * step;
}
export function unwrapRotation(previous: number, current: number) {
  let delta = current - previous;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return (delta * 180) / Math.PI;
}

export function snapRigidMove(
  shapes: Shape[],
  selectedIds: string[],
  delta: Point,
  options: {
    grid: boolean;
    objects: boolean;
    gridSize: number;
    tolerance: number;
    anchor?: Point;
    guides?: {id:string;axis:"x"|"y";coordinate:number}[];
  },
) {
  const selected=new Set(selectedIds),others=shapes.filter(s=>!selected.has(s.id));
  const moving=shapes.filter(s=>selected.has(s.id)).flatMap(anchors);
  const candidates=options.anchor ? [options.anchor,...moving] : moving;
  const stationary=others.map(shape=>({shape,box:cachedBounds(shape),points:cachedCandidates(shape)}));
  let pointSnap:{anchor:Point;point:Point;distance:number;priority:number}|undefined;
  const axes:Partial<Record<"x"|"y",{adjust:number;priority:number;guide?:SmartGuide;anchor:Point}>>={};
  let outline:{anchor:Point;point:Point;distance:number}|undefined;
  const offer=(axis:"x"|"y",adjust:number,priority:number,anchor:Point,guide?:SmartGuide)=>{
    const old=axes[axis];
    if(Math.abs(adjust)<=options.tolerance && (!old || priority<old.priority || priority===old.priority && Math.abs(adjust)<Math.abs(old.adjust)))axes[axis]={adjust,priority,anchor,guide};
  };
  for(const anchor of candidates) {
    const point={x:anchor.x+delta.x,y:anchor.y+delta.y};
    if(options.objects)for(const target of stationary) {
      for(const candidate of target.points) {
        const d=distance(point,candidate.point);
        const priority=candidate.kind==="vertex" || candidate.kind==="quadrant" ? 0 : candidate.kind==="midpoint" ? 1 : 2;
        if(d<=options.tolerance && (!pointSnap || priority<pointSnap.priority || priority===pointSnap.priority && d<pointSnap.distance))pointSnap={anchor,point:candidate.point,distance:d,priority};
      }
      const box=target.box;
      for(const axis of ["x","y"] as const) {
        const start=axis==="x" ? box.x : box.y,size=axis==="x" ? box.width : box.height;
        for(const coordinate of [start,start+size/2,start+size])offer(axis,coordinate-point[axis],1,anchor,{axis,coordinate,objectId:target.shape.id,bounds:box,alignment:coordinate===start+size/2 ? "Center" : "Edge"});
      }
      if(point.x<box.x-options.tolerance || point.x>box.x+box.width+options.tolerance || point.y<box.y-options.tolerance || point.y>box.y+box.height+options.tolerance)continue;
      const q=nearestOutline(target.shape,point,options.tolerance/32),d=distance(point,q);
      const horizontal=Math.abs(q.y-box.y)<1e-8 || Math.abs(q.y-box.y-box.height)<1e-8;
      const vertical=Math.abs(q.x-box.x)<1e-8 || Math.abs(q.x-box.x-box.width)<1e-8;
      if(horizontal && Math.abs(q.x-point.x)<1e-8)offer("y",q.y-point.y,0,anchor,{axis:"y",coordinate:q.y,objectId:target.shape.id,bounds:box,alignment:"Edge"});
      else if(vertical && Math.abs(q.y-point.y)<1e-8)offer("x",q.x-point.x,0,anchor,{axis:"x",coordinate:q.x,objectId:target.shape.id,bounds:box,alignment:"Edge"});
      else if(d<=options.tolerance && (!outline || d<outline.distance))outline={anchor,point:q,distance:d};
    }
    if(options.objects)for(const guide of options.guides ?? [])offer(guide.axis,guide.coordinate-point[guide.axis],0,anchor,{axis:guide.axis,coordinate:guide.coordinate,objectId:guide.id,bounds:{x:point.x,y:point.y,width:0,height:0},alignment:"Guideline"});
    if(options.grid)for(const axis of ["x","y"] as const)offer(axis,Math.round(point[axis]/options.gridSize)*options.gridSize-point[axis],2,anchor);
  }
  if(pointSnap)return {delta:{x:pointSnap.point.x-pointSnap.anchor.x,y:pointSnap.point.y-pointSnap.anchor.y},anchor:pointSnap.anchor,objectSnapped:true,target:pointSnap.point,guides:[] as SmartGuide[]};
  if(outline && !Object.values(axes).some(a=>a?.priority===0))return {delta:{x:outline.point.x-outline.anchor.x,y:outline.point.y-outline.anchor.y},anchor:outline.anchor,objectSnapped:true,target:outline.point,guides:[] as SmartGuide[]};
  const source=axes.x?.anchor ?? axes.y?.anchor;
  const result={x:delta.x+(axes.x?.adjust ?? 0),y:delta.y+(axes.y?.adjust ?? 0)};
  return {delta:result,objectSnapped:Object.values(axes).some(a=>a && a.priority<2),anchor:source,target:source ? {x:source.x+result.x,y:source.y+result.y} : undefined,guides:Object.values(axes).flatMap(a=>a?.guide ? [a.guide] : [])};
}
const boundsCache=new WeakMap<Shape,ReturnType<typeof bounds>>();
const candidateCache=new WeakMap<Shape,ReturnType<typeof snapCandidates>>();
function cachedBounds(shape:Shape){let result=boundsCache.get(shape);if(!result){result=bounds([shape]);boundsCache.set(shape,result);}return result;}
function cachedCandidates(shape:Shape){let result=candidateCache.get(shape);if(!result){result=snapCandidates(shape);candidateCache.set(shape,result);}return result;}
