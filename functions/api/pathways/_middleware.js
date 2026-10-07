import {json} from '../../lib/pathways/auth.js';

export async function onRequest(context) {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  let response;
  try { response = await context.next(); }
  catch {
    // Never log a request body, query, credential, student ID, or raw exception.
    console.error(JSON.stringify({event:'pathways-request-failed',requestId,method:context.request.method}));
    response = json({error:'Pathways could not complete this request. Keep your draft and quote the reference if you contact support.',requestId},500);
  }
  const secured = new Response(response.body,response);
  secured.headers.set('X-Request-ID',requestId);
  secured.headers.set('Cache-Control','private, no-store');
  if (response.status >= 500) console.error(JSON.stringify({event:'pathways-server-error',requestId,status:response.status,durationMs:Date.now()-started}));
  return secured;
}
