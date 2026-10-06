import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto, pbkdf2Sync } from 'node:crypto';
import { verifyLogin, createPasswordRecord, derivePasswordHash } from '../functions/lib/pathways/auth.js';
import { onRequestPost as bootstrap } from '../functions/api/pathways/bootstrap.js';

const app = (await readFile(new URL('../pathways/app.js', import.meta.url), 'utf8'))
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\s*/gm, '')
  .replace(/init\(\);\s*$/, '');
function deferred(){ let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}; }
function harness(){
  const elements=new Map(),requests=[],opened=[],errors=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',value:'',disabled:false,classList:{add(){},remove(){},toggle(){}},setAttribute(){}});return elements.get(id)};
  const context=vm.createContext({console,Date,URL,crypto:webcrypto,PATHWAYS_WEEKDAYS:['Monday'],startOfWeek:()=>new Date(),datedDayKey:()=> '2026-09-18',document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>null},window:{alert:m=>errors.push(m),location:{assign:u=>opened.push(u)}}});
  vm.runInContext(app,context);
  context.request=(path,options)=>{const task=deferred();requests.push({path,options,...task});return task.promise};
  vm.runInContext("originalApi=api; api=request; renderAll=()=>{}; updateAuthorityWarning=()=>{}; outputFor=()=>JSON.stringify(state); user={id:'user-a'}; organizationId='org-a'; studentId='student-a';",context);
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
test('WhatsApp never shares when the server refuses or cannot verify the reviewed update',async()=>{
  for(const reason of ['revoked authority','expired authority','no reviewed update','network failed']){
    const h=harness();h.run("state={owner:'a'}");
    const share=h.run('openWhatsApp()');assert.equal(h.opened.length,0);assert.match(h.requests[0].path,/summaries\?studentId=student-a.*audience=parent/);
    h.requests[0].reject(new Error(reason));await share;assert.equal(h.opened.length,0,reason);
  }
});
test('WhatsApp uses server-reviewed text and discards results for a different student or session',async()=>{
  for(const change of ['',"studentId='student-b'","resetProtectedUi()"]){
    const h=harness();h.run("state={owner:'private raw text'}");const share=h.run('openWhatsApp()');if(change)h.run(change);
    h.requests[0].resolve({text:'Selected family highlight'});await share;
    assert.equal(h.opened.length,change?0:1);
    if(!change){assert.match(h.opened[0],/Selected%20family%20highlight/);assert.ok(!h.opened[0].includes('private'))}
  }
});
test('copying a family update uses the same server authority boundary as WhatsApp',async()=>{
  const h=harness();h.run("state={owner:'private raw text'}");const copying=h.run('copyReviewedOutput()');
  assert.match(h.requests[0].path,/summaries\?studentId=student-a.*audience=parent/);
  h.requests[0].reject(new Error('Family authority withdrawn'));await copying;
  assert.ok(h.errors.includes('Family authority withdrawn'));
});
test('summary viewer requests only the curated teacher endpoint',async()=>{
  const h=harness();h.run("user={memberships:[{organization_id:'org-a',role:'viewer'}]}");
  const pending=h.run('loadStudent()');assert.equal(h.requests.length,1);assert.match(h.requests[0].path,/summaries\?.*audience=teacher/);
  h.requests[0].resolve({student:{displayName:'Student A'},text:'Reviewed teacher highlight',reviewedAt:'2026-09-18'});await pending;
  assert.equal(h.run('state'),null);assert.equal(h.elements.get('viewerSummaryText').textContent,'Reviewed teacher highlight');
  h.run('resetProtectedUi()');assert.equal(h.elements.get('viewerSummaryText').textContent,'');
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
  const subtle={importKey:(...a)=>webcrypto.subtle.importKey(...a),deriveBits:(...a)=>{assert.ok(a[0].iterations<=100000);calls.push(['derive',a[0].iterations]);return webcrypto.subtle.deriveBits(...a)},digest:(...a)=>{calls.push(['digest']);return webcrypto.subtle.digest(...a)}};
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle}});
  try{
    for(const kind of ['unknown','inactive','locked','active','malformed']){
      calls.length=0;const row=kind==='unknown'?null:{user_id:'u',password_salt:'00112233445566778899aabbccddeeff',password_hash:'a'.repeat(64),password_iterations:100000,is_active:kind==='inactive'?0:1,locked_until:kind==='locked'?new Date(Date.now()+60000).toISOString():null};
      const db={prepare:sql=>({bind(){return this},async first(){return sql.includes('SELECT user_id')?row:null},async run(){return {meta:{changes:1}}}})};
      const result=await verifyLogin(db,'person@example.test',kind==='malformed'?'short':'incorrect-password');
      assert.equal(result.ok,false);assert.deepEqual(calls,[['derive',100000],['digest'],['digest']],kind);
    }
  }finally{Object.defineProperty(globalThis,'crypto',{configurable:true,value:original})}
});

