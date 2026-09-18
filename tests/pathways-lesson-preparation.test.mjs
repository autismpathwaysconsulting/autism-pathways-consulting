import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyPathwaysState, canonicalPathwaysState} from '../pathways/schema.js';
import {buildParentReport} from '../pathways/model.js';

function fixture(){
  const state=createEmptyPathwaysState();
  state.pins.push({id:'prep-demo',type:'Upcoming task / assessment',subject:'Maths',title:'Internal planning',details:'Staff discussion',due:'',parent:false,status:'Open',preparation:{topic:'Fractions',task:'Compare halves',learningOutcome:'Identify equivalent halves',materials:'Worksheet page 2',differentiatedWork:'Visual fraction strips',plannedSupport:'Wait before offering a prompt'}});
  return state;
}
test('existing pins retain their exact data without migration',()=>{
  const state=fixture();delete state.pins[0].preparation;
  assert.deepEqual(canonicalPathwaysState(state),state);
});
test('structured preparation survives canonical serialization',()=>{
  const state=fixture();assert.deepEqual(canonicalPathwaysState(state),state);
});
test('preparation requires meaningful topic, task and intended outcome',()=>{
  for(const field of ['topic','task','learningOutcome']){
    for(const value of [undefined,'','   ']){
      const state=fixture();state.pins[0].preparation[field]=value;
      assert.throws(()=>canonicalPathwaysState(state));
    }
  }
});
test('preparation cannot be marked for parent sharing or use another pin type',()=>{
  for(const change of [{parent:true},{type:'Reminder'}]){
    const state=fixture();Object.assign(state.pins[0],change);
    assert.throws(()=>canonicalPathwaysState(state),/internal upcoming task/);
  }
});
test('preparation rejects malformed objects and oversized optional fields',()=>{
  for(const value of [null,[],42]){
    const state=fixture();state.pins[0].preparation=value;
    assert.throws(()=>canonicalPathwaysState(state));
  }
  for(const field of ['materials','differentiatedWork','plannedSupport']){
    const state=fixture();state.pins[0].preparation[field]='x'.repeat(10000);
    assert.throws(()=>canonicalPathwaysState(state));
  }
});
test('parent report excludes internal preparation even if visibility is tampered with',()=>{
  const state=fixture();state.pins[0].parent=true;
  state.pins.push({id:'public-note',type:'Reminder',title:'Bring reading book',parent:true,status:'Open'});
  const report=buildParentReport({state,dayName:'Monday',baseDate:new Date(2026,8,14,12)});
  assert.match(report,/Bring reading book/);
  for(const secret of ['Internal planning','Staff discussion',...Object.values(state.pins[0].preparation)])assert.ok(!report.includes(secret));
});

import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const app=await readFile(new URL('../pathways/app.js',import.meta.url),'utf8');
function saveHarness(persist){
  const elements=Object.fromEntries(Object.entries({pinTitle:'Lesson plan',prepTopic:'Fractions',prepTask:'Compare halves',prepOutcome:'Recognise halves',prepMaterials:'',prepDifferentiated:'',prepSupport:'',pinSubject:'Maths',pinDetails:'',pinDue:''}).map(([key,value])=>[key,{value}]));
  elements.pinPrepare={checked:true};elements.savePinBtn={disabled:false};elements.pinDialog={close(){}};
  const state=createEmptyPathwaysState();let error='';
  const ctx={state,$:id=>elements[id],canEdit:()=>true,uid:()=> 'prep-test',captureStudentContext:()=>({isCurrent:()=>true}),persist,renderAll(){},showError:value=>{error=value}};
  vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('async function savePin(){'),app.indexOf('async function donePin(')),ctx);
  return {ctx,elements,state,error:()=>error};
}
test('failed preparation save retains form and does not duplicate the next attempt',async()=>{
  let attempts=0;const h=saveHarness(async()=>{if(++attempts===1)throw Error('Network unavailable');return true});
  await h.ctx.savePin();assert.equal(h.state.pins.length,0);assert.equal(h.elements.prepTopic.value,'Fractions');assert.equal(h.elements.savePinBtn.disabled,false);assert.equal(h.error(),'Network unavailable');
  await h.ctx.savePin();assert.equal(h.state.pins.length,1);assert.equal(h.state.pins[0].parent,false);
});
test('repeated clicks during a save send only one request',async()=>{
  let release;let calls=0;const h=saveHarness(()=>{calls++;return new Promise(resolve=>{release=resolve})});
  const first=h.ctx.savePin();await h.ctx.savePin();assert.equal(calls,1);release(true);await first;assert.equal(h.state.pins.length,1);
});
