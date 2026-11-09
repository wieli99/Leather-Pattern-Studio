import { expect, it } from "vitest";
import { flattenOutline } from "./flattenOutline";
import { cubicAt, cubicSegments } from "./curves";
import { applyMatrix, shapeMatrix } from "./geometry";
import type { Shape, Point } from "./project";
const base: Shape = { id: "a", name: "Piece", kind: "rectangle", points: [{x:0,y:0},{x:80,y:40}], radius:0, rotation:0 };
const loop = [{x:0,y:0},{x:100,y:50},{x:200,y:0},{x:0,y:0}];
function distance(p: Point, points: Point[]) {
  return Math.min(...points.slice(1).map((b,i) => {
    const a=points[i], dx=b.x-a.x, dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  }));
}
it("keeps closure and distinct vertices for supported loops", () => {
  const shapes: Shape[] = [base, {...base,kind:"circle"}, {...base,kind:"ellipse"},
    ...[360,-360].map(sweep => ({...base,kind:"arc" as const,sweep})),
    {...base,kind:"polyline",points:loop}, {...base,kind:"curve",points:loop},
    {...base,kind:"control-curve",points:loop,handles:loop.map(() => ({incoming:{x:-5,y:0},outgoing:{x:5,y:0}}))}];
  for (const shape of shapes) {
    const result=flattenOutline(shape);
    expect(result.closed).toBe(true);
    expect(result.points[0]).not.toEqual(result.points.at(-1));
  }
  expect(flattenOutline(base).points).toHaveLength(4);
  for (const kind of ["polyline","curve","control-curve","arc"] as const) {
    const points=loop.slice(0,3);
    expect(flattenOutline({...base,kind,points,sweep:180,handles:points.map(() => ({incoming:{x:0,y:0},outgoing:{x:0,y:0}}))}).closed).toBe(false);
  }
});
it("bounds size and approximation error in transformed coordinates", () => {
  const transform={a:-2,b:0.5,c:0.3,d:3,e:20,f:30};
  const circle: Shape={...base,kind:"circle",points:[{x:0,y:0},{x:40,y:0}],transform};
  const outline=flattenOutline(circle);
  expect(outline.points.length).toBeLessThan(1000);
  const closed=[...outline.points,outline.points[0]];
  for(let i=0;i<1000;i++) {
    const t=i*Math.PI*2/1000;
    expect(distance(applyMatrix(shapeMatrix(circle),{x:40*Math.cos(t),y:40*Math.sin(t)}),closed)).toBeLessThanOrEqual(0.010001);
  }
  const curve: Shape={...base,kind:"curve",points:loop.slice(0,3),transform};
  const flattened=flattenOutline(curve).points;
  expect(flattened.length).toBeLessThan(1000);
  for(const c of cubicSegments(curve)) for(let i=0;i<=100;i++) {
    expect(distance(applyMatrix(shapeMatrix(curve),cubicAt(c,i/100)),flattened)).toBeLessThanOrEqual(0.010001);
  }
});
it("rejects excess subdivision rather than relaxing accuracy", () => {
  expect(() => flattenOutline({...base,kind:"circle",points:[{x:0,y:0},{x:1e12,y:0}]})).toThrow("too complex");
});
