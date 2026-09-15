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

test('production Pathways assets are explicitly allowlisted',()=>{
  for(const path of ['pathways/index.html','pathways/app.css','pathways/app.js','pathways/model.js','pathways/schema.js']){
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

test('Pathways production JavaScript passes Node syntax checks',async()=>{
  const files=[
    'pathways/app.js','pathways/model.js','pathways/schema.js','pathways/demo-state.js',
    'functions/lib/pathways/auth.js','functions/lib/pathways/state.js',
    'functions/api/pathways/bootstrap.js','functions/api/pathways/login.js','functions/api/pathways/logout.js','functions/api/pathways/me.js',
    'functions/api/pathways/organizations.js','functions/api/pathways/users.js','functions/api/pathways/students.js','functions/api/pathways/assignments.js',
    'functions/api/pathways/consents.js','functions/api/pathways/state.js','functions/api/pathways/export.js','functions/api/pathways/audit.js',
    'functions/api/pathways/privacy.js','functions/api/pathways/ai-suggest.js',
  ];
  for(const file of files)await execFileAsync(process.execPath,['--check',file],{cwd:projectRoot});
});

test('password records use strong PBKDF2 parameters and reproduce deterministically',async()=>{
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

test('migration contains roles, sessions, state history, consent, audit and erasure controls',async()=>{
  const schema=await readFile(new URL('../migrations/0012_pathways_production_beta.sql',import.meta.url),'utf8');
  for(const table of ['pathways_organizations','pathways_users','pathways_memberships','pathways_students','pathways_student_assignments','pathways_consents','pathways_student_state','pathways_state_revisions','pathways_sessions','pathways_audit_log'])assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema,/pathways_state_revisions is append-only/);
  const erasure=await readFile(new URL('../migrations/0013_pathways_privacy_erasure.sql',import.meta.url),'utf8');
  assert.match(erasure,/DROP TRIGGER IF EXISTS pathways_state_revisions_no_delete/);
  assert.match(erasure,/CREATE TABLE IF NOT EXISTS pathways_erasure_log/);
});

test('AI suggestion boundary requires human confirmation and never assigns objective results',async()=>{
  const ai=await readFile(new URL('../functions/api/pathways/ai-suggest.js',import.meta.url),'utf8');
  assert.match(ai,/humanConfirmationRequired:true/);
  assert.match(ai,/Never decide an IEP objective result/);
  assert.doesNotMatch(ai,/objectiveResult:/);
});
