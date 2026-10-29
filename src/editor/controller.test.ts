import {test,expect,vi,afterEach} from 'vitest';
import {emptyDocument,parseProject,type Doc} from '../model/project';
vi.mock('./core',()=>({Core:class {
 document=emptyDocument();revision=0;past:Doc[]=[];future:Doc[]=[];
 async request(op:string,revision:number,next?:Doc){if(revision!==this.revision)throw Error('Stale revision');if(op==='preview')return {document:next,revision:this.revision};if(op==='commit'||op==='load'){parseProject(JSON.stringify(next));if(JSON.stringify(next)!==JSON.stringify(this.document)){this.past.push(this.document);this.document=next!;this.future=[];this.revision++}}if(op==='undo'&&this.past.length){this.future.push(this.document);this.document=this.past.pop()!;this.revision++}return {document:this.document,revision:this.revision,canUndo:!!this.past.length,canRedo:!!this.future.length}}
}}));
vi.mock('./persistence',()=>({ProjectFiles:class{},recovery:async()=>undefined}));
import {Controller} from './controller';
function editor(){const e=new Controller();e.ready=true;e.grid=false;e.objects=false;return e}
afterEach(()=>vi.useRealTimers());
test('cancel discards drawing and transforms without document changes',()=>{const e=editor();e.setTool('rectangle');e.pointerDown({x:100,y:100},0,false,false);expect(e.pending).toHaveLength(1);e.cancel();expect(e.pending).toHaveLength(0);expect(e.document.shapes).toHaveLength(0);expect(e.canUndo).toBe(false)});
test('one drawing gesture creates one transaction',async()=>{vi.useFakeTimers();const e=editor();e.setTool('rectangle');e.pointerDown({x:100,y:100},0,false,false);e.pointerDown({x:400,y:310},0,false,false);await vi.waitFor(()=>expect(e.document.shapes).toHaveLength(1));expect(e.revision).toBe(1);await e.transact('undo');expect(e.document.shapes).toHaveLength(0)});
test('invalid geometry is not committed',async()=>{const e=editor();e.setTool('rectangle');e.finish([{x:0,y:0},{x:0,y:10}]);await Promise.resolve();expect(e.revision).toBe(0);expect(e.message).toContain('positive')});
test('snapping uses screen-space tolerance and alt override',()=>{const e=editor();e.grid=true;e.zoom=3;expect(e.snap({x:.3,y:.2})).toEqual({x:0,y:0});expect(e.snap({x:.3,y:.2},true)).toEqual({x:.3,y:.2});e.grid=false;e.objects=true;e.document={version:3,shapes:[{id:'a',name:'line',kind:'line',points:[{x:10,y:10},{x:20,y:20}],rotation:0,radius:0}]};expect(e.snap({x:10.2,y:10.2})).toEqual({x:10,y:10})});
test('cursor anchored zoom preserves world coordinates',()=>{const e=editor(),pixel={x:200,y:300},before=e.world(pixel);e.wheel(pixel,0,-100,true);expect(e.world(pixel).x).toBeCloseTo(before.x);expect(e.world(pixel).y).toBeCloseTo(before.y)});
