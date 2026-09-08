import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

import { onRequest as middleware } from "../functions/_middleware.js";
import { onRequest as api } from "../functions/api/[[path]].js";
import { onRequest as consent } from "../functions/consent.js";
import { onRequestGet as health } from "../functions/health.js";
import { buildPathwayPreview, PUBLIC_FILES } from "../scripts/build.mjs";
import { createTestD1 } from "./helpers/d1-test-db.mjs";

const baseEnv = {
  CF_PAGES_BRANCH: "codex-client-pathway-production-readiness",
  APC_PATHWAY_ENVIRONMENT: "preview",
  APC_PATHWAY_PREVIEW_BRANCH: "codex-client-pathway-preview",
  APC_PATHWAY_PRODUCTION_ENABLED: "false",
  APC_PATHWAY_REAL_CLIENT_DATA_ENABLED: "false",
  APC_PATHWAY_D1_MODE: "synthetic-preview",
  APC_PATHWAY_R2_MODE: "disabled",
  APC_PATHWAY_ALLOWED_CLIENT_ID: "DEMO-CLIENT-001",
  APC_PATHWAY_NOTICE_VERSION: "synthetic-notice-v1",
  APC_PATHWAY_TERMS_VERSION: "synthetic-terms-v1",
  APC_PATHWAY_PREVIEW_SESSION_SECRET: "test-only-session-secret-with-more-than-32-characters",
  APC_PATHWAY_PREVIEW_OPERATOR_SECRET: "test-only-operator-secret-with-more-than-32-characters",
};

async function fixture(overrides = {}) {
  const env = { ...baseEnv, PATHWAY_DB: await createTestD1(), ...overrides };

  async function request(path, options = {}) {
    const url = new URL(path, "https://pathway.example");
    const context = {
      request: new Request(url, options),
      env,
      data: {},
      params: {},
      next: async () => {
        if (url.pathname === "/consent" || url.pathname === "/consent/") return consent(context);
        if (url.pathname === "/health") return health(context);
        if (url.pathname.startsWith("/api/")) {
          context.params.path = url.pathname.slice("/api/".length).split("/");
          return api(context);
        }
        return new Response("synthetic asset", { status: 200 });
      },
    };
    return middleware(context);
  }

  async function operator(path, body) {
    return request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://pathway.example",
        "X-APC-Preview-Operator": env.APC_PATHWAY_PREVIEW_OPERATOR_SECRET,
      },
      body: JSON.stringify(body),
    });
  }

  async function issue(expiresInSeconds = 3600) {
    const response = await operator("/api/operator/invitations/issue", {
      clientId: "DEMO-CLIENT-001",
      accountId: "ACCOUNT-DEMO-0001",
      expiresInSeconds,
    });
    assert.equal(response.status, 201);
    return response.json();
  }

  async function login(invitationToken) {
    const page = await request("/login");
    const source = await page.text();
    const csrf = source.match(/name="csrf" value="([^"]+)"/)?.[1];
    assert.ok(csrf);
    const accepted = await request("/login", {
      method: "POST",
      headers: { Cookie: `__Host-apc_pathway_login_csrf=${csrf}`, Origin: "https://pathway.example" },
      body: new URLSearchParams({ csrf, invite: invitationToken }),
    });
    const sessionCookie = accepted.headers.get("set-cookie")?.match(/__Host-apc_pathway_session=([^;,]+)/)?.[1];
    return { response: accepted, sessionCookie };
  }

  async function acceptConsent(sessionCookie) {
    const page = await request("/consent", { headers: { Cookie: `__Host-apc_pathway_session=${sessionCookie}` } });
    assert.equal(page.status, 200);
    const source = await page.text();
    const csrf = source.match(/name="csrf" value="([^"]+)"/)?.[1];
    assert.ok(csrf);
    return request("/consent", {
      method: "POST",
      headers: { Cookie: `__Host-apc_pathway_session=${sessionCookie}`, Origin: "https://pathway.example" },
      body: new URLSearchParams({
        csrf,
        noticeVersion: env.APC_PATHWAY_NOTICE_VERSION,
        termsVersion: env.APC_PATHWAY_TERMS_VERSION,
        accept: "yes",
      }),
    });
  }

  async function authenticated() {
    const invitation = await issue();
    const loggedIn = await login(invitation.invitationToken);
    assert.equal(loggedIn.response.status, 303);
    assert.ok(loggedIn.sessionCookie);
    assert.equal((await acceptConsent(loggedIn.sessionCookie)).status, 303);
    return { invitation, sessionCookie: loggedIn.sessionCookie };
  }

  return { env, request, operator, issue, login, acceptConsent, authenticated };
}

