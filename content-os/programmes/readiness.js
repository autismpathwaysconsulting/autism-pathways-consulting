const form=document.querySelector('#readiness-form');
const selects=[...form.querySelectorAll('select')];
const result=document.querySelector('#readiness-result');
function review(){
 const remaining=selects.filter(select=>select.value!=='confirmed');
 result.replaceChildren();
 const heading=document.createElement('h2');heading.textContent=remaining.length?`${remaining.length} of 8 areas still need review`:'All eight areas marked confirmed';
 const explanation=document.createElement('p');explanation.textContent=remaining.length?'Keep participant invitations on hold. Record an owner, next action and review date for each unresolved area in the scouting pack.':'Ready for CJ to review the supporting evidence. These selections do not approve a launch, confirm insurance or establish individual suitability. Recheck arrangements before each visit.';
 result.append(heading,explanation);
 if(remaining.length){const list=document.createElement('ul');for(const select of remaining){const li=document.createElement('li');li.textContent=`${select.closest('label').firstChild.textContent}: ${select.selectedOptions[0].textContent}`;list.append(li);}result.append(list);}
}
form.addEventListener('change',review);
const printButton=document.querySelector('#print-readiness');printButton.hidden=false;printButton.addEventListener('click',()=>window.print());
review();
