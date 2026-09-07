import { readFormData, requestOriginIsValid, sameValue, secure, signature } from "./lib/security.js";

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

async function consentCsrf(env, identity) {
  const value = `${identity.session_id}.${env.APC_PATHWAY_NOTICE_VERSION}.${env.APC_PATHWAY_TERMS_VERSION}`;
  return `${identity.session_id}.${await signature(env.APC_PATHWAY_PREVIEW_SESSION_SECRET, value)}`;
}

function consentPage(context, csrf, error = "") {
  const notice = htmlEscape(context.env.APC_PATHWAY_NOTICE_VERSION);
  const terms = htmlEscape(context.env.APC_PATHWAY_TERMS_VERSION);
  const message = error ? `<p class="error" role="alert">${htmlEscape(error)}</p>` : "";
  return secure(new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Preview consent rehearsal | APC</title><link rel="stylesheet" href="/login.css"></head><body><a class="skip-link" href="#consent-main">Skip to consent</a><main id="consent-main"><section><p class="eyebrow">SYNTHETIC CONSENT REHEARSAL</p><h1>Review this preview version</h1><p>This is test evidence for version handling, not approved legal wording.</p>${message}<dl><div><dt>Privacy notice</dt><dd>${notice}</dd></div><div><dt>Portal terms</dt><dd>${terms}</dd></div><div><dt>Languages presented</dt><dd>English (Malaysia) and Bahasa Malaysia</dd></div></dl><form method="post" action="/consent"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="noticeVersion" value="${notice}"><input type="hidden" name="termsVersion" value="${terms}"><label class="check"><input type="checkbox" name="accept" value="yes" required><span>I accept these exact synthetic preview versions and confirm this does not authorise real client data.</span></label><button type="submit">Accept and continue</button></form><p class="boundary">Optional marketing, testimonial, WhatsApp and media choices are not bundled into this acceptance.</p></section></main></body></html>`, { status: error ? 400 : 200, headers: { "Content-Type": "text/html; charset=utf-8" } }));
}

export async function onRequest(context) {
  const identity = context.data?.pathwayIdentity;
  if (!identity) return secure(new Response("Not found", { status: 404 }));
  if (context.request.method === "GET") {
    if (identity.consent) return secure(Response.redirect(new URL("/", context.request.url), 302));
    return consentPage(context, await consentCsrf(context.env, identity));
  }
  if (context.request.method !== "POST") return secure(new Response("Method not allowed", { status: 405 }));
  if (!requestOriginIsValid(context.request)) return consentPage(context, await consentCsrf(context.env, identity), "The request could not be verified.");
  let form;
  try { form = await readFormData(context.request); } catch { return consentPage(context, await consentCsrf(context.env, identity), "The form could not be read."); }
  const suppliedCsrf = String(form.get("csrf") || "");
  const expectedCsrf = await consentCsrf(context.env, identity);
  const exactVersions = form.get("noticeVersion") === context.env.APC_PATHWAY_NOTICE_VERSION &&
    form.get("termsVersion") === context.env.APC_PATHWAY_TERMS_VERSION;
  if (!exactVersions || form.get("accept") !== "yes" || !await sameValue(suppliedCsrf, expectedCsrf)) {
    return consentPage(context, expectedCsrf, "Accept the exact versions shown to continue.");
  }
  const acceptedAt = new Date().toISOString();
  const acceptanceId = crypto.randomUUID();
  try {
    await context.env.PATHWAY_DB.batch([
      context.env.PATHWAY_DB.prepare(`INSERT INTO consent_acceptances
        (acceptance_id, client_id, account_id, notice_version, terms_version, notice_languages_json, accepted_at, evidence_method)
        VALUES (?, ?, ?, ?, ?, '["en-MY","ms-MY"]', ?, 'authenticated-checkbox')`)
        .bind(acceptanceId, identity.client_id, identity.account_id,
          context.env.APC_PATHWAY_NOTICE_VERSION, context.env.APC_PATHWAY_TERMS_VERSION, acceptedAt),
      context.env.PATHWAY_DB.prepare(`INSERT INTO audit_events
        (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
        VALUES (?, ?, 'account', ?, ?, 'consent.accepted', 'consent_acceptance', ?, ?)`)
        .bind(crypto.randomUUID(), acceptedAt, identity.account_id, identity.client_id, acceptanceId,
          JSON.stringify({ noticeVersion: context.env.APC_PATHWAY_NOTICE_VERSION, termsVersion: context.env.APC_PATHWAY_TERMS_VERSION })),
    ]);
  } catch (error) {
    const existing = await context.env.PATHWAY_DB.prepare(`SELECT acceptance_id FROM consent_acceptances
      WHERE client_id = ? AND account_id = ? AND notice_version = ? AND terms_version = ? LIMIT 1`)
      .bind(identity.client_id, identity.account_id, context.env.APC_PATHWAY_NOTICE_VERSION, context.env.APC_PATHWAY_TERMS_VERSION).first();
    if (!existing) throw error;
  }
  return secure(new Response(null, { status: 303, headers: { Location: new URL("/", context.request.url).toString() } }));
}