test("production and incomplete preview configurations fail closed", async () => {
  const production = await fixture({ CF_PAGES_BRANCH: "main" });
  assert.equal((await production.request("/")).status, 404);
  const noDatabase = await fixture({ PATHWAY_DB: undefined });
  assert.equal((await noDatabase.request("/")).status, 503);
  const realData = await fixture({ APC_PATHWAY_REAL_CLIENT_DATA_ENABLED: "true" });
  assert.equal((await realData.request("/")).status, 503);
});

test("single-use invitation, consent version acceptance and session access work end to end", async () => {
  const app = await fixture();
  const invitation = await app.issue();
  const login = await app.login(invitation.invitationToken);
  assert.equal(login.response.status, 303);
  assert.equal(login.response.headers.get("location"), "https://pathway.example/consent");
  assert.match(login.response.headers.get("set-cookie") || "", /Secure/);
  assert.match(login.response.headers.get("set-cookie") || "", /HttpOnly/);
  assert.match(login.response.headers.get("set-cookie") || "", /SameSite=Strict/);
  assert.equal((await app.request("/", { headers: { Cookie: `__Host-apc_pathway_session=${login.sessionCookie}` } })).status, 302);
  assert.equal((await app.acceptConsent(login.sessionCookie)).status, 303);
  const portal = await app.request("/api/portal", { headers: { Cookie: `__Host-apc_pathway_session=${login.sessionCookie}` } });
  assert.equal(portal.status, 200);
  assert.equal(portal.headers.get("x-apc-pathway-scope"), "DEMO-CLIENT-001");
  assert.equal((await portal.json()).consent.termsVersion, "synthetic-terms-v1");
  assert.equal((await app.login(invitation.invitationToken)).response.status, 401);

  app.env.APC_PATHWAY_TERMS_VERSION = "synthetic-terms-v2";
  const gated = await app.request("/api/portal", { headers: { Cookie: `__Host-apc_pathway_session=${login.sessionCookie}` } });
  assert.equal(gated.status, 428);
  assert.equal((await app.acceptConsent(login.sessionCookie)).status, 303);
  assert.equal(await app.env.PATHWAY_DB.prepare("SELECT COUNT(*) AS count FROM consent_acceptances WHERE client_id = ?")
    .bind("DEMO-CLIENT-001").first("count"), 2);
});

test("invitation expiry, recovery and revocation invalidate old access", async () => {
  const expiredApp = await fixture();
  const expired = await expiredApp.issue();
  await expiredApp.env.PATHWAY_DB.prepare("UPDATE invitations SET expires_at = ? WHERE invitation_id = ?")
    .bind("2020-01-01T00:00:00.000Z", expired.invitationId).run();
  assert.equal((await expiredApp.login(expired.invitationToken)).response.status, 401);
  assert.equal(await expiredApp.env.PATHWAY_DB.prepare("SELECT status FROM invitations WHERE invitation_id = ?")
    .bind(expired.invitationId).first("status"), "expired");

  const app = await fixture();
  const original = await app.issue();
  const recoveredResponse = await app.operator("/api/operator/invitations/recover", {
    clientId: "DEMO-CLIENT-001", accountId: "ACCOUNT-DEMO-0001", previousInvitationId: original.invitationId, expiresInSeconds: 3600,
  });
  assert.equal(recoveredResponse.status, 201);
  const recovered = await recoveredResponse.json();
  assert.equal((await app.login(original.invitationToken)).response.status, 401);
  const login = await app.login(recovered.invitationToken);
  assert.equal(login.response.status, 303);
  await app.operator("/api/operator/invitations/revoke", { clientId: "DEMO-CLIENT-001", invitationId: recovered.invitationId });
  assert.equal((await app.request("/consent", { headers: { Cookie: `__Host-apc_pathway_session=${login.sessionCookie}` } })).status, 302);
  assert.equal((await app.request("/login")).headers.get("cache-control"), "private, no-store");
});

