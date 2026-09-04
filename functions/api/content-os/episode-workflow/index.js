const MAX_BODY_BYTES = 128 * 1024;
const STATUSES = new Set(["IDEA", "APPROVED", "SCRIPT_LOCKED", "FILMED", "EDITING", "REVIEW", "READY", "PUBLISHED"]);
const MODES = new Set(["full", "delta", "ready"]);
const RESULTS = new Set(["PENDING", "READY", "NOT_READY"]);

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}
function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, required, optional = []) {
  if (!isObject(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => allowed.has(key));
}
function validText(value, maximum, required = true) {
  return typeof value === "string" && (!required || Boolean(value.trim())) && value.length <= maximum && !/\p{Cc}/u.test(value);
}
function validEpisodeId(value) { return typeof value === "string" && /^EP\d{2,4}$/.test(value); }
function validResearchItemId(value) {
  return value === null || (typeof value === "string" && value.length <= 260 && /^apc-weekly-topic-review:\d{4}-W\d{2}\|topic:[A-Za-z0-9._-]{4,100}$/.test(value));
}
function safeJson(value) { try { return JSON.parse(value); } catch { return null; } }

export function validateAction(payload) {
  if (!isObject(payload) || typeof payload.action !== "string") return "Request must be a workflow action.";
  if (payload.action === "create_episode") {
    if (!exactKeys(payload, ["action", "episode"]) || !exactKeys(payload.episode, ["id", "title", "researchItemId"])) return "Episode request does not match the expected schema.";
    if (!validEpisodeId(payload.episode.id)) return "Episode id must use EP followed by 2 to 4 digits.";
    if (!validText(payload.episode.title, 200)) return "Episode title is invalid.";
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i.test(payload.episode.title) || /@[a-z0-9_]/i.test(payload.episode.title) || /\b(?:https?|ftp|file):/i.test(payload.episode.title)) return "Episode title must be deidentified.";
    if (!validResearchItemId(payload.episode.researchItemId)) return "Research item id is invalid.";
    return null;
  }
  if (payload.action === "update_episode_status") {
    if (!exactKeys(payload, ["action", "episodeId", "status"]) || !validEpisodeId(payload.episodeId) || !STATUSES.has(payload.status)) return "Episode status request is invalid.";
    return null;
  }
  if (payload.action === "save_production_pack") {
    if (!exactKeys(payload, ["action", "episodeId", "pack"]) || !validEpisodeId(payload.episodeId) || !isObject(payload.pack)) return "Production pack request is invalid.";
    return null;
  }
  if (payload.action === "save_review") {
    if (!exactKeys(payload, ["action", "episodeId", "manifest"]) || !validEpisodeId(payload.episodeId) || !isObject(payload.manifest)) return "Review request is invalid.";
    const manifest = payload.manifest;
    if (!validText(manifest.label, 100) || !MODES.has(manifest.mode) || !/^[0-9a-f]{64}$/i.test(manifest.video?.sha256 || "")) return "Review manifest identity is invalid.";
    if (manifest.review && (!isObject(manifest.review) || !RESULTS.has(manifest.review.status))) return "Review result is invalid.";
    if (manifest.review?.score !== undefined && manifest.review?.score !== null && (!Number.isFinite(manifest.review.score) || manifest.review.score < 0 || manifest.review.score > 100)) return "Review score must be between 0 and 100.";
    return null;
  }
  return "Action is not supported.";
}

async function readBody(request) {
  if (request.headers.get("X-APC-Content-OS") !== "1") return { error: json({ error: "Missing Content OS request header." }, 400) };
  if (new URL(request.url).search) return { error: json({ error: "POST does not accept query parameters." }, 400) };
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) return { error: json({ error: "Cross-origin writes are not allowed." }, 403) };
  if ((request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") return { error: json({ error: "Content-Type must be application/json." }, 415) };
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) return { error: json({ error: "Content-Length is invalid or too large." }, Number(declared) > MAX_BODY_BYTES ? 413 : 400) };
  const reader = request.body?.getReader();
  if (!reader) return { error: json({ error: "Request body is required." }, 400) };
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel(); return { error: json({ error: "Request body is too large." }, 413) }; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return { payload: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }; }
  catch { return { error: json({ error: "Request body is not valid UTF-8 JSON." }, 400) }; }
}

async function overview(database) {
  const [episodes, reviews, publications] = await database.batch([
    database.prepare("SELECT * FROM episodes ORDER BY updated_at DESC, id DESC LIMIT 200"),
    database.prepare("SELECT * FROM video_reviews ORDER BY reviewed_at DESC LIMIT 200"),
    database.prepare(`SELECT p.publication_id, p.platform, p.post_ref, p.published_at, p.publication_json,
      COUNT(s.snapshot_id) AS snapshot_count, MAX(s.captured_at) AS last_snapshot_at
      FROM content_publications p LEFT JOIN content_analytics_snapshots s ON s.publication_id = p.publication_id AND s.archived = 0
      GROUP BY p.publication_id, p.platform, p.post_ref, p.published_at, p.publication_json
      ORDER BY p.created_at DESC LIMIT 200`),
  ]);
  return {
    schemaVersion: "apc.episode_workflow.v1",
    episodes: (episodes.results || []).map(row => ({ ...row, productionPack: row.production_pack_json ? safeJson(row.production_pack_json) : null })),
    reviews: (reviews.results || []).map(row => ({ ...row, manifest: safeJson(row.manifest_json) })),
    publications: (publications.results || []).map(row => {
      const data = safeJson(row.publication_json) || {};
      return { ...data, publicationId: row.publication_id, platform: row.platform, postRef: row.post_ref, publishedAt: row.published_at, snapshotCount: Number(row.snapshot_count || 0), lastSnapshotAt: row.last_snapshot_at };
    }),
  };
}

