const form = document.querySelector('#programme-form');
const button = document.querySelector('#interest-submit');
const status = document.querySelector('#form-status');
const availability = document.querySelector('#availability-status');
const fields = document.querySelector('#interest-fields');
const names = {"volunteering":"Community Volunteering","money":"Everyday Money Skills","camp":"Fitness & Adventure Camp"};
let widget = null;
let token = '';
let ready = false;
let busy = false;
let submissionError = '';
function message(text) {status.textContent = text;}
function selected(name) {return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(el=>el.value);}
function updateFirstChoice() {
 const select = form.elements.firstChoice; const previous = select.value;
 select.replaceChildren(new Option('Choose your first preference', ''));
 for(const value of selected('programmes')) select.add(new Option(names[value],value));
 if ([...select.options].some(o=>o.value===previous)) select.value=previous;
}
form.querySelectorAll('[name="programmes"]').forEach(el=>el.addEventListener('change',updateFirstChoice));
let attempt = 0;
let securityTimer;
let securityScript;
const retry = document.createElement('button');
retry.type = 'button'; retry.id = 'interest-retry'; retry.textContent = 'Retry security check'; retry.hidden = true;
status.after(retry);
function securityFailure() {
 clearTimeout(securityTimer); token=''; ready=false; button.disabled=true; retry.hidden=false;
 message('The security check could not finish. Your answers are still here. Retry the check, or use the email link above to contact CJ.');
}
async function init() {
 const current=++attempt;
 clearTimeout(securityTimer); token=''; ready=false; button.disabled=true; retry.hidden=true;
 try { if(widget!==null)window.turnstile?.remove(widget); } catch {}
 widget=null; securityScript?.remove(); document.querySelector('#programme-security').replaceChildren();
 if(!submissionError)message('Checking interest-list availability...');
 try {
  const response=await fetch('/api/programme-interest',{cache:'no-store',signal:AbortSignal.timeout(15000)}); if(!response.ok)throw new Error();
  const config=await response.json(); if(current!==attempt)return;
  if(!config.enabled){fields.disabled=true;availability.textContent='The interest list is not open yet. Explore the programmes or email CJ with an enquiry.';message('Online submissions are not open yet.');return;}
  fields.disabled=false;availability.textContent='The interest list is open. Sharing interest does not reserve a place.';
  if(!submissionError)message('Loading the security check. Your answers will stay here if you need to retry.');
  securityTimer=setTimeout(()=>{if(current===attempt){attempt++;securityFailure();}},20000);
  const render=()=>{if(current!==attempt)return;try{
   widget=window.turnstile.render('#programme-security',{sitekey:config.sitekey,action:'programme-interest',callback:value=>{if(current!==attempt)return;clearTimeout(securityTimer);token=value;ready=true;retry.hidden=true;button.disabled=busy;if(!submissionError)message('Ready to send when you have completed the form.');},'expired-callback':()=>{if(current!==attempt)return;securityFailure();},'error-callback':()=>{if(current!==attempt)return;attempt++;securityFailure();}});
  }catch{if(current===attempt){attempt++;securityFailure();}}};
  if(window.turnstile?.render){render();return;}
  const script=document.createElement('script');securityScript=script;script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onerror=()=>{if(current===attempt){attempt++;securityFailure();}};script.onload=render;document.head.append(script);
 }catch{if(current!==attempt)return;availability.textContent='We could not check whether the list is open. Please retry or email CJ.';message('The interest list could not load. Your answers are still here.');retry.hidden=false;}
}
retry.addEventListener('click',()=>{submissionError='';init();});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 if(!form.reportValidity())return;
 const programmes=selected('programmes'),ages=selected('ages');
 if(!programmes.length || !ages.length){message('Please choose at least one programme and one age band.');form.querySelector(!programmes.length?'[name="programmes"]':'[name="ages"]').focus();return;}
 if(!ready||!token){message('Please complete the security check before sending.');return;}
 submissionError='';busy=true;button.disabled=true;button.textContent='Sending...';message('Sending your interest request...');
 const data=Object.fromEntries(new FormData(form));
 Object.assign(data,{programmes,ages,adult:form.elements.adult.checked,consent:form.elements.consent.checked,updates:form.elements.updates.checked,supportDiscussion:form.elements.supportDiscussion.checked?'yes':'not-now',consentVersion:'programmes-2026-09-v1',token});
 try {
  const response=await fetch('/api/programme-interest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok||result.received!==true)throw new Error(result.error||'We could not confirm your request was saved. Please try again or email CJ.');
  form.hidden=true;document.querySelector('.explorer-actions').hidden=true;availability.textContent='Your request has been received. See the confirmation beside this note.';const confirmation=document.querySelector('#interest-confirmation');confirmation.hidden=false;confirmation.focus();
 } catch(error) {
  submissionError=error.name==='TimeoutError'?'We could not confirm your request was saved. Your answers are still here. Please try again or email CJ.':error.message;
  message(submissionError);token='';ready=false;
  // Recreate the check with a new attempt and timer. Late callbacks from the
  // failed attempt cannot re-enable submission, and a stalled retry is bounded.
  await init();
 }
 finally {busy=false;button.disabled=!token;button.textContent='Send my interest';}
});
window.addEventListener('pageshow',updateFirstChoice);
init();
