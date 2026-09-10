import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost } from '../functions/api/content-os/publications/historical.js';
import { onRequest as authorize } from '../functions/_middleware.js';
const publication = {schemaVersion:'apc.analytics.v1',publicationId:'pub_example',episodeId:'EP06',platform:'Instagram',postRef:'https://www.instagram.com/p/DdC4AyFTnyW/',publishedAt:'2026-01-01T00:00:00.000Z',title:'Synthetic',topic:'Synthetic',problemArea:'Test',productFamily:'',format:'Reel',durationSeconds:null,slideCount:null,hookType:'Other',creativeVersion:'',ctaType:'save_share_comment',experimentType:'Discovery post'};
function database() {
 publication.publicationId = 'pub_' + 'a'.repeat(32);
 const sql = new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE episodes(id TEXT PRIMARY KEY,status TEXT,archived_at TEXT); INSERT INTO episodes VALUES('EP06','APPROVED',NULL);
 CREATE TABLE content_publications(publication_id TEXT PRIMARY KEY,platform TEXT,post_ref TEXT,published_at TEXT,created_at TEXT,payload_hash TEXT,publication_json TEXT,UNIQUE(platform,post_ref));
 CREATE TABLE episode_events(event_id TEXT PRIMARY KEY,episode_id TEXT,event_type TEXT,artifact_id TEXT,idempotency_key TEXT UNIQUE,payload_sha256 TEXT,metadata_json TEXT,created_at TEXT);`);
 const db={prepare(query){return {bind(...args){return {first:async()=>sql.prepare(query).get(...args),run:async()=>sql.prepare(query).run(...args)}}}},async batch(statements){sql.exec('BEGIN');try {const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {sql,db};
}
function request(p) {return new Request('https://example.com/api/content-os/publications/historical',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json','X-APC-Content-OS':'1'},body:JSON.stringify({publication:p})});}
test('historical registration is idempotent, preserves review status and needs no export',async()=>{
 const {sql,db}=database(); const env={APC_CONTENT_OS_DB:db};
 for(let i=0;i<2;i++){const r=await onRequestPost({request:request({...publication}),env});assert.equal(r.status,200,await r.text());}
 assert.equal(sql.prepare('SELECT status FROM episodes').get().status,'APPROVED');
 assert.equal(sql.prepare('SELECT count(*) AS n FROM content_publications').get().n,1);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM episode_events').get().n,1);
 const event=JSON.parse(sql.prepare('SELECT metadata_json FROM episode_events').get().metadata_json);
 assert.equal(event.reviewStatus,'UNCHANGED'); assert.equal(event.exportEvidence,'NOT_SUPPLIED');
 const r=await onRequestPost({request:request({...publication,publishedAt:'2026-01-02T00:00:00Z'}),env}); assert.equal(r.status,409);
 sql.close();
});
test('missing or future publication times fail without writes',async()=>{
 const {sql,db}=database();for(const publishedAt of ['', '2999-01-01T00:00:00Z'])assert.equal((await onRequestPost({request:request({...publication,publishedAt}),env:{APC_CONTENT_OS_DB:db}})).status,400);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM content_publications').get().n,0);sql.close();
});
test('TikTok publication is recordable with honest unavailable tracking',async()=>{
 const {sql,db}=database();const r=await onRequestPost({request:request({...publication,platform:'TikTok',postRef:'https://www.tiktok.com/@example/video/123456789'}),env:{APC_CONTENT_OS_DB:db}});assert.equal(r.status,200);assert.equal((await r.json()).trackingStatus,'UNAVAILABLE');sql.close();
});
test('publication destination and episode survive authentication redirect',async()=>{
 const request=new Request('https://example.com/content-os/?section=results&publication=historical&episode=EP06');
 const env={APC_CONTENT_OS_AUTH:'test-secret',APC_CONTENT_OS_ENVIRONMENT:'production'};
 const response=await authorize({request,env,next:async()=>new Response('allowed')});
 assert.equal(response.status,302);
 const login=new URL(response.headers.get('Location'));
 assert.equal(login.searchParams.get('next'),'/content-os/?section=results&publication=historical&episode=EP06');
 const page=await authorize({request:new Request(login),env,next:async()=>new Response('allowed')});
 assert.match(await page.text(),/next=%2Fcontent-os%2F%3Fsection%3Dresults/);
});
