import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PUBLIC_FILES } from '../scripts/build-site.mjs';
import {
  assertValidPathwaysState,
  createEmptyPathwaysState,
} from '../pathways/schema.js';
import {
  buildIepReport,
  buildParentReport,
  datedLessonKey,
  objectiveStats,
  startOfWeek,
} from '../pathways/model.js';
import {
  createPasswordRecord,
  derivePasswordHash,
  validatePassword,
} from '../functions/lib/pathways/auth.js';
import { hasUseAuthority } from '../functions/api/pathways/state.js';

const execFileAsync=promisify(execFile);
const projectRoot=fileURLToPath(new URL('../',import.meta.url));

function sampleState(){
  const state=createEmptyPathwaysState();
  state.timetable.Monday=[['09:00–09:55','EAL']];
  state.objectives.push({
    id:'obj-demo',domain:'AUT',target:'Begin a familiar written task',
    condition:'Following teacher instruction during familiar written work',support:'First-step visual',
    criterion:'Within 2 minutes in 4 of 5 opportunities',review:'2026-11-30',status:'active',measureType:'criterion',supersedesId:'',
  });
  const week=new Date(2026,8,14,12,0,0,0);
  state.subjects[datedLessonKey('Monday','09:00–09:55','EAL',week)]={
    saved:true,skipped:false,status:'routine',narrative:'Student A completed the task after teacher instruction.',
    participation:'Full access / participation',aideLevel:'None',supportSource:'Teacher',supportPurpose:'',
    autonomy:[],domains:['AUT'],eventObservation:'',eventUncertainty:'',
    tasks:[
      {id:'task-1',label:'Questions 1-5',type:'Independent work',outcome:'Completed / accessed',detail:'',includeParent:true,objectiveId:'obj-demo',objectiveResult:'Criterion met',measurementValue:null,measurementUnit:''},
      {id:'task-2',label:'Warm-up',type:'Warm-up',outcome:'Completed / accessed',detail:'Internal only',includeParent:false,objectiveId:'obj-demo',objectiveResult:'Not measured / insufficient opportunity',measurementValue:null,measurementUnit:''},
    ],
  };
  return {state,week};
}

function authorityDb(row){
  return {
    prepare(){
      return {
        bind(){
          return { first:async()=>row };
        },
      };
    },
  };
}

test('production Pathways assets are explicitly allowlisted',()=>{
  for(const path of ['pathways/index.html','pathways/app.css','pathways/app.js','pathways/model.js','pathways/schema.js','pathways/account.html','pathways/account.js','pathways/lifecycle.html','pathways/lifecycle.js']){
    assert.ok(PUBLIC_FILES.includes(path),`${path} must ship in the public build`);
  }
});

test('Cloudflare routes production Pathways APIs through Functions',async()=>{
  const routes=JSON.parse(await readFile(new URL('../_routes.json',import.meta.url),'utf8'));
  assert.ok(routes.include.includes('/api/pathways/*'));
});

