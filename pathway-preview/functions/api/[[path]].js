import {
  SESSION_COOKIE,
  RequestError,
  cookieValue,
  expireCookie,
  isoNow,
  json,
  readJson,
  requestOriginIsValid,
  sameValue,
  sha256Hex,
} from "../lib/security.js";
import {
  OPERATOR_ID,
  assertAllowedSyntheticClient,
  issueInvitation,
  validCalLink,
} from "../lib/pathway-store.js";

const asText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;

function requireExactKeys(body, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(body);
  if (required.some(key => !Object.hasOwn(body, key)) || keys.some(key => !allowed.has(key))) {
    throw new RequestError(400, "Request fields are invalid.");
  }
}

async function operatorAuthorized(request, env) {
  const supplied = request.headers.get("X-APC-Preview-Operator") || "";
  return supplied.length >= 32 && await sameValue(supplied, env.APC_PATHWAY_PREVIEW_OPERATOR_SECRET);
}

async function requireOperator(context) {
  if (!await operatorAuthorized(context.request, context.env)) throw new RequestError(404, "Not found.");
  if (!requestOriginIsValid(context.request)) throw new RequestError(403, "Origin was not accepted.");
}

function requirePost(context) {
  if (context.request.method !== "POST") throw new RequestError(405, "Method not allowed.");
  if (!requestOriginIsValid(context.request)) throw new RequestError(403, "Origin was not accepted.");
}

async function portalProjection(context) {
  const { client_id: clientId, account_id: accountId } = context.data.pathwayIdentity;
  const profile = await context.env.PATHWAY_DB.prepare(`SELECT preferred_name, service_name, stage_number, portal_status
    FROM clients WHERE client_id = ? LIMIT 1`).bind(clientId).first();
  if (!profile || profile.portal_status !== "active") throw new RequestError(403, "Portal access is not active.");
  const journals = await context.env.PATHWAY_DB.prepare(`SELECT journal_id AS id, entry_date AS date, entry_time AS time,
      title, entry_text AS entry, created_at AS createdAt
    FROM journals WHERE client_id = ? AND account_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 50`).bind(clientId, accountId).all();
  const booking = await context.env.PATHWAY_DB.prepare(`SELECT booking_link_id, cal_url, assigned_at, expires_at
    FROM booking_links WHERE client_id = ? AND account_id = ? AND status = 'assigned'
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY assigned_at DESC LIMIT 1`).bind(clientId, accountId, isoNow()).first();
  return {
    profile: {
      firstName: profile.preferred_name,
      pathway: profile.service_name,
      stage: profile.stage_number,
      bookingEnabled: Boolean(booking),
      privateBookingUrl: booking?.cal_url || "",
      lastSynced: "from isolated synthetic preview storage",
    },
    journals: journals.results,
    booking: booking ? { assignedAt: booking.assigned_at, expiresAt: booking.expires_at } : null,
    consent: {
      noticeVersion: context.env.APC_PATHWAY_NOTICE_VERSION,
      termsVersion: context.env.APC_PATHWAY_TERMS_VERSION,
      acceptedAt: context.data.pathwayIdentity.consent.accepted_at,
    },
  };
}

