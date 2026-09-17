import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { verifyLogin } from '../functions/lib/pathways/auth.js';

const app = (await readFile(new URL('../pathways/app.js', import.meta.url), 'utf8'))
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\s*/gm, '')
  .replace(/init\(\);\s*$/, '');
function deferred(){ let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}; }
function harness(){
  const elements=new Map(),requests=[],opened=[],errors=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',value:'',disabled:false,classList:{add(){},remove(){},toggle(){}},setAttribute(){}});return elements.get(id)};
  const context=vm.createContext({console,Date,URL,crypto:webcrypto,PATHWAYS_WEEKDAYS:['Monday'],startOfWeek:()=>new Date(),document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>null},window:{alert:m=>errors.push(m),location:{assign:u=>opened.push(u)}}});
  vm.runInContext(app,context);
  context.request=(path,options)=>{const task=deferred();requests.push({path,options,...task});return task.promise};
  vm.runInContext("api=request; renderAll=()=>{}; updateAuthorityWarning=()=>{}; outputFor=()=>JSON.stringify(state); user={id:'user-a'}; organizationId='org-a'; studentId='student-a';",context);
  return {run:code=>vm.runInContext(code,context),requests,elements,opened,errors};
}
function answer(h,index,id){h.requests[index].resolve({record:{revision:0,state:{owner:id}},student:{display_name:id},permission:'edit',role:'support',revisions:[]});h.requests[index+1].resolve({consents:[]})}

test('out-of-order student loads cannot replace the current student, including A-B-A',async()=>{
  const h=harness();const a=h.run('loadStudent()');
  h.run("studentId='student-b'");const b=h.run('loadStudent()');
  h.run("studentId='student-a'");const newest=h.run('loadStudent()');
  answer(h,4,'new-a');await newest;answer(h,2,'b');await b;answer(h,0,'old-a');await a;
  assert.equal(h.run('state.owner'),'new-a');assert.equal(h.elements.get('studentHeading').textContent,'new-a');
});
test('old load failures cannot clear a newer student or display an error',async()=>{
  const h=harness();const a=h.run('loadStudent()');h.run("studentId='student-b'");const b=h.run('loadStudent()');
  answer(h,2,'b');await b;h.requests[0].reject(new Error('old failure'));await a;
  assert.equal(h.run('state.owner'),'b');assert.deepEqual(h.errors,[]);
});
test('logout and organisation changes discard pending student loads',async()=>{
  for(const transition of ["resetProtectedUi()","organizationId='org-b'"]){
    const h=harness();const pending=h.run('loadStudent()');h.run(transition);answer(h,0,'private-a');await pending;
    assert.equal(h.run('state'),null);assert.notEqual(h.elements.get('studentHeading').textContent,'private-a');
  }
});
test('a late save result cannot install the previous student into the current view',async()=>{
  const h=harness();h.run("record={revision:0,permission:'edit',role:'support'};state={owner:'a'}");const saving=h.run('persist()');
  h.run("studentId='student-b'");const loading=h.run('loadStudent()');answer(h,1,'b');await loading;
  h.requests[0].resolve({record:{revision:1,state:{owner:'a'}}});assert.equal(await saving,false);assert.equal(h.run('state.owner'),'b');
});
test('WhatsApp requires a fresh decisive grant and never shares on missing, revoked or failed checks',async()=>{
  for(const status of ['withdrawn','expired','pending-effective','declined',null,'failure']){
    const h=harness();h.run("state={owner:'a'};currentConsents=[{consent_type:'family-sharing',decision_sequence:1,status:'granted'}]");
    const share=h.run('openWhatsApp()');assert.equal(h.opened.length,0);assert.match(h.requests[0].path,/consents\?studentId=student-a/);
    if(status==='failure')h.requests[0].reject(new Error('network failed'));
    else h.requests[0].resolve({consents:status?[{consent_type:'family-sharing',decision_sequence:1,status:'granted'},{consent_type:'family-sharing',decision_sequence:2,status}]:[]});
    await share;assert.equal(h.opened.length,0,status);assert.equal(h.elements.get('openWhatsApp').disabled,true);
  }
});
test('WhatsApp permits a fresh grant but discards checks for a different student or session',async()=>{
  for(const change of ['',"studentId='student-b'","resetProtectedUi()"]){
    const h=harness();h.run("state={owner:'a'}");const share=h.run('openWhatsApp()');if(change)h.run(change);
    h.requests[0].resolve({consents:[{consent_type:'family-sharing',decision_sequence:1,status:'granted'}]});await share;
    assert.equal(h.opened.length,change?0:1);
  }
});
test('stale history and admin panel responses do not expose a previous student',async()=>{
  for(const call of ['loadRevision(1)','renderStudentAdminPanel()']){
    const h=harness();h.run("students=[{student_id:'student-a',display_name:'Private A'}]");const pending=h.run(call);h.run("studentId='student-b'");
    if(call.startsWith('loadRevision'))h.requests[0].resolve({revision:{state:{private:'a'}}});
    else {h.requests[0].resolve({assignments:[{user_id:'private'}]});h.requests[1].resolve({consents:[]})}
    await pending;assert.equal(h.run('selectedRevision'),null);assert.equal(h.run('currentAssignments.length'),0);
  }
});
test('login rejection paths perform equivalent PBKDF2 work and constant-time comparison',async()=>{
  const original=globalThis.crypto;const calls=[];
  const subtle={importKey:(...a)=>webcrypto.subtle.importKey(...a),deriveBits:(...a)=>{calls.push(['derive',a[0].iterations]);return webcrypto.subtle.deriveBits(...a)},digest:(...a)=>{calls.push(['digest']);return webcrypto.subtle.digest(...a)}};
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle}});
  try{
    for(const kind of ['unknown','inactive','locked','active','malformed']){
      calls.length=0;const row=kind==='unknown'?null:{user_id:'u',password_salt:'00112233445566778899aabbccddeeff',password_hash:'a'.repeat(64),password_iterations:160000,is_active:kind==='inactive'?0:1,locked_until:kind==='locked'?new Date(Date.now()+60000).toISOString():null};
      const db={prepare:sql=>({bind(){return this},async first(){return sql.includes('SELECT user_id')?row:null},async run(){return {meta:{changes:1}}}})};
      const result=await verifyLogin(db,'person@example.test',kind==='malformed'?'short':'incorrect-password');
      assert.equal(result.ok,false);assert.deepEqual(calls,[['derive',160000],['digest'],['digest']],kind);
    }
  }finally{Object.defineProperty(globalThis,'crypto',{configurable:true,value:original})}
});
