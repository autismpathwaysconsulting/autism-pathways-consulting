import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveEpisodeBundle,episodeBundle,bundleHtml} from '../scripts/episode-bundle.mjs';
import {latestRecordedMaterials,productionProgress,publicationEvidence} from '../content-os/episode-learning.js';

test('progress is evidence-based without rewriting approval and links reach analytics',()=>{
 const material={publicationState:'FOUNDER_REPORTED_PUBLISHED',publishedAt:null,publicationUrls:['https://www.instagram.com/reel/one/']};
 const events=[{episode_id:'EP04',created_at:'2026-09-09',metadata:{action:'recorded_materials_saved',materials:material}}];
 assert.equal(latestRecordedMaterials(events,'EP05'),null);
 assert.equal(latestRecordedMaterials(events,'EP04'),material);
 assert.match(productionProgress({status:'APPROVED'},material),/Published.*date unknown/);
 assert.match(productionProgress({}, {...material,publicationState:'UNPUBLISHED'}),/Recorded/);
 const evidence=publicationEvidence('EP04',[],material);
 assert.equal(evidence[0].snapshotCount,null);
 assert.equal(publicationEvidence('EP04',evidence,material).length,1);
});
test('versioned local bundle preserves history, escapes HTML and verifies read-back without live restore',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'apc-bundle-'));
 const overview={episodes:[{id:'EP04',title:'<script>alert(1)</script>',status:'APPROVED'}],events:[],artifacts:[{episode_id:'EP04',payload:{spokenScript:'Original'}},{episode_id:'EP05',payload:{spokenScript:'Other'}}],reviews:[],publications:[]};
 const before=JSON.stringify(overview);
 const bundle=episodeBundle(overview,'EP04'); assert.equal(bundle.artifacts.length,1);
 assert.ok(!bundleHtml(bundle).includes('<script>'));
 const saved=await saveEpisodeBundle(directory,overview,'EP04');
 assert.equal(saved.readBackVerified,true); assert.equal(saved.mediaCopied,false);
 assert.equal((await saveEpisodeBundle(directory,overview,'EP04')).folder,saved.folder);
 assert.equal(JSON.stringify(overview),before);
 const restored=JSON.parse(await readFile(join(saved.folder,'episode.json'),'utf8'));
 assert.deepEqual(restored,bundle);
 await writeFile(join(saved.folder,'episode.html'),'corrupt');
 await assert.rejects(saveEpisodeBundle(directory,overview,'EP04'),/read-back mismatch/);
 assert.throws(()=>episodeBundle(overview,'../EP04'));
});
