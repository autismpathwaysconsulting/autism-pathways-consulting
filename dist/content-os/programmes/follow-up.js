const status=document.querySelector('#follow-up-status');
try {
 const response=await fetch('/api/content-os/programmes',{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(response.status===401?'Your session ended. Sign in again.':'The tracker could not load. Open the interest tracker to retry.');
 const data=await response.json();
 const active=data.records.filter(r=>!['closed','duplicate'].includes(r.status));
 const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 const totals=[['New records to review',active.filter(r=>r.status==='new').length],['Follow-ups due',active.filter(r=>r.next_followup&&r.next_followup<=today).length],['Active records without a follow-up date',active.filter(r=>!r.next_followup).length]];
 for(const [label,count]of totals){const p=document.createElement('p');p.textContent=`${label}: ${count}`;document.querySelector('#follow-up-totals').append(p);}
 status.textContent=data.truncated?'Partial counts: the tracker returned only the newest 1,000 records.':'Counts loaded from the programme interest tracker. Categories overlap.';
}catch(error){status.textContent=error.message;}
