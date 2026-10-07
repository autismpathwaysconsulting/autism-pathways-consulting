import test from 'node:test';
import assert from 'node:assert/strict';
import {objectiveStats,objectiveEvidence} from '../pathways/model.js';
import {onRequest as boundary} from '../functions/api/pathways/_middleware.js';
import {probe} from '../scripts/pathways-availability.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sha256Hex} from '../functions/lib/pathways/auth.js';

test('IEP evidence excludes unsaved, skipped, legacy and out-of-period rows; blank results are missing evidence',()=>{
 const row=(result,saved=true,skipped=false)=>({saved,skipped,aideLevel:'High',supportTiming:'Throughout the task',tasks:[{objectiveId:'goal',label:'Practice',objectiveResult:result,measurementValue:0,measurementUnit:'seconds'}]});
 const subjects={'2026-10-05|08:00|EAL':row('Criterion met'),'2026-10-06|08:00|EAL':row(''),'2026-10-07|08:00|Maths':row('Criterion not met',false),'2026-10-08|08:00|Art':row('Criterion met',true,true),'legacy|Monday|08:00|EAL':row('Criterion met'),'2026-09-01|08:00|EAL':row('Criterion not met')};
 const range={from:'2026-10-05',to:'2026-10-09'};
 assert.deepEqual(objectiveStats(subjects,'goal',range),{measured:1,met:1,partial:0,notMet:0,notMeasured:1});
 const rows=objectiveEvidence(subjects,'goal',range);assert.equal(rows.length,2);assert.equal(rows[0].value,0);assert.match(rows[0].support,/High.*Throughout/);
 assert.equal(objectiveStats(subjects,'unknown').measured,0);
});

test('API exception boundary returns JSON and a request reference without logging exception or request content',async()=>{
 const logs=[],original=console.error;console.error=message=>logs.push(message);
 try{
  const response=await boundary({request:new Request('https://example.test/api/pathways/state?studentId=PRIVATE',{method:'POST',body:'SENSITIVE'}),next:async()=>{throw new Error('SECRET database details')}});
  assert.equal(response.status,500);const data=await response.json();assert.equal(data.requestId,response.headers.get('X-Request-ID'));assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.ok(!JSON.stringify(logs).match(/SECRET|PRIVATE|SENSITIVE/));assert.ok(!JSON.stringify(data).includes('SECRET'));
 }finally{console.error=original}
});

test('read-only availability probe detects broken sign-in pages and exposed authenticated API',async()=>{
 const result=await probe('https://example.test',async url=>url.pathname==='/pathways/'?new Response('login',{headers:{'Content-Type':'text/html'}}):Response.json({error:'Sign in required'}, {status:401}));assert.equal(result.ok,true);
 const broken=await probe('https://example.test',async()=>Response.json({ok:true}));assert.equal(broken.ok,false);
 await assert.rejects(probe('http://example.test'));await assert.rejects(probe('https://user:secret@example.test'));
});

test('synthetic SQLite backup restoration preserves state hashes, history, audit and integrity',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pathways-recovery-'));let source,restored;
 try{
  source=new DatabaseSync(join(dir,'source.sqlite'));
  for(const file of ['0012_pathways_production_beta.sql','0013_pathways_privacy_erasure.sql','0014_pathways_synthetic_provenance.sql'])source.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const now=new Date().toISOString(),json='{"synthetic":true}',hash=await sha256Hex(json);
  source.prepare("INSERT INTO pathways_organizations(organization_id,name,slug,created_at,updated_at) VALUES ('org','Synthetic','synthetic',?,?)").run(now,now);
  source.prepare("INSERT INTO pathways_students(student_id,organization_id,display_name,is_synthetic_demo,created_at,updated_at) VALUES ('student','org','Synthetic',1,?,?)").run(now,now);
  source.prepare("INSERT INTO pathways_student_state(student_id,state_json,state_hash,updated_at,last_request_id) VALUES ('student',?,?,?,'synthetic:backup')").run(json,hash,now);
  const backup=join(dir,'backup.sqlite');source.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");source.close();source=null;
  restored=new DatabaseSync(backup);assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length,0);
  const state=restored.prepare('SELECT state_json,state_hash FROM pathways_student_state').get();assert.equal(await sha256Hex(state.state_json),state.state_hash);
  assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM pathways_state_revisions').get().count,1);assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM pathways_audit_log').get().count,1);
 }finally{source?.close();restored?.close();await rm(dir,{recursive:true,force:true})}
});
