import {CONSENT_VERSION, reply, readBody, sameOrigin, validate, purgeExpired} from '../lib/programmes/interest.js';
async function storageReady(db) {
 try {
  // Compile the complete storage contract without reading any household records.
  await db.prepare(`SELECT id,email,name,phone,programmes,first_choice,ages,location,saturday,
   accompanying_adult,support_discussion,updates,consent_version,created_at,status,next_followup
   FROM programme_interest LIMIT 0`).all();
  return true;
 } catch { return false; }
}
export async function onRequest({request, env}) {
 const enabled = env.APC_PROGRAMME_INTEREST_ENABLED === 'true' && !!env.APC_CONTENT_OS_DB && !!env.APC_PROGRAMME_TURNSTILE_SITEKEY && !!env.APC_PROGRAMME_TURNSTILE_SECRET;
 if (request.method === 'GET') {
  const ready = enabled && await storageReady(env.APC_CONTENT_OS_DB);
  return reply({enabled:ready, sitekey:ready ? env.APC_PROGRAMME_TURNSTILE_SITEKEY : null, consentVersion:CONSENT_VERSION});
 }
 if (request.method !== 'POST') return reply({error:'Method not allowed.'},405);
 if (!enabled) return reply({error:'The interest list is not open yet. Please email CJ if you would like to enquire.'},503);
 if (!sameOrigin(request)) return reply({error:'Please submit using the APC programme page.'},403);
 let body, data;
 try {body=await readBody(request);data=validate(body);} catch {return reply({error:'Please check your answers and consent, then try again.'},400);}
 if (body.website) return reply({error:'Unable to accept this request.'},400);
 if (typeof body.token !== 'string' || !body.token || body.token.length > 2048) return reply({error:'Please complete the security check.'},400);
 try {
  const verified = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({secret:env.APC_PROGRAMME_TURNSTILE_SECRET,response:body.token}), signal:AbortSignal.timeout(10000)});
  if (!verified.ok) throw new Error('Verification unavailable');
  const result = await verified.json();
  if (!result.success || result.hostname !== new URL(request.url).hostname || result.action !== 'programme-interest') return reply({error:'The security check expired or was not accepted. Please try again.'},400);
  const db = env.APC_CONTENT_OS_DB;
  await purgeExpired(db);
  await db.prepare(`INSERT INTO programme_interest
   (id,email,name,phone,programmes,first_choice,ages,location,saturday,accompanying_adult,support_discussion,updates,consent_version,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING`).bind(crypto.randomUUID(),data.email,data.name,data.phone,JSON.stringify(data.programmes),data.firstChoice,JSON.stringify(data.ages),data.location,data.saturday,data.adultAvailability,data.supportDiscussion,data.updates?1:0,CONSENT_VERSION,new Date().toISOString()).run();
  // Identical response for new and existing addresses. Anonymous requests never overwrite consent or household answers.
  return reply({received:true});
 } catch {return reply({error:'We could not confirm your request was saved. Your answers are still here. Please try again, or email CJ.'},503);}
}
