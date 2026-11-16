import {MODEL, SYSTEM_PROMPT, CALL_INVITE, LABEL, CRISIS_REPLY, FALLBACK, validateInput, needsCrisisReply, buildUserMessage, parseModelReply} from '../lib/pattern-summary.js';

// Nothing the parent types is stored or logged. Off unless APC_PATTERN_SUMMARY_ENABLED is "true" and the key secret exists.
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function askModel(env, input) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
    body: JSON.stringify({model: MODEL, max_tokens: 400, system: SYSTEM_PROMPT, messages: [{role: 'user', content: buildUserMessage(input)}]}),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('model ' + res.status);
  const data = await res.json();
  return (data.content || []).map(c => c.text || '').join('');
}

export async function summarise(env, body, ask = askModel) {
  const input = validateInput(body);
  if (needsCrisisReply([input.before, input.during, input.after].join(' '))) return {kind: 'crisis', text: CRISIS_REPLY};
  let parsed = null;
  try { parsed = parseModelReply(await ask(env, input)); } catch { parsed = null; }
  if (parsed?.safety) return {kind: 'crisis', text: CRISIS_REPLY};
  return {kind: 'summary', ...(parsed || FALLBACK), invite: CALL_INVITE, label: LABEL};
}

export async function onRequest({request, env}) {
  const enabled = env.APC_PATTERN_SUMMARY_ENABLED === 'true' && !!env.ANTHROPIC_API_KEY;
  if (request.method === 'GET') return json({enabled});
  if (request.method !== 'POST') return json({error: 'Method not allowed.'}, 405);
  if (!enabled) return json({error: 'This tool is not open yet.'}, 503);
  if (!sameOrigin(request)) return json({error: 'Please use the APC website.'}, 403);
  let body;
  try { body = await request.json(); } catch { return json({error: 'Please check your answers and try again.'}, 400); }
  try { return json(await summarise(env, body)); }
  catch (e) { return json({error: e.message === 'consent' ? 'Please tick the box to continue.' : 'Please describe what happened during the moment, then try again.'}, 400); }
}
