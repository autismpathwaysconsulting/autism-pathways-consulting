import { readBody } from './external.js';
import { assertValidPublication } from '../../../../content-os/analytics.js';
import { canonicalInstagramReelPostRef, canonicalInstagramReelPublicationId } from '../../../../content-os/instagram-reels.js';

const reply = (body, status = 200) => Response.json(body, { status, headers: {'Cache-Control':'private, no-store'} });
async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function onRequestPost({request, env}) {
  let publication;
  try {
    const body = await readBody(request);
    if (Object.keys(body).join() !== 'publication') throw Error('Expected a publication record.');
    publication = body.publication;
    assertValidPublication(publication);
    if (!/^EP\d{2,4}$/.test(publication.episodeId || '')) throw Error('Choose an existing episode.');
    if (!publication.publishedAt || !Number.isFinite(Date.parse(publication.publishedAt)) || Date.parse(publication.publishedAt) > Date.now()) throw Error('Enter the actual publication date and time, not a future time.');
    const url = new URL(publication.postRef);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) throw Error('Use a public HTTPS post URL.');
    if (publication.platform === 'Instagram') {
      url.pathname = url.pathname.replace(/^\/p\//, '/reel/');
      publication.postRef = canonicalInstagramReelPostRef(url.toString());
      publication.publicationId = await canonicalInstagramReelPublicationId(publication.postRef);
    } else if (publication.platform === 'TikTok' && ['www.tiktok.com','tiktok.com'].includes(url.hostname) && /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname)) {
      publication.postRef = 'https://www.tiktok.com' + url.pathname.replace(/\/$/, '');
      publication.publicationId = 'pub_' + (await hash('TikTok\n' + publication.postRef)).slice(0,32);
    } else throw Error('Use an Instagram video URL or full TikTok video URL.');
  } catch (error) { return error instanceof Response ? error : reply({error:error.message},400); }
  const db = env.APC_CONTENT_OS_DB;
  if (!db) return reply({error:'Publication storage is unavailable. Nothing was recorded.'},503);
  try {
    const episode = await db.prepare('SELECT id, status, archived_at FROM episodes WHERE id = ?').bind(publication.episodeId).first();
    if (!episode || episode.archived_at) return reply({error:'Choose an active existing episode.'},409);
    const json = JSON.stringify(publication);
    const digest = await hash(json);
    const now = new Date().toISOString();
    const meta = publication.platform === 'Instagram' && env.APC_CONTENT_OS_AUTOMATION_ENABLED === 'true' && env.APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED === 'true';
    const metadata = JSON.stringify({publicationId:publication.publicationId, publicationStatus:'FOUNDER_REPORTED_PUBLISHED', reviewStatus:'UNCHANGED', exportEvidence:'NOT_SUPPLIED', reviewEvidence:'NOT_VERIFIED_FOR_THIS_UPLOAD', trackingMode:meta?'meta_github_sync':'unavailable', recordedAt:now});
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO content_publications (publication_id, platform, post_ref, published_at, created_at, payload_hash, publication_json)
        SELECT ?, ?, ?, ?, ?, ?, ? FROM episodes WHERE id = ? AND archived_at IS NULL`).bind(publication.publicationId,publication.platform,publication.postRef,publication.publishedAt,now,digest,json,publication.episodeId),
      db.prepare(`INSERT OR IGNORE INTO episode_events (event_id, episode_id, event_type, artifact_id, idempotency_key, payload_sha256, metadata_json, created_at)
        SELECT ?, ?, 'PUBLICATION_LINKED', NULL, ?, ?, ?, ? FROM content_publications WHERE publication_id = ? AND payload_hash = ?`).bind(crypto.randomUUID(),publication.episodeId,'historical:'+publication.publicationId,digest,metadata,now,publication.publicationId,digest)
    ]);
    const saved = await db.prepare('SELECT publication_json FROM content_publications WHERE publication_id = ?').bind(publication.publicationId).first();
    if (!saved || saved.publication_json !== json) return reply({error:'This post is already recorded with different details. Refresh and check its episode and publication time.'},409);
    return reply({recorded:true, publicationId:publication.publicationId, reviewStatus:'UNCHANGED', trackingStatus:meta?'MAPPING_AVAILABLE_COLLECTION_UNVERIFIED':'UNAVAILABLE', message:meta?'Publication recorded; mapping is available to the existing Meta collector. Collection and scheduling are not yet verified.':'Publication recorded. Automatic tracking is unavailable for this path; use existing manual analytics.', checkpointNotice:'Past 24h/7d/28d snapshots are not reconstructed. Missing and unsupported metrics remain unknown.'});
  } catch { return reply({error:'Could not confirm publication storage. Retry the same details safely.'},503); }
}
export async function onRequest(context) { return context.request.method === 'POST' ? onRequestPost(context) : reply({error:'Only POST is supported.'},405); }