test('bootstrap reports a runtime hashing limit without writing accounts or exposing secrets', async () => {
  const original = globalThis.crypto;
  let writes = 0;
  const secret = 'private-bootstrap-test-key';
  const password = 'private-founder-test-password';
  const db = { prepare: () => ({ first: async () => ({count: 0}) }), batch: async () => { writes++; } };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    randomUUID: () => webcrypto.randomUUID(),
    getRandomValues: a => webcrypto.getRandomValues(a),
    subtle: {
      digest: (...a) => webcrypto.subtle.digest(...a),
      importKey: (...a) => webcrypto.subtle.importKey(...a),
      deriveBits: async () => { throw new DOMException('Pbkdf2 failed: iteration counts above 100000 are not supported (requested 160000).', 'NotSupportedError'); },
    },
  }});
  try {
    const request = new Request('https://example.test/api/pathways/bootstrap', {
      method: 'POST', headers: {'Content-Type':'application/json', Origin:'https://example.test', 'X-Pathways-Request':'1', Authorization:'Basic '+btoa('apc:'+secret)},
      body: JSON.stringify({email:'founder@example.test', password, displayName:'Founder', organizationName:'Demo School', organizationSlug:'demo-school'}),
    });
    const response = await bootstrap({request, env:{APC_PATHWAYS_DB:db, APC_PATHWAYS_BOOTSTRAP_SECRET:secret}});
    const body = await response.text();
    assert.equal(response.status, 503);
    assert.equal(JSON.parse(body).code, 'PATHWAYS_PASSWORD_HASH_RUNTIME_LIMIT');
    assert.equal(writes, 0);
    assert.ok(!body.includes(password) && !body.includes(secret));
  } finally {
    Object.defineProperty(globalThis, 'crypto', {configurable:true, value:original});
  }
});

test('bootstrap storage exceptions return JSON without database details', async () => {
  const response = await bootstrap({request:new Request('https://example.test/api/pathways/bootstrap', {method:'POST'}), env:{APC_PATHWAYS_DB:{prepare(){throw new Error('private database diagnostic');}}}});
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.equal(JSON.parse(body).code, 'PATHWAYS_BOOTSTRAP_RUNTIME_ERROR');
  assert.ok(!body.includes('private database diagnostic'));
});