export async function onRequestGet({ env }) {
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Canonical database is not configured." }, 503);
  try { return json(await overview(env.APC_CONTENT_OS_DB)); }
  catch (error) { console.error(JSON.stringify({ message: "Episode workflow read failed", error: String(error?.message || error) })); return json({ error: "Episode workflow is unavailable." }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Canonical database is not configured." }, 503);
  const body = await readBody(request);
  if (body.error) return body.error;
  const validation = validateAction(body.payload);
  if (validation) return json({ error: validation }, 400);
  const payload = body.payload;
  const database = env.APC_CONTENT_OS_DB;
  const now = new Date().toISOString();
  try {
    if (payload.action === "create_episode") {
      const existing = await database.prepare("SELECT id FROM episodes WHERE id = ?").bind(payload.episode.id).first();
      if (existing) return json({ error: "That episode ID already exists." }, 409);
      const researchId = payload.episode.researchItemId;
      if (researchId) {
        const researchItem = await database.prepare("SELECT item_id FROM research_items WHERE item_id = ? AND item_type = 'topic'").bind(researchId).first();
        if (!researchItem) return json({ error: "Research topic was not found." }, 404);
        const usedByEpisode = await database.prepare("SELECT id FROM episodes WHERE source_research_item_id = ?").bind(researchId).first();
        if (usedByEpisode) return json({ error: "That research topic already has an episode." }, 409);
        await database.batch([
          database.prepare(`INSERT INTO episodes (id, title, source_research_item_id, status, production_pack_json, created_at, updated_at)
            VALUES (?, ?, ?, 'APPROVED', NULL, ?, ?)`).bind(payload.episode.id, payload.episode.title.trim(), researchId, now, now),
          database.prepare("INSERT INTO research_decisions (item_id, decision, decided_at, request_id) VALUES (?, 'used', ?, ?)")
            .bind(researchId, now, crypto.randomUUID()),
        ]);
      } else {
        await database.prepare(`INSERT INTO episodes (id, title, source_research_item_id, status, production_pack_json, created_at, updated_at)
          VALUES (?, ?, NULL, 'APPROVED', NULL, ?, ?)`).bind(payload.episode.id, payload.episode.title.trim(), now, now).run();
      }
    } else if (payload.action === "update_episode_status") {
      const result = await database.prepare("UPDATE episodes SET status = ?, updated_at = ? WHERE id = ?").bind(payload.status, now, payload.episodeId).run();
      if (Number(result.meta?.changes || 0) !== 1) return json({ error: "Episode was not found." }, 404);
    } else if (payload.action === "save_production_pack") {
      const result = await database.prepare("UPDATE episodes SET production_pack_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(payload.pack), now, payload.episodeId).run();
      if (Number(result.meta?.changes || 0) !== 1) return json({ error: "Episode was not found." }, 404);
    } else if (payload.action === "save_review") {
      const manifest = payload.manifest;
      const episode = await database.prepare("SELECT id FROM episodes WHERE id = ?").bind(payload.episodeId).first();
      if (!episode) return json({ error: "Episode was not found." }, 404);
      const result = manifest.review?.status || "PENDING";
      const priorReview = await database.prepare("SELECT id FROM video_reviews WHERE episode_id = ? AND video_sha256 = ? AND mode = ?")
        .bind(payload.episodeId, manifest.video.sha256.toLowerCase(), manifest.mode).first();
      if (priorReview) return json(await overview(database));
      await database.batch([
        database.prepare(`INSERT INTO video_reviews
          (id, episode_id, version_label, video_sha256, mode, result, score, manifest_json, reviewed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (episode_id, video_sha256, mode) DO NOTHING`)
          .bind(crypto.randomUUID(), payload.episodeId, manifest.label.trim(), manifest.video.sha256.toLowerCase(), manifest.mode, result,
            Number.isFinite(manifest.review?.score) ? manifest.review.score : null, JSON.stringify(manifest), now),
        database.prepare("UPDATE episodes SET status = ?, updated_at = ? WHERE id = ?")
          .bind(result === "READY" ? "READY" : "REVIEW", now, payload.episodeId),
      ]);
    }
    return json(await overview(database));
  } catch (error) {
    console.error(JSON.stringify({ message: "Episode workflow write failed", action: payload.action, error: String(error?.message || error) }));
    return json({ error: "The episode update could not be saved." }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ error: "Only GET and POST are supported." }, 405, { Allow: "GET, POST" });
}