test("all client objects are authorized from the server session scope", async () => {
  const app = await fixture();
  const { sessionCookie } = await app.authenticated();
  await app.env.PATHWAY_DB.exec(`INSERT INTO clients VALUES ('DEMO-OTHER-999','Other','Home Support Programme',1,'active','2026-09-07T00:00:00Z','2026-09-07T00:00:00Z');
    INSERT INTO accounts VALUES ('ACCOUNT-DEMO-9999','DEMO-OTHER-999','active','2026-09-07T00:00:00Z');
    INSERT INTO journals VALUES ('JOURNAL-OTHER','DEMO-OTHER-999','ACCOUNT-DEMO-9999','2026-09-01',NULL,NULL,'Other record','2026-09-01T00:00:00Z',NULL);`);
  const own = await app.request("/api/journals", {
    method: "POST",
    headers: { Cookie: `__Host-apc_pathway_session=${sessionCookie}`, "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2026-09-07", time: "09:30", title: "Synthetic note", entry: "A bounded synthetic entry." }),
  });
  assert.equal(own.status, 201);
  const crossClient = await app.request("/api/journals/JOURNAL-OTHER", { headers: { Cookie: `__Host-apc_pathway_session=${sessionCookie}` } });
  assert.equal(crossClient.status, 404);
  const exported = await (await app.request("/api/export", { headers: { Cookie: `__Host-apc_pathway_session=${sessionCookie}` } })).json();
  assert.equal(exported.clientId, "DEMO-CLIENT-001");
  assert.ok(exported.journals.every(row => row.id !== "JOURNAL-OTHER"));
});

test("CJ-only private Cal.com assignment has no public booking or availability surface", async () => {
  const app = await fixture();
  const { sessionCookie } = await app.authenticated();
  const rejected = await app.operator("/api/operator/booking-links/assign", {
    clientId: "DEMO-CLIENT-001", accountId: "ACCOUNT-DEMO-0001", calUrl: "https://cal.com/autismpathwaysconsulting/first-step-call",
  });
  assert.equal(rejected.status, 400);
  const assignedResponse = await app.operator("/api/operator/booking-links/assign", {
    clientId: "DEMO-CLIENT-001", accountId: "ACCOUNT-DEMO-0001", calUrl: "https://cal.com/apc-preview/follow-up-opaque-123",
    expiresAt: "2027-01-01T00:00:00.000Z",
  });
  assert.equal(assignedResponse.status, 201);
  const assigned = await assignedResponse.json();
  const projection = await (await app.request("/api/portal", { headers: { Cookie: `__Host-apc_pathway_session=${sessionCookie}` } })).json();
  assert.equal(projection.profile.privateBookingUrl, "https://cal.com/apc-preview/follow-up-opaque-123");
  assert.equal("availability" in projection, false);
  await app.operator("/api/operator/booking-links/revoke", { clientId: "DEMO-CLIENT-001", bookingLinkId: assigned.bookingLinkId });
  const revoked = await (await app.request("/api/portal", { headers: { Cookie: `__Host-apc_pathway_session=${sessionCookie}` } })).json();
  assert.equal(revoked.profile.privateBookingUrl, "");
});

test("retention, export and deletion rehearsal preserve immutable audit evidence", async () => {
  const app = await fixture();
  const { sessionCookie } = await app.authenticated();
  const retention = await app.operator("/api/operator/retention/rehearse", {
    clientId: "DEMO-CLIENT-001", mode: "dry-run", cutoff: "2027-01-01T00:00:00.000Z",
  });
  assert.equal(retention.status, 200);
  assert.equal((await retention.json()).policyStatus, "UNAPPROVED_NO_AUTOMATIC_RETENTION");
  assert.equal((await app.request("/api/export", { headers: { Cookie: `__Host-apc_pathway_session=${sessionCookie}` } })).status, 200);
  const deletion = await app.operator("/api/operator/deletion/rehearse", {
    clientId: "DEMO-CLIENT-001", confirmSynthetic: "DELETE DEMO-CLIENT-001",
  });
  assert.equal(deletion.status, 200);
  assert.equal(await app.env.PATHWAY_DB.prepare("SELECT COUNT(*) AS count FROM journals WHERE client_id = ?")
    .bind("DEMO-CLIENT-001").first("count"), 0);
  assert.equal((await app.request("/", { headers: { Cookie: `__Host-apc_pathway_session=${sessionCookie}` } })).status, 302);
  await assert.rejects(() => app.env.PATHWAY_DB.prepare("UPDATE audit_events SET event_type = 'changed'").run(), /append-only/);
  await assert.rejects(() => app.env.PATHWAY_DB.prepare("DELETE FROM audit_events").run(), /append-only/);
});

