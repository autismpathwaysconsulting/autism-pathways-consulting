// Read-only probe. Configure an external scheduler to run it and alert on non-zero exit.
// Never supply login credentials to this script.
export async function probe(baseUrl, fetcher=fetch) {
  const base=new URL(baseUrl);
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new Error('Use an HTTPS origin without credentials or query parameters.');
  const results=[];
  for(const [path,status,contentType] of [['/pathways/',200,'text/html'],['/api/pathways/me',401,'application/json']]){
    const response=await fetcher(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(15000)});
    const ok=response.status===status&&(response.headers.get('content-type')||'').includes(contentType);
    results.push({check:path==='/pathways/'?'sign-in page':'unauthenticated API protection',ok,status:response.status});
    await response.body?.cancel();
  }
  return {ok:results.every(result=>result.ok),checks:results};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  try{const result=await probe(process.env.PATHWAYS_BASE_URL||'');console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1}
  catch{console.error('Pathways availability probe failed. No credentials or response bodies were logged.');process.exitCode=1}
}