test('bootstrap and login work under the hosted PBKDF2 cap without downgrading old records', async () => {
  const original = globalThis.crypto;
  const iterations = [];
  Object.defineProperty(globalThis, 'crypto', {configurable:true, value:{
    randomUUID: () => webcrypto.randomUUID(),
    getRandomValues: a => webcrypto.getRandomValues(a),
    subtle: {
      digest: (...a) => webcrypto.subtle.digest(...a),
      importKey: (...a) => webcrypto.subtle.importKey(...a),
      deriveBits: (...a) => {
        iterations.push(a[0].iterations);
        if (a[0].iterations > 100000) throw new DOMException('Pbkdf2 failed: iteration counts above 100000 are not supported.', 'NotSupportedError');
        return webcrypto.subtle.deriveBits(...a);
      },
    },
  }});
  try {
    let account;
    let batches = 0;
    const password = 'synthetic-test-passphrase';
    const db = {
      prepare(sql) {
        return {
          sql, args:[], bind(...args){ this.args=args; return this; },
          async first(){
            if (sql.includes('COUNT(*)')) return {count:account?1:0};
            if (sql.includes('SELECT user_id')) return account;
            return null;
          },
          async run(){return {meta:{changes:1}};},
        };
      },
      async batch(statements) {
        batches++;
        const entry = statements.find(s => s.sql.includes('INSERT INTO pathways_users'));
        const [id,email,name,salt,hash,count] = entry.args;
        account = {user_id:id,email,display_name:name,password_salt:salt,password_hash:hash,password_iterations:count,is_active:1,is_platform_admin:1};
        assert.ok(statements.some(s => s.sql.includes('INSERT INTO pathways_students')));
      },
    };
    const secret = 'synthetic-bootstrap-secret';
    const request = new Request('https://example.test/api/pathways/bootstrap', {
      method:'POST', headers:{'Content-Type':'application/json',Origin:'https://example.test','X-Pathways-Request':'1',Authorization:'Basic '+btoa('apc:'+secret)},
      body:JSON.stringify({email:'founder@example.test',password,displayName:'Founder',organizationName:'Demo School',organizationSlug:'demo-school',seedDemo:true}),
    });
    const response = await bootstrap({request,env:{APC_PATHWAYS_DB:db,APC_PATHWAYS_BOOTSTRAP_SECRET:secret}});
    assert.equal(response.status,201);
    assert.equal((await response.json()).ok,true);
    assert.equal(batches,1);
    assert.equal(account.password_iterations,100000);
    assert.equal(account.password_hash,pbkdf2Sync(password,Buffer.from(account.password_salt,'hex'),100000,32,'sha256').toString('hex'));
    assert.equal((await verifyLogin(db,'founder@example.test',password)).ok,true);
    assert.equal((await verifyLogin(db,'founder@example.test','incorrect-password')).ok,false);
    assert.deepEqual(iterations,[100000,100000,100000]);
    await assert.rejects(derivePasswordHash(password,account.password_salt,160000),{name:'NotSupportedError'});
    assert.equal(iterations.at(-1),160000);
    const record = await createPasswordRecord(password);
    assert.equal(record.passwordIterations,100000);
    assert.notEqual(record.passwordSalt,account.password_salt);
    assert.notEqual(record.passwordHash,account.password_hash);
  } finally {
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:original});
  }
});
test('a late summary save cannot reload another student, and failed reviews retain draft text',async()=>{
  for(const mode of ['changed-student','failure']){
    const h=harness();h.run("record={revision:3,permission:'edit'};state={owner:'a'};summaryReview={context:captureStudentContext(),date:'2026-09-18',audience:'parent',revision:3}");
    h.elements.set('summaryDraft',{value:'Selected family details'});
    const pending=h.run('saveReviewedSummary()');assert.equal(h.requests.length,1);
    assert.equal(h.requests[0].options.body.expectedRevision,3);
    if(mode==='changed-student'){h.run("studentId='student-b'");h.requests[0].resolve({ok:true})}
    else h.requests[0].reject(new Error('Record changed. Reload and review again.'));
    await pending;assert.equal(h.requests.length,1);assert.equal(h.elements.get('summaryDraft').value,'Selected family details');
    assert.equal(h.elements.get('saveSummary').disabled,false);
  }
});
test('reopening a summary preserves selected highlights until regeneration is confirmed',()=>{
  const h=harness();h.run("record={revision:4,permission:'edit'};state={private:'internal lesson detail',reviewedSummaries:{'2026-09-18':{parent:{text:'Selected highlight'}}}};reviewSummary()");
  assert.equal(h.elements.get('summaryDraft').value,'Selected highlight');
  h.run("window.confirm=()=>false;useLatestSummaryDraft()");assert.equal(h.elements.get('summaryDraft').value,'Selected highlight');
  h.run("window.confirm=()=>true;outputFor=()=> 'Fresh lesson draft';useLatestSummaryDraft()");assert.equal(h.elements.get('summaryDraft').value,'Fresh lesson draft');
});
test('a pending review save locks its editor and restores editing after an error',async()=>{
  const h=harness();h.run("record={revision:4,permission:'edit'};state={};reviewSummary()");
  const saved=h.run('saveReviewedSummary()');assert.equal(h.elements.get('summaryDraft').disabled,true);assert.equal(h.elements.get('reviewSummary').disabled,true);
  h.requests[0].reject(new Error('Please retry'));await saved;
  assert.equal(h.elements.get('summaryDraft').disabled,false);assert.equal(h.elements.get('reviewSummary').disabled,false);
});
test('daily actions cannot open preparation for a read-only or summary-viewer account',()=>{
  const h=harness();h.run("state={};record={permission:'read'};let preparationOpened=false;openPin=()=>{preparationOpened=true};dashboardAction('prepare')");
  assert.equal(h.run('preparationOpened'),false);
  h.run("record={permission:'edit'};user={memberships:[{organization_id:'org-a',role:'viewer'}]};dashboardAction('prepare')");assert.equal(h.run('preparationOpened'),false);
  h.run("user={memberships:[{organization_id:'org-a',role:'support'}]};dashboardAction('prepare')");assert.equal(h.run('preparationOpened'),true);assert.equal(h.elements.get('pinPrepare').checked,true);assert.equal(h.elements.get('pinParent').value,'no');
});
test('daily shortcuts navigate to existing sections and respect reduced motion',()=>{
  const h=harness();h.run("state={};window.matchMedia=()=>({matches:true})");
  for(const [action,id] of [['record','lessonRecords'],['goals','goalsOverview'],['updates','reviewUpdates']]){
    h.run(`$('${id}').scrollIntoView=options=>{$('${id}').scrolled=options.behavior};$('${id}').focus=()=>{$('${id}').focused=true};dashboardAction('${action}')`);
    assert.equal(h.elements.get(id).scrolled,'auto');assert.equal(h.elements.get(id).focused,true);
  }
});