async function createJournal(context) {
  requirePost(context);
  const body = await readJson(context.request);
  requireExactKeys(body, ["date", "entry"], ["time", "title"]);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : null;
  const time = body.time === "" || body.time == null ? null : (/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time) ? body.time : undefined);
  const title = body.title === "" || body.title == null ? null : asText(body.title, 80);
  const entry = asText(body.entry, 1200);
  if (!date || time === undefined || (body.title && !title) || !entry) throw new RequestError(400, "Journal fields are invalid.");
  const identity = context.data.pathwayIdentity;
  const journalId = crypto.randomUUID();
  const createdAt = isoNow();
  await context.env.PATHWAY_DB.batch([
    context.env.PATHWAY_DB.prepare(`INSERT INTO journals
      (journal_id, client_id, account_id, entry_date, entry_time, title, entry_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(journalId, identity.client_id, identity.account_id, date, time, title, entry, createdAt),
    context.env.PATHWAY_DB.prepare(`INSERT INTO audit_events
      (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
      VALUES (?, ?, 'account', ?, ?, 'journal.created', 'journal', ?, '{}')`)
      .bind(crypto.randomUUID(), createdAt, identity.account_id, identity.client_id, journalId),
  ]);
  return json({ id: journalId, date, time: time || "", title: title || "", entry, createdAt }, 201);
}

async function getJournal(context, journalId) {
  if (context.request.method !== "GET") throw new RequestError(405, "Method not allowed.");
  const identity = context.data.pathwayIdentity;
  const journal = await context.env.PATHWAY_DB.prepare(`SELECT journal_id AS id, entry_date AS date, entry_time AS time,
      title, entry_text AS entry, created_at AS createdAt
    FROM journals WHERE journal_id = ? AND client_id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(journalId, identity.client_id, identity.account_id).first();
  if (!journal) throw new RequestError(404, "Journal not found.");
  return json(journal);
}

async function exportOwnRecords(context) {
  if (context.request.method !== "GET") throw new RequestError(405, "Method not allowed.");
  const projection = await portalProjection(context);
  const identity = context.data.pathwayIdentity;
  const exportedAt = isoNow();
  await context.env.PATHWAY_DB.prepare(`INSERT INTO audit_events
    (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
    VALUES (?, ?, 'account', ?, ?, 'records.exported', 'client_projection', ?, ?)`)
    .bind(crypto.randomUUID(), exportedAt, identity.account_id, identity.client_id, identity.client_id,
      JSON.stringify({ format: "json", synthetic: true })).run();
  return json({ exportVersion: "synthetic-rehearsal-v1", exportedAt, clientId: identity.client_id, ...projection });
}

async function logout(context) {
  requirePost(context);
  const identity = context.data.pathwayIdentity;
  const at = isoNow();
  await context.env.PATHWAY_DB.batch([
    context.env.PATHWAY_DB.prepare("UPDATE portal_sessions SET revoked_at = ? WHERE session_id = ? AND client_id = ?")
      .bind(at, identity.session_id, identity.client_id),
    context.env.PATHWAY_DB.prepare(`INSERT INTO audit_events
      (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
      VALUES (?, ?, 'account', ?, ?, 'session.revoked', 'session', ?, '{"reason":"logout"}')`)
      .bind(crypto.randomUUID(), at, identity.account_id, identity.client_id, identity.session_id),
  ]);
  const response = json({ ok: true });
  response.headers.append("Set-Cookie", expireCookie(SESSION_COOKIE));
  return response;
}

async function issue(context, recovery = false) {
  await requireOperator(context);
  requirePost(context);
  const body = await readJson(context.request);
  requireExactKeys(body, recovery ? ["clientId", "accountId", "expiresInSeconds", "previousInvitationId"] :
    ["clientId", "accountId", "expiresInSeconds"]);
  if (recovery && !asText(body.previousInvitationId, 80)) throw new RequestError(400, "A previous invitation is required.");
  if (recovery) {
    assertAllowedSyntheticClient(context.env, body.clientId);
    const previous = await context.env.PATHWAY_DB.prepare(`SELECT invitation_id FROM invitations
      WHERE invitation_id = ? AND client_id = ? AND account_id = ? LIMIT 1`)
      .bind(body.previousInvitationId, body.clientId, body.accountId).first();
    if (!previous) throw new RequestError(404, "Previous synthetic invitation not found.");
  }
  const result = await issueInvitation(context.env, {
    clientId: body.clientId,
    accountId: body.accountId,
    expiresInSeconds: body.expiresInSeconds,
    supersedesInvitationId: recovery ? body.previousInvitationId : null,
  });
  if (recovery) {
    const at = isoNow();
    await context.env.PATHWAY_DB.prepare(`UPDATE portal_sessions SET revoked_at = ?
      WHERE invitation_id = ? AND client_id = ? AND revoked_at IS NULL`)
      .bind(at, body.previousInvitationId, body.clientId).run();
  }
  return json({ ...result, syntheticOnly: true }, 201);
}

async function revokeInvitation(context) {
  await requireOperator(context);
  requirePost(context);
  const body = await readJson(context.request);
  requireExactKeys(body, ["clientId", "invitationId"]);
  assertAllowedSyntheticClient(context.env, body.clientId);
  const invitationId = asText(body.invitationId, 80);
  if (!invitationId) throw new RequestError(400, "Invitation ID is required.");
  const at = isoNow();
  await context.env.PATHWAY_DB.batch([
    context.env.PATHWAY_DB.prepare(`UPDATE invitations SET status = 'revoked', revoked_at = ?
      WHERE invitation_id = ? AND client_id = ? AND status != 'revoked'`).bind(at, invitationId, body.clientId),
    context.env.PATHWAY_DB.prepare(`UPDATE portal_sessions SET revoked_at = ?
      WHERE invitation_id = ? AND client_id = ? AND revoked_at IS NULL`).bind(at, invitationId, body.clientId),
    context.env.PATHWAY_DB.prepare(`INSERT INTO audit_events
      (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
      VALUES (?, ?, 'operator', ?, ?, 'invitation.revoked', 'invitation', ?, '{}')`)
      .bind(crypto.randomUUID(), at, OPERATOR_ID, body.clientId, invitationId),
  ]);
  return json({ revoked: true });
}

async function assignBooking(context) {
  await requireOperator(context);
  requirePost(context);
  const body = await readJson(context.request);
  requireExactKeys(body, ["clientId", "accountId", "calUrl"], ["expiresAt"]);
  assertAllowedSyntheticClient(context.env, body.clientId);
  if (!validCalLink(body.calUrl)) throw new RequestError(400, "Only an assigned private Cal.com event URL is allowed.");
  const expiresAt = body.expiresAt == null ? null : (Number.isFinite(Date.parse(body.expiresAt)) ? new Date(body.expiresAt).toISOString() : undefined);
  if (expiresAt === undefined || (expiresAt && Date.parse(expiresAt) <= Date.now())) throw new RequestError(400, "Booking link expiry is invalid.");
  const accountId = asText(body.accountId, 80);
  if (!accountId) throw new RequestError(400, "Synthetic account is required.");
  const grant = await context.env.PATHWAY_DB.prepare(`SELECT grant_id FROM access_grants
    WHERE client_id = ? AND account_id = ? AND status = 'active' LIMIT 1`).bind(body.clientId, accountId).first();
  if (!grant) throw new RequestError(404, "Active synthetic grant not found.");
  const at = isoNow();
  const id = crypto.randomUUID();
  await context.env.PATHWAY_DB.batch([
    context.env.PATHWAY_DB.prepare(`UPDATE booking_links SET status = 'revoked', revoked_at = ?
      WHERE client_id = ? AND account_id = ? AND status = 'assigned'`).bind(at, body.clientId, accountId),
    context.env.PATHWAY_DB.prepare(`INSERT INTO booking_links
      (booking_link_id, client_id, account_id, cal_url, status, assigned_at, assigned_by, expires_at)
      VALUES (?, ?, ?, ?, 'assigned', ?, ?, ?)`)
      .bind(id, body.clientId, accountId, body.calUrl, at, OPERATOR_ID, expiresAt),
    context.env.PATHWAY_DB.prepare(`INSERT INTO audit_events
      (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
      VALUES (?, ?, 'operator', ?, ?, 'booking_link.assigned', 'booking_link', ?, ?)`)
      .bind(crypto.randomUUID(), at, OPERATOR_ID, body.clientId, id, JSON.stringify({ expiresAt })),
  ]);
  return json({ bookingLinkId: id, assigned: true, expiresAt }, 201);
}

async function revokeBooking(context) {
  await requireOperator(context);
  requirePost(context);
  const body = await readJson(context.request);
  requireExactKeys(body, ["clientId", "bookingLinkId"]);
  assertAllowedSyntheticClient(context.env, body.clientId);
  const id = asText(body.bookingLinkId, 80);
  if (!id) throw new RequestError(400, "Booking link ID is required.");
  const at = isoNow();
  await context.env.PATHWAY_DB.batch([
    context.env.PATHWAY_DB.prepare(`UPDATE booking_links SET status = 'revoked', revoked_at = ?
      WHERE booking_link_id = ? AND client_id = ? AND status = 'assigned'`).bind(at, id, body.clientId),
    context.env.PATHWAY_DB.prepare(`INSERT INTO audit_events
      (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
      VALUES (?, ?, 'operator', ?, ?, 'booking_link.revoked', 'booking_link', ?, '{}')`)
      .bind(crypto.randomUUID(), at, OPERATOR_ID, body.clientId, id),
  ]);
  return json({ revoked: true });
}

async function retentionRehearsal(context) {
  await requireOperator(context);
  requirePost(context);
  const body = await readJson(context.request);
  requireExactKeys(body, ["clientId", "mode", "cutoff"]);
  assertAllowedSyntheticClient(context.env, body.clientId);
  if (body.mode !== "dry-run") throw new RequestError(400, "Retention rehearsal is dry-run only.");
  const cutoff = Number.isFinite(Date.parse(body.cutoff)) ? new Date(body.cutoff).toISOString() : null;
  if (!cutoff) throw new RequestError(400, "An explicit rehearsal cutoff is required.");
  const result = await context.env.PATHWAY_DB.prepare(`SELECT COUNT(*) AS candidate_count FROM journals
    WHERE client_id = ? AND created_at < ? AND deleted_at IS NULL`).bind(body.clientId, cutoff).first();
  const id = crypto.randomUUID();
  const at = isoNow();
  await context.env.PATHWAY_DB.batch([
    context.env.PATHWAY_DB.prepare(`INSERT INTO lifecycle_rehearsals
      (rehearsal_id, client_id, rehearsal_type, mode, requested_at, requested_by, result_json)
      VALUES (?, ?, 'retention', 'dry-run', ?, ?, ?)`)
      .bind(id, body.clientId, at, OPERATOR_ID, JSON.stringify({ cutoff, candidateCount: result.candidate_count })),
    context.env.PATHWAY_DB.prepare(`INSERT INTO audit_events
      (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
      VALUES (?, ?, 'operator', ?, ?, 'retention.rehearsed', 'lifecycle_rehearsal', ?, ?)`)
      .bind(crypto.randomUUID(), at, OPERATOR_ID, body.clientId, id, JSON.stringify({ cutoff })),
  ]);
  return json({ rehearsalId: id, mode: "dry-run", candidateCount: result.candidate_count, policyStatus: "UNAPPROVED_NO_AUTOMATIC_RETENTION" });
}

async function deletionRehearsal(context) {
  await requireOperator(context);
  requirePost(context);
  const body = await readJson(context.request);
  requireExactKeys(body, ["clientId", "confirmSynthetic"]);
  assertAllowedSyntheticClient(context.env, body.clientId);
  if (body.confirmSynthetic !== `DELETE ${body.clientId}`) throw new RequestError(400, "Synthetic deletion confirmation did not match.");
  const snapshot = await context.env.PATHWAY_DB.prepare(`SELECT
      (SELECT COUNT(*) FROM journals WHERE client_id = ?) AS journals,
      (SELECT COUNT(*) FROM booking_links WHERE client_id = ?) AS booking_links,
      (SELECT COUNT(*) FROM portal_sessions WHERE client_id = ? AND revoked_at IS NULL) AS active_sessions`)
    .bind(body.clientId, body.clientId, body.clientId).first();
  const id = crypto.randomUUID();
  const at = isoNow();
  const snapshotHash = await sha256Hex(JSON.stringify(snapshot));
  await context.env.PATHWAY_DB.batch([
    context.env.PATHWAY_DB.prepare("DELETE FROM journals WHERE client_id = ?").bind(body.clientId),
    context.env.PATHWAY_DB.prepare("DELETE FROM booking_links WHERE client_id = ?").bind(body.clientId),
    context.env.PATHWAY_DB.prepare("UPDATE portal_sessions SET revoked_at = ? WHERE client_id = ? AND revoked_at IS NULL").bind(at, body.clientId),
    context.env.PATHWAY_DB.prepare("UPDATE invitations SET status = 'revoked', revoked_at = ? WHERE client_id = ? AND status != 'revoked'").bind(at, body.clientId),
    context.env.PATHWAY_DB.prepare(`INSERT INTO lifecycle_rehearsals
      (rehearsal_id, client_id, rehearsal_type, mode, requested_at, requested_by, result_json)
      VALUES (?, ?, 'deletion', 'execute-synthetic', ?, ?, ?)`)
      .bind(id, body.clientId, at, OPERATOR_ID, JSON.stringify({ deleted: snapshot, snapshotHash, preserved: ["audit_events", "lifecycle_rehearsals"] })),
    context.env.PATHWAY_DB.prepare(`INSERT INTO audit_events
      (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
      VALUES (?, ?, 'operator', ?, ?, 'deletion.rehearsed', 'lifecycle_rehearsal', ?, ?)`)
      .bind(crypto.randomUUID(), at, OPERATOR_ID, body.clientId, id, JSON.stringify({ snapshotHash })),
  ]);
  return json({ rehearsalId: id, deleted: snapshot, preserved: ["audit_events", "lifecycle_rehearsals"], syntheticOnly: true });
}

export async function onRequest(context) {
  const path = Array.isArray(context.params.path) ? context.params.path.join("/") : String(context.params.path || "");
  try {
    if (new URL(context.request.url).search) throw new RequestError(400, "Query parameters are not accepted.");
    if (path === "portal" && context.request.method === "GET") return json(await portalProjection(context));
    if (path === "journals") return await createJournal(context);
    if (path.startsWith("journals/")) return await getJournal(context, path.slice("journals/".length));
    if (path === "export") return await exportOwnRecords(context);
    if (path === "session/logout") return await logout(context);
    if (path === "operator/invitations/issue") return await issue(context, false);
    if (path === "operator/invitations/recover") return await issue(context, true);
    if (path === "operator/invitations/revoke") return await revokeInvitation(context);
    if (path === "operator/booking-links/assign") return await assignBooking(context);
    if (path === "operator/booking-links/revoke") return await revokeBooking(context);
    if (path === "operator/retention/rehearse") return await retentionRehearsal(context);
    if (path === "operator/deletion/rehearse") return await deletionRehearsal(context);
    throw new RequestError(404, "Not found.");
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error(JSON.stringify({ message: "pathway preview request failed", path, error: error instanceof Error ? error.message : String(error) }));
    return json({ error: "The synthetic preview request could not be completed." }, 500);
  }
}
