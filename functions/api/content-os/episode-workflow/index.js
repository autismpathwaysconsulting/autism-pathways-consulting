const MAX_BODY_BYTES = 128 * 1024;
const STATUSES = new Set(["IDEA", "APPROVED", "SCRIPT_LOCKED", "FILMED", "EDITING", "REVIEW", "READY", "PUBLISHED"]);
const MODES = new Set(["full", "delta", "ready"]);
const RESULTS = new Set(["PENDING", "READY", "NOT_READY"]);
const HOOK_RESULTS = new Set(["PASS", "REWORK", "FAIL"]);
const FINAL_DECISIONS = new Set(["FILM", "REVISE"]);
const PACKAGE_SCHEMA = "apc.episode_pack.v2";

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
function validMultiline(value, maximum, required = true) {
  return typeof value === "string" && (!required || Boolean(value.trim())) && value.length <= maximum && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}
function validEpisodeId(value) { return typeof value === "string" && /^EP\d{2,4}$/.test(value); }
function validResearchItemId(value) {
  return value === null || (typeof value === "string" && value.length <= 260 && /^apc-weekly-topic-review:\d{4}-W\d{2}\|topic:[A-Za-z0-9._-]{4,100}$/.test(value));
}
function validIdempotencyKey(value) { return typeof value === "string" && /^[A-Za-z0-9:_-]{12,180}$/.test(value); }
function safeJson(value) { try { return JSON.parse(value); } catch { return null; } }
function hasUnsafeKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasUnsafeKey);
  return Object.keys(value).some(key => ["__proto__", "constructor", "prototype"].includes(key) || hasUnsafeKey(value[key]));
}
function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (isObject(value)) return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function deidentifiedTitle(value) {
  return !/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i.test(value) && !/@[a-z0-9_]/i.test(value) && !/\b(?:https?|ftp|file):/i.test(value);
}
function validStringArray(value, maximumItems = 30, maximumText = 2000) {
  return Array.isArray(value) && value.length <= maximumItems && value.every(item => validMultiline(item, maximumText, false));
}
function validatePrompt(prompt) {
  if (!exactKeys(prompt, ["schemaVersion", "format", "notes", "text", "sourceContext", "masterRules"])) return "Tracked prompt does not match the expected schema.";
  if (prompt.schemaVersion !== "apc.episode_prompt.v1" || !validText(prompt.format, 80) || !validMultiline(prompt.notes, 2000, false) || !validMultiline(prompt.text, 100000)) return "Tracked prompt fields are invalid.";
  if (!isObject(prompt.sourceContext) || hasUnsafeKey(prompt.sourceContext)) return "Prompt source context is invalid.";
  if (!exactKeys(prompt.masterRules, ["version", "sha256", "sourcePath"]) || !validText(prompt.masterRules.version, 40) || !/^[0-9a-f]{64}$/.test(prompt.masterRules.sha256) || !validText(prompt.masterRules.sourcePath, 260)) return "Master rule identity is invalid.";
  return null;
}
function validateProductionPack(pack) {
  const keys = ["schemaVersion", "episodeId", "masterRules", "redteam", "hookGate", "finalDecision", "spokenScript", "filmingBoard", "overlays", "hyperframesPrompt", "visualAssets", "editNotes", "sourceNotes", "platformCopy", "claimCautions"];
  if (!exactKeys(pack, keys)) return "Imported pack does not match the expected schema.";
  if (pack.schemaVersion !== PACKAGE_SCHEMA || !validEpisodeId(pack.episodeId)) return "Imported pack identity is invalid.";
  if (!exactKeys(pack.masterRules, ["version", "sha256"]) || !validText(pack.masterRules.version, 40) || !/^[0-9a-f]{64}$/.test(pack.masterRules.sha256)) return "Imported pack master rule identity is invalid.";
  if (!exactKeys(pack.redteam, ["result", "score", "risks", "fixes"]) || !["PASS", "FAIL"].includes(pack.redteam.result) || !Number.isFinite(pack.redteam.score) || pack.redteam.score < 0 || pack.redteam.score > 10 || !validStringArray(pack.redteam.risks) || !validStringArray(pack.redteam.fixes)) return "Imported pack red-team result is invalid. Score must be between 0 and 10.";
  if (!exactKeys(pack.hookGate, ["result", "yesCount", "checks"]) || !HOOK_RESULTS.has(pack.hookGate.result) || !Number.isSafeInteger(pack.hookGate.yesCount) || pack.hookGate.yesCount < 0 || pack.hookGate.yesCount > 5 || !Array.isArray(pack.hookGate.checks) || pack.hookGate.checks.length !== 5 || !pack.hookGate.checks.every(value => typeof value === "boolean") || pack.hookGate.checks.filter(Boolean).length !== pack.hookGate.yesCount) return "Imported pack hook gate is invalid.";
  if (!FINAL_DECISIONS.has(pack.finalDecision) || !validMultiline(pack.spokenScript, 20000) || !Array.isArray(pack.filmingBoard) || !pack.filmingBoard.length || pack.filmingBoard.length > 80 || !Array.isArray(pack.overlays) || pack.overlays.length > 80 || !validMultiline(pack.hyperframesPrompt, 30000, false)) return "Imported pack production content is invalid.";
  if (!(isObject(pack.visualAssets) || Array.isArray(pack.visualAssets)) || !validStringArray(pack.editNotes, 50, 3000) || !validStringArray(pack.sourceNotes, 50, 3000) || !isObject(pack.platformCopy) || !validStringArray(pack.claimCautions, 50, 3000) || hasUnsafeKey(pack)) return "Imported pack supporting content is invalid.";
  return null;
}

