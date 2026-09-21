const form = document.querySelector('#programme-form');
const button = document.querySelector('#interest-submit');
const status = document.querySelector('#form-status');
const names = {volunteering:'APC Community Crew', money:'Everyday Money', camp:'Community Adventure Camp'};
let widget = null;
let token = '';
let ready = false;
let busy = false;
function message(text) {status.textContent = text;}
function selected(name) {return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(el=>el.value);}
function updateFirstChoice() {
 const select = form.elements.firstChoice; const previous = select.value;
 select.replaceChildren(new Option('Choose your first preference', ''));
 for(const value of selected('programmes')) select.add(new Option(names[value],value));
 if ([...select.options].some(o=>o.value===previous)) select.value=previous;
}
form.querySelectorAll('[name="programmes"]').forEach(el=>el.addEventListener('change',updateFirstChoice));
function securityFailure() {token='';button.disabled=true;message('The security check could not load. Please refresh or email CJ using the link below.');}
async function init() {
 try {
  const response=await fetch('/api/programme-interest',{cache:'no-store'}); if(!response.ok) throw new Error();
  const config=await response.json();
  if (!config.enabled) {message('The interest list is being prepared and is not open yet. You can email CJ with an enquiry.');return;}
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onerror=securityFailure;
  script.onload=()=>{try{widget=window.turnstile.render('#programme-security',{sitekey:config.sitekey,action:'programme-interest',callback:value=>{token=value;ready=true;button.disabled=busy;message('Ready to send when you have completed the form.');},'expired-callback':()=>{token='';button.disabled=true;message('The security check expired. Please complete it again.');},'error-callback':securityFailure});}catch{securityFailure();}};
  document.head.append(script);
 } catch {message('The interest list could not load. Please refresh or email CJ with your enquiry.');}
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 if(!form.reportValidity())return;
 const programmes=selected('programmes'),ages=selected('ages');
 if(!programmes.length || !ages.length){message('Please choose at least one programme and one age band.');form.querySelector(!programmes.length?'[name="programmes"]':'[name="ages"]').focus();return;}
 if(!ready||!token){message('Please complete the security check before sending.');return;}
 busy=true;button.disabled=true;button.textContent='Sending...';message('Sending your interest request...');
 const data=Object.fromEntries(new FormData(form));
 Object.assign(data,{programmes,ages,adult:form.elements.adult.checked,consent:form.elements.consent.checked,updates:form.elements.updates.checked,supportDiscussion:form.elements.supportDiscussion.checked?'yes':'not-now',consentVersion:'programmes-2026-09-v1',token});
 try {
  const response=await fetch('/api/programme-interest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok||result.received!==true)throw new Error(result.error||'We could not confirm your request was saved. Please try again or email CJ.');
  form.hidden=true;const confirmation=document.querySelector('#interest-confirmation');confirmation.hidden=false;confirmation.focus();
 } catch(error) {message(error.name==='TimeoutError'?'We could not confirm your request was saved. Your answers are still here. Please try again or email CJ.':error.message);token='';ready=false;try{window.turnstile.reset(widget);}catch{securityFailure();}}
 finally {busy=false;button.disabled=!token;button.textContent='Send my interest';}
});
init();
