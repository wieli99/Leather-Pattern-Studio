import { expect, it } from "vitest";
import { snapRotation, unwrapRotation } from "./rigidTransform";
it("uses Model rotation modifiers and wraps seam crossings", () => {
  expect(snapRotation(13.3, {})).toBe(13);
  expect(snapRotation(13.3, { shiftKey: true })).toBe(15);
  expect(snapRotation(13.3, { ctrlKey: true })).toBe(10);
  expect(snapRotation(13.3, { altKey: true })).toBe(13.3);
  expect(
    unwrapRotation((179 * Math.PI) / 180, (-179 * Math.PI) / 180),
  ).toBeCloseTo(2);
});
import { snapRigidMove } from "./rigidTransform";
import type { Shape } from "../model/project";
it("snaps moving anchors to object geometry before grid points", () => {
  const a: Shape = {
      id: "a",
      name: "A",
      kind: "rectangle",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
      ],
      radius: 0,
      rotation: 0,
    },
    b: Shape = {
      ...a,
      id: "b",
      points: [
        { x: 30, y: 0 },
        { x: 50, y: 20 },
      ],
    };
  const result = snapRigidMove(
    [a, b],
    ["a"],
    { x: 8, y: 0 },
    { grid: true, objects: true, gridSize: 10, tolerance: 5 },
  );
  expect(result.delta).toEqual({ x: 10, y: 0 });
  expect(result.anchor).toBeDefined();
});
it("combines bottom and left alignment even when bottom is already exact",()=>{
 const source:Shape={id:"small",name:"Small",kind:"rectangle",points:[{x:1,y:10},{x:21,y:30}],rotation:0,radius:0};
 const target:Shape={...source,id:"big",points:[{x:0,y:0},{x:40,y:30}]};
 const result=snapRigidMove([source,target],[source.id],{x:0,y:0},{grid:false,objects:true,gridSize:1,tolerance:2});
 expect(result.delta).toEqual({x:-1,y:0});
});
it("a coincident midpoint does not block matching both material edges",()=>{
 const source:Shape={id:"small",name:"Small",kind:"rectangle",points:[{x:1,y:10},{x:20,y:30}],radius:0,rotation:0};
 const target:Shape={...source,id:"big",points:[{x:0,y:0},{x:40,y:30}]};
 expect(snapRigidMove([source,target],[source.id],{x:0,y:0},{grid:false,objects:true,gridSize:1,tolerance:2}).delta).toEqual({x:-1,y:0});
});
