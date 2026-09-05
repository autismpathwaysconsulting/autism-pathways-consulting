import { assertValidPublication } from "../../content-os/analytics.js";
import { sha256Hex } from "./crypto";
import { beginOauth, finishOauth } from "./oauth";
import { ConnectionRow, isProvider, JsonRecord, record, textValue } from "./model";

const MAX_BODY_BYTES = 64 * 1024;
const CHECKPOINTS = [
  { name: "24h", delayMs: 24 * 60 * 60 * 1000, windowMs: 36 * 60 * 60 * 1000 },
  { name: "7d", delayMs: 7 * 24 * 60 * 60 * 1000, windowMs: 9 * 24 * 60 * 60 * 1000 },
  { name: "28d", delayMs: 28 * 24 * 60 * 60 * 1000, windowMs: 35 * 24 * 60 * 60 * 1000 },
] as const;

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}

async function readBody(request: Request): Promise<unknown> {
  if ((request.headers.get("Content-Type") || "").split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new Response(JSON.stringify({ error: "Content-Type must be application/json.", code: "unsupported_content_type" }), { status: 415, headers: { "Content-Type": "application/json" } });
  }
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY_BYTES) throw new Response(JSON.stringify({ error: "Request body is too large.", code: "body_too_large" }), { status: 413, headers: { "Content-Type": "application/json" } });
  const reader = request.body?.getReader();
  if (!reader) throw new Response(JSON.stringify({ error: "Request body is required.", code: "invalid_body" }), { status: 400, headers: { "Content-Type": "application/json" } });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel("Request body exceeded limit.");
        throw new Response(JSON.stringify({ error: "Request body is too large.", code: "body_too_large" }), { status: 413, headers: { "Content-Type": "application/json" } });
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { throw new Response(JSON.stringify({ error: "Request body is not valid JSON.", code: "invalid_json" }), { status: 400, headers: { "Content-Type": "application/json" } }); }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize((value as JsonRecord)[key])]));
  return value;
}

function canonicalJson(value: unknown): string { return JSON.stringify(canonicalize(value)); }

function platformMatchesProvider(platform: unknown, provider: string): boolean {
  return provider === "meta" ? platform === "Instagram" || platform === "Facebook" :
    provider === "tiktok" ? platform === "TikTok" : platform === "YouTube";
}

export async function listConnections(env: Env): Promise<Response> {
  const result = await env.APC_CONTENT_OS_DB.prepare(`SELECT connection_id, provider, account_id, account_name,
    token_expires_at, scopes_json, metadata_json, status, last_refreshed_at, last_error_code, created_at, updated_at
    FROM content_analytics_connections ORDER BY provider, account_name`).all();
  return json({
    schemaVersion: "apc.analytics_connectors.v1",
    ingestionEnabled: String(env.APC_ANALYTICS_INGESTION_ENABLED) === "true",
    enabledProviders: String(env.APC_ANALYTICS_ENABLED_PROVIDERS).split(",").map(value => value.trim()).filter(isProvider),
    configuredProviders: {
      meta: Boolean(env.META_APP_ID && env.META_APP_SECRET),
      tiktok: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
      youtube: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    },
    connections: result.results.map(row => ({
      connectionId: row.connection_id, provider: row.provider, accountId: row.account_id,
      accountName: row.account_name, tokenExpiresAt: row.token_expires_at, status: row.status,
      lastRefreshedAt: row.last_refreshed_at, lastErrorCode: row.last_error_code,
      createdAt: row.created_at, updatedAt: row.updated_at,
    })),
  });
}

