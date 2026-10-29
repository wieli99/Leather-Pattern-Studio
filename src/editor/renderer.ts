import type {Controller} from './controller';
import {center} from '../model/geometry';
import type {Shape} from '../model/project';
export function shapePath(ctx:CanvasRenderingContext2D,s:Shape){
 const a=s.points[0],b=s.points[s.points.length-1];ctx.beginPath();
 if(s.kind==='rectangle')ctx.roundRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y),Math.min(s.radius,Math.abs(b.x-a.x)/2,Math.abs(b.y-a.y)/2));
 else if(s.kind==='circle')ctx.arc(a.x,a.y,Math.hypot(b.x-a.x,b.y-a.y),0,Math.PI*2);
 else if(s.kind==='ellipse')ctx.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.abs(b.x-a.x)/2,Math.abs(b.y-a.y)/2,0,0,Math.PI*2);
 else s.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
}
export function attachRenderer(canvas:HTMLCanvasElement,editor:Controller){
 const ctx=canvas.getContext('2d')!;let frame=0,dirty=true;
 const unsubscribe=editor.subscribe(()=>{dirty=true});
 const observer=new ResizeObserver(()=>{dirty=true});observer.observe(canvas);
 function draw(){
  const rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1,w=rect.width,h=rect.height;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
  editor.width=w;editor.height=h;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const z=editor.zoom,pan=editor.pan,spacing=Math.pow(10,Math.ceil(Math.log10(18/z))),step=spacing*z;
  ctx.fillStyle='#3d454c';for(let x=((pan.x%step)+step)%step;x<w;x+=step)for(let y=((pan.y%step)+step)%step;y<h;y+=step)ctx.fillRect(x,y,1,1);
  ctx.strokeStyle='#394149';ctx.beginPath();ctx.moveTo(pan.x,0);ctx.lineTo(pan.x,h);ctx.moveTo(0,pan.y);ctx.lineTo(w,pan.y);ctx.stroke();
  ctx.save();ctx.translate(pan.x,pan.y);ctx.scale(z,z);
  function shape(s:Shape,preview=false){ctx.save();const c=center(s);ctx.translate(c.x,c.y);ctx.rotate(s.rotation*Math.PI/180);ctx.translate(-c.x,-c.y);shapePath(ctx,s);const selected=editor.selected.includes(s.id);ctx.lineWidth=(selected?1.7:1.2)/z;ctx.strokeStyle=preview?'#79cfb4':selected?'#ffbd77':editor.hover===s.id?'#fff':'#bbc6cf';if(['rectangle','circle','ellipse'].includes(s.kind)){ctx.fillStyle=selected?'#ffbd7712':'#b5c5d005';ctx.fill()}ctx.stroke();ctx.restore()}
  (editor.preview??editor.document).shapes.forEach(s=>shape(s));
  if(editor.pending.length&&editor.tool!=='select')shape({id:'preview',name:'',kind:editor.tool,points:[...editor.pending,editor.cursor],rotation:0,radius:0},true);
  if(editor.selected.length){const b=editor.selectionBounds;ctx.strokeStyle='#ffbd7770';ctx.lineWidth=1/z;ctx.setLineDash([4/z,4/z]);ctx.strokeRect(b.x,b.y,b.width,b.height);ctx.setLineDash([]);for(const handle of editor.handles()){ctx.fillStyle=handle.kind==='rotate'?'#79cfb4':'#ffbd77';ctx.beginPath();if(handle.kind==='rotate')ctx.arc(handle.point.x,handle.point.y,4/z,0,Math.PI*2);else ctx.rect(handle.point.x-3/z,handle.point.y-3/z,6/z,6/z);ctx.fill()}}
  const g=editor.gesture;if(g?.kind==='marquee'){ctx.fillStyle='#79cfb417';ctx.strokeStyle='#79cfb4';ctx.lineWidth=1/z;ctx.fillRect(g.start.x,g.start.y,g.end.x-g.start.x,g.end.y-g.start.y);ctx.strokeRect(g.start.x,g.start.y,g.end.x-g.start.x,g.end.y-g.start.y)}
  if(editor.snapTarget){const p=editor.snapTarget;ctx.strokeStyle='#79cfb4';ctx.lineWidth=1/z;ctx.strokeRect(p.x-4/z,p.y-4/z,8/z,8/z)}
  ctx.restore();ctx.fillStyle='#7e8b98';ctx.font='11px system-ui';ctx.fillText(`${spacing} mm grid`,14,h-14);
 }
 function loop(){if(dirty){draw();dirty=false}frame=requestAnimationFrame(loop)}loop();
 return()=>{cancelAnimationFrame(frame);observer.disconnect();unsubscribe()};
}
