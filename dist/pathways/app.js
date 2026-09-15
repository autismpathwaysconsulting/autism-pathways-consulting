import {
  PATHWAYS_DOMAINS,
  PATHWAYS_OBJECTIVE_RESULTS,
  PATHWAYS_WEEKDAYS,
  createEmptyPathwaysState,
} from './schema.js';
import {
  DOMAIN_META,
  OVERVIEW_OPTIONS,
  collapseConsecutiveSlots,
  currentSubjects,
  dateForDay,
  datedDayKey,
  datedLessonKey,
  effectivePinStatus,
  formatShortDate,
  moveWeek,
  objectiveStats,
  outputFor,
  startOfWeek,
  weekKey,
} from './model.js';

const $ = id => document.getElementById(id);
const STATUS = [
  ['routine','Routine / nothing notable'],
  ['noAide','No direct aide support'],
  ['support','Additional support used'],
  ['voice','Communication / autonomy worth noting'],
  ['event','Important event'],
];
const PARTICIPATION = ['Full access / participation','Partial','Limited at that time','Not observed / unclear'];
const AUTONOMY = ['Initiated','Made a choice','Asked for help','Requested clarification','Communicated a need','Self-advocated','Accepted support','Declined support','Used known support independently'];
const QUICK_NOTES = [
  'Participated steadily and followed the teacher’s instruction.',
  'Worked independently using the teacher’s examples / notes.',
  'No direct aide support was needed in this lesson.',
  'Needed light support to get started, then continued with less support.',
  'Needed an additional explanation to understand the task.',
  'Asked the teacher for clarification and then continued.',
  'Used written notes / visual information to complete the task.',
  'Re-engaged with the lesson after brief support.',
];
const TASK_TYPES = ['Teacher instruction / explanation','Warm-up','Independent work','Worksheet','Note-taking','Reading / comprehension','Writing','Quiz','Group work','Discussion','Practical activity','Transition','Assessment','Review / reflection','Other'];
const TASK_OUTCOMES = ['Completed / accessed','Partially completed / accessed','Ongoing','Not completed / not accessed','Student declined / opted out','Not required','Unclear'];

let user = null;
let csrfToken = '';
let organizations = [];
let organizationId = '';
let students = [];
let studentId = '';
let record = null;
let state = null;
let revisions = [];
let currentDay = preferredDay();
let activeWeek = startOfWeek(new Date());
let outputView = 'parent';
let editingKey = null;
let editingTime = '';
let editingSubject = '';
let formData = null;
let editingObjectiveId = null;
let selectedRevision = null;
let currentConsents = [];
let adminUsers = [];
let currentAssignments = [];
let historicalEditConfirmedFor = '';

function preferredDay(){
  const name = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
  return PATHWAYS_WEEKDAYS.includes(name) ? name : 'Monday';
}

