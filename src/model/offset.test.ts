import { expect, test } from "vitest";
import { offsetShape } from "./offset";
import { parseProject, DOCUMENT_VERSION, type Shape } from "./project";
import { cubicAt, cubicSegments } from "./curves";
import { nearestOutline } from "./geometry";

const rectangle: Shape = { id: "piece", name: "Piece", kind: "rectangle", points: [{ x: 0, y: 0 }, { x: 80, y: 40 }], radius: 0, rotation: 0 };
const extent = (shape: Shape) => ({
  minX: Math.min(...shape.points.map(p => p.x)), maxX: Math.max(...shape.points.map(p => p.x)),
  minY: Math.min(...shape.points.map(p => p.y)), maxY: Math.max(...shape.points.map(p => p.y)),
});

test("signed closed offsets expand and inset independently of winding", () => {
  const outside = offsetShape(rectangle, 3, "sharp");
  const inside = offsetShape(rectangle, -3, "sharp");
  expect(extent(outside)).toEqual({ minX: -3, maxX: 83, minY: -3, maxY: 43 });
  expect(extent(inside)).toEqual({ minX: 3, maxX: 77, minY: 3, maxY: 37 });
  const reverse = { ...rectangle, kind: "polyline" as const, points: [{x:0,y:0},{x:0,y:40},{x:80,y:40},{x:80,y:0},{x:0,y:0}] };
  expect(extent(offsetShape(reverse, -3, "sharp"))).toEqual(extent(inside));
  expect(outside.id).not.toBe(rectangle.id);
  parseProject(JSON.stringify({ version: DOCUMENT_VERSION, shapes: [rectangle, outside, inside] }));
});

test("open path signs choose visual left and right", () => {
  const line: Shape = { ...rectangle, kind: "line", points: [{x:0,y:0},{x:20,y:0}] };
  expect(offsetShape(line, 2, "sharp").points).toEqual([{x:0,y:-2},{x:20,y:-2}]);
  expect(offsetShape(line, -2, "sharp").points).toEqual([{x:0,y:2},{x:20,y:2}]);
});

test("rounded joins follow the offset radius and invalid insets fail", () => {
  const rounded = offsetShape(rectangle, 4, "rounded");
  expect(rounded.kind).toBe("rectangle");
  expect(rounded.radius).toBe(4);
  expect(extent(rounded)).toEqual({ minX: -4, maxX: 84, minY: -4, maxY: 44 });
  expect(() => offsetShape(rectangle, -25, "sharp")).toThrow(/collapses|reverses/);
  expect(() => offsetShape(rectangle, 0, "sharp")).toThrow(/non-zero/);
});

test("circle and simple rectangle offsets retain exact primitives", () => {
  const circle: Shape = { ...rectangle, kind:"circle", points:[{x:10,y:10},{x:30,y:10}] };
  const outer = offsetShape(circle, 3, "sharp"), inner = offsetShape(circle, -3, "rounded");
  expect(outer.kind).toBe("circle");
  expect(inner.kind).toBe("circle");
  expect(outer.points[1].x-outer.points[0].x).toBeCloseTo(23);
  expect(inner.points[1].x-inner.points[0].x).toBeCloseTo(17);
  expect(offsetShape(rectangle, 3, "sharp").radius).toBe(0);
  const stretched = { ...circle, transform:{a:2,b:0,c:0,d:1,e:0,f:0} };
  expect(offsetShape(stretched, 3, "sharp").kind).toBe("control-curve");
});

test("curves and ellipses produce valid editable outlines", () => {
  const ellipse: Shape = { ...rectangle, kind: "ellipse" };
  const curve: Shape = { ...rectangle, kind: "curve", points: [{x:0,y:0},{x:20,y:10},{x:40,y:0}] };
  for (const shape of [ellipse, curve]) {
    const copy = offsetShape(shape, 2, "rounded");
    expect(copy.kind).toBe("control-curve");
    expect(copy.points.length).toBeGreaterThan(3);
    expect(copy.points.length).toBeLessThanOrEqual(129);
    parseProject(JSON.stringify({ version: DOCUMENT_VERSION, shapes: [shape, copy] }));
  }
});

