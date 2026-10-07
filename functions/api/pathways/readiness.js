import {authenticate,json} from '../../lib/pathways/auth.js';

export async function onRequest({request,env}) {
  if(request.method!=='GET')return json({error:'Method not allowed.'},405,{Allow:'GET'});
  const auth=await authenticate(request,env);
  if(!auth.ok)return json({error:auth.error},auth.status);
  if(!auth.user.platformAdmin)return json({error:'Platform administrator access required.'},403);
  const tables=['pathways_users','pathways_students','pathways_student_state','pathways_state_revisions','pathways_audit_log','pathways_sessions'];
  const result=await auth.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pathways_%'").all();
  const names=new Set((result.results||[]).map(row=>row.name));
  const schemaReady=tables.every(name=>names.has(name));
  return json({checkedAt:new Date().toISOString(),checks:{database: schemaReady?'reachable; core tables present':'core tables missing',
    sentenceDrafting:env.APC_PATHWAYS_AI_ENABLED==='true'&&Boolean(env.OPENAI_API_KEY)&&Boolean(env.APC_PATHWAYS_AI_MODEL)?'configured; synthetic-only, provider evaluation still required':'disabled or missing configuration',
    monitoring:'External alert delivery must be tested separately',backup:'A Cloudflare recovery drill must be recorded separately',
    schoolAcceptance:'School privacy arrangements and role acceptance are not verified by this check'},readyForRealStudents:false},schemaReady?200:503);
}
