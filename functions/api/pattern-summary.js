import {MODEL, SYSTEM_PROMPT, CALL_INVITE, LABEL, CRISIS_REPLY, FALLBACK, validateInput, needsCrisisReply, buildUserMessage, parseModelReply} from '../lib/pattern-summary.js';

// Nothing the parent types is stored or logged. Off unless APC_PATTERN_SUMMARY_ENABLED is "true", the key secret exists and Turnstile is set up
// (it reuses the site's Turnstile keys, with its own action name, so nobody can spend the API credit from a script).
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

async function humanCheck(env, request, token) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({secret: env.APC_PROGRAMME_TURNSTILE_SECRET, response: token}), signal: AbortSignal.timeout(10000)});
    if (!res.ok) return false;
    const r = await res.json();
    return r.success === true && r.hostname === new URL(request.url).hostname && r.action === 'pattern-summary';
  } catch { return false; }
}

export async function onRequest({request, env}, verify = humanCheck) {
  const enabled = env.APC_PATTERN_SUMMARY_ENABLED === 'true' && !!env.ANTHROPIC_API_KEY && !!env.APC_PROGRAMME_TURNSTILE_SITEKEY && !!env.APC_PROGRAMME_TURNSTILE_SECRET;
  if (request.method === 'GET') return json({enabled, sitekey: enabled ? env.APC_PROGRAMME_TURNSTILE_SITEKEY : null});
  if (request.method !== 'POST') return json({error: 'Method not allowed.'}, 405);
  if (!enabled) return json({error: 'This tool is not open yet.'}, 503);
  if (!sameOrigin(request)) return json({error: 'Please use the APC website.'}, 403);
  let body;
  try { body = await request.json(); } catch { return json({error: 'Please check your answers and try again.'}, 400); }
  if (!(await verify(env, request, body?.token))) return json({error: 'The security check expired. Please try again.'}, 400);
  try { return json(await summarise(env, body)); }
  catch (e) { return json({error: e.message === 'consent' ? 'Please tick the box to continue.' : 'Please describe what happened during the moment, then try again.'}, 400); }
}
