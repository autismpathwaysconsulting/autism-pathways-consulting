import { isoNow, randomToken, sha256Hex } from "./security.js";

export const SYNTHETIC_CLIENT_PATTERN = /^DEMO-[A-Z0-9-]{6,48}$/;
export const SYNTHETIC_ACCOUNT_PATTERN = /^ACCOUNT-DEMO-[A-Z0-9-]{4,48}$/;
export const OPERATOR_ID = "OPERATOR-CJ-SYNTHETIC";

export function configuredPreview(env) {
  return env.CF_PAGES_BRANCH === env.APC_PATHWAY_PREVIEW_BRANCH &&
    /^[a-z0-9][a-z0-9._\/-]{7,79}$/i.test(env.APC_PATHWAY_PREVIEW_BRANCH || "") &&
    env.APC_PATHWAY_ENVIRONMENT === "preview" &&
    env.APC_PATHWAY_PRODUCTION_ENABLED === "false" &&
    env.APC_PATHWAY_REAL_CLIENT_DATA_ENABLED === "false" &&
    env.APC_PATHWAY_D1_MODE === "synthetic-preview" &&
    env.APC_PATHWAY_R2_MODE === "disabled" &&
    SYNTHETIC_CLIENT_PATTERN.test(env.APC_PATHWAY_ALLOWED_CLIENT_ID || "") &&
    typeof env.PATHWAY_DB?.prepare === "function" &&
    typeof env.APC_PATHWAY_PREVIEW_SESSION_SECRET === "string" &&
    env.APC_PATHWAY_PREVIEW_SESSION_SECRET.length >= 32 &&
    typeof env.APC_PATHWAY_PREVIEW_OPERATOR_SECRET === "string" &&
    env.APC_PATHWAY_PREVIEW_OPERATOR_SECRET.length >= 32 &&
    /^[a-z0-9._-]{3,40}$/i.test(env.APC_PATHWAY_NOTICE_VERSION || "") &&
    /^[a-z0-9._-]{3,40}$/i.test(env.APC_PATHWAY_TERMS_VERSION || "");
}

export function assertAllowedSyntheticClient(env, clientId) {
  if (!SYNTHETIC_CLIENT_PATTERN.test(clientId || "") || clientId !== env.APC_PATHWAY_ALLOWED_CLIENT_ID) {
    throw new Error("Synthetic client target is outside the preview boundary.");
  }
}

export async function currentConsent(db, clientId, accountId, env) {
  return db.prepare(`SELECT ca.acceptance_id, ca.accepted_at, ca.notice_version, ca.terms_version
    FROM consent_acceptances ca
    WHERE ca.client_id = ? AND ca.account_id = ? AND ca.notice_version = ? AND ca.terms_version = ?
    ORDER BY ca.accepted_at DESC LIMIT 1`)
    .bind(clientId, accountId, env.APC_PATHWAY_NOTICE_VERSION, env.APC_PATHWAY_TERMS_VERSION).first();
}

export async function authenticateSession(request, env, rawToken) {
  if (!/^[a-f0-9]{64}$/.test(rawToken || "")) return null;
  const tokenHash = await sha256Hex(rawToken);
  const identity = await env.PATHWAY_DB.prepare(`SELECT
      s.session_id, s.client_id, s.account_id, s.grant_id, s.expires_at,
      ag.status AS grant_status, ag.expires_at AS grant_expires_at,
      i.status AS invitation_status, a.account_status, c.portal_status
    FROM portal_sessions s
    JOIN access_grants ag ON ag.grant_id = s.grant_id AND ag.client_id = s.client_id AND ag.account_id = s.account_id
    JOIN invitations i ON i.invitation_id = s.invitation_id AND i.client_id = s.client_id AND i.account_id = s.account_id
    JOIN accounts a ON a.account_id = s.account_id AND a.client_id = s.client_id
    JOIN clients c ON c.client_id = s.client_id
    WHERE s.token_hash = ? AND s.client_id = ? AND s.revoked_at IS NULL
    LIMIT 1`)
    .bind(tokenHash, env.APC_PATHWAY_ALLOWED_CLIENT_ID).first();
  if (!identity || identity.grant_status !== "active" || identity.invitation_status !== "accepted" ||
    identity.account_status !== "active" || identity.portal_status !== "active") return null;
  const now = Date.now();
  if (Date.parse(identity.expires_at) <= now || (identity.grant_expires_at && Date.parse(identity.grant_expires_at) <= now)) return null;
  identity.consent = await currentConsent(env.PATHWAY_DB, identity.client_id, identity.account_id, env);
  return identity;
}

