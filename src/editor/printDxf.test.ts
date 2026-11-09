import { expect, it } from "vitest";
import { layoutDxf } from "./printDxf";
import type { Shape } from "../model/project";
import type { PrintLayout } from "../model/printLayout";
it("writes entity closure flags for full arcs and closed and open paths without DOM APIs", () => {
  const points=[{x:0,y:0},{x:100,y:50},{x:200,y:0},{x:0,y:0}];
  const shapes: Shape[] = ["polyline","curve","control-curve","arc","arc"].map((kind,i) => ({
    id:String(i),name:"Piece",kind:kind as Shape["kind"],points:kind === "arc" ? points.slice(0,2) : points,radius:0,rotation:0,sweep:i===4?-360:360,
    handles:points.map(() => ({incoming:{x:0,y:0},outgoing:{x:0,y:0}})),
  }));
  shapes.push({...shapes[0],id:"open",points:points.slice(0,3)});
  const layout: PrintLayout={id:"p",name:"Test",width:210,height:297,margin:10,units:"mm",pages:[],instances:shapes.map(s => ({id:`p${s.id}`,sourceId:s.id,x:0,y:0,rotation:0}))};
  const result=layoutDxf({version:21,shapes},layout);
  const entities=result.text.split("0\r\nLWPOLYLINE\r\n").slice(1);
  expect(entities).toHaveLength(6);
  const flags=entities.map(e => Number(e.match(/\r\n70\r\n(\d+)/)![1]));
  expect(flags.filter(f=>f===1)).toHaveLength(5);
  expect(flags.filter(f=>f===0)).toHaveLength(1);
  expect(result.svg).toContain('fill="white"');
});