test('failed objective save keeps the form but cannot leak into an unrelated save or duplicate a retry',async()=>{
  const h=harness();
  h.run("record={revision:0,permission:'edit',role:'support'};state={objectives:[],pins:[{id:'p',status:'Open'}]};$('objTarget').value='Begin work';$('objCondition').value='During maths';$('objCriterion').value='Within two minutes';$('objReview').value='2026-11-01';$('objectiveDialog').close=()=>{}");
  const first=h.run('saveObjective()');h.requests[0].reject(new Error('Offline'));await first;
  assert.equal(h.run('state.objectives.length'),0);
  assert.equal(h.elements.get('objTarget').value,'Begin work');
  const unrelated=h.run("donePin('p')");
  assert.equal(h.requests[1].options.body.state.objectives.length,0);
  h.requests[1].reject(new Error('Offline'));await unrelated;
  assert.equal(h.run('state.pins[0].status'),'Open');
  const retry=h.run('saveObjective()');
  assert.equal(h.requests[2].options.body.state.objectives.length,1);
  h.requests[2].resolve({record:{revision:1,state:h.requests[2].options.body.state}});await retry;
  assert.equal(h.run('state.objectives.length'),1);
});

test('overlapping saves do not send competing revisions or alter the pending snapshot',async()=>{
  const h=harness();h.run("record={revision:0,permission:'edit',role:'support'};state={pins:[{id:'a',status:'Open'},{id:'b',status:'Open'}]}");
  const first=h.run("donePin('a')");const second=h.run("donePin('b')");
  assert.equal(h.requests.length,1);await second;
  assert.equal(h.requests[0].options.body.state.pins[1].status,'Open');
  h.requests[0].resolve({record:{revision:1,state:h.requests[0].options.body.state}});await first;
  assert.equal(h.run('state.pins[0].status'),'Done');assert.equal(h.run('state.pins[1].status'),'Open');
});

test('session expiry clears private records, exposes a useful message and retains the HTTP status',async()=>{
  const h=harness();h.run("state={private:'student data'};fetch=async()=>({status:401,ok:false,headers:{get:()=> 'application/json'},json:async()=>({error:'Unauthorized'})})");
  await assert.rejects(h.run("originalApi('/api/pathways/me')"),error=>error.status===401);
  assert.equal(h.run('state'),null);assert.equal(h.run('user'),null);
  assert.match(h.elements.get('loginError').textContent,/session expired/);
});

test('workspace restoration reports a connection failure and a valid session opens without another login',async()=>{
  const h=harness();h.run('bindStaticEvents=()=>{}');
  const failed=h.run('init()');h.requests[0].reject(new Error('Offline'));await failed;
  assert.match(h.elements.get('loginError').textContent,/Check your connection and reload/);
  assert.equal(h.run('user'),null);
  h.run("loadOrganizations=async()=>{};showApp=()=>{appOpened=true};appOpened=false");
  const restored=h.run('init()');h.requests[1].resolve({user:{id:'restored'},csrfToken:'synthetic-csrf'});await restored;
  assert.equal(h.run('appOpened'),true);assert.equal(h.run('user.id'),'restored');assert.equal(h.run('csrfToken'),'synthetic-csrf');
});

test('a failed lesson save retains its draft and leaves the last confirmed lesson unchanged',async()=>{
  const h=harness();h.run("record={revision:0,permission:'edit',role:'support'};state={subjects:{lesson:{narrative:'Confirmed'}}};editingKey='lesson';formData={tasks:[]};$('narrative').value='Unsaved draft';$('subjectDialog').close=()=>{}");
  const failed=h.run('saveSubject()');h.requests[0].reject(new Error('Offline'));await failed;
  assert.equal(h.run('state.subjects.lesson.narrative'),'Confirmed');assert.equal(h.run('formData.narrative'),'Unsaved draft');
  const retry=h.run('saveSubject()');h.requests[1].resolve({record:{revision:1,state:h.requests[1].options.body.state}});await retry;
  assert.equal(h.run('state.subjects.lesson.narrative'),'Unsaved draft');
});