function uid(prefix){return `${prefix}-${crypto.randomUUID()}`}
function clone(value){return JSON.parse(JSON.stringify(value))}
function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function selectedOrg(){return organizations.find(item=>item.organization_id===organizationId)||null}
function selectedStudent(){return students.find(item=>item.student_id===studentId)||null}
function currentMembership(){return user?.memberships?.find(item=>item.organization_id===organizationId)||null}
function currentRole(){return user?.platformAdmin?'platform-admin':currentMembership()?.role||''}
function canAdmin(){return user?.platformAdmin || ['admin','senco'].includes(currentRole())}
function canManageUsers(){return user?.platformAdmin || currentRole()==='admin'}
function canRestore(){return canAdmin() && record?.permission!=='read'}
function canEdit(){return Boolean(record && record.permission!=='read')}
function localDateKeyForZone(timeZone='Asia/Kuala_Lumpur'){
  try{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    if(values.year&&values.month&&values.day)return `${values.year}-${values.month}-${values.day}`;
  }catch{}
  const now=new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

function setSaveStatus(kind,text){
  const dot=$('saveDot'); dot.className=`dot ${kind||''}`; $('saveText').textContent=text;
}

function showError(message){
  window.alert(message);
}

async function api(path,{method='GET',body=null}={}){
  const headers={Accept:'application/json'};
  if(body!==null){
    headers['Content-Type']='application/json';
    headers['X-Pathways-Request']='1';
    if(csrfToken) headers['X-Pathways-CSRF']=csrfToken;
  }
  const response=await fetch(path,{method,headers,body:body===null?undefined:JSON.stringify(body),credentials:'same-origin'});
  const type=response.headers.get('Content-Type')||'';
  const data=type.includes('application/json')?await response.json().catch(()=>({})):{};
  if(response.status===401 && path!=='/api/pathways/login'){
    showLogin();
    throw new Error(data.error||'Session expired.');
  }
  if(!response.ok){
    const error=new Error(data.error||`Request failed (${response.status}).`);
    error.status=response.status; error.data=data; throw error;
  }
  return data;
}

function showLogin(){
  $('appView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
}
function showApp(){
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
}

async function init(){
  bindStaticEvents();
  try{
    const me=await api('/api/pathways/me');
    user=me.user; csrfToken=me.csrfToken; showApp(); await loadOrganizations();
  }catch(error){
    if(error.status!==401) console.error(error);
    showLogin();
  }
}

async function login(event){
  event.preventDefault(); $('loginError').classList.add('hidden');
  try{
    const result=await api('/api/pathways/login',{method:'POST',body:{email:$('loginEmail').value,password:$('loginPassword').value}});
    user=result.user; csrfToken=result.csrfToken; $('loginPassword').value=''; showApp(); await loadOrganizations();
  }catch(error){
    $('loginError').textContent=error.message; $('loginError').classList.remove('hidden');
  }
}

async function logout(){
  try{await api('/api/pathways/logout',{method:'POST',body:{}})}catch{}
  user=null;csrfToken='';organizations=[];students=[];state=null;record=null;showLogin();
}

async function loadOrganizations(){
  const data=await api('/api/pathways/organizations');
  organizations=data.organizations||[];
  if(!organizationId || !organizations.some(item=>item.organization_id===organizationId)) organizationId=organizations[0]?.organization_id||'';
  $('orgSelect').innerHTML=organizations.map(item=>`<option value="${escapeHtml(item.organization_id)}">${escapeHtml(item.name)}</option>`).join('');
  $('orgSelect').value=organizationId;
  $('userName').textContent=user.displayName;
  $('userRole').textContent=currentRole()||'No organisation role';
  $('adminNav').classList.toggle('hidden',!canAdmin());
  await loadStudents();
}

async function loadStudents(preferredId=''){
  if(!organizationId){students=[];studentId='';renderNoStudent();return}
  const data=await api(`/api/pathways/students?organizationId=${encodeURIComponent(organizationId)}`);
  students=data.students||[];
  if(preferredId && students.some(item=>item.student_id===preferredId)) studentId=preferredId;
  else if(!studentId || !students.some(item=>item.student_id===studentId)) studentId=students[0]?.student_id||'';
  $('studentSelect').innerHTML=students.length?students.map(item=>`<option value="${escapeHtml(item.student_id)}">${escapeHtml(item.display_name)}</option>`).join(''):'<option value="">No students</option>';
  $('studentSelect').value=studentId;
  if(studentId) await loadStudent(); else renderNoStudent();
  if(canAdmin()) await renderAdmin();
}

function renderNoStudent(){
  state=null;record=null;$('emptyState').classList.remove('hidden');
  ['dailyScreen','historyScreen','objectivesScreen'].forEach(id=>$(id).classList.add('hidden'));
  $('studentHeading').textContent='No student selected';
}

async function loadStudent(){
  if(!studentId){renderNoStudent();return}
  setSaveStatus('saving','Loading');
  try{
    const [stateData,consentData]=await Promise.all([
      api(`/api/pathways/state?studentId=${encodeURIComponent(studentId)}&history=1&limit=40`),
      api(`/api/pathways/consents?studentId=${encodeURIComponent(studentId)}`),
    ]);
    record={...stateData.record,permission:stateData.permission,role:stateData.role};
    state=clone(stateData.record.state);
    revisions=stateData.revisions||[];
    currentConsents=consentData.consents||[];
    $('emptyState').classList.add('hidden');
    $('studentHeading').textContent=stateData.student.display_name;
    $('readOnlyWarning').classList.toggle('hidden',canEdit());
    updateAuthorityWarning(stateData.student);
    renderAll();
    setSaveStatus('saved','Saved');
  }catch(error){setSaveStatus('error','Load error');showError(error.message)}
}

function updateAuthorityWarning(student){
  const synthetic=student?.external_ref==='SYNTHETIC-DEMO';
  const applicable=currentConsents
    .filter(item=>['pilot-use','school-record'].includes(item.consent_type))
    .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||String(b.consent_id||'').localeCompare(String(a.consent_id||'')));
  const latest=applicable[0]||null;
  const today=localDateKeyForZone(selectedOrg()?.timezone||'Asia/Kuala_Lumpur');
  const expiry=latest?.expires_at?String(latest.expires_at).slice(0,10):'';
  const has=Boolean(latest&&['granted','not-required'].includes(latest.status)&&(!expiry||expiry>=today));
  $('authorityWarning').classList.toggle('hidden',synthetic||has);
}

async function persist(action='edit'){
  if(!canEdit()) throw new Error('This workspace is read-only.');
  setSaveStatus('saving','Saving');
  const requestId=`web:${Date.now()}:${crypto.randomUUID()}`;
  try{
    const result=await api('/api/pathways/state',{method:'PUT',body:{studentId,expectedRevision:record.revision,requestId,action,state}});
    record={...result.record,permission:record.permission,role:record.role};
    state=clone(result.record.state);
    revisions.unshift({revision:record.revision,action:record.lastAction,created_at:record.updatedAt,actor_user_id:record.updatedBy,state_hash:record.stateHash,request_id:record.lastRequestId});
    revisions=[...new Map(revisions.map(item=>[item.revision,item])).values()].sort((a,b)=>b.revision-a.revision).slice(0,40);
    setSaveStatus('saved','Saved');
    return true;
  }catch(error){
    setSaveStatus('error',error.status===409?'Conflict':'Save error');
    if(error.status===403 && error.data?.authorityBlocked){
      $('authorityWarning').classList.remove('hidden');
      throw error;
    }
    if(error.status===409){
      showError('This student record changed in another session. Pathways will reload the latest version rather than overwrite it.');
      await loadStudent();
      return false;
    }
    throw error;
  }
}

function renderAll(){
  if(!state)return;
  renderWeek();renderDays();renderPins();renderSubjects();renderOverview();renderObjectiveSummary();renderOutput();renderObjectives();renderHistory();
  $('addPinBtn').disabled=!canEdit();$('quickObjectiveBtn').disabled=!canEdit();$('addObjectiveBtn').disabled=!canEdit();$('saveOverviewBtn').disabled=!canEdit();
}

function renderWeek(){
  const start=startOfWeek(activeWeek);const end=new Date(start);end.setDate(end.getDate()+4);
  $('weekLabel').textContent=`${formatShortDate(start)} – ${formatShortDate(end)}`;
}

function renderDays(){
  $('dayTabs').innerHTML=PATHWAYS_WEEKDAYS.map(day=>`<button class="day ${day===currentDay?'active':''}" data-day="${day}">${day.slice(0,3)}</button>`).join('');
  $('dayHeading').textContent=`${currentDay} · ${formatShortDate(dateForDay(currentDay,activeWeek))}`;
}

function renderPins(){
  const visible=(state.pins||[]).filter(pin=>!['Done','Archived'].includes(effectivePinStatus(pin,new Date()))).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  $('pinList').innerHTML=visible.length?visible.map(pin=>{
    const status=effectivePinStatus(pin,new Date());
    return `<div class="item"><div class="section-head"><div><div class="item-title">${escapeHtml(pin.title)}</div><div class="meta"><span class="pill">${escapeHtml(pin.type)}</span>${pin.subject?`<span>${escapeHtml(pin.subject)}</span>`:''}${pin.due?`<span>${status==='Overdue'?'Overdue · ':''}${escapeHtml(pin.due)}</span>`:''}${pin.parent?'<span class="pill good">Parent-visible</span>':'<span class="pill">Internal</span>'}</div>${pin.details?`<div class="item-copy">${escapeHtml(pin.details)}</div>`:''}</div>${canEdit()?`<button class="btn secondary small" data-pin-done="${escapeHtml(pin.id)}">Done</button>`:''}</div></div>`;
  }).join(''):'<div class="muted-box">No open homework, upcoming tasks or announcements.</div>';
}

function renderSubjects(){
  const entries=currentSubjects(state,currentDay,activeWeek);let saved=0;
  for(const entry of entries) if(entry.data?.saved)saved++;
  $('savedCount').textContent=`${saved}/${entries.length} saved`;
  $('subjectList').innerHTML=entries.length?entries.map(({time,subject,key,data})=>{
    const status=data?.saved?'Saved':data?.skipped?'Not reported':'Not saved';
    const preview=data?.narrative||(data?.skipped?'Not reported today':'Open to add the normal subject report.');
    const domains=(data?.domains||[]).map(code=>`<span class="pill" style="border-left:3px solid ${DOMAIN_META[code]?.[1]||'#475569'}">${code}</span>`).join('');
    return `<article class="item"><div class="time-cell">${escapeHtml(time)}</div><div><div><span class="item-title">${escapeHtml(subject)}</span> <span class="pill ${data?.saved?'good':''}">${status}</span></div><div class="item-copy">${escapeHtml(preview)}</div><div class="meta">${domains}</div></div><button class="btn secondary small" data-subject-key="${escapeHtml(key)}" data-time="${escapeHtml(time)}" data-subject="${escapeHtml(subject)}">${canEdit()?'Open':'View'}</button></article>`;
  }).join(''):'<div class="muted-box">No timetable blocks configured for this day. Administrators can set up the timetable from Administration.</div>';
}

function renderOverview(){
  const key=datedDayKey(currentDay,activeWeek);const data=state.overview[key]||{};
  $('overviewChoices').innerHTML=OVERVIEW_OPTIONS.map(([id,label])=>`<button class="choice ${data.choice===id?'selected':''}" data-overview="${id}" ${canEdit()?'':'disabled'}>${escapeHtml(label)}</button>`).join('');
  $('overviewNote').value=data.note||'';$('overviewNote').disabled=!canEdit();
}

function renderObjectiveSummary(){
  const active=(state.objectives||[]).filter(item=>item.status==='active');
  $('objectiveSummary').innerHTML=active.length?active.map(objective=>{
    const stats=objectiveStats(state.subjects,objective.id);
    return `<div class="item"><div class="item-title">${escapeHtml(objective.target)}</div><div class="meta"><span class="pill">${objective.domain}</span><span>${stats.met}/${stats.measured} met</span>${stats.notMeasured?`<span>${stats.notMeasured} not measured</span>`:''}</div></div>`;
  }).join(''):'<div class="muted-box">No active objectives.</div>';
}

function renderOutput(){
  $('outputText').textContent=outputFor(outputView,{state,dayName:currentDay,baseDate:activeWeek});
  document.querySelectorAll('.output-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.output===outputView));
  $('openWhatsApp').classList.toggle('hidden',outputView!=='parent');
}

function renderObjectives(){
  const items=state.objectives||[];
  $('objectiveList').innerHTML=items.length?items.map(objective=>{
    const stats=objectiveStats(state.subjects,objective.id);const meta=DOMAIN_META[objective.domain];
    return `<div class="item"><div class="section-head"><div><div class="item-title">${escapeHtml(objective.target)}</div><div class="item-copy">${escapeHtml(objective.condition)}${objective.support?` · with ${escapeHtml(objective.support)}`:''}</div><div class="meta"><span class="pill" style="border-left:3px solid ${meta?.[1]||'#475569'}">${objective.domain}</span><span class="pill ${objective.status==='active'?'good':''}">${escapeHtml(objective.status)}</span><span>${stats.measured} measured</span><span>${stats.met} met</span><span>Review ${escapeHtml(objective.review)}</span><span>${escapeHtml(objective.measureType||'criterion')}</span></div></div>${canEdit()?`<button class="btn secondary small" data-edit-objective="${escapeHtml(objective.id)}">Edit</button>`:''}</div></div>`;
  }).join(''):'<div class="muted-box">No objectives yet.</div>';
}

function renderHistory(){
  $('revisionList').innerHTML=revisions.length?revisions.map(item=>`<button class="item history-row" data-revision="${item.revision}"><div class="item-title">Revision ${item.revision}</div><div class="meta"><span>${escapeHtml(item.action||'edit')}</span><span>${escapeHtml(item.created_at||item.createdAt||'')}</span></div></button>`).join(''):'<div class="muted-box">No revision history available.</div>';
}

function historicalEditGuard(){
  const selected=weekKey(activeWeek),current=weekKey(new Date());
  if(selected===current)return true;
  if(historicalEditConfirmedFor===selected)return true;
  const ok=window.confirm(`You are editing the week beginning ${selected}, not the current week. Continue?`);
  if(ok)historicalEditConfirmedFor=selected;
  return ok;
}

function openSubject(key,time,subject){
  if(canEdit()&&!historicalEditGuard())return;
  editingKey=key;editingTime=time;editingSubject=subject;
  const existing=state.subjects[key]||{};
  formData={
    status:existing.status||'routine',narrative:existing.narrative||'',participation:existing.participation||'',
    aideLevel:existing.aideLevel||'None',supportSource:existing.supportSource||'Teacher',supportPurpose:existing.supportPurpose||'Understanding / clarification',
    autonomy:[...(existing.autonomy||[])],domains:[...(existing.domains||[])],eventObservation:existing.eventObservation||'',eventUncertainty:existing.eventUncertainty||'',
    tasks:clone(existing.tasks||[]),saved:Boolean(existing.saved),skipped:Boolean(existing.skipped),
  };
  $('subjectTime').textContent=`${time} · ${formatShortDate(dateForDay(currentDay,activeWeek))}`;$('subjectName').textContent=subject;$('narrative').value=formData.narrative;
  $('aideLevel').value=formData.aideLevel;$('supportSource').value=formData.supportSource;$('supportPurpose').value=formData.supportPurpose;$('eventObservation').value=formData.eventObservation;$('eventUncertainty').value=formData.eventUncertainty;
  renderSubjectForm();
  for(const el of $('subjectForm').querySelectorAll('input,textarea,select,button')) if(el.value!=='cancel') el.disabled=!canEdit() && !el.classList.contains('icon-btn');
  $('subjectDialog').showModal();
}

function renderSubjectForm(){
  $('statusChoices').innerHTML=STATUS.map(([id,label])=>`<button type="button" class="choice ${formData.status===id?'selected':''}" data-status="${id}">${escapeHtml(label)}</button>`).join('');
  $('quickNotes').innerHTML=QUICK_NOTES.map(note=>`<button type="button" class="chip" data-quick-note="${escapeHtml(note)}">${escapeHtml(note)}</button>`).join('');
  $('participationChoices').innerHTML=PARTICIPATION.map(value=>`<button type="button" class="choice ${formData.participation===value?'selected':''}" data-participation="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join('');
  $('autonomyChoices').innerHTML=AUTONOMY.map(value=>`<button type="button" class="chip ${formData.autonomy.includes(value)?'selected':''}" data-autonomy="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join('');
  $('domainChoices').innerHTML=PATHWAYS_DOMAINS.map(code=>`<button type="button" class="domain ${formData.domains.includes(code)?'selected':''}" style="--domain:${DOMAIN_META[code]?.[1]||'#475569'}" data-domain="${code}"><strong>${code}</strong><small>${escapeHtml(DOMAIN_META[code]?.[0]||code)}</small></button>`).join('');
  renderTasks();
  if(['support','voice','event'].includes(formData.status)) $('moreDetail').open=true;
}

function renderTasks(){
  const activeObjectives=(state.objectives||[]).filter(item=>item.status==='active');
  $('taskList').innerHTML=formData.tasks.length?formData.tasks.map((task,index)=>{
    const objective=activeObjectives.find(item=>item.id===task.objectiveId);const measure=objective?.measureType||'criterion';
    const objectiveOptions=['<option value="">No objective measurement</option>',...activeObjectives.map(item=>`<option value="${escapeHtml(item.id)}" ${task.objectiveId===item.id?'selected':''}>${item.domain} · ${escapeHtml(item.target)}</option>`)].join('');
    const resultOptions=['<option value="">Select result</option>',...PATHWAYS_OBJECTIVE_RESULTS.map(value=>`<option ${task.objectiveResult===value?'selected':''}>${escapeHtml(value)}</option>`)].join('');
    let measurement='';
    if(task.objectiveId && measure!=='criterion'){
      const units={latency:'seconds',duration:'minutes',frequency:'count',accuracy:'percent'};
      measurement=`<label>${measure[0].toUpperCase()+measure.slice(1)}<div class="row"><input class="task-measure" type="number" min="0" step="0.1" value="${task.measurementValue??''}"><span class="pill">${units[measure]}</span></div></label>`;
    }
    return `<div class="task" data-task-index="${index}"><div class="section-head"><strong>Task ${index+1}</strong><button type="button" class="btn ghost small" data-remove-task="${index}">Remove</button></div><div class="task-grid"><label>Task<input class="task-label" value="${escapeHtml(task.label||'')}"></label><label>Type<select class="task-type">${TASK_TYPES.map(value=>`<option ${task.type===value?'selected':''}>${escapeHtml(value)}</option>`).join('')}</select></label><label>Outcome<select class="task-outcome">${TASK_OUTCOMES.map(value=>`<option ${task.outcome===value?'selected':''}>${escapeHtml(value)}</option>`).join('')}</select></label></div><label>Internal detail<textarea class="task-detail" rows="2">${escapeHtml(task.detail||'')}</textarea></label><label class="check-row"><input class="task-parent" type="checkbox" ${task.includeParent?'checked':''}>Include this task in the parent / WhatsApp report</label><div class="task-more"><label>Objective<select class="task-objective">${objectiveOptions}</select></label><label>Opportunity result<select class="task-result" ${task.objectiveId?'':'disabled'}>${resultOptions}</select></label></div>${measurement}</div>`;
  }).join(''):'<div class="muted-box">No task breakdown needed. Add tasks only when they clarify the lesson or measure an objective.</div>';
}

async function saveSubject(){
  formData.narrative=$('narrative').value.trim();formData.aideLevel=$('aideLevel').value;formData.supportSource=$('supportSource').value;formData.supportPurpose=$('supportPurpose').value;formData.eventObservation=$('eventObservation').value.trim();formData.eventUncertainty=$('eventUncertainty').value.trim();
  if(!formData.participation)formData.participation='Not observed / unclear';
  state.subjects[editingKey]={...formData,saved:true,skipped:false};
  try{if(await persist('edit')){$('subjectDialog').close();renderAll()}}catch(error){showError(error.message)}
}

async function markNotReported(){
  const existing=state.subjects[editingKey];
  if(existing?.saved&&!window.confirm('This lesson already has a saved report. Replace it with “Not reported today”?'))return;
  state.subjects[editingKey]={saved:false,skipped:true,status:'',narrative:'',participation:'Not observed / unclear',aideLevel:'None',supportSource:'',supportPurpose:'',autonomy:[],domains:[],eventObservation:'',eventUncertainty:'',tasks:[]};
  try{if(await persist('edit')){$('subjectDialog').close();renderAll()}}catch(error){showError(error.message)}
}

async function saveOverview(){
  const key=datedDayKey(currentDay,activeWeek);const old=state.overview[key]||{};state.overview[key]={...old,note:$('overviewNote').value.trim()};
  try{if(await persist('edit'))renderAll()}catch(error){showError(error.message)}
}

function openPin(){
  if(!canEdit())return;$('pinDialog').querySelector('form').reset();$('pinParent').value='yes';$('pinDialog').showModal();
}
async function savePin(){
  const title=$('pinTitle').value.trim();if(!title){showError('Add a short title.');return}
  state.pins.push({id:uid('pin'),type:$('pinType').value,subject:$('pinSubject').value.trim(),title,details:$('pinDetails').value.trim(),due:$('pinDue').value,parent:$('pinParent').value==='yes',status:'Open'});
  try{if(await persist('edit')){$('pinDialog').close();renderAll()}}catch(error){showError(error.message)}
}
async function donePin(id){
  const pin=state.pins.find(item=>item.id===id);if(!pin)return;pin.status='Done';try{if(await persist('edit'))renderAll()}catch(error){showError(error.message)}
}

function openObjective(id=''){
  if(!canEdit())return;editingObjectiveId=id;const objective=state.objectives.find(item=>item.id===id)||null;
  $('objectiveDialogTitle').textContent=objective?'Edit objective':'Add measurable objective';
  $('objDomain').innerHTML=PATHWAYS_DOMAINS.map(code=>`<option value="${code}">${code} · ${escapeHtml(DOMAIN_META[code]?.[0]||code)}</option>`).join('');
  $('objDomain').value=objective?.domain||'AUT';$('objStatus').value=objective?.status||'active';$('objTarget').value=objective?.target||'';$('objCondition').value=objective?.condition||'';$('objSupport').value=objective?.support||'';$('objCriterion').value=objective?.criterion||'';$('objMeasure').value=objective?.measureType||'criterion';$('objReview').value=objective?.review||'';
  $('objectiveDialog').showModal();
}
async function saveObjective(){
  const draft={id:editingObjectiveId||uid('obj'),domain:$('objDomain').value,target:$('objTarget').value.trim(),condition:$('objCondition').value.trim(),support:$('objSupport').value.trim(),criterion:$('objCriterion').value.trim(),review:$('objReview').value,status:$('objStatus').value,measureType:$('objMeasure').value,supersedesId:''};
  if(!draft.target||!draft.condition||!draft.criterion||!draft.review){showError('Target, context/condition, criterion and review date are required.');return}
  const index=state.objectives.findIndex(item=>item.id===draft.id);if(index>=0)state.objectives[index]=draft;else state.objectives.push(draft);
  try{if(await persist('edit')){$('objectiveDialog').close();renderAll()}}catch(error){showError(error.message)}
}

async function loadRevision(revision){
  try{
    const data=await api(`/api/pathways/state?studentId=${encodeURIComponent(studentId)}&revision=${revision}`);selectedRevision=data.revision;
    $('revisionHeading').textContent=`Revision ${revision} · ${data.revision.action}`;
    const snapshot=data.revision.state;const lessonCount=Object.values(snapshot.subjects||{}).filter(item=>item.saved).length;
    $('revisionPreview').textContent=JSON.stringify({createdAt:data.revision.created_at,actorUserId:data.revision.actor_user_id,action:data.revision.action,summary:{savedLessons:lessonCount,objectives:(snapshot.objectives||[]).length,persistentItems:(snapshot.pins||[]).length},state:snapshot},null,2);
    $('restoreRevision').classList.toggle('hidden',!canRestore()||Number(revision)===record.revision);
  }catch(error){showError(error.message)}
}
async function restoreRevision(){
  if(!selectedRevision||!canRestore())return;
  if(!window.confirm(`Restore revision ${selectedRevision.revision}? The current state will remain available in history.`))return;
  try{
    const result=await api('/api/pathways/state',{method:'POST',body:{action:'restore',studentId,revision:selectedRevision.revision,expectedRevision:record.revision,requestId:`restore:${Date.now()}:${crypto.randomUUID()}`}});
    if(result.conflict){showError('The record changed before restore. Reloading.');await loadStudent();return}
    await loadStudent();showError(`Revision ${selectedRevision.revision} restored as a new revision.`);
  }catch(error){showError(error.message)}
}

async function renderAdmin(){
  if(!canAdmin())return;
  try{
    const usersData=await api(`/api/pathways/users?organizationId=${encodeURIComponent(organizationId)}`);adminUsers=usersData.users||[];
    $('newUserBtn').classList.toggle('hidden',!canManageUsers());
    $('adminStudents').innerHTML=students.length?students.map(item=>`<button class="item" data-admin-student="${escapeHtml(item.student_id)}"><div class="item-title">${escapeHtml(item.display_name)}</div><div class="meta"><span>${escapeHtml(item.year_group||'')}</span><span>${escapeHtml(item.external_ref||'No external ref')}</span></div></button>`).join(''):'<div class="muted-box">No students.</div>';
    $('adminUsers').innerHTML=adminUsers.length?adminUsers.map(item=>`<div class="item"><div class="item-title">${escapeHtml(item.display_name)}</div><div class="item-copy">${escapeHtml(item.email)}</div><div class="meta"><span class="pill">${escapeHtml(item.role)}</span><span>${item.membership_active?'Active':'Inactive'}</span></div></div>`).join(''):'<div class="muted-box">No staff users.</div>';
    await renderStudentAdminPanel();await loadAudit();
  }catch(error){showError(error.message)}
}

async function renderStudentAdminPanel(){
  const student=selectedStudent();if(!student){$('studentAdminPanel').innerHTML='Select a student.';return}
  try{
    const [assignmentData,consentData]=await Promise.all([
      api(`/api/pathways/assignments?studentId=${encodeURIComponent(studentId)}`),
      api(`/api/pathways/consents?studentId=${encodeURIComponent(studentId)}`),
    ]);
    currentAssignments=assignmentData.assignments||[];currentConsents=consentData.consents||[];updateAuthorityWarning(student);
    const assigned=new Set(currentAssignments.map(item=>item.user_id));
    const assignable=adminUsers.filter(item=>!assigned.has(item.user_id));
    $('studentAdminPanel').innerHTML=`<div><strong>${escapeHtml(student.display_name)}</strong><div class="meta"><span>${escapeHtml(student.year_group||'')}</span><span>${escapeHtml(student.external_ref||'No reference')}</span></div></div><div class="row"><button class="btn secondary small" id="recordAuthorityBtn">Record authority</button><button class="btn secondary small" id="editTimetableBtn">Timetable setup</button><button class="btn secondary small" id="exportStudentBtn">Export</button><button class="btn secondary small" id="exportHistoryBtn">Export + history</button></div><h3>Authority / consent</h3>${currentConsents.length?currentConsents.map(item=>`<div class="item"><div class="item-title">${escapeHtml(item.consent_type)} · ${escapeHtml(item.status)}</div><div class="item-copy">${escapeHtml(item.authority_label||'')}${item.expires_at?` · Expires ${escapeHtml(String(item.expires_at).slice(0,10))}`:''}</div></div>`).join(''):'<div class="muted-box">No authority record yet.</div>'}<h3>Assigned staff</h3>${currentAssignments.length?currentAssignments.map(item=>`<div class="item"><div class="section-head"><div><div class="item-title">${escapeHtml(item.display_name)}</div><div class="meta"><span>${escapeHtml(item.role||'')}</span><span>${escapeHtml(item.permission)}</span></div></div><button class="btn ghost small" data-remove-assignment="${escapeHtml(item.assignment_id)}">Remove</button></div></div>`).join(''):'<div class="muted-box">No explicit assignments. Admin/SENCO access is organisation-wide.</div>'}${assignable.length?`<div class="row"><select id="assignUserSelect">${assignable.map(item=>`<option value="${escapeHtml(item.user_id)}">${escapeHtml(item.display_name)} · ${escapeHtml(item.role)}</option>`).join('')}</select><select id="assignPermission"><option value="edit">Edit</option><option value="read">Read only</option></select><button id="assignUserBtn" class="btn secondary small">Assign</button></div>`:''}${canManageUsers()?'<div class="row"><button id="eraseStudentBtn" class="btn danger small">Erase student record</button></div>':''}`;
  }catch(error){$('studentAdminPanel').textContent=error.message}
}

async function loadAudit(){
  if(!canAdmin())return;
  try{
    const data=await api(`/api/pathways/audit?organizationId=${encodeURIComponent(organizationId)}&limit=60`);
    $('auditList').innerHTML=(data.events||[]).length?data.events.map(event=>`<div class="item"><div class="item-title">${escapeHtml(event.action)} · ${escapeHtml(event.entity_type)}</div><div class="meta"><span>${escapeHtml(event.actor_name||event.actor_user_id||'system')}</span><span>${escapeHtml(event.created_at)}</span></div></div>`).join(''):'<div class="muted-box">No audit events.</div>';
  }catch(error){$('auditList').textContent=error.message}
}

async function createStudent(){
  const displayName=$('newStudentName').value.trim();if(!displayName){showError('Add a display name or pilot alias.');return}
  try{
    const result=await api('/api/pathways/students',{method:'POST',body:{organizationId,displayName,externalRef:$('newStudentRef').value.trim(),yearGroup:$('newStudentYear').value.trim(),state:createEmptyPathwaysState()}});
    $('studentDialog').close();await loadStudents(result.student.student_id);showError('Student workspace created. Record the appropriate use authority before entering support data.');
  }catch(error){showError(error.message)}
}
async function createUser(){
  try{
    await api('/api/pathways/users',{method:'POST',body:{organizationId,displayName:$('newUserName').value.trim(),email:$('newUserEmail').value.trim(),role:$('newUserRole').value,password:$('newUserPassword').value}});
    $('userDialog').close();await renderAdmin();showError('User created. Share the temporary password through an appropriate private channel and reset it if needed.');
  }catch(error){showError(error.message)}
}
async function saveConsent(){
  if(!studentId)return;
  try{
    await api('/api/pathways/consents',{method:'POST',body:{studentId,consentType:$('consentType').value,status:$('consentStatus').value,grantedAt:$('consentGrantedAt').value||null,expiresAt:$('consentExpiresAt').value||null,authorityLabel:$('consentAuthority').value.trim(),referenceNote:$('consentNote').value.trim()}});
    $('consentDialog').close();currentConsents=(await api(`/api/pathways/consents?studentId=${encodeURIComponent(studentId)}`)).consents||[];updateAuthorityWarning(selectedStudent());await renderStudentAdminPanel();
  }catch(error){showError(error.message)}
}
async function assignUser(){
  const userId=$('assignUserSelect')?.value;if(!userId)return;
  try{await api('/api/pathways/assignments',{method:'POST',body:{studentId,userId,permission:$('assignPermission').value}});await renderStudentAdminPanel()}catch(error){showError(error.message)}
}
async function removeAssignment(id){
  if(!window.confirm('Remove this explicit student assignment?'))return;
  try{await api(`/api/pathways/assignments?assignmentId=${encodeURIComponent(id)}`,{method:'DELETE',body:{}});await renderStudentAdminPanel()}catch(error){showError(error.message)}
}

function exportStudent(history=false){
  if(!studentId)return;window.open(`/api/pathways/export?studentId=${encodeURIComponent(studentId)}${history?'&history=1':''}`,'_blank','noopener');
}

async function eraseStudent(){
  const student=selectedStudent();if(!student)return;
  if(!window.confirm(`Erase ${student.display_name}'s Pathways workspace and all support-state history? This cannot be undone.`))return;
  const typed=window.prompt(`Type the exact internal student ID to confirm:\n${student.student_id}`);
  if(typed!==student.student_id){showError('Erasure cancelled because the confirmation did not match.');return}
  try{
    await api('/api/pathways/privacy',{method:'POST',body:{action:'erase-student',studentId:student.student_id,confirmStudentId:typed,reasonCode:'request'}});
    studentId='';await loadStudents();showError('Student Pathways workspace erased. A minimal non-content erasure log remains.');
  }catch(error){showError(error.message)}
}

function ensureTimetableDialog(){
  let dialog=$('timetableDialog');if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='timetableDialog';dialog.innerHTML=`<form method="dialog"><div class="dialog-head"><h2>Timetable setup</h2><button class="icon-btn" value="cancel" aria-label="Close">×</button></div><div class="dialog-body"><p class="muted">One block per line: <strong>Day | time range | subject</strong></p><textarea id="timetableText" rows="16" placeholder="Monday | 09:00–09:55 | EAL\nMonday | 10:55–11:50 | Science"></textarea><p class="tiny muted">Consecutive identical subjects can be entered as one combined block.</p></div><div class="dialog-actions"><button value="cancel" class="btn ghost">Cancel</button><button id="saveTimetableBtn" type="button" class="btn primary">Save timetable</button></div></form>`;document.body.appendChild(dialog);$('saveTimetableBtn').onclick=saveTimetable;return dialog;
}
function editTimetable(){
  if(!canEdit())return;const dialog=ensureTimetableDialog();const lines=[];for(const day of PATHWAYS_WEEKDAYS)for(const [time,subject] of state.timetable[day]||[])lines.push(`${day} | ${time} | ${subject}`);$('timetableText').value=lines.join('\n');dialog.showModal();
}
async function saveTimetable(){
  const next=Object.fromEntries(PATHWAYS_WEEKDAYS.map(day=>[day,[]]));const lines=$('timetableText').value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  for(const [index,line] of lines.entries()){
    const parts=line.split('|').map(item=>item.trim());if(parts.length!==3||!PATHWAYS_WEEKDAYS.includes(parts[0])||!parts[1]||!parts[2]){showError(`Timetable line ${index+1} is invalid.`);return}next[parts[0]].push([parts[1],parts[2]]);
  }
  state.timetable=next;try{if(await persist('edit')){ensureTimetableDialog().close();renderAll()}}catch(error){showError(error.message)}
}

function bindStaticEvents(){
  $('loginForm').addEventListener('submit',login);$('logoutBtn').onclick=logout;
  $('orgSelect').onchange=async event=>{organizationId=event.target.value;studentId='';$('userRole').textContent=currentRole();$('adminNav').classList.toggle('hidden',!canAdmin());await loadStudents()};
  $('studentSelect').onchange=async event=>{studentId=event.target.value;await loadStudent();if(canAdmin())await renderAdmin()};
  document.querySelectorAll('.nav').forEach(btn=>btn.onclick=async()=>{document.querySelectorAll('.nav').forEach(item=>item.classList.toggle('active',item===btn));document.querySelectorAll('.screen').forEach(screen=>screen.classList.add('hidden'));const target=$(`${btn.dataset.screen}Screen`);if(target)target.classList.remove('hidden');if(btn.dataset.screen==='admin')await renderAdmin();if(btn.dataset.screen==='history')renderHistory()});
  $('dayTabs').onclick=event=>{const btn=event.target.closest('[data-day]');if(!btn)return;currentDay=btn.dataset.day;renderAll()};
  $('prevWeek').onclick=()=>{activeWeek=moveWeek(activeWeek,-1);currentDay='Monday';renderAll()};$('nextWeek').onclick=()=>{activeWeek=moveWeek(activeWeek,1);currentDay='Monday';renderAll()};$('currentWeek').onclick=()=>{activeWeek=startOfWeek(new Date());currentDay=preferredDay();historicalEditConfirmedFor='';renderAll()};
  $('subjectList').onclick=event=>{const btn=event.target.closest('[data-subject-key]');if(btn)openSubject(btn.dataset.subjectKey,btn.dataset.time,btn.dataset.subject)};
  $('statusChoices').onclick=event=>{const btn=event.target.closest('[data-status]');if(!btn||!canEdit())return;formData.status=btn.dataset.status;renderSubjectForm()};
  $('quickNotes').onclick=event=>{const btn=event.target.closest('[data-quick-note]');if(!btn||!canEdit())return;const ta=$('narrative');ta.value=[ta.value.trim(),btn.dataset.quickNote].filter(Boolean).join(' ');formData.narrative=ta.value};
  $('participationChoices').onclick=event=>{const btn=event.target.closest('[data-participation]');if(!btn||!canEdit())return;formData.participation=btn.dataset.participation;renderSubjectForm()};
  $('autonomyChoices').onclick=event=>{const btn=event.target.closest('[data-autonomy]');if(!btn||!canEdit())return;formData.autonomy=formData.autonomy.includes(btn.dataset.autonomy)?formData.autonomy.filter(x=>x!==btn.dataset.autonomy):[...formData.autonomy,btn.dataset.autonomy];renderSubjectForm()};
  $('domainChoices').onclick=event=>{const btn=event.target.closest('[data-domain]');if(!btn||!canEdit())return;const code=btn.dataset.domain;if(formData.domains.includes(code))formData.domains=formData.domains.filter(x=>x!==code);else if(formData.domains.length<3)formData.domains.push(code);else{showError('Use up to 3 domains only when clearly relevant.');return}renderSubjectForm()};
  $('addTaskBtn').onclick=()=>{if(!canEdit())return;formData.tasks.push({id:uid('task'),label:'',type:'Independent work',outcome:'Completed / accessed',detail:'',includeParent:false,objectiveId:'',objectiveResult:'',measurementValue:null,measurementUnit:''});renderTasks()};
  $('taskList').addEventListener('click',event=>{const remove=event.target.closest('[data-remove-task]');if(remove&&canEdit()){formData.tasks.splice(Number(remove.dataset.removeTask),1);renderTasks()}});
  $('taskList').addEventListener('input',event=>{const taskRoot=event.target.closest('[data-task-index]');if(!taskRoot||!canEdit())return;const task=formData.tasks[Number(taskRoot.dataset.taskIndex)];if(event.target.classList.contains('task-label'))task.label=event.target.value;if(event.target.classList.contains('task-detail'))task.detail=event.target.value;if(event.target.classList.contains('task-measure'))task.measurementValue=event.target.value===''?null:Number(event.target.value)});
  $('taskList').addEventListener('change',event=>{const taskRoot=event.target.closest('[data-task-index]');if(!taskRoot||!canEdit())return;const task=formData.tasks[Number(taskRoot.dataset.taskIndex)];if(event.target.classList.contains('task-type'))task.type=event.target.value;if(event.target.classList.contains('task-outcome'))task.outcome=event.target.value;if(event.target.classList.contains('task-parent'))task.includeParent=event.target.checked;if(event.target.classList.contains('task-result'))task.objectiveResult=event.target.value;if(event.target.classList.contains('task-objective')){task.objectiveId=event.target.value;task.objectiveResult=task.objectiveId?(task.objectiveResult||'Not measured / insufficient opportunity'):'';task.measurementValue=null;const objective=state.objectives.find(item=>item.id===task.objectiveId);task.measurementUnit={latency:'seconds',duration:'minutes',frequency:'count',accuracy:'percent'}[objective?.measureType]||'';renderTasks()}});
  $('saveSubjectBtn').onclick=saveSubject;$('notReportedBtn').onclick=markNotReported;
  $('overviewChoices').onclick=async event=>{const btn=event.target.closest('[data-overview]');if(!btn||!canEdit())return;const key=datedDayKey(currentDay,activeWeek);state.overview[key]={...(state.overview[key]||{}),choice:btn.dataset.overview};try{if(await persist('edit'))renderAll()}catch(error){showError(error.message)}};$('saveOverviewBtn').onclick=saveOverview;
  $('addPinBtn').onclick=openPin;$('savePinBtn').onclick=savePin;$('pinList').onclick=event=>{const btn=event.target.closest('[data-pin-done]');if(btn)donePin(btn.dataset.pinDone)};
  $('quickObjectiveBtn').onclick=()=>openObjective();$('addObjectiveBtn').onclick=()=>openObjective();$('objectiveList').onclick=event=>{const btn=event.target.closest('[data-edit-objective]');if(btn)openObjective(btn.dataset.editObjective)};$('saveObjectiveDialogBtn').onclick=saveObjective;
  document.querySelectorAll('.output-tab').forEach(btn=>btn.onclick=()=>{outputView=btn.dataset.output;renderOutput()});$('copyOutput').onclick=async()=>{try{await navigator.clipboard.writeText($('outputText').textContent);$('copyOutput').textContent='Copied';setTimeout(()=>$('copyOutput').textContent='Copy',1200)}catch{showError('Copy was blocked by the browser.')}};$('openWhatsApp').onclick=()=>window.open(`https://wa.me/?text=${encodeURIComponent(outputFor('parent',{state,dayName:currentDay,baseDate:activeWeek}))}`,'_blank','noopener');
  $('revisionList').onclick=event=>{const btn=event.target.closest('[data-revision]');if(btn)loadRevision(Number(btn.dataset.revision))};$('restoreRevision').onclick=restoreRevision;$('refreshHistory').onclick=loadStudent;
  $('newStudentBtn').onclick=()=>{$('studentDialog').querySelector('form').reset();$('studentDialog').showModal()};$('createStudentBtn').onclick=createStudent;$('newUserBtn').onclick=()=>{$('userDialog').querySelector('form').reset();$('userDialog').showModal()};$('createUserBtn').onclick=createUser;$('saveConsentBtn').onclick=saveConsent;$('refreshAudit').onclick=loadAudit;
  $('adminStudents').onclick=async event=>{const btn=event.target.closest('[data-admin-student]');if(!btn)return;studentId=btn.dataset.adminStudent;$('studentSelect').value=studentId;await loadStudent();await renderStudentAdminPanel()};
  $('studentAdminPanel').onclick=async event=>{if(event.target.id==='recordAuthorityBtn'){$('consentDialog').querySelector('form').reset();$('consentDialog').showModal()}if(event.target.id==='editTimetableBtn')editTimetable();if(event.target.id==='exportStudentBtn')exportStudent(false);if(event.target.id==='exportHistoryBtn')exportStudent(true);if(event.target.id==='assignUserBtn')await assignUser();if(event.target.id==='eraseStudentBtn')await eraseStudent();const remove=event.target.closest('[data-remove-assignment]');if(remove)await removeAssignment(remove.dataset.removeAssignment)};
}

init();