import {emptyDocument,parseProject,type Doc,type Shape,type Point,type Tool} from '../model/project';
import {anchors,bounds,center,distance,hitTest,moveShape,rotatePoint,rotateShape,scaleShape,worldPoints,type Bounds} from '../model/geometry';
import {Core,type Snapshot} from './core';
import {ProjectFiles,recovery,type Recovery} from './persistence';
export type Gesture={kind:'move'|'scale'|'rotate'|'vertex'|'marquee'|'pan';start:Point;end:Point;original:Doc;selection:string[];pivot:Point;vertex?:number;pan?:Point};
export class Controller {
 core=new Core();files=new ProjectFiles();document=emptyDocument();preview:Doc|null=null;revision=0;canUndo=false;canRedo=false;ready=false;busy=false;dirty=false;
 tool:Tool='select';selected:string[]=[];hover='';pending:Point[]=[];cursor:Point={x:0,y:0};snapTarget:Point|null=null;grid=true;objects=true;zoom=3;pan={x:80,y:100};width=900;height=700;space=false;gesture:Gesture|null=null;
 message='Starting geometry engine…';name='Untitled.leather.json';restore:Recovery|undefined;listeners=new Set<()=>void>();version=0;timer:ReturnType<typeof setTimeout>|undefined;previewId=0;previewRunning=false;queuedPreview:Doc|null=null;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn)}};
 snapshot=()=>this.version;
 notify(){this.version++;for(const fn of this.listeners)fn()}
 async initialize(){try{this.accept(await this.core.request('snapshot',0));this.ready=true;this.message='Ready · Choose a drawing tool';try{this.restore=await recovery();if(!this.restore){const legacy=localStorage.getItem('leather-recovery');if(legacy)this.restore={document:parseProject(legacy),name:'Recovered.leather.json',time:Date.now()}}}catch{this.message='Recovery storage unavailable. Save project files regularly.'}this.notify()}catch(e){this.fail(e)}}
 fail(e:unknown){this.message=e instanceof Error?e.message:String(e);this.notify()}
 accept(s:Snapshot){this.document=s.document;this.revision=s.revision;this.canUndo=s.canUndo;this.canRedo=s.canRedo;this.selected=this.selected.filter(id=>s.document.shapes.some(s=>s.id===id))}
 scheduleRecovery(){clearTimeout(this.timer);this.timer=setTimeout(()=>{void recovery({document:this.document,name:this.name,time:Date.now()}).catch(()=>this.fail(Error('Recovery storage failed. Save a project file.')))},300)}
 async transact(operation:string,document?:Doc){if(!this.ready||this.busy)return;this.busy=true;this.notify();try{const before=this.revision;const s=await this.core.request(operation,this.revision,document);this.accept(s);if(s.revision!==before){this.dirty=true;this.scheduleRecovery()}}catch(e){this.fail(e)}finally{this.preview=null;this.busy=false;this.notify()}}
 async commit(document:Doc){try{const validated=parseProject(JSON.stringify(document));await this.transact('commit',validated)}catch(e){this.preview=null;this.fail(e)}}
 async validatePreview(document:Doc){
  this.queuedPreview=document;if(this.previewRunning)return;this.previewRunning=true;
  try{while(this.queuedPreview&&this.gesture){const next=this.queuedPreview;this.queuedPreview=null;const id=++this.previewId;try{const s=await this.core.request('preview',this.revision,next);if(id===this.previewId&&s.revision===this.revision&&this.gesture&&!this.queuedPreview){this.preview=s.document;this.notify()}}catch{}}}finally{this.previewRunning=false;this.queuedPreview=null}
 }

 setTool(tool:Tool){this.cancel();this.tool=tool;this.message=tool==='select'?'Select an edge or drag a selection box':'Click the first point; use numeric fields for exact geometry';this.notify()}
 cancel(){this.previewId++;this.pending=[];this.preview=null;this.gesture=null;this.snapTarget=null;void this.core.request('cancel',this.revision).catch(()=>{});this.notify()}
 screen(p:Point):Point{return {x:p.x*this.zoom+this.pan.x,y:p.y*this.zoom+this.pan.y}}
 world(p:Point):Point{return {x:(p.x-this.pan.x)/this.zoom,y:(p.y-this.pan.y)/this.zoom}}
 snap(p:Point,disabled=false):Point{
  this.snapTarget=null;if(disabled)return p;const tolerance=8/this.zoom;
  if(this.objects){let best=tolerance;for(const s of this.document.shapes){if(this.gesture?.selection.includes(s.id))continue;for(const a of anchors(s)){const d=distance(a,p);if(d<best){best=d;this.snapTarget=a}}}if(this.snapTarget)return this.snapTarget}
  if(this.grid){const q={x:Math.round(p.x),y:Math.round(p.y)};if(distance(p,q)<=tolerance){this.snapTarget=q;return q}}return p;
 }
 get active(){return this.document.shapes.filter(s=>this.selected.includes(s.id))}
 get selectionBounds(){return bounds(this.active)}
 handles():{kind:'scale'|'rotate'|'vertex';point:Point;vertex?:number}[]{
  if(!this.selected.length)return [];const b=this.selectionBounds;
  const result:{kind:'scale'|'rotate'|'vertex';point:Point;vertex?:number}[]=[{kind:'scale',point:{x:b.x+b.width+12/this.zoom,y:b.y+b.height+12/this.zoom}},{kind:'rotate',point:{x:b.x+b.width/2,y:b.y-28/this.zoom}}];
  if(this.active.length===1&&['line','polyline'].includes(this.active[0].kind))worldPoints(this.active[0]).forEach((point,vertex)=>result.push({kind:'vertex',point,vertex}));return result;
 }
 pointerDown(pixel:Point,button:number,shift:boolean,alt:boolean){
  if(!this.ready||this.busy)return;const raw=this.world(pixel);
  if(button===1||(button===0&&this.space)){this.gesture={kind:'pan',start:pixel,end:pixel,original:this.document,selection:[],pivot:raw,pan:{...this.pan}};return}
  if(button!==0)return;
  if(this.tool!=='select'){
   const p=this.snap(raw,alt);
   if(!this.pending.length)this.pending=[p];
   else if(this.tool==='polyline'){if(this.pending.length>=3&&distance(raw,this.pending[0])<8/this.zoom)this.finish([...this.pending,this.pending[0]]);else this.pending=[...this.pending,p]}
   else this.finish([this.pending[0],p]);this.notify();return;
  }
  const handle=this.handles().find(h=>distance(h.point,raw)<9/this.zoom);
  if(handle){const b=this.selectionBounds;this.gesture={kind:handle.kind,start:raw,end:raw,original:this.document,selection:[...this.selected],pivot:handle.kind==='scale'?{x:b.x,y:b.y}:{x:b.x+b.width/2,y:b.y+b.height/2},vertex:handle.vertex};return}
  const hit=[...this.document.shapes].reverse().find(s=>hitTest(s,raw,8/this.zoom));
  if(hit){if(shift){this.selected=this.selected.includes(hit.id)?this.selected.filter(id=>id!==hit.id):[...this.selected,hit.id]}else if(!this.selected.includes(hit.id))this.selected=[hit.id];if(this.selected.includes(hit.id))this.gesture={kind:'move',start:this.snap(raw,alt),end:raw,original:this.document,selection:[...this.selected],pivot:raw}}
  else{const selection=shift?[...this.selected]:[];this.selected=selection;this.gesture={kind:'marquee',start:raw,end:raw,original:this.document,selection,pivot:raw}}
  this.notify();
 }
 pointerMove(pixel:Point,alt:boolean){
  const raw=this.world(pixel),g=this.gesture;
  this.cursor=g?.kind==='pan'?raw:this.snap(raw,alt);
  if(g?.kind==='pan'){this.pan={x:g.pan!.x+pixel.x-g.start.x,y:g.pan!.y+pixel.y-g.start.y};this.notify();return}
  if(g){g.end=this.cursor;if(g.kind==='marquee'){this.notify();return}const selected=(s:Shape)=>g.selection.includes(s.id);let document:Doc=g.original;
   if(g.kind==='move')document={...g.original,shapes:g.original.shapes.map(s=>selected(s)?moveShape(s,g.end.x-g.start.x,g.end.y-g.start.y):s)};
   if(g.kind==='scale'){const factor=Math.max(.001,distance(g.end,g.pivot)/(distance(g.start,g.pivot)||1));document={...g.original,shapes:g.original.shapes.map(s=>selected(s)?scaleShape(s,factor,g.pivot):s)}}
   if(g.kind==='rotate'){const angle=(Math.atan2(g.end.y-g.pivot.y,g.end.x-g.pivot.x)-Math.atan2(g.start.y-g.pivot.y,g.start.x-g.pivot.x))*180/Math.PI;document={...g.original,shapes:g.original.shapes.map(s=>selected(s)?rotateShape(s,angle,g.pivot):s)}}
   if(g.kind==='vertex'){const original=g.original.shapes.find(s=>selected(s))!;const local=rotatePoint(g.end,center(original),-original.rotation);const closed=original.points.length>2&&distance(original.points[0],original.points[original.points.length-1])<1e-9;const points=original.points.map((p,i)=>i===g.vertex||(closed&&(g.vertex===0||g.vertex===original.points.length-1)&&(i===0||i===original.points.length-1))?local:p);const oldCenter=center(original),newShape={...original,points},newCenter=center(newShape),rotatedNew=rotatePoint(newCenter,oldCenter,original.rotation);const corrected=moveShape(newShape,rotatedNew.x-newCenter.x,rotatedNew.y-newCenter.y);document={...g.original,shapes:g.original.shapes.map(s=>s.id===original.id?corrected:s)}}
   this.preview=document;void this.validatePreview(document);
  }else this.hover=[...this.document.shapes].reverse().find(s=>hitTest(s,raw,8/this.zoom))?.id??'';
  this.notify();
 }
 pointerUp(){const g=this.gesture;if(!g)return;this.previewId++;this.gesture=null;
  if(g.kind==='marquee'){const x=Math.min(g.start.x,g.end.x),y=Math.min(g.start.y,g.end.y),right=Math.max(g.start.x,g.end.x),bottom=Math.max(g.start.y,g.end.y);this.selected=[...new Set([...g.selection,...this.document.shapes.filter(s=>{const b=bounds([s]);return b.x>=x&&b.y>=y&&b.x+b.width<=right&&b.y+b.height<=bottom}).map(s=>s.id)])];this.notify();return}
  if(this.preview){const next=this.preview;this.preview=null;void this.commit(next)}this.notify();
 }
 finish(points=this.pending){if(points.length<2)return;const tool=this.tool;if(tool==='select')return;const shape:Shape={id:crypto.randomUUID(),name:`${tool[0].toUpperCase()+tool.slice(1)} ${this.document.shapes.length+1}`,kind:tool,points,radius:0,rotation:0};const next={...this.document,shapes:[...this.document.shapes,shape]};try{parseProject(JSON.stringify(next));this.pending=[];this.tool='select';void this.commit(next).then(()=>{if(this.document.shapes.some(s=>s.id===shape.id))this.selected=[shape.id];this.notify()})}catch(e){this.fail(e)}}
 exact(width:number,height:number,radius=0){if(!this.pending.length)return;const a=this.pending[0];const points=this.tool==='circle'?[a,{x:a.x+radius,y:a.y}]:[a,{x:a.x+width,y:a.y+height}];this.finish(points)}
 async edit(id:string,changes:Partial<Shape>){await this.commit({...this.document,shapes:this.document.shapes.map(s=>s.id===id?{...s,...changes}:s)})}
 delete(){if(this.selected.length)void this.commit({...this.document,shapes:this.document.shapes.filter(s=>!this.selected.includes(s.id))})}
 duplicate(){const copies=this.active.map(s=>({...moveShape(s,10,10),id:crypto.randomUUID(),name:`${s.name} copy`}));if(!copies.length)return;void this.commit({...this.document,shapes:[...this.document.shapes,...copies]}).then(()=>{this.selected=copies.map(s=>s.id);this.notify()})}
 fit(selection=false){const shapes=selection?this.active:this.document.shapes;if(!shapes.length)return;const b=bounds(shapes);this.zoom=Math.max(.01,Math.min(100,(this.width-100)/Math.max(1,b.width),(this.height-100)/Math.max(1,b.height)));this.pan={x:(this.width-b.width*this.zoom)/2-b.x*this.zoom,y:(this.height-b.height*this.zoom)/2-b.y*this.zoom};this.notify()}
 wheel(pixel:Point,dx:number,dy:number,zoom:boolean){if(zoom){const p=this.world(pixel);this.zoom=Math.max(.01,Math.min(100,this.zoom*Math.exp(-dy*.002)));this.pan={x:pixel.x-p.x*this.zoom,y:pixel.y-p.y*this.zoom}}else this.pan={x:this.pan.x-dx,y:this.pan.y-dy};this.notify()}
 confirmReplace(){return !this.dirty||confirm('You have unsaved changes. Continue without saving?')}
 async newProject(){if(!this.confirmReplace())return;this.cancel();await this.transact('load',emptyDocument());this.files.handle=null;this.name='Untitled.leather.json';this.dirty=false;this.notify()}
 async open(){if(!this.confirmReplace())return;try{const file=await this.files.open();if(!file)return;this.cancel();await this.transact('load',file.document);this.name=file.name;this.dirty=false;this.scheduleRecovery();this.notify()}catch(e){this.fail(e)}}
 async save(saveAs=false){try{const doc=this.document,result=await this.files.save(doc,this.name,saveAs);if(result==='cancelled')return;if(result==='saved'){this.name=this.files.handle.name;if(doc===this.document)this.dirty=false;this.message='Project saved'}else this.message='Project download started. Keep the downloaded file as your saved copy.';this.notify()}catch(e){this.fail(e)}}
 async restoreProject(){if(!this.restore||!this.confirmReplace())return;const value=this.restore;this.restore=undefined;this.cancel();await this.transact('load',parseProject(JSON.stringify(value.document)));this.name=value.name;this.dirty=true;this.notify()}
}
