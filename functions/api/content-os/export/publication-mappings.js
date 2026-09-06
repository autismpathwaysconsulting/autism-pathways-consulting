const SOURCE = "apc-ai-os-meta-insights";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const encoder = new TextEncoder();

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function bytesFromHex(value) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < value.length; index += 2) bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  return bytes;
}

function constantTimeEqual(actual, expected) {
  if (typeof crypto.subtle.timingSafeEqual === "function") return crypto.subtle.timingSafeEqual(actual, expected);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < expected.length; index += 1) difference |= (actual[index] ?? 0) ^ expected[index];
  return difference === 0;
}

async function verifyRequest(secret, request) {
  const timestamp = request.headers.get("X-APC-Timestamp") || "";
  const parsedTimestamp = Date.parse(timestamp);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp) ||
      !Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp) > MAX_CLOCK_SKEW_MS) return false;
  const suppliedHeader = request.headers.get("X-APC-Signature-256") || "";
  const supplied = suppliedHeader.startsWith("sha256=") ? bytesFromHex(suppliedHeader.slice(7)) : null;
  if (!supplied) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = `GET\n/api/content-os/export/publication-mappings\n${timestamp}`;
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(signed)));
  return constantTimeEqual(supplied, expected);
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

export async function onRequestGet({ request, env }) {
  if (env.APC_CONTENT_OS_AUTOMATION_ENABLED !== "true" ||
      env.APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED !== "true" ||
      !env.APC_CONTENT_OS_ANALYTICS_INGEST_SECRET) {
    return json({ error: "Publication mapping export is not configured.", code: "not_configured" }, 503);
  }
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Canonical database is unavailable.", code: "database_unavailable" }, 503);
  if (request.headers.get("X-APC-Source") !== SOURCE) {
    return json({ error: "Publication mapping source is not approved.", code: "unapproved_source" }, 403);
  }
  if (!await verifyRequest(env.APC_CONTENT_OS_ANALYTICS_INGEST_SECRET, request)) {
    return json({ error: "Publication mapping signature is invalid or expired.", code: "invalid_signature" }, 401);
  }
  try {
    const result = await env.APC_CONTENT_OS_DB.prepare(`SELECT p.publication_id, p.platform, p.post_ref, p.published_at,
      p.payload_hash, p.publication_json FROM content_publications p
      JOIN episodes e ON e.id = json_extract(p.publication_json, '$.episodeId')
      WHERE p.platform = 'Instagram' AND e.status = 'PUBLISHED' AND e.archived_at IS NULL
        AND EXISTS (
          SELECT 1 FROM episode_events event
          WHERE event.episode_id = e.id AND event.event_type = 'PUBLICATION_LINKED'
            AND json_extract(event.metadata_json, '$.publicationId') = p.publication_id
            AND json_extract(event.metadata_json, '$.trackingMode') = 'meta_github_sync'
        )
      ORDER BY p.created_at DESC LIMIT 500`).all();
    const mappings = [];
    for (const row of result.results || []) {
      const publication = safeJson(row.publication_json);
      if (!publication || publication.publicationId !== row.publication_id || publication.platform !== row.platform ||
          publication.postRef !== row.post_ref || !/^EP\d{2,4}$/.test(publication.episodeId || "")) continue;
      mappings.push({
        publicationId: row.publication_id,
        episodeId: publication.episodeId,
        platform: row.platform,
        postRef: row.post_ref,
        publishedAt: row.published_at,
        title: publication.title,
        topic: publication.topic,
        problemArea: publication.problemArea,
        productFamily: publication.productFamily,
        format: publication.format,
        durationSeconds: publication.durationSeconds,
        hookType: publication.hookType,
        creativeVersion: publication.creativeVersion,
        ctaType: publication.ctaType,
        experimentType: publication.experimentType,
        payloadHash: row.payload_hash,
      });
    }
    return json({
      schemaVersion: "apc.publication-mappings.v1",
      generatedAt: new Date().toISOString(),
      source: "content-os-d1",
      mappings,
    });
  } catch (error) {
    console.error(JSON.stringify({ message: "Publication mapping export failed", errorType: String(error?.name || "Error") }));
    return json({ error: "Publication mappings are temporarily unavailable.", code: "storage_unavailable" }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ error: "Only GET is supported.", code: "method_not_allowed" }, 405);
}
