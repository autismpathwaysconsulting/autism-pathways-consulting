import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const code = await readFile(new URL('../apc-school-enquiry.js', import.meta.url), 'utf8');
function setup() {
  const fields = {};
  for (const id of ['school-training-form','school-whatsapp-link','sf-success','sf-name','sf-school','sf-role','sf-phone','sf-message','sf-topic','sf-format','sf-team-size','school-format-0','school-format-1','school-format-2','school-topic-0','school-topic-1','school-topic-2']) {
    fields[id] = { value:'', events:{}, hidden:true,
      addEventListener(type,fn) { this.events[type]=fn; },
      removeAttribute(name) { delete this[name]; },
      focus(options) { this.focused=true; this.focusOptions=options; }
    };
  }
  ['Understanding distress','Clearer communication','Smoother transitions'].forEach((topic,i)=>fields[`school-topic-${i}`].dataset={topic});
  ['Staff workshop','Team discussion','Educator & aide guidance'].forEach((format,i)=>fields[`school-format-${i}`].dataset={format});
  fields['sf-name'].value='Teacher'; fields['sf-school'].value='School'; fields['sf-phone'].value='+60 123';
  fields['sf-message'].value='Keep my existing description.';
  fields['school-training-form'].reportValidity=()=>true;
  vm.runInNewContext(code,{document:{getElementById:id=>fields[id]},encodeURIComponent});
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
