// Read-only deployment smoke check. No credentials, submissions or household reads.
const [target, expected] = process.argv.slice(2);
if (!target || !['open','closed'].includes(expected)) {
 console.error('Usage: node scripts/check-programme-live.mjs https://your-host open|closed');
 process.exit(2);
}
const base = new URL(target);
if (base.username || base.password || base.pathname !== '/' || base.search || base.hash ||
    !(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost','127.0.0.1'].includes(base.hostname)))) {
 throw new Error('Use an HTTPS origin, or localhost for rehearsal, without credentials or a path.');
}
let failures = 0;
async function check(path, verify) {
 try {
  const response = await fetch(new URL(path,base), {redirect:'manual',signal:AbortSignal.timeout(15000)});
  await verify(response);
  console.log('PASS '+path);
 } catch (error) { failures++; console.error('FAIL '+path+': '+error.message); }
}
function requireValue(condition, message) {if (!condition) throw new Error(message);}
await check('/api/programme-interest',async response=>{
 requireValue(response.status===200,'expected 200');
 requireValue((response.headers.get('Cache-Control')||'').includes('no-store'),'missing no-store');
 requireValue((response.headers.get('Content-Type')||'').includes('application/json'),'expected JSON');
 const body=await response.json();
 requireValue(Object.keys(body).sort().join(',')==='consentVersion,enabled,sitekey','unexpected public fields');
 requireValue(body.enabled===(expected==='open'),'availability differs from '+expected);
 requireValue(body.consentVersion==='programmes-2026-09-v1','unexpected consent version');
 requireValue(expected==='open' ? typeof body.sitekey==='string' && body.sitekey.length>0 : body.sitekey===null,'incorrect site key exposure');
});
await check('/api/content-os/programmes',async response=>{
 requireValue(response.status===401,'anonymous API must return 401');
 requireValue((response.headers.get('Cache-Control')||'').includes('no-store'),'missing no-store');
});
for (const path of ['/content-os/programmes/','/content-os/programmes/resources','/content-os/programmes/readiness',
 '/content-os/programmes/files/APC_Saturday_Scouting_Pack.pdf',
 '/content-os/programmes/files/APC_Saturday_Scouting_Pack.docx',
 '/content-os/programmes/files/APC_Community_Crew_Partner_Brief.pdf',
 '/content-os/programmes/files/APC_Community_Crew_Partner_Brief.docx']) {
 await check(path,async response=>{
  requireValue(response.status===302,'anonymous page must redirect');
  requireValue((response.headers.get('Cache-Control')||'').includes('no-store'),'missing no-store');
  const login=new URL(response.headers.get('Location')||'',base);
  requireValue(login.origin===base.origin && login.pathname==='/content-os/login/','incorrect login destination');
  requireValue(login.searchParams.get('next')===path,'requested destination not preserved');
 });
}
console.log(failures ? failures+' check(s) failed. Do not announce the list.' : 'Read-only checks passed. Real Turnstile and a private save/delete test are still required before sharing.');
process.exitCode=failures ? 1 : 0;
