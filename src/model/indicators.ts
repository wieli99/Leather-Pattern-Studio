import { formatLength, unitSymbol, type UnitMode } from "./units";
import type { Point, Shape } from "./project";
import { applyMatrix, shapeMatrix, distance } from "./geometry";

export const indicatorKinds = ["arrow", "arrow-head", "crosshair", "size-square", "size-ruler"] as const;
export function isIndicator(kind: string): kind is (typeof indicatorKinds)[number] {
  return (indicatorKinds as readonly string[]).includes(kind);
}
export function dimension(value: number): string {
  const rounded = +value.toFixed(2);
  return `${Math.abs(rounded-value) > 1e-10 ? "≈" : ""}${rounded}`;
}
type Label = { text: string; point: Point; angle: number; fontSize: number; bounds: Point[] };
/** All geometry is in world millimetres; ticks and lettering retain physical size. */
export function indicatorGeometry(s: Shape, units: UnitMode = "mm") {
  const m = shapeMatrix(s), world = (p: Point) => applyMatrix(m,p);
  const [a,b] = s.points, start = world(a), end = world(b);
  const length = distance(start,end);
  const ux = (end.x-start.x)/(length || 1), uy = (end.y-start.y)/(length || 1);
  const lines: [Point,Point][] = [], labels: Label[] = [];
  const at = (p: Point, along: number, normal = 0): Point => ({x:p.x+ux*along-uy*normal,y:p.y+uy*along+ux*normal});
  const label = (text: string, point: Point, angle: number, fontSize = 3) => {
    if (angle > Math.PI/2 || angle < -Math.PI/2) angle += Math.PI;
    const half = text.length*fontSize*0.62/2;
    const bounds = [-1,1].flatMap(x=>[-1,1].map(y=>({
      x:point.x+x*half*Math.cos(angle)-y*fontSize/2*Math.sin(angle),
      y:point.y+x*half*Math.sin(angle)+y*fontSize/2*Math.cos(angle),
    })));
    labels.push({text,point,angle,fontSize,bounds});
  };
  let size = length;
  if (s.kind === "arrow-head") size = (s.headSize ?? 3) * length/(distance(a,b) || 1);
  if (s.kind === "arrow" || s.kind === "arrow-head") {
    const localLength = distance(a,b);
    const h = (s.headSize ?? 3) * length/(localLength || 1);
    const tip = start;
    if (s.kind === "arrow") lines.push([start,end]);
    const sign = s.kind === "arrow" ? 1 : -1;
    lines.push([at(tip,sign*h,h),tip],[tip,at(tip,sign*h,-h)]);
  } else if (s.kind === "crosshair") {
    const r = distance(a,b);
    lines.push([world({x:a.x-r,y:a.y}),world({x:a.x+r,y:a.y})],
      [world({x:a.x,y:a.y-r}),world({x:a.x,y:a.y+r})]);
    size = distance(...lines[0]);
  } else if (s.kind === "size-square") {
    const corners = [a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}].map(world);
    corners.forEach((p,i)=>lines.push([p,corners[(i+1)%4]]));
    size = distance(corners[0],corners[1]);
    const center = {x:(start.x+end.x)/2,y:(start.y+end.y)/2};
    for (const [i,j] of [[0,1],[3,0]]) {
      const p=corners[i],q=corners[j], mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2};
      const d=distance(mid,center)||1;
      label(`${units === "mm" ? dimension(distance(p,q)) : formatLength(distance(p,q), units)} ${unitSymbol(units)}`,{x:mid.x+(mid.x-center.x)*4/d,y:mid.y+(mid.y-center.y)*4/d},Math.atan2(q.y-p.y,q.x-p.x));
    }
  } else if (s.kind === "size-ruler") {
    lines.push([start,end]);
    // Bound work for extreme imported documents; ordinary guides show every mm.
    const base = units === "mm" ? 1 : 25.4/16;
    const step = length <= 10000 ? base : Math.ceil(length/100000)*10*base;
    for (let i=0;i<=length+1e-9;i+=step) {
      const index = Math.round(i/base);
      const major = units === "mm" ? index%10===0 : index%16===0;
      const p = at(start,i), tick = major ? 4 : index%(units === "mm" ? 5 : 8)===0 ? 3 : 2;
      lines.push([p,at(p,0,tick)]);
      if (major) label(units === "mm" ? String(i) : formatLength(i, units),at(p,0,6),Math.atan2(uy,ux),2);
    }
    if (Math.abs(length/step-Math.round(length/step)) > 1e-9) lines.push([end,at(end,0,4)]);
    label(`${units === "mm" ? dimension(length) : formatLength(length, units)} ${unitSymbol(units)}`,at(start,length/2,-4),Math.atan2(uy,ux));
  }
  return {lines,labels,size,length,anchors: s.kind === "crosshair" ? [start,...lines.flat()] : s.kind === "size-square" ? lines.map(l=>l[0]) : [start,end]};
}
