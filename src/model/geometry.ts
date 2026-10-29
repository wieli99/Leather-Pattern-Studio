import type {Point, Shape} from './project.ts';
export type Bounds={x:number;y:number;width:number;height:number};
export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export function center(s:Shape):Point {
 if(s.kind==='circle')return s.points[0];
 const xs=s.points.map(p=>p.x),ys=s.points.map(p=>p.y);
 return {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2};
}
export function rotatePoint(p:Point,c:Point,degrees:number):Point {
 const a=degrees*Math.PI/180,co=Math.cos(a),si=Math.sin(a);
 return {x:c.x+(p.x-c.x)*co-(p.y-c.y)*si,y:c.y+(p.x-c.x)*si+(p.y-c.y)*co};
}
export function worldPoints(s:Shape):Point[]{return s.points.map(p=>rotatePoint(p,center(s),s.rotation))}
export function bounds(shapes:Shape[]):Bounds {
 const points=shapes.flatMap(s=>{
  const a=s.points[0],b=s.points[s.points.length-1],c=center(s);
  if(s.kind==='circle'){const r=distance(a,b);return [{x:a.x-r,y:a.y-r},{x:a.x+r,y:a.y+r}]}
  if(s.kind==='ellipse'){const rx=Math.abs(b.x-a.x)/2,ry=Math.abs(b.y-a.y)/2,t=s.rotation*Math.PI/180,ex=Math.hypot(rx*Math.cos(t),ry*Math.sin(t)),ey=Math.hypot(rx*Math.sin(t),ry*Math.cos(t));return [{x:c.x-ex,y:c.y-ey},{x:c.x+ex,y:c.y+ey}]}
  if(s.kind==='rectangle')return [a,{x:a.x,y:b.y},b,{x:b.x,y:a.y}].map(p=>rotatePoint(p,c,s.rotation));
  return worldPoints(s);
 });
 if(!points.length)return {x:0,y:0,width:100,height:100};
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
 return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
}
export function distanceToSegment(p:Point,a:Point,b:Point):number {
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function hitTest(s:Shape,point:Point,tolerance:number):boolean {
 const p=rotatePoint(point,center(s),-s.rotation),a=s.points[0],b=s.points[s.points.length-1];
 if(s.kind==='circle')return Math.abs(distance(p,a)-distance(a,b))<=tolerance;
 if(s.kind==='ellipse'){
  const rx=Math.abs(b.x-a.x)/2,ry=Math.abs(b.y-a.y)/2,c=center(s);
  let best=Infinity;
  // Sample then refine the closest ellipse parameter; robust even for eccentric ellipses.
  let angle=0;for(let i=0;i<64;i++){const t=i*Math.PI/32,d=distance(p,{x:c.x+rx*Math.cos(t),y:c.y+ry*Math.sin(t)});if(d<best){best=d;angle=t}}
  let step=Math.PI/32;for(let i=0;i<18;i++){for(const t of [angle-step,angle+step]){const d=distance(p,{x:c.x+rx*Math.cos(t),y:c.y+ry*Math.sin(t)});if(d<best){best=d;angle=t}}step/=2}
  return best<=tolerance;
 }
 if(s.kind==='rectangle'){
  const c=center(s),r=s.radius,qx=Math.abs(p.x-c.x)-Math.abs(b.x-a.x)/2+r,qy=Math.abs(p.y-c.y)-Math.abs(b.y-a.y)/2+r;
  return Math.abs(Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r)<=tolerance;
 }
 return s.points.slice(1).some((b,i)=>distanceToSegment(p,s.points[i],b)<=tolerance);
}
export const moveShape=(s:Shape,dx:number,dy:number):Shape=>({...s,points:s.points.map(p=>({x:p.x+dx,y:p.y+dy}))});
export function rotateShape(s:Shape,degrees:number,pivot=center(s)):Shape {
 const next=rotatePoint(center(s),pivot,degrees),old=center(s);
 return {...moveShape(s,next.x-old.x,next.y-old.y),rotation:s.rotation+degrees};
}
export function scaleShape(s:Shape,factor:number,pivot:Point):Shape {
 return {...s,points:s.points.map(p=>({x:pivot.x+(p.x-pivot.x)*factor,y:pivot.y+(p.y-pivot.y)*factor})),radius:s.radius*factor};
}
export function anchors(s:Shape):Point[]{
 const pts=worldPoints(s),a=s.points[0],b=s.points[s.points.length-1],c=center(s);
 if(s.kind==='circle'){const r=distance(a,b);return [c,{x:c.x+r,y:c.y},{x:c.x-r,y:c.y},{x:c.x,y:c.y+r},{x:c.x,y:c.y-r}]}
 if(s.kind==='rectangle'||s.kind==='ellipse')return [c,...[a,b,{x:a.x,y:b.y},{x:b.x,y:a.y},{x:c.x,y:a.y},{x:c.x,y:b.y},{x:a.x,y:c.y},{x:b.x,y:c.y}].map(p=>rotatePoint(p,c,s.rotation))];
 return [...pts,c,...pts.slice(1).map((p,i)=>({x:(p.x+pts[i].x)/2,y:(p.y+pts[i].y)/2}))];
}