test("ellipse offsets stay compact and close to the requested distance", () => {
  const ellipse: Shape = { ...rectangle, kind:"ellipse", rotation:25,
    transform:{a:1.5,b:0.2,c:0.1,d:0.8,e:30,f:-10} };
  for (const distance of [3,-3]) {
    const copy=offsetShape(ellipse,distance,"sharp");
    expect(copy.kind).toBe("control-curve");
    expect(copy.points.length).toBeLessThan(30);
    expect(copy.points.at(-1)).toEqual(copy.points[0]);
    for (const segment of cubicSegments(copy)) for (let i=0; i<=8; i++) {
      const point=cubicAt(segment,i/8), closest=nearestOutline(ellipse,point);
      expect(Math.abs(Math.hypot(point.x-closest.x,point.y-closest.y)-Math.abs(distance))).toBeLessThan(0.02);
    }
    parseProject(JSON.stringify({version:DOCUMENT_VERSION,shapes:[ellipse,copy]}));
  }
});

test("ellipse insets reject a curvature cusp", () => {
  const ellipse: Shape={...rectangle,kind:"ellipse"};
  expect(() => offsetShape(ellipse,-11,"sharp")).toThrow(/cusp|collapses/);
  expect(offsetShape(ellipse,-8,"sharp").kind).toBe("control-curve");
  const stretched={...ellipse,transform:{a:2,b:0,c:0,d:1,e:0,f:0}};
  expect(() => offsetShape(stretched,-6,"sharp")).toThrow(/cusp|collapses/);
});

test("open curves keep endpoints and use few editable cubic segments", () => {
  const curve: Shape={...rectangle,kind:"control-curve",points:[{x:0,y:0},{x:80,y:0}],
    handles:[{incoming:{x:0,y:0},outgoing:{x:20,y:30}},
      {incoming:{x:-20,y:30},outgoing:{x:0,y:0}}]};
  for (const distance of [2,-2]) {
    const copy=offsetShape(curve,distance,"sharp");
    expect(copy.kind).toBe("control-curve");
    expect(copy.points.length).toBeLessThan(30);
    for (const segment of cubicSegments(copy)) for (let i=0; i<=8; i++) {
      const point=cubicAt(segment,i/8), closest=nearestOutline(curve,point);
      expect(Math.abs(Math.hypot(point.x-closest.x,point.y-closest.y)-Math.abs(distance))).toBeLessThan(0.02);
    }
  }
});

test("closed control curves and reflected ellipses remain closed", () => {
  const loop: Shape={...rectangle,kind:"control-curve",
    points:[{x:0,y:0},{x:30,y:0},{x:30,y:30},{x:0,y:30},{x:0,y:0}],
    handles:[
      {incoming:{x:0,y:5},outgoing:{x:5,y:0}},
      {incoming:{x:-5,y:0},outgoing:{x:0,y:5}},
      {incoming:{x:0,y:-5},outgoing:{x:-5,y:0}},
      {incoming:{x:5,y:0},outgoing:{x:0,y:-5}},
      {incoming:{x:0,y:5},outgoing:{x:5,y:0}},
    ]};
  const reflected: Shape={...rectangle,kind:"ellipse",transform:{a:-1,b:0,c:0,d:1,e:100,f:0}};
  for (const source of [loop,reflected]) for (const distance of [2,-2]) {
    let copy: Shape;
    try { copy=offsetShape(source,distance,"rounded"); }
    catch (error) { throw Error(`${source.kind} at ${distance}: ${error}`); }
    expect(copy.kind).toBe("control-curve");
    expect(copy.points.at(-1)).toEqual(copy.points[0]);
    expect(copy.points.length).toBeLessThanOrEqual(129);
    parseProject(JSON.stringify({version:DOCUMENT_VERSION,shapes:[source,copy]}));
  }
});

