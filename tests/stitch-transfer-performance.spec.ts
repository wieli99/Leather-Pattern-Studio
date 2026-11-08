import {test,expect} from "@playwright/test";
test("transfer hover benchmark with 1000 holes, receivers and unrelated shapes",async({page,browserName},info)=>{
 test.skip(browserName!=="chromium","Reference benchmark runs in Chromium.");
 await page.goto("/");await expect(page.getByRole("button",{name:"Open",exact:true})).toBeEnabled();
 await page.evaluate(()=>{delete (window as any).showOpenFilePicker;});
 const source={id:"source",name:"Source",kind:"rectangle",points:[{x:0,y:0},{x:100,y:40}],radius:0,rotation:0};
 const receivers=Array.from({length:5},(_,i)=>({...source,id:`receiver${i}`,name:`Receiver ${i}`,radius:i===0 ? 8 : 0,points:[{x:120,y:0},{x:240,y:60}]}));
 const extra=Array.from({length:250},(_,i)=>({...source,id:`extra${i}`,points:[{x:1000+i*110,y:1000},{x:1100+i*110,y:1040}]}));
 const chooser=page.waitForEvent("filechooser");await page.getByRole("button",{name:"Open",exact:true}).click();
 await(await chooser).setFiles({name:"perf.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({version:21,shapes:[source,...receivers,...extra],stitchGroups:[{id:"stitches",shapeId:"source",edges:["rectangle:2:edge:1"],side:1,closed:false,settings:{style:"round",roundDiameter:.1,spacing:.1,inset:2,alignment:"center"}}]}))});
 await expect(page.locator(".objects .object-select")).toHaveCount(256);
 await page.getByRole("button",{name:"Stitch line",exact:true}).click();
 const canvas=page.getByLabel("Pattern drawing canvas");await canvas.click({position:{x:230,y:160},modifiers:["Alt"]});
 await page.getByRole("button",{name:"Transfer stitching",exact:true}).click();
 const timing=await canvas.evaluate(async(el)=>{
  const box=el.getBoundingClientRect(),samples:number[]=[];let previous=performance.now();
  for(let i=0;i<100;i++){
   for(let n=0;n<3;n++)el.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,clientX:box.x+620+20*Math.sin((i+n/3)/10),clientY:box.y+190+10*Math.cos(i/10)}));
   await new Promise(requestAnimationFrame);const now=performance.now();if(i>9)samples.push(now-previous);previous=now;
  }
  samples.sort((a,b)=>a-b);return {mean:samples.reduce((a,b)=>a+b,0)/samples.length,p95:samples[Math.floor(samples.length*.95)]};
 });
 await info.attach("transfer-hover-timing",{body:JSON.stringify(timing),contentType:"application/json"});
 console.log("Transfer hover",timing);expect(timing.mean).toBeLessThan(40);
});
