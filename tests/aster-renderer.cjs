'use strict';
const fs=require('node:fs');
async function connect(){
  const targets=await(await fetch('http://127.0.0.1:'+process.env.WORKSTATION_EDITOR_CDP_PORT+'/json/list')).json();
  const target=targets.find(t=>t.type==='page'&&t.url.startsWith('vscode-file:'));
  if(!target)throw new Error('Actual IDE renderer not found');
  const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let next=0;const pending=new Map();
  socket.addEventListener('message',({data})=>{const value=JSON.parse(data);if(!value.id)return;const call=pending.get(value.id);if(call){pending.delete(value.id);clearTimeout(call.timer);value.error?call.reject(new Error(value.error.message)):call.resolve(value.result);}});
  function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
  async function evaluate(expression,sessionId,contextId){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,...(contextId?{contextId}:{})},sessionId);if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result.value;}
  async function locate(){
    async function visit(frame,sessionId){
      try {
      const {executionContextId}=await call('Page.createIsolatedWorld',{frameId:frame.frame.id,worldName:'aster-real-panel-test'},sessionId);
      if(await evaluate('!!document.getElementById("preview") && !!document.getElementById("theme")',sessionId,executionContextId))return{sessionId,contextId:executionContextId};
      for(const child of frame.childFrames||[]){const found=await visit(child,sessionId);if(found)return found;}
      }catch(error){if(!/Cannot find context|No frame|Frame.*not found|Session.*closed|Target closed/.test(error.message))throw error;}
    }
    const page=await visit((await call('Page.getFrameTree')).frameTree);if(page)return page;
    const {targetInfos}=await call('Target.getTargets');
    for(const info of targetInfos.filter(t=>t.type==='iframe')){
      const {sessionId}=await call('Target.attachToTarget',{targetId:info.targetId,flatten:true});
      const found=await visit((await call('Page.getFrameTree',{},sessionId)).frameTree,sessionId);if(found)return found;
    }
  }
  return{call,evaluate,locate,async screenshot(file){const {data}=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(file,Buffer.from(data,'base64'));},close(){socket.close();}};
}
module.exports={connect};
