import {STATUSES, reply, sameOrigin, readBody, purgeExpired} from '../../../lib/programmes/interest.js';
// All routes here are protected by functions/_middleware.js and the existing Content OS credentials.
export async function onRequest({request, env}) {
 const db = env.APC_CONTENT_OS_DB;
 if (!db) return reply({error:'Interest storage is not configured.'},503);
 try {
  if (request.method === 'GET') {
   await purgeExpired(db);
   const {results} = await db.prepare('SELECT * FROM programme_interest ORDER BY created_at DESC LIMIT 1001').all();
   return reply({records:results.slice(0,1000), truncated:results.length>1000});
  }
  if (!['PATCH','DELETE'].includes(request.method)) return reply({error:'Method not allowed.'},405);
  if (!sameOrigin(request)) return reply({error:'Same-origin request required.'},403);
  const body=await readBody(request);
  if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/.test(body.id)) return reply({error:'Invalid record.'},400);
  if (request.method === 'DELETE') {await db.prepare('DELETE FROM programme_interest WHERE id = ?').bind(body.id).run();return reply({deleted:true});}
  if (!STATUSES.includes(body.status) || typeof body.nextFollowup !== 'string' || (body.nextFollowup !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(body.nextFollowup) || !Number.isFinite(Date.parse(body.nextFollowup)) || new Date(body.nextFollowup).toISOString().slice(0,10)!==body.nextFollowup))) return reply({error:'Invalid status or date.'},400);
  await db.prepare('UPDATE programme_interest SET status = ?, next_followup = ? WHERE id = ?').bind(body.status,body.nextFollowup,body.id).run();
  return reply({saved:true});
 } catch {return reply({error:'Interest records are temporarily unavailable. No success is confirmed.'},503);}
}
