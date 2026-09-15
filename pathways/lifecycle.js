const $=id=>document.getElementById(id);
let user=null;
let csrfToken='';
let organizations=[];
let organizationId='';
let students=[];
let selectedStudentId='';

function showError(message){$('lifecycleError').textContent=message;$('lifecycleError').classList.remove('hidden')}
function clearError(){$('lifecycleError').classList.add('hidden')}
function showStatus(message){$('lifecycleStatus').textContent=message;$('lifecycleStatus').classList.remove('hidden')}
function clearStatus(){$('lifecycleStatus').classList.add('hidden')}
function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function currentMembership(){return user?.memberships?.find(item=>item.organization_id===organizationId)||null}
function currentRole(){return user?.platformAdmin?'platform-admin':currentMembership()?.role||''}
function canManageLifecycle(){return Boolean(user?.platformAdmin||['admin','senco'].includes(currentRole()))}
function canErase(){return Boolean(user?.platformAdmin||currentRole()==='admin')}
function selectedStudent(){return students.find(item=>item.student_id===selectedStudentId)||null}

async function api(path,{method='GET',body=null}={}){
  const headers={Accept:'application/json'};
  if(body!==null){headers['Content-Type']='application/json';headers['X-Pathways-Request']='1';if(csrfToken)headers['X-Pathways-CSRF']=csrfToken}
  const response=await fetch(path,{method,headers,body:body===null?undefined:JSON.stringify(body),credentials:'same-origin'});
  const type=response.headers.get('Content-Type')||'';
  const data=type.includes('application/json')?await response.json().catch(()=>({})):{};
  if(response.status===401){location.assign('/pathways/');throw new Error('Session expired.')}
  if(!response.ok){const error=new Error(data.error||`Request failed (${response.status}).`);error.status=response.status;error.data=data;throw error}
  return data;
}

async function init(){
  try{
    const [me,orgs]=await Promise.all([api('/api/pathways/me'),api('/api/pathways/organizations')]);
    user=me.user;csrfToken=me.csrfToken;organizations=orgs.organizations||[];
    organizationId=organizations.find(item=>{
      const role=user?.memberships?.find(m=>m.organization_id===item.organization_id)?.role;
      return user?.platformAdmin||role==='admin'||role==='senco';
    })?.organization_id||'';
    if(!organizationId||!canManageLifecycle())throw new Error('Administrator or SENCO access is required for records lifecycle management.');
    $('lifecycleOrg').innerHTML=organizations.filter(item=>{
      const role=user?.memberships?.find(m=>m.organization_id===item.organization_id)?.role;
      return user?.platformAdmin||role==='admin'||role==='senco';
    }).map(item=>`<option value="${escapeHtml(item.organization_id)}">${escapeHtml(item.name)}</option>`).join('');
    $('lifecycleOrg').value=organizationId;
    $('lifecycleView').classList.remove('hidden');
    await loadStudents();
  }catch(error){showError(error.message)}
}

async function loadStudents(preferredId=''){
  clearError();clearStatus();
  const data=await api(`/api/pathways/students?organizationId=${encodeURIComponent(organizationId)}&includeInactive=1`);
  students=data.students||[];
  if(preferredId&&students.some(item=>item.student_id===preferredId))selectedStudentId=preferredId;
  else if(!students.some(item=>item.student_id===selectedStudentId))selectedStudentId=students[0]?.student_id||'';
  renderStudents();renderDetails();
}

function renderStudents(){
  const filter=$('lifecycleFilter').value;
  const visible=students.filter(item=>filter==='all'||item.status===filter);
  $('lifecycleStudents').innerHTML=visible.length?visible.map(item=>`<button class="item ${item.student_id===selectedStudentId?'selected':''}" data-student-id="${escapeHtml(item.student_id)}" style="text-align:left;width:100%"><div class="section-head"><span class="item-title">${escapeHtml(item.display_name)}</span><span class="pill ${item.status==='active'?'good':item.status==='archived'?'amber':''}">${escapeHtml(item.status)}</span></div><div class="meta"><span>${escapeHtml(item.year_group||'No year group')}</span><span>${escapeHtml(item.external_ref||'No reference')}</span></div></button>`).join(''):'<div class="muted-box">No records match this filter.</div>';
}

function renderDetails(){
  const student=selectedStudent();
  if(!student){$('lifecycleStudentName').textContent='Select a student';$('lifecycleDetails').textContent='Choose a record to manage its lifecycle.';$('lifecycleActions').classList.add('hidden');return}
  $('lifecycleStudentName').textContent=student.display_name;
  $('lifecycleDetails').innerHTML=`<div class="meta"><span class="pill ${student.status==='active'?'good':student.status==='archived'?'amber':''}">${escapeHtml(student.status)}</span><span>${escapeHtml(student.year_group||'No year group')}</span><span>${escapeHtml(student.external_ref||'No external reference')}</span></div><p class="item-copy">Internal ID: ${escapeHtml(student.student_id)}</p>`;
  $('lifecycleStudentStatus').value=student.status;
  $('eraseLifecycleStudent').classList.toggle('hidden',!canErase());
  $('lifecycleActions').classList.remove('hidden');
}

