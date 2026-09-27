import { authenticate, getStudentAccess, json, readJson, requireWriteRequest } from '../../lib/pathways/auth.js';
import { readStudentState, writeStudentState } from '../../lib/pathways/state.js';
import { familySharingAuthorized, reviewedSummary, summarySourceHash } from '../../lib/pathways/summaries.js';
import { readUseAuthorityDecision } from './state.js';

function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
}
export async function onRequest({request, env}) {
  if (!['GET','POST'].includes(request.method)) return json({error:'Method not allowed.'},405,{Allow:'GET, POST'});
  const auth = await authenticate(request,env);
  if (!auth.ok) return json({error:auth.error},auth.status);
  let input;
  if (request.method === 'POST') {
    const failure = requireWriteRequest(request,auth); if(failure) return failure;
    const parsed = await readJson(request,{maxBytes:24000}); if(!parsed.ok) return parsed.response;
    input=parsed.value;
  } else input=Object.fromEntries(new URL(request.url).searchParams);
  const {studentId, date, audience} = input;
  if (!validDate(date) || !['parent','teacher'].includes(audience)) return json({error:'Choose a valid date and summary audience.'},400);
  const access = await getStudentAccess(auth,String(studentId||''),{write:request.method==='POST'});
  if(!access.ok) return json({error:access.error},access.status);
  if(access.role==='viewer' && audience!=='teacher') return json({error:'This account can read staff summaries only.'},403);
  try {
    const authorityDecision=await readUseAuthorityDecision(auth.db,access.student);
    if(!authorityDecision.valid) return json({error:'Current school-use authority is required.'},403);
    const record=await readStudentState(auth.db,studentId);
    if(!record) return json({error:'Student state was not found.'},404);
    if(request.method==='GET') {
      const summary=await reviewedSummary(record.state,date,audience);
      if(!summary) return json({error:'No current reviewed summary. Ask the aide or SENCO to review and save an update.'},409);
      if(audience==='parent' && !await familySharingAuthorized(auth.db,studentId)) return json({error:'Current family-sharing authority is required before copying or sharing.'},403);
      return json({student:{id:studentId,displayName:access.student.display_name},date,audience,text:summary.text,reviewedAt:summary.reviewedAt});
    }
    if(typeof input.text!=='string' || !input.text.trim() || input.text.length>12000) return json({error:'Add a summary of 1–12,000 characters.'},400);
    if(!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision!==record.revision) return json({error:'The record changed. Reload and review the latest notes before saving.'},409);
    const state=record.state;
    const summary={text:input.text.trim(),sourceHash:await summarySourceHash(state),reviewedAt:new Date().toISOString(),reviewedBy:auth.user.id};
    state.reviewedSummaries={...state.reviewedSummaries,[date]:{...state.reviewedSummaries?.[date],[audience]:summary}};
    const result=await writeStudentState({db:auth.db,student:access.student,actorUserId:auth.user.id,state,expectedRevision:input.expectedRevision,requestId:input.requestId,action:'edit',authorityDecision});
    if(result.authorityBlocked) return json({error:'Use authority changed. Nothing was approved.'},403);
    if(result.conflict) return json({error:'The record changed. Reload and review again.'},409);
    return json({ok:true,record:result.record});
  } catch(error) {
    if(error instanceof TypeError) return json({error:error.message},400);
    console.error(JSON.stringify({message:'Summary request failed',errorType:error?.name||'Error'}));
    return json({error:'Summary temporarily unavailable.'},503);
  }
}