export async function disconnect(request: Request, env: Env, provider: string): Promise<Response> {
  if (!isProvider(provider)) return json({ error: "Provider is invalid.", code: "invalid_provider" }, 404);
  const body = record(await readBody(request), "Request body is invalid.");
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, "connectionId")) return json({ error: "Request schema is invalid.", code: "invalid_schema" }, 400);
  const connectionId = textValue(body.connectionId, 100);
  if (!connectionId || !/^conn_[a-f0-9]{32}$/.test(connectionId)) return json({ error: "Connection ID is invalid.", code: "invalid_connection" }, 400);
  const now = new Date().toISOString();
  const results = await env.APC_CONTENT_OS_DB.batch([
    env.APC_CONTENT_OS_DB.prepare("UPDATE content_analytics_connections SET status = 'disconnected', updated_at = ? WHERE connection_id = ? AND provider = ?").bind(now, connectionId, provider),
    env.APC_CONTENT_OS_DB.prepare("UPDATE content_analytics_publication_links SET status = 'disconnected', updated_at = ? WHERE connection_id = ?").bind(now, connectionId),
    env.APC_CONTENT_OS_DB.prepare(`UPDATE content_analytics_checkpoint_jobs SET status = 'skipped', completed_at = ?,
      last_error_code = 'connection_disconnected', updated_at = ? WHERE status IN ('pending', 'retry', 'running')
      AND link_id IN (SELECT link_id FROM content_analytics_publication_links WHERE connection_id = ?)`)
      .bind(now, now, connectionId),
  ]);
  if (Number(results[0]?.meta.changes || 0) !== 1) return json({ error: "Connection was not found.", code: "not_found" }, 404);
  return json({ disconnected: true, connectionId });
}

interface ExistingPublicationRow { publication_id: string; platform: string; post_ref: string; payload_hash: string; }
interface ExistingLinkRow { link_id: string; connection_id: string; remote_media_id: string; }

