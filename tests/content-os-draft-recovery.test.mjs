import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const app=await readFile(new URL('../content-os/episodes/app.js',import.meta.url),'utf8');
test('recovery is scoped to episode and exact prompt, rejects malformed data, and survives until cleared',()=>{
 const code=app.slice(app.indexOf('function scriptRecoveryKey('),app.indexOf('function element('));
 const data=new Map();const context={localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
 runInNewContext(code,context);
 assert.equal(context.keepScriptRecovery('EP05','hash-a',['my words']),true);
 assert.equal(context.readScriptRecovery('EP05','hash-a')[0],'my words');
 assert.equal(context.readScriptRecovery('EP05','hash-b'),null);
 assert.equal(context.readScriptRecovery('EP04','hash-a'),null);
 data.set(context.scriptRecoveryKey('EP05'),'bad json');assert.equal(context.readScriptRecovery('EP05','hash-a'),null);
 context.keepScriptRecovery('EP05','hash-a',['x'.repeat(5001)]);assert.equal(context.readScriptRecovery('EP05','hash-a'),null);
 context.clearScriptRecovery('EP05');assert.equal(data.size,0);
});
test('script editing uses one save, preserves draft on failure, and does not re-audit unchanged words',async()=>{
 const code=app.slice(app.indexOf('async function saveScriptDraft('),app.indexOf('function parseImportedJson('));
 for(const scenario of ['unchanged','changed','failure','clipboard-failure']){
  const calls=[];let recovered=null;let cleared=false;
  const pack={contentType:'VIDEO',filmingBoard:[{spokenWords:'Original words'}]};
  const context={episodeById:()=>({id:'EP05',status:'APPROVED'}),latestPack:()=>pack,
   activePromptArtifact:()=>({payload_sha256:'oldhash'}),keepScriptRecovery:(id,hash,words)=>{recovered=words;},
   clearScriptRecovery:()=>{cleared=true;},packWithCurrentPromptBinding:()=>structuredClone(pack),isTimedPauseScene:()=>false,
   latestPrompt:()=>({format:'Talking head'}),sourceContext:()=>({topic:{id:'test'}}),manualContext:()=>({}),
   promptRecord:()=>({text:'Recheck'}),uniqueKey:()=> 'test',setStatus:()=>{},
   apiRequest:async p=>{calls.push(p);if(scenario==='failure')throw Error('offline');},
   selectStudioEpisode:id=>assert.equal(id,'EP05'),goToStudioStage:s=>assert.equal(s,'pack'),promptTextForCodex:()=> 'Bound saved prompt',
   navigator:{clipboard:{writeText:async()=>{if(scenario==='clipboard-failure')throw Error('denied');}}}};
  const container={querySelectorAll:()=>[{value:scenario==='unchanged'?'Original words':'Changed words'}]};context.container=container;
  const result=runInNewContext(code+'\nsaveScriptDraft("EP05",container)',context);
  if(scenario==='failure')await assert.rejects(result,/offline/);else await result;
  assert.equal(calls.length,scenario==='unchanged'?0:1);
  if(calls.length){assert.equal(calls[0].action,'save_prompt_revision');assert.equal(calls[0].prompt.preferredScript,'Changed words');}
  assert.equal(cleared,scenario!=='failure');
  if(scenario==='failure')assert.equal(recovered[0],'Changed words');
  assert.equal(pack.filmingBoard[0].spokenWords,'Original words');
 }
});