test('version conflicts retain only changed draft records while loading the newer server state',async()=>{
  const h=harness();h.run("record={revision:0,permission:'edit',role:'support'};state={subjects:{lesson:{narrative:'Original'},other:{narrative:'Unrelated private note'}}};$('conflictDraftDialog').showModal=()=>{};$('conflictDraftDialog').close=()=>{}");
  const pending=h.run("persist('edit',next=>{next.subjects.lesson={narrative:'My unsaved observation'}})");
  h.requests[0].reject(Object.assign(new Error('Conflict'),{status:409}));
  await new Promise(resolve=>setImmediate(resolve));
  h.requests[1].resolve({record:{revision:1,state:{subjects:{lesson:{narrative:'Newer colleague observation'}}}},student:{display_name:'Student A'},permission:'edit',role:'support',revisions:[]});h.requests[2].resolve({consents:[]});
  assert.equal(await pending,false);
  assert.equal(h.run('state.subjects.lesson.narrative'),'Newer colleague observation');
  assert.match(h.elements.get('conflictDraftText').value,/My unsaved observation/);
  assert.ok(!h.elements.get('conflictDraftText').value.includes('Unrelated private note'));
  await assert.rejects(h.run('persist()'),/Review the recovered draft first/);
  assert.equal(h.requests.length,3);
});

test('draft survives a failed conflict reload and same-student refresh, then clears on sign-out',async()=>{
  const h=harness();h.run("record={revision:0,permission:'edit',role:'support'};state={overview:{day:{note:'Old'}}};$('conflictDraftDialog').showModal=()=>{}");
  const pending=h.run("persist('edit',next=>{next.overview.day.note='Keep this draft'})");
  h.requests[0].reject(Object.assign(new Error('Conflict'),{status:409}));await new Promise(resolve=>setImmediate(resolve));
  h.requests[1].reject(new Error('Offline'));h.requests[2].resolve({consents:[]});await pending;
  assert.equal(h.run('state'),null);assert.match(h.elements.get('conflictDraftText').value,/Keep this draft/);
  const reloading=h.run('loadStudent()');answer(h,3,'new-a');await reloading;
  assert.match(h.elements.get('conflictDraftText').value,/Keep this draft/);
  h.run('resetProtectedUi()');assert.equal(h.run('conflictDraft'),null);assert.equal(h.elements.get('conflictDraftText').value,'');
});

test('switching students clears recovered drafts and late reloads cannot restore them',async()=>{
  const h=harness();h.run("conflictDraft={epoch:sessionEpoch,organizationId,studentId,text:'Private draft A'};showConflictDraft()");
  const a=h.run('loadStudent()');h.run("studentId='student-b'");const b=h.run('loadStudent()');
  answer(h,2,'b');await b;answer(h,0,'a');await a;
  assert.equal(h.run('conflictDraft'),null);assert.equal(h.elements.get('conflictDraftText').value,'');assert.equal(h.run('state.owner'),'b');
});

test('discard requires confirmation and copying never reads a previous student draft',async()=>{
  const h=harness();h.run("conflictDraft={epoch:sessionEpoch,organizationId,studentId,text:'Draft A'};showConflictDraft();window.confirm=()=>false;$('conflictDraftDialog').close=()=>{};copied=[];navigator={clipboard:{writeText:async text=>copied.push(text)}}");
  h.run('discardConflictDraft()');assert.equal(h.run('conflictDraft.text'),'Draft A');
  await h.run('copyConflictDraft()');assert.equal(h.run('copied[0]'),'Draft A');
  h.run("studentId='student-b'");await h.run('copyConflictDraft()');assert.equal(h.run('copied.length'),1);
  h.run("studentId='student-a';window.confirm=()=>true;discardConflictDraft()");assert.equal(h.run('conflictDraft'),null);assert.equal(h.elements.get('conflictDraftText').value,'');
});

test('revoked student access clears the temporary conflict draft',async()=>{
  const h=harness();h.run("conflictDraft={epoch:sessionEpoch,organizationId,studentId,text:'Private draft'};showConflictDraft()");
  const loading=h.run('loadStudent()');h.requests[0].reject(Object.assign(new Error('Access revoked'),{status:403}));h.requests[1].resolve({consents:[]});await loading;
  assert.equal(h.run('conflictDraft'),null);assert.equal(h.elements.get('conflictDraftText').value,'');
});
