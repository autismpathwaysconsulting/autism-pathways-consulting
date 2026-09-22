import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const code = await readFile(new URL('../apc-school-enquiry.js', import.meta.url), 'utf8');
function setup(recordSiteMetric) {
  const fields = {};
  for (const id of ['school-extra-details','school-message-preview','school-copy-message','school-copy-status','school-topic-selected-0','school-topic-selected-1','school-topic-selected-2','school-format-selected-0','school-format-selected-1','school-format-selected-2','school-training-form','school-whatsapp-link','sf-success','sf-name','sf-school','sf-role','sf-phone','sf-message','sf-topic','sf-format','sf-team-size','school-format-0','school-format-1','school-format-2','school-topic-0','school-topic-1','school-topic-2']) {
    fields[id] = { value:'', events:{}, hidden:true, open:false, validationMessage:'',
      setCustomValidity(message) { this.validationMessage=message; },
      addEventListener(type,fn) { this.events[type]=fn; },
      select() { this.selected=true; },
      removeAttribute(name) { delete this[name]; },
      focus(options) { this.focused=true; this.focusOptions=options; }
    };
  }
  ['Understanding distress','Clearer communication','Smoother transitions'].forEach((topic,i)=>fields[`school-topic-${i}`].dataset={topic});
  ['Staff workshop','Team discussion','Educator & aide guidance'].forEach((format,i)=>fields[`school-format-${i}`].dataset={format});
  fields['school-extra-details'].contains = node => ['sf-topic','sf-format','sf-team-size','sf-message'].some(id=>fields[id]===node);
  fields['sf-name'].value='Teacher'; fields['sf-school'].value='School'; fields['sf-phone'].value='+60 12 345 6789';
  fields['sf-message'].value='Keep my existing description.';
  fields['school-training-form'].reportValidity=()=>['sf-name','sf-school','sf-phone'].every(id=>!fields[id].validationMessage);
  vm.runInNewContext(code,{document:{getElementById:id=>fields[id]},encodeURIComponent,recordSiteMetric});
  return fields;
}
test('each visual topic carries through to enquiry without overwriting typed details',()=>{
  const f=setup();
  for(let i=0;i<3;i++) {
    f[`school-topic-${i}`].events.click();
    assert.equal(f['sf-topic'].value,f[`school-topic-${i}`].dataset.topic);
    assert.equal(f['sf-message'].value,'Keep my existing description.');
    assert.equal(f['sf-topic'].focused,true);
    f['school-training-form'].events.submit({preventDefault(){}});
    const message=new URL(f['school-whatsapp-link'].href).searchParams.get('text');
    assert.ok(message.includes(`Training focus: ${f['sf-topic'].value}`));
    assert.ok(message.includes('Keep my existing description.'));
  }
});
test('edits or a different topic invalidate the prepared WhatsApp message',()=>{
  const f=setup(), form=f['school-training-form'];
  for (const invalidate of [()=>form.events.input(),()=>form.events.change(),()=>f['school-topic-1'].events.click()]) {
    form.events.submit({preventDefault(){}});
    assert.equal(f['sf-success'].hidden,false);
    invalidate();
    assert.equal(f['sf-success'].hidden,true);
    assert.equal(f['school-whatsapp-link'].href,undefined);
  }
});

test('format choices preserve topic and notes, invalidate old messages, and include team size',()=>{
 const f=setup(); f['sf-topic'].value='Clearer communication'; f['sf-team-size'].value='12';
 for(let i=0;i<3;i++) {
  f['school-training-form'].events.submit({preventDefault(){}});
  f[`school-format-${i}`].events.click();
  assert.equal(f['sf-success'].hidden,true);
  assert.equal(f['school-whatsapp-link'].href,undefined);
  assert.equal(f['sf-format'].value,f[`school-format-${i}`].dataset.format);
  assert.equal(f['sf-topic'].value,'Clearer communication');
  assert.equal(f['sf-message'].value,'Keep my existing description.');
  f['school-training-form'].events.submit({preventDefault(){}});
  const message=new URL(f['school-whatsapp-link'].href).searchParams.get('text');
  assert.ok(message.includes(`Preferred format: ${f['sf-format'].value}`));
  assert.ok(message.includes('Team size: 12'));
 }
});
test('unspecified optional enquiry details have useful message defaults',()=>{
 const f=setup();f['sf-message'].value='';
 f['school-training-form'].events.submit({preventDefault(){}});
 const message=new URL(f['school-whatsapp-link'].href).searchParams.get('text');
 assert.ok(message.includes('Preferred format: Help me choose'));
 assert.ok(message.includes('Team size: To discuss'));
 assert.ok(message.includes('Training needs: To discuss'));
});

