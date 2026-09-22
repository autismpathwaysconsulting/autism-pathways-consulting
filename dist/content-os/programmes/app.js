const endpoint='/api/content-os/programmes';
const labels = {"volunteering":"Community Volunteering","money":"Everyday Money Skills","camp":"Fitness & Adventure Camp"};
let records=[];
const status=document.querySelector('#status');
function el(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function values(json){try{return JSON.parse(json);}catch{return [];}}
async function request(method,body){const response=await fetch(endpoint,{method,cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(response.status===401?'Your session ended. Sign in again.':result.error||'Request failed.');return result;}
function localToday(){const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function active(row){return !['closed','duplicate'].includes(row.status);}
function due(row){return active(row)&&row.next_followup&&row.next_followup<=localToday();}
function render(){
 const verified=records.filter(r=>r.status==='verified');
 const summary=document.querySelector('#summary');summary.replaceChildren();
 summary.append(el('p',`${records.length} stored contact records · ${verified.length} verified households`));
 for(const [id,name] of Object.entries(labels)){summary.append(el('p',`${name}: ${verified.filter(r=>values(r.programmes).includes(id)).length} verified interested · ${verified.filter(r=>r.first_choice===id).length} first choice`));}
 summary.append(el('p',`${verified.filter(r=>r.updates===1).length} verified households with permission for selected-programme updates`));
 summary.append(el('p',`${records.filter(due).length} follow-ups due · ${records.filter(r=>active(r)&&!r.next_followup).length} active records without a follow-up date`));
 const list=document.querySelector('#records');list.replaceChildren();const filter=document.querySelector('#filter').value;
 for(const row of records.filter(r=>filter==='all'||(filter==='due'?due(r):filter==='no-date'?active(r)&&!r.next_followup:r.status===filter)).sort((a,b)=>(a.next_followup||'9999').localeCompare(b.next_followup||'9999'))){
  const card=el('article');card.append(el('h2',row.name));if(due(row))card.append(el('p',`Follow-up due: ${row.next_followup}`));const dl=el('dl');
  for(const [name,value] of [['Email',row.email],['Phone',row.phone||'Not provided'],['Programmes',values(row.programmes).map(p=>labels[p]).join(', ')],['First choice',labels[row.first_choice]],['Age bands',values(row.ages).join(', ')],['Town / district',row.location],['Saturday',row.saturday],['Accompanying adult',row.accompanying_adult],['Private support chat',row.support_discussion],['Future updates',row.updates?'Opted in':'No permission'],['Received',row.created_at.slice(0,10)],['Consent version',row.consent_version]]){dl.append(el('dt',name),el('dd',value));}card.append(dl);
  const actions=el('div');actions.className='actions';const label=el('label','Review status ');const select=el('select');for(const value of ['new','contacted','verified','duplicate','closed'])select.add(new Option(value,value));select.value=row.status;label.append(select);
  const dateLabel=el('label','Next follow-up '),date=el('input');date.type='date';date.value=row.next_followup;dateLabel.append(date);
  const save=el('button','Save review'),remove=el('button','Delete record');remove.className='danger';
  async function mutate(method,body){save.disabled=true;remove.disabled=true;try{await request(method,body);await load();status.textContent=method==='DELETE'?'Record deleted.':'Review saved.';}catch(error){status.textContent=error.message;save.disabled=false;remove.disabled=false;}}
  save.addEventListener('click',()=>{if(!date.reportValidity())return;if(select.value==='verified'&&row.status!=='verified'&&!confirm('Have you confirmed the adult contact, current interest and one record per household? This does not confirm programme suitability.'))return;mutate('PATCH',{id:row.id,status:select.value,nextFollowup:date.value});});
  remove.addEventListener('click',()=>{if(confirm('Permanently delete this record? Verify any withdrawal request before proceeding.'))mutate('DELETE',{id:row.id});});
  actions.append(label,dateLabel,save,remove);card.append(actions);list.append(card);
 }
 if(!list.children.length)list.append(el('p','No records in this view.'));
}
async function load(){status.textContent='Loading...';try{const data=await request('GET');records=data.records;render();status.textContent=data.truncated?'Showing the newest 1,000 records only. Totals are partial. Arrange a complete review before planning capacity.':'List refreshed. Counts describe interest, not confirmed places.';}catch(error){records=[];document.querySelector('#summary').replaceChildren();document.querySelector('#records').replaceChildren();status.textContent=error.message;}}
document.querySelector('#refresh').addEventListener('click',load);document.querySelector('#filter').addEventListener('change',render);load();