test("preview build, recovery UI and responsive accessibility controls remain isolated", async () => {
  const result = await buildPathwayPreview();
  assert.deepEqual(result.files, [...PUBLIC_FILES].sort());
  assert.deepEqual((await readdir(new URL("../dist/", import.meta.url))).sort(), [...PUBLIC_FILES].sort());
  const rootBuild = await readFile(new URL("../../scripts/build-site.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(rootBuild, /pathway-preview|client-pathway/);
  const publicSource = await Promise.all(PUBLIC_FILES.map(file => readFile(new URL(`../public/${file}`, import.meta.url), "utf8")));
  const functionsSource = await Promise.all([
    "../functions/_middleware.js", "../functions/api/[[path]].js", "../functions/consent.js",
  ].map(file => readFile(new URL(file, import.meta.url), "utf8")));
  const combined = [...publicSource, ...functionsSource].join("\n");
  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.vars.APC_PATHWAY_PRODUCTION_ENABLED, "false");
  assert.equal(config.vars.APC_PATHWAY_REAL_CLIENT_DATA_ENABLED, "false");
  assert.equal(config.vars.APC_PATHWAY_D1_MODE, "synthetic-preview");
  assert.equal(config.d1_databases.length, 1);
  assert.equal(config.d1_databases[0].binding, "PATHWAY_DB");
  assert.equal(config.d1_databases[0].database_name, "apc-client-pathway-preview-synthetic");
  assert.deepEqual(config.r2_buckets, []);
  assert.equal(config.env.preview.vars.APC_PATHWAY_REAL_CLIENT_DATA_ENABLED, "false");
  assert.equal(config.env.preview.d1_databases[0].database_id, config.d1_databases[0].database_id);
  assert.equal(config.env.production.vars.APC_PATHWAY_ENVIRONMENT, "disabled");
  assert.deepEqual(config.env.production.d1_databases, []);
  const gates = JSON.parse(await readFile(new URL("../docs/portal-release-gates.json", import.meta.url), "utf8"));
  assert.equal(gates.productionEnabled, false);
  assert.equal(gates.realClientDataEnabled, false);
  assert.equal(gates.mandatoryGates.find(gate => gate.id === "OPS-HOLD-003").state, "BLOCKED");
  assert.ok(gates.mandatoryGates.every(gate => gate.state === "BLOCKED"));
  assert.doesNotMatch(combined, /APC_CONTENT_OS_DB|APC_CALM_FEEDBACK_DB|APC_ANALYTICS_CONNECTOR|api\/content-os|meta\.com/);
  assert.doesNotMatch(combined, /availability\s*:/);
  assert.match(combined, /data-retry/);
  assert.match(publicSource.join("\n"), /skip-link/);
  assert.match(publicSource.join("\n"), /@media\(max-width:/);
  assert.match(publicSource.join("\n"), /focus-visible/);
  assert.match(publicSource.join("\n"), /aria-live="polite"/);
});

test("actual JSON body bytes are bounded even without a Content-Length header", async () => {
  const app = await fixture();
  const response = await app.request("/api/operator/invitations/issue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://pathway.example",
      "X-APC-Preview-Operator": app.env.APC_PATHWAY_PREVIEW_OPERATOR_SECRET,
    },
    body: JSON.stringify({ padding: "x".repeat(20_000) }),
  });
  assert.equal(response.status, 413);
});

test("operator routes are undiscoverable without the separate preview secret", async () => {
  const app = await fixture();
  const response = await app.request("/api/operator/invitations/issue", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "DEMO-CLIENT-001", accountId: "ACCOUNT-DEMO-0001", expiresInSeconds: 3600 }),
  });
  assert.equal(response.status, 404);
});