test('review matches the WhatsApp message and clears after edits',()=>{
 const f=setup();f['school-topic-1'].events.click();f['school-format-0'].events.click();
 assert.equal(f['school-topic-selected-1'].hidden,false);
 assert.equal(f['school-topic-selected-0'].hidden,true);
 assert.equal(f['school-format-selected-0'].hidden,false);
 f['school-training-form'].events.submit({preventDefault(){}});
 assert.equal(f['school-message-preview'].value,new URL(f['school-whatsapp-link'].href).searchParams.get('text'));
 f['sf-topic'].value='';f['school-training-form'].events.change();
 assert.equal(f['school-message-preview'].value,'');
 assert.equal(f['school-topic-selected-1'].hidden,true);
 assert.equal(f['school-format-selected-0'].hidden,false);
});
test('copy has a manual fallback without a clipboard and ignores invalidated drafts',async()=>{
 const f=setup();f['school-training-form'].events.submit({preventDefault(){}});
 await f['school-copy-message'].events.click();
 assert.equal(f['school-message-preview'].selected,true);
 assert.match(f['school-copy-status'].textContent,/copy command/);
 f['school-training-form'].events.input();
 await f['school-copy-message'].events.click();
 assert.equal(f['school-copy-status'].textContent,'');
});

test('topic and format choices reveal optional context, including an invalid hidden field',()=>{
 const f=setup(), extra=f['school-extra-details'];
 assert.equal(extra.open,false);
 f['school-topic-0'].events.click();assert.equal(extra.open,true);
 extra.open=false;f['school-format-2'].events.click();assert.equal(extra.open,true);
 extra.open=false;f['school-training-form'].events.invalid({target:f['sf-team-size']});assert.equal(extra.open,true);
 extra.open=false;f['school-training-form'].events.invalid({target:f['sf-name']});assert.equal(extra.open,false);
});

test('blank identities and malformed numbers cannot prepare an enquiry; corrections recover',()=>{
 const f=setup(),form=f['school-training-form'];
 for (const [id,invalid] of [['sf-name','   '],['sf-school','\t'],['sf-phone','hello'],['sf-phone','123'],['sf-phone','1234567890123456'],['sf-phone','123+456789']]) {
  const original=f[id].value; f[id].value=invalid;form.events.input();form.events.submit({preventDefault(){}});
  assert.equal(f['sf-success'].hidden,true);assert.equal(f['school-whatsapp-link'].href,undefined);assert.ok(f[id].validationMessage);
  f[id].value=original;form.events.input();assert.equal(f[id].validationMessage,'');
 }
 for (const number of ['011-1234 5678','+60 (11) 1234-5678','+65 8123 4567']) {
  f['sf-phone'].value=number;form.events.input();form.events.submit({preventDefault(){}});assert.equal(f['sf-success'].hidden,false);
 }
});


test('enquiry preparation makes no analytics calls while integration is deferred',()=>{
 const actions=[],f=setup((...args)=>actions.push(args));
 f['school-training-form'].events.submit({preventDefault(){}});
 assert.equal(f['sf-success'].hidden,false);assert.deepEqual(actions,[]);
});

test('an omitted alternative number is valid; a supplied number is preserved and validated',()=>{
 const f=setup(), form=f['school-training-form'];
 for (const number of ['', '   ']) {
  f['sf-phone'].value=number; form.events.input();form.events.submit({preventDefault(){}});
  assert.equal(f['sf-success'].hidden,false);
  const message=new URL(f['school-whatsapp-link'].href).searchParams.get('text');
  assert.ok(!message.includes('Alternative contact number:'));
  assert.ok(!message.includes('WhatsApp:'));
 }
 f['sf-phone'].value='+60 12 345 6789';form.events.input();form.events.submit({preventDefault(){}});
 assert.match(f['school-message-preview'].value,/Alternative contact number: \+60 12 345 6789/);
 f['sf-phone'].value='not a number';form.events.input();form.events.submit({preventDefault(){}});
 assert.equal(f['sf-success'].hidden,true);
 assert.ok(f['sf-phone'].validationMessage);
});

