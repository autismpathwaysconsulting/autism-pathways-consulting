import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const hash = text => createHash('sha256').update(text).digest('hex');
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function episodeBundle(overview,id) {
  const episode=overview.episodes.find(e=>e.id===id);
  if(!episode || !/^EP\d{2,4}$/.test(id)) throw new Error('Existing episode required');
  const scoped = name => (overview[name] || []).filter(row=>row.episode_id===id || row.episodeId===id);
  return {schemaVersion:'apc.local-episode-bundle.v1',episode,artifacts:scoped('artifacts'),events:scoped('events'),reviews:scoped('reviews'),publications:scoped('publications'),limitations:['Local snapshot; not a cloud backup or publication approval.','Media and external overlay files are references, not embedded copies.','Analytics snapshots require the separate governed analytics backup.']};
}
export function bundleHtml(bundle) {
  const events=bundle.events.filter(e=>e.metadata?.action==='recorded_materials_saved').sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const material=events[0]?.metadata.materials;
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>'+escape(bundle.episode.title)+'</title><style>body{font:18px system-ui;max-width:800px;margin:2rem auto;padding:1rem;overflow-wrap:anywhere}pre{white-space:pre-wrap}h1{font-size:1.8rem}</style><h1>'+escape(bundle.episode.title)+'</h1><p>Saved local evidence bundle · not filming or upload approval</p><h2>Recorded transcript · '+escape(material?.transcriptStatus || 'missing')+'</h2><pre>'+escape(material?.transcript || 'No recorded transcript saved.')+'</pre><h2>Post caption</h2><pre>'+escape(material?.caption || 'No caption saved.')+'</pre><h2>Complete preserved record and versions</h2><pre>'+escape(JSON.stringify(bundle,null,2))+'</pre></html>';
}
export async function saveEpisodeBundle(directory,overview,id) {
  const bundle=episodeBundle(overview,id);
  const json=JSON.stringify(bundle,null,2)+'\n';
  const sha256=hash(json); const folder=join(directory,id,sha256);
  await mkdir(folder,{recursive:true,mode:0o700});
  const html=bundleHtml(bundle);
  for(const [name,body] of [['episode.json',json],['episode.html',html]]) {
    try { await writeFile(join(folder,name),body,{flag:'wx',mode:0o600}); }
    catch(error) { if(error.code!=='EEXIST') throw error; }
    if(await readFile(join(folder,name),'utf8')!==body) throw new Error('Bundle read-back mismatch: '+name);
  }
  // Read-back reconstruction is checked without modifying the live database.
  const restored=JSON.parse(await readFile(join(folder,'episode.json'),'utf8'));
  if(restored.episode.id!==id || hash(JSON.stringify(restored,null,2)+'\n')!==sha256) throw new Error('Bundle reconstruction failed');
  return {episodeId:id,sha256,folder,readBackVerified:true,mediaCopied:false};
}
