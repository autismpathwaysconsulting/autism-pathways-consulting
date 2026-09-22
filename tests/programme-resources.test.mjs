import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequest} from '../functions/_middleware.js';
import {PUBLIC_FILES} from '../scripts/build-site.mjs';

const env={APC_CONTENT_OS_ENVIRONMENT:'production',APC_CONTENT_OS_AUTH:'resource-tests-only'};
const files=['APC_Saturday_Scouting_Pack.pdf','APC_Saturday_Scouting_Pack.docx','APC_Community_Crew_Partner_Brief.pdf','APC_Community_Crew_Partner_Brief.docx'];

test('programme resource pages and every document require authentication and retain their return path',async()=>{
 for(const path of ['/content-os/programmes/resources','/content-os/programmes/resources.html','/content-os/programmes/readiness',...files.map(file=>'/content-os/programmes/files/'+file),'/content-os/programmes/resources?view=scouting']){
  let reached=false;
  const response=await onRequest({request:new Request('https://example.test'+path),env,next:()=>{reached=true;return new Response('private');}});
  assert.equal(response.status,302,path);assert.equal(reached,false,path);
  const redirect=new URL(response.headers.get('Location'));assert.equal(redirect.pathname,'/content-os/login/');assert.equal(redirect.searchParams.get('next'),path);
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 }
});

test('authorised document responses retain exact bytes and private response headers',async()=>{
 for(const file of files){
  const path='content-os/programmes/files/'+file;assert.ok(PUBLIC_FILES.includes(path));const content=readFileSync(new URL('../'+path,import.meta.url));
  const request=new Request('https://example.test/'+path,{headers:{Authorization:'Basic '+btoa('apc:resource-tests-only')}});
  const response=await onRequest({request,env,next:()=>new Response(content)});
  assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),content);
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
 }
});

test('download routes fail closed when authentication is missing or unconfigured',async()=>{
 const request=new Request('https://example.test/content-os/programmes/files/'+files[0]);
 const response=await onRequest({request,env:{APC_CONTENT_OS_ENVIRONMENT:'production'},next:()=>{throw new Error('must not serve document');}});
 assert.equal(response.status,503);
});

test('sign-in return paths do not permit external redirects',async()=>{
 for(const next of ['https://other.test/private','//other.test/private','/programmes','/content-os/login/']){
  const response=await onRequest({request:new Request('https://example.test/content-os/login/?next='+encodeURIComponent(next)),env,next:()=>new Response()});
  const html=await response.text();assert.equal(response.status,200);assert.doesNotMatch(html,/other\.test/);assert.doesNotMatch(html,/&amp;next=/);
 }
});