export async function issueInvitation(env, { clientId, accountId, expiresInSeconds = 86400, supersedesInvitationId = null }) {
  assertAllowedSyntheticClient(env, clientId);
  if (!SYNTHETIC_ACCOUNT_PATTERN.test(accountId || "")) throw new Error("Invalid synthetic account.");
  const ttl = Number(expiresInSeconds);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 7 * 86400) throw new Error("Invitation lifetime is outside the preview limit.");
  const target = await env.PATHWAY_DB.prepare(`SELECT ag.grant_id
    FROM accounts a JOIN access_grants ag
      ON ag.client_id = a.client_id AND ag.account_id = a.account_id
    WHERE a.client_id = ? AND a.account_id = ? AND ag.status = 'active'
    LIMIT 1`).bind(clientId, accountId).first();
  if (!target) throw new Error("No active synthetic access grant exists.");

  const invitationId = crypto.randomUUID();
  const rawToken = randomToken();
  const tokenHash = await sha256Hex(rawToken);
  const issuedAt = isoNow();
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  await env.PATHWAY_DB.batch([
    env.PATHWAY_DB.prepare(`UPDATE invitations SET status = 'revoked', revoked_at = ?
      WHERE client_id = ? AND account_id = ? AND status IN ('issued','recovered')`).bind(issuedAt, clientId, accountId),
    env.PATHWAY_DB.prepare(`INSERT INTO invitations
      (invitation_id, client_id, account_id, grant_id, token_hash, status, issued_at, expires_at, supersedes_invitation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(invitationId, clientId, accountId, target.grant_id, tokenHash,
        supersedesInvitationId ? "recovered" : "issued", issuedAt, expiresAt, supersedesInvitationId),
    env.PATHWAY_DB.prepare(`INSERT INTO audit_events
      (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
      VALUES (?, ?, 'operator', ?, ?, ?, 'invitation', ?, ?)`)
      .bind(crypto.randomUUID(), issuedAt, OPERATOR_ID, clientId,
        supersedesInvitationId ? "invitation.recovered" : "invitation.issued", invitationId,
        JSON.stringify({ expiresAt, supersedesInvitationId })),
  ]);
  return { invitationId, invitationToken: rawToken, expiresAt };
}

export async function acceptInvitation(env, rawToken) {
  if (!/^[a-f0-9]{64}$/.test(rawToken || "")) return null;
  const tokenHash = await sha256Hex(rawToken);
  const invitation = await env.PATHWAY_DB.prepare(`SELECT invitation_id, client_id, account_id, grant_id, status, expires_at
    FROM invitations WHERE token_hash = ? AND client_id = ? LIMIT 1`)
    .bind(tokenHash, env.APC_PATHWAY_ALLOWED_CLIENT_ID).first();
  if (!invitation) return null;
  const now = isoNow();
  if (Date.parse(invitation.expires_at) <= Date.now()) {
    if (["issued", "recovered"].includes(invitation.status)) {
      await env.PATHWAY_DB.batch([
        env.PATHWAY_DB.prepare("UPDATE invitations SET status = 'expired' WHERE invitation_id = ? AND client_id = ?")
          .bind(invitation.invitation_id, invitation.client_id),
        env.PATHWAY_DB.prepare(`INSERT INTO audit_events
          (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
          VALUES (?, ?, 'system', 'PATHWAY-PREVIEW', ?, 'invitation.expired', 'invitation', ?, '{}')`)
          .bind(crypto.randomUUID(), now, invitation.client_id, invitation.invitation_id),
      ]);
    }
    return null;
  }
  if (!["issued", "recovered"].includes(invitation.status)) return null;

  const sessionToken = randomToken();
  const sessionId = crypto.randomUUID();
  const sessionHash = await sha256Hex(sessionToken);
  const sessionExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  try {
    await env.PATHWAY_DB.batch([
      env.PATHWAY_DB.prepare(`UPDATE invitations SET status = 'accepted', accepted_at = ?
        WHERE invitation_id = ? AND client_id = ? AND status IN ('issued','recovered')`)
        .bind(now, invitation.invitation_id, invitation.client_id),
      env.PATHWAY_DB.prepare(`INSERT INTO portal_sessions
        (session_id, client_id, account_id, grant_id, invitation_id, token_hash, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(sessionId, invitation.client_id, invitation.account_id, invitation.grant_id,
          invitation.invitation_id, sessionHash, now, sessionExpires),
      env.PATHWAY_DB.prepare(`INSERT INTO audit_events
        (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
        VALUES (?, ?, 'account', ?, ?, 'invitation.accepted', 'session', ?, '{}')`)
        .bind(crypto.randomUUID(), now, invitation.account_id, invitation.client_id, sessionId),
    ]);
  } catch (error) {
    const state = await env.PATHWAY_DB.prepare("SELECT status FROM invitations WHERE invitation_id = ? AND client_id = ?")
      .bind(invitation.invitation_id, invitation.client_id).first();
    if (state?.status === "accepted") return null;
    throw error;
  }
  return { sessionToken, sessionExpires, clientId: invitation.client_id, accountId: invitation.account_id };
}

export function validCalLink(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    return url.protocol === "https:" && url.hostname === "cal.com" && !url.username && !url.password &&
      !url.search && !url.hash && parts.length >= 2 && parts.length <= 4 &&
      !parts.some(part => /^(first-step-call|parent-strategy-session|availability)$/i.test(part));
  } catch {
    return false;
  }
}
