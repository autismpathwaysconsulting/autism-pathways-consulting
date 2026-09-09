import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const app=await readFile(new URL('../content-os/episodes/app.js',import.meta.url),'utf8');
test('whole script saves once, rebuilds paragraph draft scenes, preserves originals and invalidates approval',async()=>{
 const pack={spokenScript:'Old one.\n\nOld two.',filmingBoard:[{spokenWords:'Old one.'},{spokenWords:'Old two.'}]};
 for(const text of ['New first paragraph.\n\nNew second paragraph.','Old one. Old two.','']){
  const calls=[];
  const context={episodeById:()=>({id:'EP06',status:'APPROVED'}),latestPack:()=>pack,
   activePromptArtifact:()=>({payload_sha256:'hash'}),keepScriptRecovery(){},clearScriptRecovery(){},
   packWithCurrentPromptBinding:()=>structuredClone(pack),isTimedPauseScene:()=>false,
   latestPrompt:()=>({format:'Talking head'}),sourceContext:()=>({}),promptRecord:()=>({text:'Recheck'}),
   uniqueKey:()=> 'unique',setStatus(){},apiRequest:async p=>calls.push(p),selectStudioEpisode(){},goToStudioStage(){},
   promptTextForCodex:()=> 'Bound',navigator:{clipboard:{writeText:async()=>{}}},
   container:{querySelectorAll:()=>[{value:'Old one.'},{value:'Old two.'}],querySelector:()=>({value:text})}};
  const code=app.slice(app.indexOf('async function saveScriptDraft('),app.indexOf('function parseImportedJson('));
  const result=runInNewContext(code+'\nsaveScriptDraft("EP06",container)',context);
  if(!text){await assert.rejects(result,/Enter the spoken script/);continue;}
  await result;
  assert.equal(calls.length,text.startsWith('New')?1:0);
  if(calls.length){assert.equal(calls[0].prompt.preferredScript,text);assert.match(calls[0].prompt.text,/Unverified/);assert.match(calls[0].prompt.text,/New second paragraph/);}
  assert.equal(pack.spokenScript,'Old one.\n\nOld two.');
 }
});
test('single editor and separate rubric are explicit',async()=>{
 assert.match(app,/Complete spoken script/);
 assert.match(app,/Optional: edit the existing scenes/);
 const learning=await readFile(new URL('../content-os/episode-learning.js',import.meta.url),'utf8');
 assert.match(learning,/FOUNDER-APPROVED PRE-FILM RUBRIC/);
 assert.match(learning,/do not normalize partial scores/);
 assert.match(learning,/full-export audit still requires actual/);
});
