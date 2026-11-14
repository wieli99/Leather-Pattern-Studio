import { test, expect } from "vitest";
import { automaticPivot } from "./pivot";
import type { Shape } from "./project";
const rectangle=(id:string,x:number,width:number): Shape=>({id,name:id,kind:"rectangle",points:[{x,y:0},{x:x+width,y:20}],radius:0,rotation:0});
test("Median weights object centers equally instead of their sizes or anchor counts",()=>{
  const shapes=[rectangle("a",0,100),rectangle("b",200,20)];
  expect(automaticPivot(shapes,"bounding-box","mm")).toEqual({x:110,y:10});
  expect(automaticPivot(shapes,"median","mm")).toEqual({x:130,y:10});
  expect(automaticPivot([shapes[0]],"median","mm")).toEqual({x:50,y:10});
  expect(automaticPivot([],"median","mm")).toBeUndefined();
});
test("Median uses world centers and does not double-count attached stitching",()=>{
  const a={...rectangle("a",0,100),transform:{a:1,b:0,c:0,d:1,e:20,f:30}};
  const stitch={...rectangle("stitch",1000,20),stitchParentId:"a"};
  expect(automaticPivot([a,stitch,a],"median","mm")).toEqual({x:70,y:40});
});
