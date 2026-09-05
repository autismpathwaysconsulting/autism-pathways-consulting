import {
  ANALYTICS_METRICS,
  ANALYTICS_PROTOCOL_VERSION,
  ANALYTICS_SCHEMA_VERSION,
  validateAnalyticsSubmission,
} from "../../content-os/analytics.js";
import { fetchProviderMetrics } from "./connectors";
import { ProviderHttpError } from "./http";
import { ConnectionRow, isProvider, JsonRecord, parseJsonRecord } from "./model";
import { sha256Hex } from "./crypto";

interface JobRow extends ConnectionRow {
  job_id: string;
  link_id: string;
  publication_id: string;
  checkpoint: "24h" | "7d" | "28d";
  due_at: string;
  window_ends_at: string;
  attempt_count: number;
  remote_media_id: string;
  publication_json: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize((value as JsonRecord)[key])]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function changes(result: D1Result): number {
  return Number(result.meta.changes || result.meta.rows_written || 0);
}

function enabledProviders(env: Env): Set<string> {
  return new Set(env.APC_ANALYTICS_ENABLED_PROVIDERS.split(",").map(value => value.trim()).filter(isProvider));
}

async function recordRun(env: Env, job: JobRow, startedAt: string, outcome: string, errorCode: string | null, httpStatus: number | null): Promise<void> {
  const now = new Date().toISOString();
  await env.APC_CONTENT_OS_DB.prepare(`INSERT INTO content_analytics_ingestion_runs
    (run_id, job_id, provider, started_at, finished_at, outcome, http_status, error_code, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(`run_${crypto.randomUUID()}`, job.job_id, job.provider, startedAt, now, outcome, httpStatus, errorCode, JSON.stringify({ attempt: job.attempt_count })).run();
}

async function finishJob(env: Env, job: JobRow, status: "completed" | "skipped" | "missed" | "failed", snapshotId: string | null, errorCode: string | null): Promise<void> {
  const now = new Date().toISOString();
  await env.APC_CONTENT_OS_DB.prepare(`UPDATE content_analytics_checkpoint_jobs SET
    status = ?, completed_at = ?, snapshot_id = ?, last_error_code = ?,
    lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
    WHERE job_id = ?`).bind(status, now, snapshotId, errorCode, now, job.job_id).run();
}

async function retryJob(env: Env, job: JobRow, errorCode: string): Promise<void> {
  const now = new Date();
  const delayMinutes = Math.min(360, 15 * (2 ** Math.max(0, job.attempt_count - 1)));
  const retryAt = new Date(now.getTime() + delayMinutes * 60000);
  if (job.attempt_count >= 5 || retryAt.getTime() >= Date.parse(job.window_ends_at)) {
    await finishJob(env, job, "failed", null, errorCode);
    return;
  }
  await env.APC_CONTENT_OS_DB.prepare(`UPDATE content_analytics_checkpoint_jobs SET
    status = 'retry', next_attempt_at = ?, last_error_code = ?, lease_owner = NULL,
    lease_expires_at = NULL, updated_at = ? WHERE job_id = ?`)
    .bind(retryAt.toISOString(), errorCode, now.toISOString(), job.job_id).run();
}

async function existingSnapshot(env: Env, job: JobRow): Promise<{ snapshot_id: string } | null> {
  return env.APC_CONTENT_OS_DB.prepare(`SELECT snapshot_id FROM content_analytics_snapshots
    WHERE publication_id = ? AND checkpoint = ?
    ORDER BY revision DESC LIMIT 1`).bind(job.publication_id, job.checkpoint).first<{ snapshot_id: string }>();
}

async function processJob(env: Env, job: JobRow): Promise<"saved" | "already_present" | "retry" | "failed"> {
  const startedAt = new Date().toISOString();
  const prior = await existingSnapshot(env, job);
  if (prior) {
    await finishJob(env, job, "skipped", prior.snapshot_id, "manual_or_existing_snapshot");
    await recordRun(env, job, startedAt, "already_present", "manual_or_existing_snapshot", null);
    return "already_present";
  }
  try {
    const publication = parseJsonRecord(job.publication_json);
    const providerMetrics = await fetchProviderMetrics(job, publication, job.remote_media_id, env);
    const identity = `connector:v1|${job.publication_id}|${job.checkpoint}`;
    const identityHash = await sha256Hex(identity);
    const snapshotId = `snap_${identityHash.slice(0, 32)}`;
    const idempotencyKey = `connector:v1:${identityHash.slice(0, 40)}`;
    const capturedAt = new Date().toISOString();
    const missingReasons = Object.fromEntries(ANALYTICS_METRICS.map(key => [
      key,
      providerMetrics.metrics[key] === null ? "not_shown_in_source" : null,
    ]));
    const snapshot = {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      snapshotId,
      publicationId: job.publication_id,
      checkpoint: job.checkpoint,
      protocolVersion: ANALYTICS_PROTOCOL_VERSION,
      capturedAt,
      metrics: providerMetrics.metrics,
      missingReasons,
      signals: { substantiveCommentsCount: null, dmProblemCount: null, requestCount: null, interestCount: null, paidCount: null },
      deidentifiedThemeSummary: "",
      collectionMethod: providerMetrics.collectionMethod,
      sourceSystem: providerMetrics.sourceSystem,
      sourceMetricVersion: providerMetrics.sourceMetricVersion,
    };
    const payload = { publication, snapshot, idempotencyKey };
    const validation = validateAnalyticsSubmission(payload);
    if (!validation.valid) throw new Error(`Normalized analytics failed validation: ${validation.error}`);
    const publicationHash = await sha256Hex(canonicalJson(publication));
    const snapshotHash = await sha256Hex(canonicalJson({ snapshot, idempotencyKey }));
    const result = await env.APC_CONTENT_OS_DB.prepare(`INSERT INTO content_analytics_snapshots (
        snapshot_id, publication_id, checkpoint, revision, captured_at, created_at,
        archived, payload_hash, idempotency_key, snapshot_json
      ) SELECT ?, ?, ?, 1, ?, ?, 0, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM content_publications WHERE publication_id = ? AND payload_hash = ?)
      AND NOT EXISTS (SELECT 1 FROM content_analytics_snapshots WHERE publication_id = ? AND checkpoint = ?)`)
      .bind(snapshotId, job.publication_id, job.checkpoint, capturedAt, capturedAt, snapshotHash, idempotencyKey, canonicalJson(snapshot), job.publication_id, publicationHash, job.publication_id, job.checkpoint).run();
    if (changes(result) !== 1) {
      const raced = await existingSnapshot(env, job);
      if (!raced) throw new Error("Automatic analytics snapshot could not be stored.");
      await finishJob(env, job, "skipped", raced.snapshot_id, "manual_or_existing_snapshot");
      await recordRun(env, job, startedAt, "already_present", "manual_or_existing_snapshot", null);
      return "already_present";
    }
    await finishJob(env, job, "completed", snapshotId, null);
    await recordRun(env, job, startedAt, "saved", null, 200);
    return "saved";
  } catch (error) {
    const providerError = error instanceof ProviderHttpError ? error : null;
    const errorCode = providerError?.code || "normalization_or_storage_error";
    if (providerError?.status === 401 || errorCode === "reconnect_required") {
      const now = new Date().toISOString();
      await env.APC_CONTENT_OS_DB.batch([
        env.APC_CONTENT_OS_DB.prepare("UPDATE content_analytics_connections SET status = 'reconnect_required', last_error_code = ?, updated_at = ? WHERE connection_id = ?").bind(errorCode, now, job.connection_id),
        env.APC_CONTENT_OS_DB.prepare("UPDATE content_analytics_publication_links SET status = 'paused', updated_at = ? WHERE connection_id = ?").bind(now, job.connection_id),
      ]);
      await finishJob(env, job, "failed", null, errorCode);
      await recordRun(env, job, startedAt, "failed", errorCode, providerError?.status || 401);
      return "failed";
    }
    if (providerError?.retryable) {
      await retryJob(env, job, errorCode);
      await recordRun(env, job, startedAt, "retry", errorCode, providerError.status);
      return "retry";
    }
    await finishJob(env, job, "failed", null, errorCode);
    await recordRun(env, job, startedAt, "failed", errorCode, providerError?.status || null);
    return "failed";
  }
}

async function claimJobs(env: Env, leaseOwner: string, maximum: number, providers: Set<string>): Promise<JobRow[]> {
  if (!providers.size) return [];
  const now = new Date().toISOString();
  const leaseExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.APC_CONTENT_OS_DB.prepare(`UPDATE content_analytics_checkpoint_jobs SET
    status = 'missed', completed_at = ?, last_error_code = 'checkpoint_window_expired', updated_at = ?
    WHERE status IN ('pending', 'retry', 'running') AND window_ends_at < ?`).bind(now, now, now).run();
  await env.APC_CONTENT_OS_DB.prepare(`UPDATE content_analytics_checkpoint_jobs SET
    status = 'retry', next_attempt_at = ?, lease_owner = NULL, lease_expires_at = NULL,
    last_error_code = 'expired_lease_recovered', updated_at = ?
    WHERE status = 'running' AND lease_expires_at < ? AND window_ends_at >= ?`)
    .bind(now, now, now, now).run();
  const providerList = [...providers];
  const providerPlaceholders = providerList.map(() => "?").join(", ");
  const candidates = await env.APC_CONTENT_OS_DB.prepare(`SELECT
      j.job_id, j.link_id, j.publication_id, j.checkpoint, j.due_at, j.window_ends_at, j.attempt_count,
      l.remote_media_id,
      p.publication_json,
      c.connection_id, c.provider, c.account_id, c.account_name, c.access_token_ciphertext,
      c.refresh_token_ciphertext, c.token_expires_at, c.scopes_json, c.metadata_json, c.status,
      c.last_refreshed_at, c.last_error_code, c.created_at, c.updated_at
    FROM content_analytics_checkpoint_jobs j
    JOIN content_analytics_publication_links l ON l.link_id = j.link_id AND l.status = 'active'
    JOIN content_analytics_connections c ON c.connection_id = l.connection_id AND c.status = 'active'
    JOIN content_publications p ON p.publication_id = j.publication_id
    WHERE j.status IN ('pending', 'retry') AND j.due_at <= ? AND j.window_ends_at >= ?
      AND c.provider IN (${providerPlaceholders})
      AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= ?)
      AND (j.lease_expires_at IS NULL OR j.lease_expires_at < ?)
    ORDER BY j.due_at ASC LIMIT ?`)
    .bind(now, now, ...providerList, now, now, maximum).all<JobRow>();
  const claimed: JobRow[] = [];
  for (const row of candidates.results) {
    const result = await env.APC_CONTENT_OS_DB.prepare(`UPDATE content_analytics_checkpoint_jobs SET
      status = 'running', attempt_count = attempt_count + 1, lease_owner = ?, lease_expires_at = ?, updated_at = ?
      WHERE job_id = ? AND status IN ('pending', 'retry') AND (lease_expires_at IS NULL OR lease_expires_at < ?)`)
      .bind(leaseOwner, leaseExpiry, now, row.job_id, now).run();
    if (changes(result) === 1) claimed.push({ ...row, attempt_count: Number(row.attempt_count) + 1 });
  }
  return claimed;
}

export async function runScheduledIngestion(env: Env): Promise<{ claimed: number; saved: number; skipped: number; failed: number; retried: number }> {
  const totals = { claimed: 0, saved: 0, skipped: 0, failed: 0, retried: 0 };
  if (String(env.APC_ANALYTICS_INGESTION_ENABLED) !== "true") return totals;
  const maximum = Math.min(20, Math.max(1, Number(env.APC_ANALYTICS_MAX_JOBS) || 8));
  const providers = enabledProviders(env);
  const cleanupBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await env.APC_CONTENT_OS_DB.prepare("DELETE FROM content_oauth_states WHERE expires_at < ?").bind(cleanupBefore).run();
  const jobs = await claimJobs(env, crypto.randomUUID(), maximum, providers);
  totals.claimed = jobs.length;
  for (const job of jobs) {
    const outcome = await processJob(env, job);
    if (outcome === "saved") totals.saved += 1;
    else if (outcome === "already_present") totals.skipped += 1;
    else if (outcome === "retry") totals.retried += 1;
    else totals.failed += 1;
  }
  console.log(JSON.stringify({ message: "analytics ingestion complete", ...totals }));
  return totals;
}