test("circular arcs keep exact arc geometry and respect travel direction", () => {
  const arc: Shape={...rectangle,kind:"arc",points:[{x:0,y:0},{x:20,y:0}],sweep:90};
  const outward=offsetShape(arc,3,"sharp");
  expect(outward.kind).toBe("arc");
  expect(outward.points[1].x).toBeCloseTo(23);
  expect(outward.sweep).toBe(90);
  expect(offsetShape({...arc,sweep:-90},3,"sharp").points[1].x).toBeCloseTo(17);
  expect(offsetShape({...arc,sweep:360},3,"sharp").points[1].x).toBeCloseTo(23);
  const reflected={...arc,transform:{a:-1,b:0,c:0,d:1,e:0,f:0}};
  expect(offsetShape(reflected,3,"sharp").points[1].x).toBeCloseTo(17);
});

test("stretched arcs use a compact open control curve", () => {
  const arc: Shape={...rectangle,kind:"arc",points:[{x:0,y:0},{x:20,y:0}],sweep:-180,
    transform:{a:1.5,b:0,c:0,d:0.75,e:0,f:0}};
  const copy=offsetShape(arc,2,"rounded");
  expect(copy.kind).toBe("control-curve");
  expect(copy.points.length).toBeLessThan(30);
  expect(copy.points.at(-1)).not.toEqual(copy.points[0]);
  for (const segment of cubicSegments(copy)) for (let i=0; i<=8; i++) {
    const point=cubicAt(segment,i/8), closest=nearestOutline(arc,point);
    expect(Math.abs(Math.hypot(point.x-closest.x,point.y-closest.y)-2)).toBeLessThan(0.02);
  }
  parseProject(JSON.stringify({version:DOCUMENT_VERSION,shapes:[arc,copy]}));
});

test("sharp and rounded curve anchors create different compact joins", () => {
  const curve: Shape={...rectangle,kind:"control-curve",
    points:[{x:0,y:0},{x:40,y:0},{x:40,y:40}],
    handles:[
      {incoming:{x:0,y:0},outgoing:{x:40/3,y:0}},
      {incoming:{x:-40/3,y:0},outgoing:{x:0,y:40/3}},
      {incoming:{x:0,y:-40/3},outgoing:{x:0,y:0}},
    ]};
  const sharp=offsetShape(curve,3,"sharp"), rounded=offsetShape(curve,3,"rounded");
  expect(sharp.kind).toBe("control-curve");
  expect(rounded.kind).toBe("control-curve");
  expect(sharp.points.some(p => Math.hypot(p.x-43,p.y+3)<1e-6)).toBe(true);
  expect(rounded.points.some(p => Math.hypot(p.x-43,p.y+3)<1e-6)).toBe(false);
  expect(offsetShape(curve,-3,"sharp").kind).toBe("control-curve");
  const curved={...curve,handles:curve.handles!.map((h,i) => i===0 ? {...h,outgoing:{x:10,y:-5}} : h)};
  expect(() => offsetShape(curved,-3,"sharp")).toThrow(/accuracy|cusp|collapses/);
  const wide=offsetShape(curve,200,"rounded");
  expect(wide.points.length).toBeGreaterThan(4);
  for (const segment of cubicSegments(wide).slice(1,-1)) for (let i=0; i<=8; i++) {
    const point=cubicAt(segment,i/8);
    expect(Math.abs(Math.hypot(point.x-40,point.y)-200)).toBeLessThan(0.01);
  }
});

test("offset names remain valid at the document limit", () => {
  const longName = { ...rectangle, name: "x".repeat(200) };
  const copy = offsetShape(longName, 2, "sharp");
  expect(copy.name).toHaveLength(200);
  parseProject(JSON.stringify({ version: DOCUMENT_VERSION, shapes: [longName, copy] }));
});
