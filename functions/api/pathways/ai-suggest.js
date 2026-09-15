import {
  authenticate,
  getStudentAccess,
  json,
  readJson,
  requireWriteRequest,
} from '../../lib/pathways/auth.js';

const STATUS=['routine','noAide','support','voice','event'];
const PARTICIPATION=['Full access / participation','Partial','Limited at that time','Not observed / unclear'];
const AIDE=['None','Light','Moderate','High'];
const SUPPORT_SOURCE=['Student / self','Teacher','Aide','Peer','Environment / material','Multiple','Unclear'];
const SUPPORT_PURPOSE=['Task initiation','Understanding / clarification','Sequencing / planning','Organisation','Communication','Regulation / sensory access','Transition','Social participation','Safety / access','Other',''];
const AUTONOMY=['Initiated','Made a choice','Asked for help','Requested clarification','Communicated a need','Self-advocated','Accepted support','Declined support','Used known support independently'];
const DOMAINS=['COM','PAR','AUT','LRN','REG','SOC','SUP','TRN'];

function cleanSuggestion(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('AI suggestion was not an object.');
  const one=(candidate,allowed,fallback='')=>allowed.includes(candidate)?candidate:fallback;
  const list=(candidate,allowed,max)=>Array.isArray(candidate)?[...new Set(candidate.filter(item=>allowed.includes(item)))].slice(0,max):[];
  const tasks=Array.isArray(value.tasks)?value.tasks.slice(0,6).map(task=>({
    label:String(task?.label||'').slice(0,240),
    type:String(task?.type||'').slice(0,120),
    outcome:String(task?.outcome||'').slice(0,120),
    detail:String(task?.detail||'').slice(0,600),
  })).filter(task=>task.label||task.type):[];
  return {
    status:one(value.status,STATUS,'routine'),
    participation:one(value.participation,PARTICIPATION,'Not observed / unclear'),
    aideLevel:one(value.aideLevel,AIDE,'None'),
    supportSource:one(value.supportSource,SUPPORT_SOURCE,'Unclear'),
    supportPurpose:one(value.supportPurpose,SUPPORT_PURPOSE,''),
    autonomy:list(value.autonomy,AUTONOMY,6),
    domains:list(value.domains,DOMAINS,3),
    eventObservation:String(value.eventObservation||'').slice(0,1200),
    eventUncertainty:String(value.eventUncertainty||'').slice(0,1200),
    tasks,
    confidenceNote:String(value.confidenceNote||'').slice(0,500),
  };
}

function extractText(response){
  if(typeof response?.output_text==='string'&&response.output_text)return response.output_text;
  for(const item of response?.output||[]){
    for(const content of item?.content||[]){
      if(typeof content?.text==='string'&&content.text)return content.text;
    }
  }
  return '';
}

export async function onRequestPost({request,env}){
  const auth=await authenticate(request,env);
  if(!auth.ok)return json({error:auth.error},auth.status);
  const writeFailure=requireWriteRequest(request,auth);if(writeFailure)return writeFailure;
  if(!env.OPENAI_API_KEY)return json({error:'Pathways AI is not configured on this deployment.'},503);
  const parsed=await readJson(request,{maxBytes:32*1024});if(!parsed.ok)return parsed.response;
  const payload=parsed.value;const studentId=String(payload.studentId||'');
  const access=await getStudentAccess(auth,studentId,{write:true});if(!access.ok)return json({error:access.error},access.status);
  const narrative=String(payload.narrative||'').trim();const subject=String(payload.subject||'').trim().slice(0,160);
  if(narrative.length<8||narrative.length>5000)return json({error:'Add a short narrative before asking AI to suggest structure.'},400);

  const instructions=`You structure school-support observations for Pathways. Extract only information directly supported by the aide's narrative. Do not infer diagnosis, emotion, intent, behavioural function, causation, or hidden internal states. Do not assume less support is better. If something is unclear, use the explicit unclear/not-observed option or an empty string. Domains: COM communication/self-advocacy; PAR participation/access; AUT autonomy/self-management; LRN learning/executive function; REG regulation/sensory access; SOC social connection/belonging; SUP support/environment; TRN transition/future readiness. Return JSON only with keys: status, participation, aideLevel, supportSource, supportPurpose, autonomy, domains, eventObservation, eventUncertainty, tasks, confidenceNote. status must be one of routine,noAide,support,voice,event. participation must be one of Full access / participation, Partial, Limited at that time, Not observed / unclear. aideLevel one of None,Light,Moderate,High. supportSource one of Student / self,Teacher,Aide,Peer,Environment / material,Multiple,Unclear. supportPurpose one of Task initiation,Understanding / clarification,Sequencing / planning,Organisation,Communication,Regulation / sensory access,Transition,Social participation,Safety / access,Other, or empty. autonomy may contain only Initiated,Made a choice,Asked for help,Requested clarification,Communicated a need,Self-advocated,Accepted support,Declined support,Used known support independently. domains up to 3. tasks up to 6, each with label,type,outcome,detail. Never decide an IEP objective result.`;

  try{
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'Authorization':`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:env.APC_PATHWAYS_AI_MODEL||'gpt-5.6-luna',
        reasoning:{effort:'none'},
        max_output_tokens:1200,
        input:[
          {role:'system',content:instructions},
          {role:'user',content:`Subject: ${subject||'Not specified'}\nNarrative:\n${narrative}`},
        ],
      }),
    });
    if(!response.ok){
      console.error(JSON.stringify({message:'Pathways AI provider request failed',status:response.status}));
      return json({error:'AI suggestion is temporarily unavailable.'},503);
    }
    const body=await response.json();const text=extractText(body).trim();
    const candidate=JSON.parse(text.replace(/^```json\s*/i,'').replace(/```$/,'').trim());
    const suggestion=cleanSuggestion(candidate);
    return json({suggestion,model:env.APC_PATHWAYS_AI_MODEL||'gpt-5.6-luna',humanConfirmationRequired:true});
  }catch(error){
    console.error(JSON.stringify({message:'Pathways AI suggestion failed',errorType:String(error?.name||'Error')}));
    return json({error:'AI suggestion could not be generated. Keep the narrative and enter only the fields you can confirm.'},503);
  }
}

export async function onRequest(context){
  if(context.request.method!=='POST')return json({error:'Method not allowed.'},405,{Allow:'POST'});
  return onRequestPost(context);
}
