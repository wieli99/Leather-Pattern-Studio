import init, {Editor} from './wasm/leather_document';
let core:Editor;
const ready=init().then(()=>{core=new Editor()});
self.onmessage=async(event:MessageEvent)=>{
 const {id,operation,document,revision}=event.data;
 try{await ready;const result=operation==='snapshot'?core.snapshot():core.apply(operation,JSON.stringify(document??null),revision);self.postMessage({id,result:JSON.parse(result)})}
 catch(error){self.postMessage({id,error:String(error)})}
};
