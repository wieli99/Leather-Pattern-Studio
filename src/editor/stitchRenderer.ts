import { receivingWarnings, receivingStitches, resolvedStitchGroups, holeAppearance, holeMark as effectiveHoleMark, holeTouchesEdge, stitchEdgeContacts } from "../model/stitchLayers";
import { applyMatrix, shapeMatrix } from "../model/geometry";
import type { Controller } from "./controller";
import {
  stitchGeometry,
  stitchEdges,
  type StitchGroup,
} from "../model/stitchGeometry";
export function drawStitches(
  ctx: CanvasRenderingContext2D,
  editor: Controller,
  color: (name: string) => string,
) {
  const doc=editor.stitchTransferRenderDocument;
  const preview=editor.stitchTransferPlacement ? editor.stitchTransferPreview : null;
  const previews=new Map(preview?.transfers.map((t,i)=>[t.id,preview.results[i]]) ?? []);
  const painted=new Set<string>();
  function draw(g: StitchGroup, preview = false) {
    const s = doc.shapes.find((s) => s.id === g.shapeId);
    if (!s || editor.isHidden(s.id)) return;
    const highlighted=(doc.stitchTransfers ?? []).some(t=>(t.id===editor.stitchTransferHighlight || t.masterId===editor.stitchTransferHighlight) && (t.id===g.id || t.masterId===g.id));
    const selected =
      highlighted || preview || (editor.stitchMode && (editor.stitchSelected.includes(g.id) || (doc.stitchTransfers ?? []).some(t => t.id === g.id && editor.stitchSelected.includes(t.masterId))));
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = color(selected ? "accent" : "shape");
    ctx.lineWidth = 1 / editor.zoom;
    try {
      const geometry = stitchGeometry(s,g,doc.stitchGroups);
      if (preview) {
        ctx.save();
        ctx.setLineDash([4 / editor.zoom, 3 / editor.zoom]);
        ctx.beginPath();
        for (const edge of stitchEdges(s).filter((e) =>
          g.edges.includes(e.key),
        ))
          edge.points.forEach((p, i) =>
            i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
          );
        ctx.stroke();
        ctx.restore();
      }
      if (selected) {
        ctx.save();
        ctx.lineJoin = ctx.lineCap = "round";
        ctx.globalAlpha = preview ? 0.12 : 0.24;
        ctx.lineWidth = 9 / editor.zoom;
        ctx.beginPath();
        geometry.points.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.stroke();
        ctx.globalAlpha = preview ? 0.6 : 1;
        ctx.lineWidth = 2 / editor.zoom;
        ctx.setLineDash([5 / editor.zoom, 4 / editor.zoom]);
        ctx.stroke();
        ctx.restore();
      }
      const projected=previews.get(g.id);
      const edgeContacts=projected ? new Set(projected.edgeHits.map(n=>n-1)) : editor.stitchMode ? stitchEdgeContacts(doc,s,g) : new Set<number>();
      for (const [index, { point, angle }] of geometry.holes.entries()) {
        const appearance = holeAppearance(g,index);
        const marker = effectiveHoleMark(appearance);
        const holeMark = marker;

        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate(angle + (g.settings.reversed ? -holeMark.angle : holeMark.angle));
        ctx.beginPath();
        if (appearance.style === "round")
          ctx.arc(0, 0, holeMark.width / 2, 0, Math.PI * 2);
        else if (appearance.style === "japanese") {
          ctx.moveTo(-holeMark.width / 2, 0);
          ctx.lineTo(0, -holeMark.height / 2);
          ctx.lineTo(holeMark.width / 2, 0);
          ctx.lineTo(0, holeMark.height / 2);
          ctx.closePath();
        } else
          ctx.rect(-holeMark.width / 2, -holeMark.height / 2, holeMark.width, holeMark.height);
        ctx.fill();
        if (editor.stitchMode && edgeContacts.has(index)) {
          ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 2 / editor.zoom;
          ctx.beginPath(); ctx.arc(0,0,Math.max(holeMark.width,holeMark.height)/2+3/editor.zoom,0,Math.PI*2); ctx.stroke();
        }
        if (selected && editor.editingStitchHoles && editor.stitchHoleSelection.some(h=>h.groupId===g.id && h.number===index+1)) {
          ctx.beginPath(); ctx.arc(0, 0, Math.max(holeMark.width, holeMark.height) / 2 + 4 / editor.zoom, 0, Math.PI * 2);
          ctx.lineWidth = 2 / editor.zoom; ctx.stroke();
        }
        ctx.restore();
      }
      if (selected && !g.settings.holeCount && g.edges.length > 1) {
        const edges = stitchEdges(s);
        g.edges.forEach((key, index) => {
          if (!g.closed && index === 0) return;
          const point = edges.find(edge => edge.key === key)?.points[0];
          if (!point) return;
          ctx.save();
          ctx.fillStyle = color(index === editor.stitchSplitJunction ? "accent" : "shape");
          ctx.font = `${12 / editor.zoom}px sans-serif`;
          ctx.fillText(String(index + 1), point.x + 5 / editor.zoom, point.y - 5 / editor.zoom);
          ctx.beginPath(); ctx.arc(point.x, point.y, (index === editor.stitchSplitJunction ? 5 : 3) / editor.zoom, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        });
      }
      if (selected) {
        const a = geometry.points[0],
          b = geometry.points[1],
          angle = geometry.holes[0]?.angle ?? Math.atan2(b.y - a.y, b.x - a.x),
          size = 7 / editor.zoom;
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(size * 2, 0);
        ctx.lineTo(size, -size / 2);
        ctx.moveTo(size * 2, 0);
        ctx.lineTo(size, size / 2);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(a.x, a.y, 3 / editor.zoom, 0, Math.PI * 2);
        ctx.stroke();
        const end = geometry.points.at(-1)!;
        if (!geometry.closed)
          ctx.strokeRect(
            end.x - 2 / editor.zoom,
            end.y - 2 / editor.zoom,
            4 / editor.zoom,
            4 / editor.zoom,
          );
      }
    } catch (error) {
      const p = applyMatrix(shapeMatrix(s), s.points[0]);
      ctx.fillStyle = color("accent");
      ctx.font = `${14 / editor.zoom}px sans-serif`;
      ctx.fillText(`⚠ ${error instanceof Error ? error.message : "Invalid stitching geometry"}`, p.x, p.y);
    } finally {
      ctx.restore();
    }
  }
  for(const group of resolvedStitchGroups(doc)) {
    if(editor.stitchMode && editor.stitchHover && editor.stitchAbsorbed.includes(group.id))continue;
    const projected=previews.get(group.id);
    if(projected) {
      const shape=doc.shapes.find(s=>s.id===group.shapeId)!;
      const key=JSON.stringify([stitchGeometry(shape,group,doc.stitchGroups).holes,group.settings,group.holeOverrides,projected.edgeHits]);
      if(painted.has(key))continue;
      painted.add(key);
    }
    draw(editor.stitchDraft?.id===group.id && !editor.stitchError ? editor.stitchDraft : group);
  }
  for (const warning of receivingWarnings(doc)) {
    const transfer=doc.stitchTransfers?.find(t=>t.id===warning.id);
    const target=doc.shapes.find(s=>s.id===warning.targetId);
    if (!target || !transfer?.visible || editor.isHidden(target.id)) continue;
    const point=applyMatrix(shapeMatrix(target),target.points[0]);
    ctx.save(); ctx.fillStyle=color("accent"); ctx.font=`${13/editor.zoom}px sans-serif`;
    ctx.fillText("⚠ Transfer needs attention",point.x,point.y-8/editor.zoom); ctx.restore();
  }
  const placement=editor.stitchTransferPlacement,ghost=editor.stitchTransferGhost;
  if(placement && ghost && (editor.pointerInside || placement.phase==="placed")) {
    ctx.save();ctx.strokeStyle=color("accent");ctx.lineWidth=1.5/editor.zoom;ctx.globalAlpha=.6;ctx.setLineDash([6/editor.zoom,4/editor.zoom]);
    for(const ghost of editor.stitchTransferGhosts)for(const edge of stitchEdges(ghost)){ctx.beginPath();edge.points.forEach((p,index)=>index ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));ctx.stroke();}
    ctx.setLineDash([]);ctx.globalAlpha=.9;
    const center=editor.transferSourceCenter;
    const angle=placement.angle*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle);
    for(const id of placement.groupIds) {
      const group=doc.stitchGroups?.find(g=>g.id===id),shape=doc.shapes.find(s=>s.id===group?.shapeId);
      if(!group || !shape)continue;
      try {stitchGeometry(shape,group,doc.stitchGroups).holes.forEach((hole,index)=>{
        const p={x:placement.center.x+c*(hole.point.x-center.x)-sn*(hole.point.y-center.y),y:placement.center.y+sn*(hole.point.x-center.x)+c*(hole.point.y-center.y)};
        const appearance=holeAppearance(group,index),mark=effectiveHoleMark(appearance);
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(hole.angle+angle+(group.settings.reversed ? -mark.angle : mark.angle));ctx.fillStyle=color("accent");ctx.beginPath();
        if(appearance.style==="round")ctx.arc(0,0,mark.width/2,0,Math.PI*2);
        else if(appearance.style==="japanese"){ctx.moveTo(-mark.width/2,0);ctx.lineTo(0,-mark.height/2);ctx.lineTo(mark.width/2,0);ctx.lineTo(0,mark.height/2);ctx.closePath();}
        else ctx.rect(-mark.width/2,-mark.height/2,mark.width,mark.height);
        ctx.fill();ctx.restore();
      });}catch{/* The tool reports invalid selected geometry. */}
    }
    ctx.restore();
  }
  if(editor.stitchMode || editor.measurementsVisible) {
    const groups=resolvedStitchGroups(doc);
    const ids=new Set<string>((doc.stitchTransfers ?? []).flatMap(t=>[t.masterId,t.id]));
    for(const group of groups) {
      if(!ids.has(group.id))continue;
      const shape=doc.shapes.find(s=>s.id===group.shapeId);
      if(!shape || editor.isHidden(shape.id))continue;
      try {
        const holes=stitchGeometry(shape,group,doc.stitchGroups).holes,p=holes[Math.floor(holes.length/2)]?.point;
        if(!p)continue;
        ctx.save();ctx.translate(p.x,p.y);ctx.scale(1/editor.zoom,1/editor.zoom);ctx.translate(10,12);
        ctx.strokeStyle=ctx.fillStyle=color("accent");ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(0,0,5,3,-.6,0,Math.PI*2);ctx.ellipse(7,-4,5,3,-.6,0,Math.PI*2);ctx.stroke();ctx.font="bold 13px sans-serif";ctx.fillText(`=${[...new Set((doc.stitchTransfers ?? []).filter(t=>t.id===group.id || t.masterId===group.id).map(t=>t.number).filter((n):n is number=>n!=null))].sort((a,b)=>a-b).join(",")}`,15,2);ctx.restore();
      }catch{/* Retained invalid transfers have a separate warning. */}
    }
  }
  for (const link of doc.stitchLinks ?? []) {
    const entries = link.members.map(id => {
      const g = (doc.stitchGroups ?? []).find(g => g.id === id);
      const shape = doc.shapes.find(s => s.id === g?.shapeId);
      if (!g || !shape || editor.isHidden(shape.id)) return null;
      try {
        const geometry = stitchGeometry(shape, editor.stitchDraft?.id === id ? editor.stitchDraft : g);
        let remaining = geometry.points.slice(1).reduce((total, p, i) =>
          total + Math.hypot(p.x - geometry.points[i].x, p.y - geometry.points[i].y), 0) / 2;
        let point = geometry.points[0];
        for (let i = 1; i < geometry.points.length; i++) {
          const a = geometry.points[i - 1], b = geometry.points[i];
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          if (remaining <= length && length > 0) {
            point = {x: a.x + (b.x - a.x) * remaining / length, y: a.y + (b.y - a.y) * remaining / length};
            break;
          }
          remaining -= length;
        }
        return {point, count: geometry.holes.length};
      } catch { return {point: applyMatrix(shapeMatrix(shape), shape.points[0]), count: -1}; }
    });
    const broken = entries.some(e => !e || e.count < 0) || new Set(entries.map(e => e?.count)).size !== 1;
    if (!broken && !editor.stitchMode && !editor.measurementsVisible) continue;
    for (const entry of entries) {
      if (!entry) continue;
      ctx.save();
      ctx.translate(entry.point.x, entry.point.y);
      ctx.scale(1 / editor.zoom, 1 / editor.zoom);
      ctx.translate(8, -12);
      ctx.strokeStyle = ctx.fillStyle = broken ? "#dc2626" : color("accent");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 3, -0.6, 0, Math.PI * 2);
      ctx.ellipse(7, -4, 5, 3, -0.6, 0, Math.PI * 2);
      if (broken) { ctx.moveTo(0, -9); ctx.lineTo(8, 5); }
      ctx.stroke();
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(String(link.id), 16, 3);
      ctx.restore();
    }
  }
  if (
    editor.stitchMode &&
    editor.stitchHover?.id === "preview" &&
    !editor.stitchDraft
  )
    draw(editor.stitchHover, true);
}
