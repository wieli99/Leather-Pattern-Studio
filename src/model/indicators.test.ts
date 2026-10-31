import { describe, test, expect } from "vitest";
import { construct } from "../editor/construction";
import { indicatorGeometry, dimension, indicatorKinds } from "./indicators";
import { intersectsBox, bounds, hitTest, stretchShape, rotateShape, center } from "./geometry";
import { parseProject, emptyDocument } from "./project";
import { stitchEdges } from "./stitchGeometry";
import { shapeArea } from "./area";
const a = {x:0,y:0}, b = {x:20,y:0};
describe("indicator geometry",()=>{
  test("open arrows point to the second endpoint; bodyless arrows have no shaft",()=>{
    const arrow = construct("arrow",[a,b]);
    expect(indicatorGeometry(arrow).lines).toEqual([[a,b],[{x:3,y:3},a],[a,{x:3,y:-3}]]);
    expect(indicatorGeometry(construct("arrow-head",[a,b])).lines).toHaveLength(2);
    expect(hitTest(arrow,{x:2,y:2},0.1)).toBe(true);
    expect(hitTest(construct("arrow-head",[a,b]),{x:5,y:0},0.1)).toBe(false);
  });
  test("crosshair starts at the center and second click defines radius",()=>{
    const s=construct("crosshair",[a,{x:3,y:4}]);
    expect(center(s)).toEqual(a);
    expect(indicatorGeometry(s).size).toBe(10);
    expect(bounds([s])).toEqual({x:-4,y:-4,width:8,height:8});
    expect(hitTest(s,{x:-3,y:-4},0.1)).toBe(true);
  });
  test("square uses largest pointer component and dimensions follow transforms",()=>{
    const s=construct("size-square",[a,{x:-20,y:10}]);
    expect(s.points[1]).toEqual({x:-20,y:20});
    const scaled=rotateShape(stretchShape(s,2,2,a),35);
    expect(indicatorGeometry(scaled).size).toBeCloseTo(40);
    expect(indicatorGeometry(scaled).labels[0].text).toBe("40 mm");
    const g=indicatorGeometry(scaled);
    expect(hitTest(scaled,g.labels[0].point,0.1)).toBe(true);
  });
  test("rulers retain millimetre ticks and physical label size after scaling",()=>{
    const s=stretchShape(construct("size-ruler",[a,b]),2,2,a);
    const g=indicatorGeometry(s);
    expect(g.lines).toHaveLength(42);
    expect(g.lines[2]).toEqual([{x:1,y:0},{x:1,y:2}]);
    expect(g.labels.at(-1)?.text).toBe("40 mm");
    expect(g.labels.at(-1)?.fontSize).toBe(3);
    expect(dimension(1/3)).toBe("≈0.33");
  });
  test.each(indicatorKinds)("%s roundtrips and remains an annotation",kind=>{
    const s={...construct(kind,[a,{x:20,y:15}]),id:"i",name:"Indicator"};
    const doc=parseProject(JSON.stringify({...emptyDocument(),shapes:[s]}));
    expect(doc.shapes[0].rotation).toBeCloseTo(s.rotation,12);
    expect({...doc.shapes[0],rotation:s.rotation}).toEqual(s);
    expect(stitchEdges(s)).toEqual([]);
    expect(shapeArea(s)).toBe(null);
  });
  test("invalid geometry and sizes are rejected",()=>{
    expect(()=>construct("arrow",[a,a])).toThrow();
    const s={...construct("size-square",[a,{x:10,y:10}]),id:"i",name:"Guide"};
    const parse=(shape:unknown)=>parseProject(JSON.stringify({...emptyDocument(),shapes:[shape]}));
    expect(()=>parse({...s,points:[a,b]})).toThrow(/square/);
    expect(()=>parse(stretchShape(s,2,1,a))).toThrow(/uniform/);
    expect(()=>parse({...s,headSize:0})).toThrow(/arrowhead/);
  });
});

test("inch size rulers show fractional ticks and physical inch labels", () => {
  const shape = construct("size-ruler", [a, { x: 50.8, y: 0 }]);
  const g = indicatorGeometry(shape, "in-fractional");
  expect(g.labels.map(label => label.text)).toEqual(["0", "1", "2", "2 in"]);
  expect(g.lines).toHaveLength(34);
  expect(indicatorGeometry(shape).length).toBe(g.length);
});

test("crossing selection uses rendered ruler ticks in each unit mode", () => {
  const ruler = construct("size-ruler", [a, {x: 50.8, y: 0}]);
  const millimetreTick = {x: .99, y: 1, width: .02, height: .2};
  const inchTick = {x: 25.4/16-.01, y: 1, width: .02, height: .2};
  expect(intersectsBox(ruler, millimetreTick)).toBe(true);
  expect(intersectsBox(ruler, inchTick)).toBe(false);
  for (const units of ["in-fractional", "in-decimal"] as const) {
    expect(intersectsBox(ruler, millimetreTick, .001, units)).toBe(false);
    expect(intersectsBox(ruler, inchTick, .001, units)).toBe(true);
  }
});
