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