export async function registerPublication(request: Request, env: Env): Promise<Response> {
  const body = record(await readBody(request), "Request body is invalid.");
  const keys = Object.keys(body).sort().join(",");
  if (keys !== "connectionId,publication,remoteMediaId") return json({ error: "Request schema is invalid.", code: "invalid_schema" }, 400);
  const publication = record(body.publication, "Publication is invalid.");
  try { assertValidPublication(publication); }
  catch (error) { return json({ error: String(error instanceof Error ? error.message : error), code: "invalid_publication" }, 400); }
  const connectionId = textValue(body.connectionId, 100);
  const remoteMediaId = textValue(body.remoteMediaId, 300);
  if (!connectionId || !/^conn_[a-f0-9]{32}$/.test(connectionId) || !remoteMediaId || !/^[A-Za-z0-9._:-]{2,300}$/.test(remoteMediaId)) {
    return json({ error: "Connection or remote media ID is invalid.", code: "invalid_link" }, 400);
  }
  const publishedAt = textValue(publication.publishedAt);
  if (!publishedAt) return json({ error: "publishedAt is required for automatic analytics.", code: "missing_published_at" }, 400);
  const publishedTime = Date.parse(publishedAt);
  if (!Number.isFinite(publishedTime) || publishedTime > Date.now() + 5 * 60 * 1000) return json({ error: "Published time is invalid.", code: "invalid_published_at" }, 400);
  const connection = await env.APC_CONTENT_OS_DB.prepare(`SELECT * FROM content_analytics_connections
    WHERE connection_id = ? AND status = 'active'`).bind(connectionId).first<ConnectionRow>();
  if (!connection || !platformMatchesProvider(publication.platform, connection.provider)) return json({ error: "Active connection does not match the publication platform.", code: "connection_mismatch" }, 409);

  const publicationId = textValue(publication.publicationId, 100)!;
  const publicationJson = canonicalJson(publication);
  const publicationHash = await sha256Hex(publicationJson);
  const existingPublication = await env.APC_CONTENT_OS_DB.prepare(`SELECT publication_id, platform, post_ref, payload_hash
    FROM content_publications WHERE publication_id = ? OR (platform = ? AND post_ref = ?) LIMIT 1`)
    .bind(publicationId, publication.platform, publication.postRef).first<ExistingPublicationRow>();
  if (existingPublication && (existingPublication.publication_id !== publicationId || existingPublication.payload_hash !== publicationHash)) {
    return json({ error: "Publication conflicts with an existing record.", code: "publication_conflict" }, 409);
  }
  const linkId = `link_${(await sha256Hex(`${connectionId}|${remoteMediaId}|${publicationId}`)).slice(0, 32)}`;
  const existingLink = await env.APC_CONTENT_OS_DB.prepare("SELECT link_id, connection_id, remote_media_id FROM content_analytics_publication_links WHERE publication_id = ?").bind(publicationId).first<ExistingLinkRow>();
  if (existingLink && (existingLink.connection_id !== connectionId || existingLink.remote_media_id !== remoteMediaId)) {
    return json({ error: "Publication is already linked to a different provider item.", code: "link_conflict" }, 409);
  }
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (!existingPublication) {
    statements.push(env.APC_CONTENT_OS_DB.prepare(`INSERT INTO content_publications
      (publication_id, platform, post_ref, published_at, created_at, payload_hash, publication_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(publicationId, publication.platform, publication.postRef, publishedAt, now, publicationHash, publicationJson));
  }
  if (!existingLink) {
    statements.push(env.APC_CONTENT_OS_DB.prepare(`INSERT INTO content_analytics_publication_links
      (link_id, publication_id, connection_id, remote_media_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)`).bind(linkId, publicationId, connectionId, remoteMediaId, now, now));
  }
  for (const checkpoint of CHECKPOINTS) {
    const dueAt = new Date(publishedTime + checkpoint.delayMs).toISOString();
    const windowEnd = new Date(publishedTime + checkpoint.windowMs).toISOString();
    const status = Date.now() > Date.parse(windowEnd) ? "missed" : "pending";
    const jobId = `job_${(await sha256Hex(`connector:v1|${publicationId}|${checkpoint.name}`)).slice(0, 32)}`;
    statements.push(env.APC_CONTENT_OS_DB.prepare(`INSERT INTO content_analytics_checkpoint_jobs
      (job_id, link_id, publication_id, checkpoint, due_at, window_ends_at, status, attempt_count,
       next_attempt_at, lease_owner, lease_expires_at, completed_at, snapshot_id, last_error_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, ?, NULL, ?, ?, ?)
      ON CONFLICT(publication_id, checkpoint) DO NOTHING`)
      .bind(jobId, existingLink?.link_id || linkId, publicationId, checkpoint.name, dueAt, windowEnd, status, status === "missed" ? now : null, status === "missed" ? "checkpoint_window_expired" : null, now, now));
  }
  await env.APC_CONTENT_OS_DB.batch(statements);
  return json({ schemaVersion: "apc.analytics_connectors.v1", tracked: true, publicationId, linkId: existingLink?.link_id || linkId, checkpoints: CHECKPOINTS.map(item => item.name) }, existingLink ? 200 : 201);
}

export async function ingestionStatus(env: Env): Promise<Response> {
  const [jobs, runs] = await env.APC_CONTENT_OS_DB.batch([
    env.APC_CONTENT_OS_DB.prepare(`SELECT status, COUNT(*) AS count, MIN(CASE WHEN status IN ('pending','retry') THEN due_at END) AS next_due_at
      FROM content_analytics_checkpoint_jobs GROUP BY status ORDER BY status`),
    env.APC_CONTENT_OS_DB.prepare(`SELECT run_id, job_id, provider, started_at, finished_at, outcome, http_status, error_code
      FROM content_analytics_ingestion_runs ORDER BY started_at DESC LIMIT 20`),
  ]);
  return json({
    schemaVersion: "apc.analytics_connectors.v1",
    scheduler: { enabled: String(env.APC_ANALYTICS_INGESTION_ENABLED) === "true", cron: "every 30 minutes, UTC" },
    jobs: jobs?.results || [],
    recentRuns: runs?.results || [],
  });
}

export async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/content-os/connections") return listConnections(env);
  if (request.method === "GET" && url.pathname === "/api/content-os/ingestion-status") return ingestionStatus(env);
  if (request.method === "POST" && url.pathname === "/api/content-os/publications") return registerPublication(request, env);
  const match = /^\/api\/content-os\/connections\/(meta|tiktok|youtube)\/(start|callback|disconnect)$/.exec(url.pathname);
  if (match?.[1] && match[2]) {
    const provider = match[1];
    if (!isProvider(provider)) return json({ error: "Provider is invalid.", code: "invalid_provider" }, 404);
    if (match[2] === "start" && request.method === "GET") return beginOauth(request, env, provider);
    if (match[2] === "callback" && request.method === "GET") return finishOauth(request, env, provider);
    if (match[2] === "disconnect" && request.method === "POST") return disconnect(request, env, provider);
  }
  return json({ error: "Route not found.", code: "not_found" }, 404);
}
