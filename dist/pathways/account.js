const $=id=>document.getElementById(id);
let csrfToken='';

async function jsonResponse(response){
  const type=response.headers.get('Content-Type')||'';
  return type.includes('application/json')?response.json().catch(()=>({})):{};
}

async function loadAccount(){
  try{
    const response=await fetch('/api/pathways/me',{credentials:'same-origin',headers:{Accept:'application/json'}});
    const data=await jsonResponse(response);
    if(!response.ok)throw new Error(data.error||'Please sign in to Pathways first.');
    csrfToken=data.csrfToken||'';
    $('accountUser').textContent=`Signed in as ${data.user?.displayName||data.user?.email||'Pathways user'}`;
    const privileged=Boolean(data.user?.platformAdmin||(data.user?.memberships||[]).some(item=>item.role==='admin'||item.role==='senco'));
    $('lifecycleLink').classList.toggle('hidden',!privileged);
  }catch(error){
    $('accountUser').textContent=error.message;
    $('savePassword').disabled=true;
  }
}

$('passwordForm').addEventListener('submit',async event=>{
  event.preventDefault();
  $('accountError').classList.add('hidden');$('accountStatus').classList.add('hidden');
  const currentPassword=$('currentPassword').value;
  const newPassword=$('newPassword').value;
  if(newPassword!==$('confirmPassword').value){
    $('accountError').textContent='New password confirmation does not match.';$('accountError').classList.remove('hidden');return;
  }
  $('savePassword').disabled=true;$('savePassword').textContent='Changing…';
  try{
    const response=await fetch('/api/pathways/password',{
      method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json','Accept':'application/json','X-Pathways-Request':'1','X-Pathways-CSRF':csrfToken},
      body:JSON.stringify({currentPassword,newPassword}),
    });
    const data=await jsonResponse(response);
    if(!response.ok)throw new Error(data.error||'Password could not be changed.');
    $('passwordForm').reset();
    $('accountStatus').textContent='Password changed. Your sessions were signed out. Returning to Pathways sign-in…';
    $('accountStatus').classList.remove('hidden');
    setTimeout(()=>location.assign('/pathways/'),1200);
  }catch(error){
    $('accountError').textContent=error.message;$('accountError').classList.remove('hidden');
    $('savePassword').disabled=false;$('savePassword').textContent='Change password';
  }
});

loadAccount();