test('production browser app never uses localStorage for student records',async()=>{
  const app=await readFile(new URL('../pathways/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/\blocalStorage\b/);
  assert.match(app,/\/api\/pathways\/state/);
  assert.match(app,/expectedRevision/);
});

test('saved lesson previews preserve the narrative instead of saying not reported',async()=>{
  const app=await readFile(new URL('../pathways/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/data\?\.narrative\s*\|\|\s*data\?\.skipped\s*\?/);
  assert.match(app,/data\?\.narrative\s*\|\|\s*\(data\?\.skipped\s*\?/);
});

test('Pathways production JavaScript passes Node syntax checks',async()=>{
  const files=[
    'pathways/app.js','pathways/model.js','pathways/schema.js','pathways/demo-state.js','pathways/account.js','pathways/lifecycle.js',
    'functions/lib/pathways/auth.js','functions/lib/pathways/state.js',
    'functions/api/pathways/bootstrap.js','functions/api/pathways/login.js','functions/api/pathways/logout.js','functions/api/pathways/me.js',
    'functions/api/pathways/organizations.js','functions/api/pathways/users.js','functions/api/pathways/students.js','functions/api/pathways/assignments.js',
    'functions/api/pathways/consents.js','functions/api/pathways/state.js','functions/api/pathways/export.js','functions/api/pathways/audit.js',
    'functions/api/pathways/privacy.js','functions/api/pathways/ai-suggest.js',
  ];
  for(const file of files)await execFileAsync(process.execPath,['--check',file],{cwd:projectRoot});
});

test('password records use salted PBKDF2 and reproduce deterministically',async()=>{
  assert.equal(validatePassword('short'),false);
  assert.equal(validatePassword('correct horse battery staple'),true);
  const record=await createPasswordRecord('correct horse battery staple');
  assert.ok(record.passwordIterations>=100000);
  assert.match(record.passwordSalt,/^[a-f0-9]{32}$/);
  assert.match(record.passwordHash,/^[a-f0-9]{64}$/);
  assert.equal(await derivePasswordHash('correct horse battery staple',record.passwordSalt,record.passwordIterations),record.passwordHash);
  assert.notEqual(await derivePasswordHash('different secure passphrase',record.passwordSalt,record.passwordIterations),record.passwordHash);
});

test('shared state schema requires structurally measurable objectives',()=>{
  const state=createEmptyPathwaysState();
  state.objectives.push({id:'obj-test',domain:'AUT',target:'Start task',condition:'',support:'',criterion:'',review:'',status:'active',measureType:'criterion',supersedesId:''});
  assert.throws(()=>assertValidPathwaysState(state),/must include target, condition, criterion and review date/);
});

test('task parent visibility rejects non-boolean values but absence remains backward compatible',()=>{
  const {state}=sampleState();
  state.subjects[Object.keys(state.subjects)[0]].tasks[0].includeParent='false';
  assert.throws(()=>assertValidPathwaysState(state),/parent visibility/);
  delete state.subjects[Object.keys(state.subjects)[0]].tasks[0].includeParent;
  assert.equal(assertValidPathwaysState(state),true);
});

test('valid state preserves explicit Not measured exclusion and parent privacy',()=>{
  const {state,week}=sampleState();
  assert.equal(assertValidPathwaysState(state),true);
  assert.deepEqual(objectiveStats(state.subjects,'obj-demo'),{measured:1,met:1,partial:0,notMet:0,notMeasured:1});
  const parent=buildParentReport({state,dayName:'Monday',baseDate:week});
  assert.match(parent,/Questions 1-5/);
  assert.doesNotMatch(parent,/Warm-up/);
  assert.doesNotMatch(parent,/Internal only/);
  const iep=buildIepReport({state,dayName:'Monday',baseDate:week});
  assert.match(iep,/Cumulative dated objective evidence/);
  assert.match(iep,/1 not measured excluded/);
});

test('dated keys separate school weeks',()=>{
  const week1=startOfWeek(new Date(2026,8,14,12));
  const week2=startOfWeek(new Date(2026,8,21,12));
  assert.notEqual(datedLessonKey('Monday','09:00–09:55','EAL',week1),datedLessonKey('Monday','09:00–09:55','EAL',week2));
});

test('latest use-authority record is decisive and synthetic exemption requires immutable provenance',async()=>{
  const student={student_id:'stu-test',is_synthetic_demo:0};
  assert.equal(await hasUseAuthority(authorityDb({status:'withdrawn',expires_at:null}),student,new Date('2026-09-15T00:00:00Z')),false);
  assert.equal(await hasUseAuthority(authorityDb({status:'declined',expires_at:null}),student,new Date('2026-09-15T00:00:00Z')),false);
  assert.equal(await hasUseAuthority(authorityDb({status:'granted',expires_at:'2026-09-14'}),student,new Date('2026-09-15T00:00:00Z')),false);
  assert.equal(await hasUseAuthority(authorityDb({status:'granted',expires_at:'2026-09-16'}),student,new Date('2026-09-15T00:00:00Z')),true);
  assert.equal(await hasUseAuthority(authorityDb(null),student,new Date('2026-09-15T00:00:00Z')),false);
  assert.equal(await hasUseAuthority(authorityDb(null),{student_id:'stu-demo',external_ref:'SYNTHETIC-DEMO',is_synthetic_demo:1}),true);
  assert.equal(await hasUseAuthority(authorityDb(null),{student_id:'stu-real',external_ref:'SYNTHETIC-DEMO',is_synthetic_demo:0}),false);
});

test('organisation admins cannot reset global credentials',async()=>{
  const users=await readFile(new URL('../functions/api/pathways/users.js',import.meta.url),'utf8');
  assert.match(users,/Organisation administrators cannot reset global user credentials/);
  assert.match(users,/if \(!auth\.user\.platformAdmin\)/);
});

test('migration makes canonical state history atomic and audit request-idempotent',async()=>{
  const schema=await readFile(new URL('../migrations/0012_pathways_production_beta.sql',import.meta.url),'utf8');
  for(const table of ['pathways_organizations','pathways_users','pathways_memberships','pathways_students','pathways_student_assignments','pathways_consents','pathways_student_state','pathways_state_revisions','pathways_sessions','pathways_audit_log'])assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema,/pathways_state_revisions is append-only/);
  assert.match(schema,/CREATE TRIGGER IF NOT EXISTS pathways_state_history_after_insert/);
  assert.match(schema,/CREATE TRIGGER IF NOT EXISTS pathways_state_history_after_update/);
  assert.match(schema,/AFTER UPDATE OF revision ON pathways_student_state/);
  assert.match(schema,/CREATE UNIQUE INDEX IF NOT EXISTS pathways_audit_request_idx/);
  assert.doesNotMatch(schema,/student_id TEXT REFERENCES pathways_students\(student_id\) ON DELETE SET NULL/);
  const stateLib=await readFile(new URL('../functions/lib/pathways/state.js',import.meta.url),'utf8');
  assert.match(stateLib,/same SQLite transaction/);
  assert.doesNotMatch(stateLib,/INSERT INTO pathways_state_revisions/);
  assert.doesNotMatch(stateLib,/INSERT INTO pathways_audit_log/);
  assert.doesNotMatch(stateLib,/revision insert failed after canonical write/);
});

test('synthetic demo provenance is database-backed and immutable',async()=>{
  const [migration,bootstrap,stateApi,auth]=await Promise.all([
    readFile(new URL('../migrations/0014_pathways_synthetic_provenance.sql',import.meta.url),'utf8'),
    readFile(new URL('../functions/api/pathways/bootstrap.js',import.meta.url),'utf8'),
    readFile(new URL('../functions/api/pathways/state.js',import.meta.url),'utf8'),
    readFile(new URL('../functions/lib/pathways/auth.js',import.meta.url),'utf8'),
  ]);
  assert.match(migration,/ADD COLUMN is_synthetic_demo/);
  assert.match(migration,/synthetic-demo provenance is immutable/);
  assert.match(bootstrap,/is_synthetic_demo/);
  assert.match(bootstrap,/VALUES \(\?, \?, 'Student A', 'SYNTHETIC-DEMO', 'Demo', 'active', 1/);
  assert.match(auth,/is_synthetic_demo/);
  assert.match(stateApi,/student\.is_synthetic_demo === 1/);
  assert.doesNotMatch(stateApi,/external_ref === 'SYNTHETIC-DEMO'/);
});

test('erasure is atomic and retains only hashed non-content evidence',async()=>{
  const erasure=await readFile(new URL('../migrations/0013_pathways_privacy_erasure.sql',import.meta.url),'utf8');
  assert.match(erasure,/erased_student_hash TEXT NOT NULL/);
  assert.doesNotMatch(erasure,/erased_student_id TEXT/);
  const privacy=await readFile(new URL('../functions/api/pathways/privacy.js',import.meta.url),'utf8');
  assert.match(privacy,/auth\.db\.batch\(\[/);
  assert.match(privacy,/sha256Hex\(studentId\)/);
  assert.doesNotMatch(privacy,/erasedStudentId/);
  assert.doesNotMatch(privacy,/display_name|external_ref|year_group/);
  const students=await readFile(new URL('../functions/api/pathways/students.js',import.meta.url),'utf8');
  assert.doesNotMatch(students,/metadata:\s*\{\s*externalRef/);
});

test('AI suggestion boundary requires human confirmation and never assigns objective results',async()=>{
  const ai=await readFile(new URL('../functions/api/pathways/ai-suggest.js',import.meta.url),'utf8');
  assert.match(ai,/humanConfirmationRequired:true/);
  assert.match(ai,/Never decide an IEP objective result/);
  assert.doesNotMatch(ai,/objectiveResult:/);
});