export function validateAction(payload) {
  if (!isObject(payload) || typeof payload.action !== "string") return "Request must be a workflow action.";
  if (payload.action === "create_episode") {
    if (!exactKeys(payload, ["action", "episode"]) || !exactKeys(payload.episode, ["id", "title", "researchItemId"])) return "Episode request does not match the expected schema.";
    if (!validEpisodeId(payload.episode.id)) return "Episode id must use EP followed by 2 to 4 digits.";
    if (!validText(payload.episode.title, 200) || !deidentifiedTitle(payload.episode.title)) return "Episode title is invalid or not deidentified.";
    if (!validResearchItemId(payload.episode.researchItemId)) return "Research item id is invalid.";
    return null;
  }
  if (payload.action === "create_tracked_prompt") {
    if (!exactKeys(payload, ["action", "episode", "prompt", "idempotencyKey"]) || !exactKeys(payload.episode, ["id", "title", "researchItemId"])) return "Tracked episode request does not match the expected schema.";
    if (!validEpisodeId(payload.episode.id) || !validText(payload.episode.title, 200) || !deidentifiedTitle(payload.episode.title) || !validResearchItemId(payload.episode.researchItemId)) return "Tracked episode identity is invalid.";
    if (!validIdempotencyKey(payload.idempotencyKey)) return "Idempotency key is invalid.";
    return validatePrompt(payload.prompt);
  }
  if (payload.action === "save_prompt_revision") {
    if (!exactKeys(payload, ["action", "episodeId", "prompt", "idempotencyKey"]) || !validEpisodeId(payload.episodeId) || !validIdempotencyKey(payload.idempotencyKey)) return "Prompt revision request is invalid.";
    return validatePrompt(payload.prompt);
  }
  if (payload.action === "import_production_pack") {
    if (!exactKeys(payload, ["action", "episodeId", "pack", "idempotencyKey"]) || !validEpisodeId(payload.episodeId) || !validIdempotencyKey(payload.idempotencyKey)) return "Production pack import request is invalid.";
    const error = validateProductionPack(payload.pack);
    if (error) return error;
    if (payload.pack.episodeId !== payload.episodeId) return "Imported pack belongs to a different episode.";
    return null;
  }
  if (payload.action === "lock_script") {
    if (!exactKeys(payload, ["action", "episodeId", "idempotencyKey"]) || !validEpisodeId(payload.episodeId) || !validIdempotencyKey(payload.idempotencyKey)) return "Script lock request is invalid.";
    return null;
  }
  if (payload.action === "update_episode_status") {
    if (!exactKeys(payload, ["action", "episodeId", "status"]) || !validEpisodeId(payload.episodeId) || !STATUSES.has(payload.status)) return "Episode status request is invalid.";
    return null;
  }
  if (payload.action === "save_production_pack") {
    if (!exactKeys(payload, ["action", "episodeId", "pack"]) || !validEpisodeId(payload.episodeId) || !isObject(payload.pack) || hasUnsafeKey(payload.pack)) return "Production pack request is invalid.";
    return null;
  }
  if (payload.action === "save_review") {
    if (!exactKeys(payload, ["action", "episodeId", "manifest"]) || !validEpisodeId(payload.episodeId) || !isObject(payload.manifest) || hasUnsafeKey(payload.manifest)) return "Review request is invalid.";
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

function nextEpisodeId(rows) {
  const used = new Set(rows.map(row => row.id));
  let number = Math.max(0, ...rows.map(row => Number(/^EP(\d+)$/.exec(row.id)?.[1] || 0))) + 1;
  while (used.has("EP" + String(number).padStart(2, "0"))) number += 1;
  return "EP" + String(number).padStart(2, "0");
}
async function overview(database, actionResult = null) {
  const [episodes, reviews, publications, artifacts, events] = await database.batch([
    database.prepare("SELECT * FROM episodes ORDER BY updated_at DESC, id DESC LIMIT 200"),
    database.prepare("SELECT * FROM video_reviews ORDER BY reviewed_at DESC LIMIT 200"),
    database.prepare(`SELECT p.publication_id, p.platform, p.post_ref, p.published_at, p.publication_json,
      COUNT(s.snapshot_id) AS snapshot_count, MAX(s.captured_at) AS last_snapshot_at
      FROM content_publications p LEFT JOIN content_analytics_snapshots s ON s.publication_id = p.publication_id AND s.archived = 0
      GROUP BY p.publication_id, p.platform, p.post_ref, p.published_at, p.publication_json
      ORDER BY p.created_at DESC LIMIT 200`),
    database.prepare("SELECT * FROM episode_artifacts ORDER BY created_at DESC, version DESC LIMIT 500"),
    database.prepare("SELECT * FROM episode_events ORDER BY created_at DESC LIMIT 1000"),
  ]);
  const episodeRows = episodes.results || [];
  return {
    schemaVersion: "apc.episode_workflow.v2",
    nextEpisodeId: nextEpisodeId(episodeRows),
    actionResult,
    episodes: episodeRows.map(row => ({ ...row, productionPack: row.production_pack_json ? safeJson(row.production_pack_json) : null })),
    reviews: (reviews.results || []).map(row => ({ ...row, manifest: safeJson(row.manifest_json) })),
    artifacts: (artifacts.results || []).map(row => ({ ...row, payload: safeJson(row.payload_json) })),
    events: (events.results || []).map(row => ({ ...row, metadata: safeJson(row.metadata_json) })),
    publications: (publications.results || []).map(row => {
      const data = safeJson(row.publication_json) || {};
      return { ...data, publicationId: row.publication_id, platform: row.platform, postRef: row.post_ref, publishedAt: row.published_at, snapshotCount: Number(row.snapshot_count || 0), lastSnapshotAt: row.last_snapshot_at };
    }),
  };
}
async function eventByKey(database, key) {
  return database.prepare("SELECT event_id, episode_id, event_type, artifact_id, payload_sha256 FROM episode_events WHERE idempotency_key = ?").bind(key).first();
}
async function idempotentOverview(database, key, hash) {
  const existing = await eventByKey(database, key);
  if (!existing) return null;
  if (existing.payload_sha256 !== hash) return json({ error: "That idempotency key is already attached to different data." }, 409);
  return json(await overview(database, { idempotent: true, episodeId: existing.episode_id, artifactId: existing.artifact_id, eventType: existing.event_type }));
}
function eventStatement(database, { episodeId, eventType, artifactId = null, idempotencyKey, payloadHash, metadata, now }) {
  return database.prepare(`INSERT INTO episode_events
    (event_id, episode_id, event_type, artifact_id, idempotency_key, payload_sha256, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), episodeId, eventType, artifactId, idempotencyKey, payloadHash, JSON.stringify(metadata), now);
}
function packGate(pack) {
  const coreHookChecksPass = pack.hookGate.checks.slice(0, 3).every(Boolean);
  return pack.redteam.result === "PASS" && pack.hookGate.result === "PASS" && pack.hookGate.yesCount >= 4 && coreHookChecksPass && pack.finalDecision === "FILM";
}
async function latestProductionArtifact(database, episodeId) {
  return database.prepare(`SELECT * FROM episode_artifacts
    WHERE episode_id = ? AND artifact_type = 'PRODUCTION_PACK'
    ORDER BY version DESC LIMIT 1`).bind(episodeId).first();
}
async function requireGatedPack(database, episodeId) {
  const artifact = await latestProductionArtifact(database, episodeId);
  const pack = artifact ? safeJson(artifact.payload_json) : null;
  return artifact && pack && packGate(pack) ? { artifact, pack } : null;
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
    if (payload.action === "create_tracked_prompt") {
      const payloadHash = await sha256Hex(canonicalJson({ episode: payload.episode, prompt: payload.prompt }));
      const duplicate = await idempotentOverview(database, payload.idempotencyKey, payloadHash);
      if (duplicate) return duplicate;
      const existing = await database.prepare("SELECT id FROM episodes WHERE id = ?").bind(payload.episode.id).first();
      if (existing) return json({ error: "That episode ID already exists. Refresh and try again." }, 409);
      const researchId = payload.episode.researchItemId;
      if (researchId) {
        const researchItem = await database.prepare("SELECT item_id FROM research_items WHERE item_id = ? AND item_type = 'topic'").bind(researchId).first();
        if (!researchItem) return json({ error: "Research topic was not found." }, 404);
        const usedByEpisode = await database.prepare("SELECT id FROM episodes WHERE source_research_item_id = ?").bind(researchId).first();
        if (usedByEpisode) return json({ error: "That research topic already has an episode." }, 409);
      }
      const artifactId = crypto.randomUUID();
      const promptHash = await sha256Hex(canonicalJson(payload.prompt));
      const packReference = {
        schemaVersion: "apc.episode_record.v2",
        episodeId: payload.episode.id,
        sourceContext: payload.prompt.sourceContext,
        masterRules: payload.prompt.masterRules,
        prompt: { artifactId, version: 1, sha256: promptHash },
        latestPackage: null,
      };
      const statements = [
        database.prepare(`INSERT INTO episodes (id, title, source_research_item_id, status, production_pack_json, created_at, updated_at)
          VALUES (?, ?, ?, 'APPROVED', ?, ?, ?)`).bind(payload.episode.id, payload.episode.title.trim(), researchId, JSON.stringify(packReference), now, now),
        database.prepare(`INSERT INTO episode_artifacts
          (artifact_id, episode_id, artifact_type, version, payload_sha256, payload_json, redteam_status, hook_gate_status, final_decision, created_at)
          VALUES (?, ?, 'PROMPT', 1, ?, ?, 'NOT_APPLICABLE', NULL, NULL, ?)`).bind(artifactId, payload.episode.id, promptHash, JSON.stringify(payload.prompt), now),
        eventStatement(database, { episodeId: payload.episode.id, eventType: "PROMPT_BUILT", artifactId, idempotencyKey: payload.idempotencyKey, payloadHash, metadata: { version: 1, promptSha256: promptHash, format: payload.prompt.format, masterRules: payload.prompt.masterRules }, now }),
      ];
      if (researchId) statements.push(database.prepare("INSERT INTO research_decisions (item_id, decision, decided_at, request_id) VALUES (?, 'used', ?, ?)").bind(researchId, now, crypto.randomUUID()));
      await database.batch(statements);
      return json(await overview(database, { idempotent: false, episodeId: payload.episode.id, artifactId, eventType: "PROMPT_BUILT" }), 201);
    }

    if (payload.action === "save_prompt_revision") {
      const payloadHash = await sha256Hex(canonicalJson({ episodeId: payload.episodeId, prompt: payload.prompt }));
      const duplicate = await idempotentOverview(database, payload.idempotencyKey, payloadHash);
      if (duplicate) return duplicate;
      const episode = await database.prepare("SELECT id, status, production_pack_json FROM episodes WHERE id = ?").bind(payload.episodeId).first();
      if (!episode) return json({ error: "Episode was not found." }, 404);
      if (!["IDEA", "APPROVED", "SCRIPT_LOCKED"].includes(episode.status)) return json({ error: "This episode has progressed beyond script locking. Create a new episode for a changed prompt." }, 409);
      const promptHash = await sha256Hex(canonicalJson(payload.prompt));
      const samePrompt = await database.prepare("SELECT artifact_id, version FROM episode_artifacts WHERE episode_id = ? AND artifact_type = 'PROMPT' AND payload_sha256 = ?").bind(payload.episodeId, promptHash).first();
      if (samePrompt) return json(await overview(database, { idempotent: true, episodeId: payload.episodeId, artifactId: samePrompt.artifact_id, eventType: "PROMPT_BUILT" }));
      const latest = await database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM episode_artifacts WHERE episode_id = ? AND artifact_type = 'PROMPT'").bind(payload.episodeId).first();
      const version = Number(latest?.version || 0) + 1;
      const artifactId = crypto.randomUUID();
      const record = safeJson(episode.production_pack_json) || {};
      const nextRecord = { ...record, schemaVersion: "apc.episode_record.v2", episodeId: payload.episodeId, sourceContext: payload.prompt.sourceContext, masterRules: payload.prompt.masterRules, prompt: { artifactId, version, sha256: promptHash }, latestPackage: null };
      delete nextRecord.package;
      await database.batch([
        database.prepare(`INSERT INTO episode_artifacts
          (artifact_id, episode_id, artifact_type, version, payload_sha256, payload_json, redteam_status, hook_gate_status, final_decision, created_at)
          VALUES (?, ?, 'PROMPT', ?, ?, ?, 'NOT_APPLICABLE', NULL, NULL, ?)`).bind(artifactId, payload.episodeId, version, promptHash, JSON.stringify(payload.prompt), now),
        database.prepare("UPDATE episodes SET status = 'APPROVED', production_pack_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(nextRecord), now, payload.episodeId),
        eventStatement(database, { episodeId: payload.episodeId, eventType: "PROMPT_BUILT", artifactId, idempotencyKey: payload.idempotencyKey, payloadHash, metadata: { version, promptSha256: promptHash, format: payload.prompt.format, masterRules: payload.prompt.masterRules }, now }),
      ]);
      return json(await overview(database, { idempotent: false, episodeId: payload.episodeId, artifactId, eventType: "PROMPT_BUILT" }), 201);
    }

    if (payload.action === "import_production_pack") {
      const payloadHash = await sha256Hex(canonicalJson({ episodeId: payload.episodeId, pack: payload.pack }));
      const duplicate = await idempotentOverview(database, payload.idempotencyKey, payloadHash);
      if (duplicate) return duplicate;
      const episode = await database.prepare("SELECT id, status, production_pack_json FROM episodes WHERE id = ?").bind(payload.episodeId).first();
      if (!episode) return json({ error: "Episode was not found." }, 404);
      if (!["IDEA", "APPROVED", "SCRIPT_LOCKED"].includes(episode.status)) return json({ error: "This episode has progressed beyond script locking. Create a new episode for a changed script." }, 409);
      const record = safeJson(episode.production_pack_json) || {};
      if (record.masterRules && (record.masterRules.version !== payload.pack.masterRules.version || record.masterRules.sha256 !== payload.pack.masterRules.sha256)) return json({ error: "Imported pack does not match the episode's locked master rules." }, 409);
      const packHash = await sha256Hex(canonicalJson(payload.pack));
      const samePack = await database.prepare("SELECT artifact_id, version FROM episode_artifacts WHERE episode_id = ? AND artifact_type = 'PRODUCTION_PACK' AND payload_sha256 = ?").bind(payload.episodeId, packHash).first();
      if (samePack) return json(await overview(database, { idempotent: true, episodeId: payload.episodeId, artifactId: samePack.artifact_id, eventType: "PACK_IMPORTED" }));
      const latest = await database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM episode_artifacts WHERE episode_id = ? AND artifact_type = 'PRODUCTION_PACK'").bind(payload.episodeId).first();
      const version = Number(latest?.version || 0) + 1;
      const artifactId = crypto.randomUUID();
      const nextRecord = { ...record, schemaVersion: "apc.episode_record.v2", episodeId: payload.episodeId, masterRules: payload.pack.masterRules, latestPackage: { artifactId, version, sha256: packHash }, package: payload.pack };
      await database.batch([
        database.prepare(`INSERT INTO episode_artifacts
          (artifact_id, episode_id, artifact_type, version, payload_sha256, payload_json, redteam_status, hook_gate_status, final_decision, created_at)
          VALUES (?, ?, 'PRODUCTION_PACK', ?, ?, ?, ?, ?, ?, ?)`).bind(artifactId, payload.episodeId, version, packHash, JSON.stringify(payload.pack), payload.pack.redteam.result, payload.pack.hookGate.result, payload.pack.finalDecision, now),
        database.prepare("UPDATE episodes SET status = 'APPROVED', production_pack_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(nextRecord), now, payload.episodeId),
        eventStatement(database, { episodeId: payload.episodeId, eventType: "PACK_IMPORTED", artifactId, idempotencyKey: payload.idempotencyKey, payloadHash, metadata: { version, packSha256: packHash, redteam: payload.pack.redteam.result, hookGate: payload.pack.hookGate.result, finalDecision: payload.pack.finalDecision }, now }),
      ]);
      return json(await overview(database, { idempotent: false, episodeId: payload.episodeId, artifactId, eventType: "PACK_IMPORTED" }), 201);
    }

    if (payload.action === "lock_script") {
      const payloadHash = await sha256Hex(canonicalJson({ episodeId: payload.episodeId, action: payload.action }));
      const duplicate = await idempotentOverview(database, payload.idempotencyKey, payloadHash);
      if (duplicate) return duplicate;
      const episode = await database.prepare("SELECT id FROM episodes WHERE id = ?").bind(payload.episodeId).first();
      if (!episode) return json({ error: "Episode was not found." }, 404);
      const gated = await requireGatedPack(database, payload.episodeId);
      if (!gated) return json({ error: "Red-team PASS, Hook Gate PASS and FILM decision are required before filming." }, 409);
      await database.batch([
        database.prepare("UPDATE episodes SET status = 'SCRIPT_LOCKED', updated_at = ? WHERE id = ?").bind(now, payload.episodeId),
        eventStatement(database, { episodeId: payload.episodeId, eventType: "SCRIPT_LOCKED", artifactId: gated.artifact.artifact_id, idempotencyKey: payload.idempotencyKey, payloadHash, metadata: { packVersion: gated.artifact.version, packSha256: gated.artifact.payload_sha256 }, now }),
      ]);
      return json(await overview(database, { idempotent: false, episodeId: payload.episodeId, artifactId: gated.artifact.artifact_id, eventType: "SCRIPT_LOCKED" }));
    }

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
          database.prepare("INSERT INTO research_decisions (item_id, decision, decided_at, request_id) VALUES (?, 'used', ?, ?)").bind(researchId, now, crypto.randomUUID()),
        ]);
      } else {
        await database.prepare(`INSERT INTO episodes (id, title, source_research_item_id, status, production_pack_json, created_at, updated_at)
          VALUES (?, ?, NULL, 'APPROVED', NULL, ?, ?)`).bind(payload.episode.id, payload.episode.title.trim(), now, now).run();
      }
    } else if (payload.action === "update_episode_status") {
      const episode = await database.prepare("SELECT id, status FROM episodes WHERE id = ?").bind(payload.episodeId).first();
      if (!episode) return json({ error: "Episode was not found." }, 404);
      if (payload.status === episode.status) return json(await overview(database));
      if (payload.status === "SCRIPT_LOCKED") return json({ error: "Use Lock for filming so the latest gated package is attached to the lock event." }, 409);
      if (payload.status === "READY") return json({ error: "READY can only be set by a final hash-based video review." }, 409);
      const transitions = {
        IDEA: new Set(["APPROVED"]),
        APPROVED: new Set(["IDEA"]),
        SCRIPT_LOCKED: new Set(["APPROVED", "FILMED"]),
        FILMED: new Set(["SCRIPT_LOCKED", "EDITING"]),
        EDITING: new Set(["FILMED", "REVIEW"]),
        REVIEW: new Set(["EDITING"]),
        READY: new Set(["REVIEW", "PUBLISHED"]),
        PUBLISHED: new Set(["READY"]),
      };
      if (!transitions[episode.status]?.has(payload.status)) return json({ error: "Move the episode one tracked stage at a time." }, 409);
      if (["FILMED", "EDITING", "REVIEW", "PUBLISHED"].includes(payload.status)) {
        const gated = await requireGatedPack(database, payload.episodeId);
        if (!gated) return json({ error: "Import a package with Red-team PASS, Hook Gate PASS and FILM decision before advancing this episode." }, 409);
      }
      if (payload.status === "PUBLISHED") {
        const publication = await database.prepare("SELECT publication_id FROM content_publications WHERE json_extract(publication_json, '$.episodeId') = ? LIMIT 1").bind(payload.episodeId).first();
        if (!publication) return json({ error: "Connect the published platform post to this episode ID before marking it PUBLISHED." }, 409);
      }
      const statusHash = await sha256Hex(canonicalJson({ episodeId: payload.episodeId, status: payload.status, at: now }));
      const result = await database.prepare("UPDATE episodes SET status = ?, updated_at = ? WHERE id = ?").bind(payload.status, now, payload.episodeId).run();
      if (Number(result.meta?.changes || 0) !== 1) return json({ error: "Episode stage was not changed." }, 409);
      await eventStatement(database, { episodeId: payload.episodeId, eventType: payload.status === "SCRIPT_LOCKED" ? "SCRIPT_LOCKED" : "STATUS_CHANGED", idempotencyKey: "status:" + crypto.randomUUID(), payloadHash: statusHash, metadata: { status: payload.status }, now }).run();
    } else if (payload.action === "save_production_pack") {
      const result = await database.prepare("UPDATE episodes SET production_pack_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(payload.pack), now, payload.episodeId).run();
      if (Number(result.meta?.changes || 0) !== 1) return json({ error: "Episode was not found." }, 404);
    } else if (payload.action === "save_review") {
      const manifest = payload.manifest;
      const episode = await database.prepare("SELECT id, status FROM episodes WHERE id = ?").bind(payload.episodeId).first();
      if (!episode) return json({ error: "Episode was not found." }, 404);
      const result = manifest.review?.status || "PENDING";
      const gated = await requireGatedPack(database, payload.episodeId);
      if (!gated || !["FILMED", "EDITING", "REVIEW", "READY"].includes(episode.status)) return json({ error: "Film and edit the locked, gated package before saving a video review." }, 409);
      if (result === "READY" && manifest.mode !== "ready") return json({ error: "Only final ready mode can mark a video READY." }, 409);
      const priorReview = await database.prepare("SELECT id FROM video_reviews WHERE episode_id = ? AND video_sha256 = ? AND mode = ?").bind(payload.episodeId, manifest.video.sha256.toLowerCase(), manifest.mode).first();
      if (priorReview) return json(await overview(database));
      const reviewHash = await sha256Hex(canonicalJson(manifest));
      await database.batch([
        database.prepare(`INSERT INTO video_reviews
          (id, episode_id, version_label, video_sha256, mode, result, score, manifest_json, reviewed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (episode_id, video_sha256, mode) DO NOTHING`).bind(crypto.randomUUID(), payload.episodeId, manifest.label.trim(), manifest.video.sha256.toLowerCase(), manifest.mode, result, Number.isFinite(manifest.review?.score) ? manifest.review.score : null, JSON.stringify(manifest), now),
        database.prepare("UPDATE episodes SET status = ?, updated_at = ? WHERE id = ?").bind(result === "READY" ? "READY" : "REVIEW", now, payload.episodeId),
        eventStatement(database, { episodeId: payload.episodeId, eventType: "VIDEO_REVIEWED", idempotencyKey: "review:" + payload.episodeId + ":" + manifest.video.sha256.toLowerCase() + ":" + manifest.mode, payloadHash: reviewHash, metadata: { label: manifest.label.trim(), mode: manifest.mode, result, score: Number.isFinite(manifest.review?.score) ? manifest.review.score : null }, now }),
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
