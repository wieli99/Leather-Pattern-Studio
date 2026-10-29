import type {Doc} from '../model/project';
export type Snapshot={document:Doc;revision:number;canUndo:boolean;canRedo:boolean};
export class Core {
 private worker=new Worker(new URL('../editor-worker.ts',import.meta.url),{type:'module'});
 private id=0;
 private requests=new Map<number,{resolve:(s:Snapshot)=>void;reject:(e:Error)=>void}>();
 constructor(){
  this.worker.onmessage=e=>{const p=this.requests.get(e.data.id);if(!p)return;this.requests.delete(e.data.id);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.result)};
  this.worker.onerror=()=>{for(const p of this.requests.values())p.reject(Error('Geometry worker failed. Reload to restore your recovery snapshot.'));this.requests.clear()};
 }
 request(operation:string,revision:number,document?:Doc):Promise<Snapshot>{
  const id=++this.id;
  return new Promise((resolve,reject)=>{this.requests.set(id,{resolve,reject});this.worker.postMessage({id,operation,revision,document})});
 }
 dispose(){this.worker.terminate();for(const p of this.requests.values())p.reject(Error('Editor closed'));this.requests.clear()}
}
