import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {sha256Hex} from '../functions/lib/pathways/auth.js';
import {createEmptyPathwaysState} from '../pathways/schema.js';
import {createStudentState, readStudentState} from '../functions/lib/pathways/state.js';
import {onRequest as summaries} from '../functions/api/pathways/summaries.js';
import {onRequest as studentsApi} from '../functions/api/pathways/students.js';
import {onRequest as stateApi} from '../functions/api/pathways/state.js';
import {onRequest as exportApi} from '../functions/api/pathways/export.js';
import {onRequest as consentsApi} from '../functions/api/pathways/consents.js';
import {onRequest as auditApi} from '../functions/api/pathways/audit.js';
import {onRequest as assignmentsApi} from '../functions/api/pathways/assignments.js';
class D1 {
 constructor(db){this.db=db}
 prepare(sql){const s=this.db.prepare(sql);let args=[];return {bind(...a){args=a;return this},async first(){return s.get(...args)||null},async all(){return {results:s.all(...args)}},async run(){return {meta:{changes:Number(s.run(...args).changes)}}}}}
 async batch(items){this.db.exec('BEGIN');try{const r=[];for(const i of items)r.push(await i.run());this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}
}
async function setup(synthetic=1){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['0012_pathways_production_beta.sql','0013_pathways_privacy_erasure.sql','0014_pathways_synthetic_provenance.sql'])sql.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const now=new Date().toISOString();const db=new D1(sql);
 sql.prepare("INSERT INTO pathways_organizations(organization_id,name,slug,created_at,updated_at) VALUES ('org','Synthetic school','synthetic',?,?)").run(now,now);
 for(const role of ['support','viewer','senco']){
  sql.prepare('INSERT INTO pathways_users(user_id,email,display_name,password_salt,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(role,role+'@example.test',role,'salt','hash',now,now);
  sql.prepare('INSERT INTO pathways_memberships(membership_id,organization_id,user_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('m-'+role,'org',role,role,now,now);
  sql.prepare('INSERT INTO pathways_sessions(session_hash,user_id,csrf_token,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(await sha256Hex(role),role,'csrf',now,new Date(Date.now()+3600000).toISOString(),now);
 }
 for(const id of ['student-a','student-b']){
  sql.prepare('INSERT INTO pathways_students(student_id,organization_id,display_name,is_synthetic_demo,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id,'org',id,synthetic,now,now);
  const state=createEmptyPathwaysState();state.overview['2026-09-18']={note:'PRIVATE NOTE'};
  await createStudentState({db,student:{student_id:id,organization_id:'org'},actorUserId:'support',state});
 }
 for(const role of ['support','viewer'])sql.prepare("INSERT INTO pathways_student_assignments(assignment_id,organization_id,student_id,user_id,permission,created_at) VALUES (?, 'org','student-a',?,'edit',?)").run('a-'+role,role,now);
 async function call(handler,role='support',query='',body=null,method=body?'POST':'GET',headers={}){
  return handler({env:{APC_PATHWAYS_DB:db},request:new Request('https://example.test/api/pathways/test'+query,{method,headers:{Cookie:'__Host-pathways_session='+role,Origin:'https://example.test','Content-Type':'application/json','X-Pathways-Request':'1','X-Pathways-CSRF':'csrf',...headers},...(body?{body:JSON.stringify(body)}:{})})});
 }
 const review=(audience='teacher',revision=0,text='Selected highlight')=>({studentId:'student-a',date:'2026-09-18',audience,expectedRevision:revision,text,requestId:'review:'+crypto.randomUUID()});
 let sequence=0;
 const consent=(status,granted=null,expires=null)=>sql.prepare("INSERT INTO pathways_consents(consent_id,organization_id,student_id,consent_type,status,granted_at,expires_at,created_at,updated_at) VALUES (?,'org','student-a','family-sharing',?,?,?,?,?)").run('c-'+ ++sequence,status,granted,expires,now,now);
 return {sql,db,call,review,consent};
}
test('reviewed teacher summary persists with server reviewer and exposes no full notes',async()=>{
 const h=await setup();try{
  const payload=h.review();payload.reviewedBy='spoof';payload.reviewedAt='2000-01-01';
  assert.equal((await h.call(summaries,'support','',payload)).status,200);
  const res=await h.call(summaries,'viewer','?studentId=student-a&date=2026-09-18&audience=teacher');assert.equal(res.status,200);
  const data=await res.json();assert.equal(data.text,'Selected highlight');assert.ok(!JSON.stringify(data).includes('PRIVATE NOTE'));assert.equal(data.state,undefined);assert.equal(data.reviewedBy,undefined);
  const saved=await readStudentState(h.db,'student-a');assert.equal(saved.state.reviewedSummaries['2026-09-18'].teacher.reviewedBy,'support');assert.equal(saved.state.overview['2026-09-18'].note,'PRIVATE NOTE');
 }finally{h.sql.close()}
});
test('viewer cannot use raw, history, export, consent, audit, assignment or write routes',async()=>{
 const h=await setup();try{
  for(const query of ['?studentId=student-a','?studentId=student-a&history=1','?studentId=student-a&revision=0'])assert.equal((await h.call(stateApi,'viewer',query)).status,403);
  for(const [api,q] of [[exportApi,'?studentId=student-a'],[exportApi,'?studentId=student-a&history=1'],[consentsApi,'?studentId=student-a'],[auditApi,'?organizationId=org'],[assignmentsApi,'?studentId=student-a']])assert.equal((await h.call(api,'viewer',q)).status,403);
  assert.equal((await h.call(summaries,'viewer','',h.review())).status,403);
  assert.equal((await h.call(stateApi,'viewer','',{studentId:'student-a'},'PUT')).status,403);
  assert.equal((await h.call(summaries,'viewer','?studentId=student-a&date=2026-09-18&audience=parent')).status,403);
 }finally{h.sql.close()}
});
test('unassigned, revoked and inactive accounts cannot fetch reviewed updates',async()=>{
 const h=await setup();try{
  await h.call(summaries,'support','',h.review());
  assert.equal((await h.call(summaries,'viewer','?studentId=student-b&date=2026-09-18&audience=teacher')).status,403);
  h.sql.exec("DELETE FROM pathways_student_assignments WHERE user_id='viewer'");
  assert.equal((await h.call(summaries,'viewer','?studentId=student-a&date=2026-09-18&audience=teacher')).status,403);
  h.sql.exec("UPDATE pathways_users SET is_active=0 WHERE user_id='viewer'");
  assert.equal((await h.call(summaries,'viewer','?studentId=student-a&date=2026-09-18&audience=teacher')).status,401);
 }finally{h.sql.close()}
});
test('family retrieval requires a reviewed update and latest effective sharing authority',async()=>{
 const h=await setup();const query='?studentId=student-a&date=2026-09-18&audience=parent';try{
  assert.equal((await h.call(summaries,'support',query)).status,409);
  await h.call(summaries,'support','',h.review('parent'));
  assert.equal((await h.call(summaries,'support',query)).status,403);
  h.consent('granted');assert.equal((await h.call(summaries,'support',query)).status,200);
  for(const [status,from,to] of [['withdrawn',null,null],['granted','2999-01-01',null],['granted',null,'2000-01-01'],['declined',null,null]]){h.consent(status,from,to);assert.equal((await h.call(summaries,'support',query)).status,403)}
 }finally{h.sql.close()}
});
test('edits invalidate summaries, conflicting reviews fail and generic writes cannot forge approval',async()=>{
 const h=await setup();try{
  await h.call(summaries,'support','',h.review());
  assert.equal((await h.call(summaries,'support','',h.review())).status,409);
  let record=await readStudentState(h.db,'student-a');
  const body={studentId:'student-a',expectedRevision:record.revision,requestId:'edit:'+crypto.randomUUID(),action:'edit',state:structuredClone(record.state)};
  body.state.reviewedSummaries['2026-09-18'].teacher.text='FORGED';
  assert.equal((await h.call(stateApi,'support','',body,'PUT')).status,403);
  body.state=record.state;body.state.overview['2026-09-18'].note='Changed observation';
  assert.equal((await h.call(stateApi,'support','',body,'PUT')).status,200);
  assert.equal((await h.call(summaries,'viewer','?studentId=student-a&date=2026-09-18&audience=teacher')).status,409);
 }finally{h.sql.close()}
});
test('review rejects invalid date, empty text and missing CSRF',async()=>{
 const h=await setup();try{
  for(const change of [{date:'2026-02-30'},{text:'   '},{audience:'all'}])assert.equal((await h.call(summaries,'support','',{...h.review(),...change})).status,400);
  assert.equal((await h.call(summaries,'support','',h.review(),'POST',{'X-Pathways-CSRF':''})).status,403);
 }finally{h.sql.close()}
});
test('saving a second audience preserves the first review, and restore requires fresh reviews',async()=>{
 const h=await setup();const query='?studentId=student-a&date=2026-09-18&audience=teacher';try{
  assert.equal((await h.call(summaries,'support','',h.review())).status,200);
  assert.equal((await h.call(summaries,'support','',h.review('parent',1,'Family-only highlight'))).status,200);
  assert.equal((await h.call(summaries,'viewer',query)).status,200);
  const res=await h.call(stateApi,'senco','',{studentId:'student-a',action:'restore',revision:1,expectedRevision:2,requestId:'restore:'+crypto.randomUUID()});assert.equal(res.status,200);
  assert.equal((await h.call(summaries,'viewer',query)).status,409);
 }finally{h.sql.close()}
});
test('inactive membership, archived student and suspended organization fail closed',async()=>{
 const h=await setup();const query='?studentId=student-a&date=2026-09-18&audience=teacher';try{
  await h.call(summaries,'support','',h.review());
  h.sql.exec("UPDATE pathways_memberships SET is_active=0 WHERE user_id='viewer'");assert.equal((await h.call(summaries,'viewer',query)).status,403);
  h.sql.exec("UPDATE pathways_memberships SET is_active=1 WHERE user_id='viewer'; UPDATE pathways_students SET status='archived' WHERE student_id='student-a'");assert.equal((await h.call(summaries,'viewer',query)).status,404);
  h.sql.exec("UPDATE pathways_students SET status='active' WHERE student_id='student-a'; UPDATE pathways_organizations SET status='suspended' WHERE organization_id='org'");assert.equal((await h.call(summaries,'viewer',query)).status,403);
 }finally{h.sql.close()}
});
test('unauthenticated summary request is rejected',async()=>{
 const h=await setup();try{assert.equal((await h.call(summaries,'no-session','?studentId=student-a&date=2026-09-18&audience=teacher')).status,401)}finally{h.sql.close()}
});

test('cross-organization assignment grants no access and viewer roster is minimized',async()=>{
 const h=await setup();try{
  const roster=await (await h.call(studentsApi,'viewer','?organizationId=org')).json();
  assert.deepEqual(Object.keys(roster.students[0]).sort(),['display_name','organization_id','student_id','year_group']);
  const now=new Date().toISOString();
  h.sql.prepare("INSERT INTO pathways_organizations(organization_id,name,slug,created_at,updated_at) VALUES ('other','Other school','other',?,?)").run(now,now);
  h.sql.exec("UPDATE pathways_memberships SET organization_id='other' WHERE user_id='viewer'");
  assert.equal((await h.call(summaries,'viewer','?studentId=student-a&date=2026-09-18&audience=teacher')).status,403);
 }finally{h.sql.close()}
});
test('school-use authority is required for both review and retrieval of a non-demo record',async()=>{
 const h=await setup(0);try{
  assert.equal((await h.call(summaries,'support','',h.review())).status,403);
  const now=new Date().toISOString();
  const consent=status=>h.sql.prepare("INSERT INTO pathways_consents(consent_id,organization_id,student_id,consent_type,status,created_at,updated_at) VALUES (?,'org','student-a','school-record',?,?,?)").run(crypto.randomUUID(),status,now,now);
  consent('granted');assert.equal((await h.call(summaries,'support','',h.review())).status,200);
  consent('withdrawn');assert.equal((await h.call(summaries,'viewer','?studentId=student-a&date=2026-09-18&audience=teacher')).status,403);
 }finally{h.sql.close()}
});

test('an editor with an older reviewed summary receives a conflict, not a false permission failure',async()=>{
 const h=await setup();try{
  const before=await readStudentState(h.db,'student-a');
  await h.call(summaries,'support','',h.review());
  before.state.overview['2026-09-18'].note='New lesson draft';
  const response=await h.call(stateApi,'support','',{studentId:'student-a',expectedRevision:before.revision,requestId:'stale:'+crypto.randomUUID(),action:'edit',state:before.state},'PUT');
  assert.equal(response.status,409);
  const result=await response.json();assert.equal(result.conflict,true);
  const current=await readStudentState(h.db,'student-a');
  assert.equal(current.revision,1);assert.equal(current.state.overview['2026-09-18'].note,'PRIVATE NOTE');
  assert.equal(current.state.reviewedSummaries['2026-09-18'].teacher.text,'Selected highlight');
 }finally{h.sql.close()}
});

test('retry after a lost save response cannot duplicate a revision or resurrect an invalidated summary',async()=>{
 const h=await setup();try{
  await h.call(summaries,'support','',h.review());
  const original=await readStudentState(h.db,'student-a');
  original.state.overview['2026-09-18'].note='Confirmed lesson after review';
  const body={studentId:'student-a',expectedRevision:original.revision,requestId:'first:'+crypto.randomUUID(),action:'edit',state:original.state};
  // The server commits, but the client does not consume the response body.
  assert.equal((await h.call(stateApi,'support','',body,'PUT')).status,200);
  const retry=await h.call(stateApi,'support','',{...body,requestId:'retry:'+crypto.randomUUID()},'PUT');
  assert.equal(retry.status,409);
  const current=await readStudentState(h.db,'student-a');
  assert.equal(current.revision,2);assert.equal(current.state.overview['2026-09-18'].note,'Confirmed lesson after review');
  assert.equal((await h.call(summaries,'viewer','?studentId=student-a&date=2026-09-18&audience=teacher')).status,409);
 }finally{h.sql.close()}
});

import {trialDays,trialGoal,trialLesson} from './fixtures/pathways-five-day-trial.mjs';
import {objectiveStats,buildParentReport} from '../pathways/model.js';
test('five synthetic school days preserve source facts, reviewed audiences, missing evidence and competing edits',async()=>{
 const h=await setup();try{
  h.consent('granted');
  for(const day of trialDays){
   let record=await readStudentState(h.db,'student-a');
   const next=structuredClone(record.state);
   next.objectives=[trialGoal];next.timetable[day.day]=[['09:00–09:50','Mathematics']];
   const key=day.date+'|09:00–09:50|Mathematics';next.subjects[key]=trialLesson(day);
   if(day.scenario==='Conflicting edits'){
    const colleague=structuredClone(record.state);colleague.overview[day.date]={note:'SENCO follow-up: review written steps.'};
    assert.equal((await h.call(stateApi,'senco','',{studentId:'student-a',expectedRevision:record.revision,requestId:crypto.randomUUID(),action:'edit',state:colleague},'PUT')).status,200);
    assert.equal((await h.call(stateApi,'support','',{studentId:'student-a',expectedRevision:record.revision,requestId:crypto.randomUUID(),action:'edit',state:next},'PUT')).status,409);
    record=await readStudentState(h.db,'student-a');
    next.overview=record.state.overview; // Explicit human-equivalent reconciliation for this fixture, not an automatic app merge.
   }
   const save=await h.call(stateApi,'support','',{studentId:'student-a',expectedRevision:record.revision,requestId:crypto.randomUUID(),action:'edit',state:next},'PUT');assert.equal(save.status,200,day.day);
   record=await readStudentState(h.db,'student-a');assert.deepEqual(record.state.subjects[key],trialLesson(day));
   const report=buildParentReport({state:record.state,dayName:day.day,baseDate:new Date(2026,9,5,12)});
   assert.ok(!report.includes('INTERNAL TRIAL ONLY'),day.day);
   if(day.narrative)assert.ok(report.includes(day.narrative),day.day);
   const teacher=await h.call(summaries,'support','',{...h.review('teacher',record.revision,day.teacher),date:day.date});assert.equal(teacher.status,200);
   record=await readStudentState(h.db,'student-a');
   assert.equal((await h.call(summaries,'support','',{...h.review('parent',record.revision,day.parent),date:day.date})).status,200);
   for(const [role,audience,expected] of [['viewer','teacher',day.teacher],['support','parent',day.parent]]){
    const response=await h.call(summaries,role,'?studentId=student-a&date='+day.date+'&audience='+audience);assert.equal(response.status,200);
    const text=(await response.json()).text;assert.equal(text,expected);assert.ok(!text.includes('INTERNAL TRIAL ONLY'));
   }
  }
  const final=await readStudentState(h.db,'student-a');
  assert.deepEqual(objectiveStats(final.state.subjects,trialGoal.id),{measured:3,met:1,partial:1,notMet:1,notMeasured:1});
  assert.equal(final.state.subjects['2026-10-07|09:00–09:50|Mathematics'].saved,false);
  assert.equal(final.state.overview['2026-10-08'].note,'SENCO follow-up: review written steps.');
  assert.equal((await h.call(summaries,'viewer','?studentId=student-a&date=2026-10-05&audience=teacher')).status,409,'Earlier reviews become stale after later record edits');
 }finally{h.sql.close()}
});
