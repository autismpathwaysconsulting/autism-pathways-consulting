import { assertValidPublication } from "../../../../content-os/analytics.js";

const MAX_BODY_BYTES = 64 * 1024;
const CHECKPOINTS = Object.freeze(["24h", "7d", "28d"]);

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validIdempotencyKey(value) {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{12,180}$/.test(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readBody(request) {
  if (request.headers.get("X-APC-Content-OS") !== "1") {
    throw json({ error: "Missing Content OS request header.", code: "missing_intent_header" }, 400);
  }
  if (new URL(request.url).search) {
    throw json({ error: "POST does not accept query parameters.", code: "query_not_allowed" }, 400);
  }
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw json({ error: "Cross-origin writes are not allowed.", code: "cross_origin_write" }, 403);
  }
  if ((request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw json({ error: "Content-Type must be application/json.", code: "unsupported_content_type" }, 415);
  }
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    throw json({ error: "Content-Length is invalid or too large.", code: "invalid_content_length" }, Number(declared) > MAX_BODY_BYTES ? 413 : 400);
  }
  const reader = request.body?.getReader();
  if (!reader) throw json({ error: "Request body is required.", code: "invalid_body" }, 400);
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel("body too large");
        throw json({ error: "Request body is too large.", code: "body_too_large" }, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (declared !== null && Number(declared) !== total) {
    throw json({ error: "Content-Length does not match the request body.", code: "content_length_mismatch" }, 400);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw json({ error: "Request body is not valid UTF-8 JSON.", code: "invalid_json" }, 400);
  }
}

export async function onRequestPost({ request, env }) {
  if (env.APC_CONTENT_OS_AUTOMATION_ENABLED !== "true" || env.APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED !== "true") {
    return json({ error: "The existing Meta automation is not configured.", code: "not_configured" }, 503);
  }
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Canonical database is not configured.", code: "database_unavailable" }, 503);

  let payload;
  try {
    payload = await readBody(request);
  } catch (error) {
    return error instanceof Response ? error : json({ error: "Publication request is invalid.", code: "invalid_body" }, 400);
  }
  if (!exactKeys(payload, ["idempotencyKey", "publication"]) || !validIdempotencyKey(payload.idempotencyKey)) {
    return json({ error: "Publication request does not match the expected schema.", code: "invalid_schema" }, 400);
  }

  const publication = payload.publication;
  try {
    assertValidPublication(publication);
  } catch (error) {
    return json({ error: String(error?.message || error), code: "invalid_publication" }, 400);
  }
  if (publication.platform !== "Instagram") {
    return json({ error: "The existing feed currently supports Instagram publications only.", code: "unsupported_platform" }, 409);
  }
  if (!/^EP\d{2,4}$/.test(publication.episodeId || "") || !publication.publishedAt) {
    return json({ error: "A tracked episode ID and publication time are required.", code: "invalid_episode_link" }, 400);
  }
  const publishedTime = Date.parse(publication.publishedAt);
  if (!Number.isFinite(publishedTime) || publishedTime > Date.now() + 5 * 60 * 1000) {
    return json({ error: "Published time is invalid.", code: "invalid_published_at" }, 400);
  }

  const database = env.APC_CONTENT_OS_DB;
  const publicationJson = canonicalJson(publication);
  const publicationHash = await sha256Hex(publicationJson);
  const requestHash = await sha256Hex(canonicalJson({ publication }));
  try {
    const priorEvent = await database.prepare(`SELECT episode_id, payload_sha256 FROM episode_events
      WHERE idempotency_key = ?`).bind(payload.idempotencyKey).first();
    if (priorEvent) {
      if (priorEvent.episode_id !== publication.episodeId || priorEvent.payload_sha256 !== requestHash) {
        return json({ error: "That idempotency key is already attached to different data.", code: "idempotency_conflict" }, 409);
      }
      return json({
        schemaVersion: "apc.external-publication.v1",
        tracked: true,
        idempotent: true,
        publicationId: publication.publicationId,
        episodeId: publication.episodeId,
        checkpoints: CHECKPOINTS,
      });
    }

    const episode = await database.prepare(`SELECT id, status, archived_at FROM episodes WHERE id = ?`)
      .bind(publication.episodeId).first();
    if (!episode) return json({ error: "Episode was not found.", code: "episode_not_found" }, 404);
    if (episode.archived_at) return json({ error: "Restore this episode before publishing it.", code: "episode_archived" }, 409);
    if (!["READY", "PUBLISHED"].includes(episode.status)) {
      return json({ error: "Complete the final READY video review before publishing.", code: "episode_not_ready" }, 409);
    }

    const existing = await database.prepare(`SELECT publication_id, payload_hash FROM content_publications
      WHERE publication_id = ? OR (platform = ? AND post_ref = ?) LIMIT 1`)
      .bind(publication.publicationId, publication.platform, publication.postRef).first();
    if (existing && (existing.publication_id !== publication.publicationId || existing.payload_hash !== publicationHash)) {
      return json({ error: "Publication conflicts with an existing record.", code: "publication_conflict" }, 409);
    }

    const now = new Date().toISOString();
    const statements = [];
    if (!existing) {
      statements.push(database.prepare(`INSERT INTO content_publications
        (publication_id, platform, post_ref, published_at, created_at, payload_hash, publication_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(publication.publicationId, publication.platform, publication.postRef, publication.publishedAt, now, publicationHash, publicationJson));
    }
    statements.push(
      database.prepare(`INSERT INTO episode_events
        (event_id, episode_id, event_type, artifact_id, idempotency_key, payload_sha256, metadata_json, created_at)
        VALUES (?, ?, 'PUBLICATION_LINKED', NULL, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), publication.episodeId, payload.idempotencyKey, requestHash, JSON.stringify({
          publicationId: publication.publicationId,
          platform: publication.platform,
          trackingMode: "meta_github_sync",
          checkpoints: CHECKPOINTS,
        }), now),
      database.prepare("UPDATE episodes SET status = 'PUBLISHED', updated_at = ? WHERE id = ?")
        .bind(now, publication.episodeId),
    );
    await database.batch(statements);
    return json({
      schemaVersion: "apc.external-publication.v1",
      tracked: true,
      idempotent: Boolean(existing),
      publicationId: publication.publicationId,
      episodeId: publication.episodeId,
      trackingMode: "meta_github_sync",
      checkpoints: CHECKPOINTS,
    }, existing ? 200 : 201);
  } catch (error) {
    try {
      const concurrentEvent = await database.prepare(`SELECT episode_id, payload_sha256 FROM episode_events
        WHERE idempotency_key = ?`).bind(payload.idempotencyKey).first();
      if (concurrentEvent) {
        if (concurrentEvent.episode_id === publication.episodeId && concurrentEvent.payload_sha256 === requestHash) {
          return json({
            schemaVersion: "apc.external-publication.v1",
            tracked: true,
            idempotent: true,
            publicationId: publication.publicationId,
            episodeId: publication.episodeId,
            checkpoints: CHECKPOINTS,
          });
        }
        return json({ error: "That idempotency key is already attached to different data.", code: "idempotency_conflict" }, 409);
      }
      const concurrentPublication = await database.prepare(`SELECT publication_id, payload_hash FROM content_publications
        WHERE publication_id = ? OR (platform = ? AND post_ref = ?) LIMIT 1`)
        .bind(publication.publicationId, publication.platform, publication.postRef).first();
      if (concurrentPublication) {
        return json({ error: "Publication conflicts with an existing record.", code: "publication_conflict" }, 409);
      }
    } catch {
      // Preserve the generic storage failure below when the database itself is unavailable.
    }
    console.error(JSON.stringify({ message: "External Meta publication registration failed", errorType: String(error?.name || "Error") }));
    return json({ error: "The publication could not be linked to the existing Meta automation.", code: "storage_unavailable" }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ error: "Only POST is supported.", code: "method_not_allowed" }, 405);
}
