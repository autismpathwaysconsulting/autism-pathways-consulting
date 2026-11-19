import test from 'node:test';
import assert from 'node:assert/strict';
import {needsCrisisReply, validateInput, parseModelReply, CRISIS_REPLY} from '../functions/lib/pattern-summary.js';
import {summarise, onRequest} from '../functions/api/pattern-summary.js';

const ok = {before: 'We were leaving the playground.', during: 'He dropped to the floor and screamed.', after: 'Calm after 10 minutes at home.', consent: true};

test('crisis wording in English, Malay and Mandarin is caught', () => {
  for (const t of ['He keeps banging his head on the wall', 'she said she wants to die', 'there was blood on his hand', 'Dia lari ke jalan raya', 'anak saya berdarah', '他说想死', 'he ran into the road']) {
    assert.equal(needsCrisisReply(t), true, t);
  }
  for (const t of ['He cries when the iPad goes off', 'She refuses to wear shoes', 'Dia menangis bila keluar rumah']) {
    assert.equal(needsCrisisReply(t), false, t);
  }
});

test('input needs consent and a description of the moment', () => {
  assert.throws(() => validateInput({...ok, consent: false}), /consent/);
  assert.throws(() => validateInput({...ok, during: ''}), /during/);
  assert.equal(validateInput({...ok, during: 'x'.repeat(900)}).during.length, 500);
});

test('model replies with banned words or bad JSON are rejected', () => {
  assert.equal(parseModelReply('not json'), null);
  assert.equal(parseModelReply(JSON.stringify({safety: false, pattern: 'This may be a sign of a disorder.', try: 'Try a warning first please.', notice: 'Notice what happens before.'})), null);
  const good = parseModelReply(JSON.stringify({safety: false, pattern: 'It may be that leaving \u2014 a change \u2014 is hard.', try: 'Give a 2-minute warning with a picture.', notice: 'Jot down what happened just before.'}));
  assert.ok(good && !good.pattern.includes('\u2014'));
  assert.deepEqual(parseModelReply('{"safety": true}'), {safety: true});
});

test('crisis input never reaches the model', async () => {
  let called = false;
  const r = await summarise({}, {...ok, during: 'He hit his sister and there was blood'}, async () => { called = true; return ''; });
  assert.equal(called, false);
  assert.equal(r.kind, 'crisis');
  assert.equal(r.text, CRISIS_REPLY);
});

test('a model failure falls back to a safe generic summary with the call invite', async () => {
  const r = await summarise({}, ok, async () => { throw new Error('down'); });
  assert.equal(r.kind, 'summary');
  assert.match(r.invite, /first-step-call/);
  assert.match(r.label, /not a diagnosis/);
  assert.match(r.pattern, /^We couldn't write your personal summary/);
});

test('the tool stays closed without its switch, key and security check, and needs a passed check', async () => {
  const env = {APC_PATTERN_SUMMARY_ENABLED: 'true', ANTHROPIC_API_KEY: 'k', APC_PROGRAMME_TURNSTILE_SITEKEY: 's', APC_PROGRAMME_TURNSTILE_SECRET: 'x'};
  const get = env => onRequest({request: new Request('https://autismpathwaysconsulting.com/api/pattern-summary'), env}).then(r => r.json());
  assert.deepEqual(await get({...env, APC_PROGRAMME_TURNSTILE_SECRET: ''}), {enabled: false, sitekey: null});
  assert.deepEqual(await get(env), {enabled: true, sitekey: 's'});
  const post = new Request('https://autismpathwaysconsulting.com/api/pattern-summary', {method: 'POST', body: JSON.stringify({...ok, token: 'bad'})});
  const r = await onRequest({request: post, env}, async () => false);
  assert.equal(r.status, 400);
});