async function saveStatus(){
  const student=selectedStudent();if(!student)return;
  clearError();clearStatus();
  const status=$('lifecycleStudentStatus').value;
  if(!['active','inactive','archived'].includes(status)){showError('Workspace status is invalid.');return}
  if(status===student.status){showStatus('No status change was needed.');return}
  if(!window.confirm(`Change ${student.display_name}'s workspace from ${student.status} to ${status}?`))return;
  try{
    await api('/api/pathways/students',{method:'PATCH',body:{studentId:student.student_id,status}});
    await loadStudents(student.student_id);
    showStatus(`Workspace status changed to ${status}.`);
  }catch(error){showError(error.message)}
}

function exportCurrentStudent(){
  const student=selectedStudent();if(!student)return;
  window.open(`/api/pathways/export?studentId=${encodeURIComponent(student.student_id)}`,'_blank','noopener');
}

function downloadJson(payload,studentId){
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=`pathways-${studentId}-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
}

async function exportStudentHistory(){
  const student=selectedStudent();if(!student)return;
  clearError();clearStatus();
  $('exportLifecycleHistory').disabled=true;
  showStatus('Preparing complete history export…');
  try{
    const history=[];
    let afterRevision=-1;
    let snapshotRevision=null;
    let first=null;
    for(let pageNumber=0;pageNumber<10000;pageNumber+=1){
      const params=new URLSearchParams({studentId:student.student_id,history:'1',afterRevision:String(afterRevision),pageSize:'50'});
      if(snapshotRevision!==null)params.set('snapshotRevision',String(snapshotRevision));
      const page=await api(`/api/pathways/export?${params.toString()}`);
      if(first===null){first=page;snapshotRevision=page.snapshotRevision}
      else if(page.snapshotRevision!==snapshotRevision)throw new Error('The record changed during export. Please start the export again.');
      history.push(...(page.history||[]));
      if(page.historyComplete){
        downloadJson({
          exportVersion:page.exportVersion||first.exportVersion||'1.1',
          generatedAt:new Date().toISOString(),
          historyComplete:true,
          snapshotRevision,
          student:first.student,
          consents:first.consents||[],
          current:first.current,
          history,
        },student.student_id);
        showStatus(`Complete history exported through revision ${snapshotRevision}.`);
        return;
      }
      if(!Number.isSafeInteger(page.nextAfterRevision)||page.nextAfterRevision<=afterRevision)throw new Error('History export pagination did not advance safely.');
      afterRevision=page.nextAfterRevision;
    }
    throw new Error('History export exceeded the safe page limit. Please contact support.');
  }catch(error){
    showError(error?.status===409?'The record changed while it was being exported. Please try again.':error.message);
  }finally{
    $('exportLifecycleHistory').disabled=false;
  }
}

async function eraseStudent(){
  const student=selectedStudent();if(!student||!canErase())return;
  clearError();clearStatus();
  if(!window.confirm(`Permanently erase ${student.display_name}'s Pathways workspace and support history? This cannot be undone.`))return;
  const typed=window.prompt(`Type the exact internal student ID to confirm:\n${student.student_id}`);
  if(typed!==student.student_id){showError('Erasure cancelled because the confirmation did not match.');return}
  try{
    await api('/api/pathways/privacy',{method:'POST',body:{action:'erase-student',studentId:student.student_id,confirmStudentId:typed,reasonCode:'request'}});
    selectedStudentId='';await loadStudents();showStatus('Student Pathways workspace erased. Only minimal non-content erasure evidence remains.');
  }catch(error){showError(error.message)}
}

$('lifecycleOrg').addEventListener('change',async event=>{organizationId=event.target.value;selectedStudentId='';if(!canManageLifecycle()){showError('Administrator or SENCO access is required.');return}await loadStudents()});
$('lifecycleFilter').addEventListener('change',renderStudents);
$('refreshLifecycle').onclick=()=>loadStudents(selectedStudentId).catch(error=>showError(error.message));
$('lifecycleStudents').onclick=event=>{const button=event.target.closest('[data-student-id]');if(!button)return;selectedStudentId=button.dataset.studentId;renderStudents();renderDetails()};
$('saveLifecycleStatus').onclick=saveStatus;
$('exportLifecycleCurrent').onclick=exportCurrentStudent;
$('exportLifecycleHistory').onclick=exportStudentHistory;
$('eraseLifecycleStudent').onclick=eraseStudent;

init();
