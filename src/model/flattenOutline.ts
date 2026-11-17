import { contourShape } from "./compound";
import { shapePath } from "../editor/renderer";
import { applyMatrix, shapeMatrix } from "./geometry";
import { isClosedShape } from "./closedShape";
import type { Point, Shape } from "./project";

/** Physical-coordinate path recorder with bounded subdivision and 0-width edges. */
export function flattenOutline(shape: Shape, tolerance = 0.01) {
  const matrix = shapeMatrix(shape);
  const points: Point[] = [];
  const limit = 100000;
  let visits = 0;
  const fail = () => { throw Error("Outline is too complex for DXF export"); };
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) fail();
  const world = (x: number, y: number) => applyMatrix(matrix, { x, y });
  const add = (p: Point) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) fail();
    const last = points.at(-1);
    if (last && Math.hypot(last.x-p.x, last.y-p.y) < 1e-10) return;
    if (points.length >= limit) fail();
    points.push(p);
  };
  const middle = (a: Point, b: Point): Point => ({ x: (a.x+b.x)/2, y: (a.y+b.y)/2 });
  function cubic(a: Point, b: Point, c: Point, d: Point, depth = 0) {
    if (++visits > limit * 2) fail();
    const distance = (p: Point) => {
      const dx = d.x-a.x, dy = d.y-a.y;
      const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
      return Math.hypot(p.x-a.x-t*dx, p.y-a.y-t*dy);
    };
    if (Math.max(distance(b), distance(c)) <= tolerance) { add(d); return; }
    if (depth >= 24) fail();
    const ab = middle(a,b), bc = middle(b,c), cd = middle(c,d);
    const abc = middle(ab,bc), bcd = middle(bc,cd), center = middle(abc,bcd);
    cubic(a,ab,abc,center,depth+1);
    cubic(center,bcd,cd,d,depth+1);
  }
  const sink = {
    moveTo(x: number, y: number) { add(world(x,y)); },
    lineTo(x: number, y: number) { add(world(x,y)); },
    closePath() {},
    bezierCurveTo(a: number,b: number,c: number,d: number,x: number,y: number) {
      cubic(points.at(-1)!, world(a,b), world(c,d), world(x,y));
    },
    ellipse(cx: number,cy: number,rx: number,ry: number,rotation: number,start: number,end: number,anticlockwise = false) {
      let span = end-start;
      if (Math.abs(span) >= 2*Math.PI) span = (anticlockwise ? -1 : 1)*2*Math.PI;
      else if (anticlockwise && span > 0) span -= 2*Math.PI;
      else if (!anticlockwise && span < 0) span += 2*Math.PI;
      // Frobenius norm bounds transform stretch; sagitta bounds the local ellipse error.
      const radius = Math.max(rx,ry)*Math.hypot(matrix.a,matrix.b,matrix.c,matrix.d);
      const step = radius > tolerance ? Math.min(Math.PI/2, 2*Math.acos(1-tolerance/radius)) : Math.PI/2;
      const count = Math.max(1, Math.ceil(Math.abs(span)/step));
      if (!Number.isFinite(count) || count+points.length > limit) fail();
      for (let i=0; i<=count; i++) {
        const t = start+span*i/count;
        add(world(cx+rx*Math.cos(t)*Math.cos(rotation)-ry*Math.sin(t)*Math.sin(rotation),
          cy+rx*Math.cos(t)*Math.sin(rotation)+ry*Math.sin(t)*Math.cos(rotation)));
      }
    },
    arc(x: number,y: number,r: number,start: number,end: number,anticlockwise = false) {
      this.ellipse(x,y,r,r,0,start,end,anticlockwise);
    },
    roundRect(x: number,y: number,w: number,h: number,r: number) {
      this.moveTo(x+r,y); this.lineTo(x+w-r,y);
      if (r) this.arc(x+w-r,y+r,r,-Math.PI/2,0);
      this.lineTo(x+w,y+h-r);
      if (r) this.arc(x+w-r,y+h-r,r,0,Math.PI/2);
      this.lineTo(x+r,y+h);
      if (r) this.arc(x+r,y+h-r,r,Math.PI/2,Math.PI);
      this.lineTo(x,y+r);
      if (r) this.arc(x+r,y+r,r,Math.PI,Math.PI*1.5);
    },
  };
  shapePath(sink as unknown as Path2D, shape);
  const closed = isClosedShape(shape);
  const first = points[0], last = points.at(-1);
  if (closed && points.length > 1 && Math.hypot(first.x-last!.x,first.y-last!.y) < 1e-9) points.pop();
  return { points, closed };
}

/** Separate contours must never acquire connecting export edges. */
export function flattenContours(shape: Shape, tolerance = 0.01) {
  if (shape.kind !== "compound") return [flattenOutline(shape, tolerance)];
  const matrix = shapeMatrix(shape);
  return shape.contours!.map(contour => flattenOutline({
    ...contourShape(shape, contour), rotation: 0, transform: matrix,
  }, tolerance));
}
