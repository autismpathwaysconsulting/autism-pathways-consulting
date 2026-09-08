import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, webcrypto } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { onRequest } from "../functions/_middleware.js";
import { buildPathwayPreview, PUBLIC_FILES } from "../scripts/build.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const invite = "synthetic-preview-invite";
const env = {
  CF_PAGES_BRANCH: "codex-client-pathway-preview",
  APC_PATHWAY_ENVIRONMENT: "preview",
  APC_PATHWAY_PREVIEW_BRANCH: "codex-client-pathway-preview",
  APC_PATHWAY_PRODUCTION_ENABLED: "false",
  APC_PATHWAY_D1_MODE: "synthetic-stub",
  APC_PATHWAY_R2_MODE: "synthetic-stub",
  APC_PATHWAY_ALLOWED_CLIENT_ID: "DEMO-CLIENT-001",
  APC_PATHWAY_PREVIEW_SESSION_VERSION: "1",
  APC_PATHWAY_PREVIEW_INVITE_SHA256: createHash("sha256").update(invite).digest("hex"),
  APC_PATHWAY_PREVIEW_SESSION_SECRET: "test-only-session-secret-with-more-than-32-characters",
};

function context(url, options = {}, overrides = {}) {
  return {
    request: new Request(url, options),
    env: { ...env, ...overrides },
    next: async () => new Response("synthetic asset", { status: 200 }),
  };
}

function signedSession(clientId, expires, version = env.APC_PATHWAY_PREVIEW_SESSION_VERSION) {
  const payload = `${clientId}.${expires}.${version}`;
  const signature = createHmac("sha256", env.APC_PATHWAY_PREVIEW_SESSION_SECRET).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

async function establishSession() {
  const login = await onRequest(context("https://pathway.example/login"));
  const html = await login.text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf);
  const accepted = await onRequest(context("https://pathway.example/login", {
    method: "POST",
    headers: { Cookie: `__Host-apc_pathway_csrf=${csrf}`, Origin: "https://pathway.example" },
    body: new URLSearchParams({ csrf, invite }),
  }));
  assert.equal(accepted.status, 303);
  const session = (accepted.headers.get("set-cookie") || "").match(/__Host-apc_pathway_session=([^;]+)/)?.[1];
  assert.ok(session);
  return { accepted, session };
}

test("production branch fails closed even with preview credentials", async () => {
  const response = await onRequest(context("https://pathway.example/", {}, { CF_PAGES_BRANCH: "main" }));
  assert.equal(response.status, 404);
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("preview fails closed when invitation secrets are absent", async () => {
  const response = await onRequest(context("https://pathway.example/", {}, { APC_PATHWAY_PREVIEW_SESSION_SECRET: "" }));
  assert.equal(response.status, 503);
});

test("preview fails closed on an unapproved branch", async () => {
  const response = await onRequest(context("https://pathway.example/", {}, { CF_PAGES_BRANCH: "unreviewed-branch" }));
  assert.equal(response.status, 503);
});

test("invitation establishes a client-scoped synthetic session", async () => {
  const { accepted, session } = await establishSession();
  const cookies = accepted.headers.get("set-cookie") || "";
  assert.match(cookies, /Secure/);
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /SameSite=Strict/);

  const asset = await onRequest(context("https://pathway.example/", { headers: { Cookie: `__Host-apc_pathway_session=${session}` } }));
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("x-apc-pathway-scope"), "DEMO-CLIENT-001");
});

test("login requires same-origin form posts and the expected content type", async () => {
  const missingOrigin = await onRequest(context("https://pathway.example/login", {
    method: "POST",
    body: new URLSearchParams({ csrf: "x", invite }),
  }));
  assert.equal(missingOrigin.status, 403);

  const crossOrigin = await onRequest(context("https://pathway.example/login", {
    method: "POST",
    headers: { Origin: "https://attacker.example" },
    body: new URLSearchParams({ csrf: "x", invite }),
  }));
  assert.equal(crossOrigin.status, 403);

  const wrongType = await onRequest(context("https://pathway.example/login", {
    method: "POST",
    headers: { Origin: "https://pathway.example", "Content-Type": "application/json" },
    body: "{}",
  }));
  assert.equal(wrongType.status, 415);
});

test("login enforces the actual streamed body limit and exact form shape", async () => {
  const oversized = await onRequest(context("https://pathway.example/login", {
    method: "POST",
    headers: {
      Origin: "https://pathway.example",
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": "12",
    },
    body: `invite=${"a".repeat(5000)}`,
  }));
  assert.equal(oversized.status, 413);

  const duplicate = await onRequest(context("https://pathway.example/login"));
  const csrf = (await duplicate.text()).match(/name="csrf" value="([^"]+)"/)?.[1];
  const invalidShape = await onRequest(context("https://pathway.example/login", {
    method: "POST",
    headers: { Cookie: `__Host-apc_pathway_csrf=${csrf}`, Origin: "https://pathway.example" },
    body: new URLSearchParams([["csrf", csrf], ["invite", invite], ["invite", invite]]),
  }));
  assert.equal(invalidShape.status, 401);
});

test("expired, overlong, tampered and cross-client sessions fail closed", async () => {
  const now = Date.now();
  const valid = signedSession(env.APC_PATHWAY_ALLOWED_CLIENT_ID, now + 30000);
  const tokens = [
    signedSession(env.APC_PATHWAY_ALLOWED_CLIENT_ID, now - 1),
    signedSession(env.APC_PATHWAY_ALLOWED_CLIENT_ID, now + 60 * 60 * 1000 + 1000),
    `${valid.slice(0, -1)}${valid.endsWith("0") ? "1" : "0"}`,
    signedSession("DEMO-CLIENT-002", now + 30000),
  ];
  for (const token of tokens) {
    const response = await onRequest(context("https://pathway.example/", { headers: { Cookie: `__Host-apc_pathway_session=${token}` } }));
    assert.equal(response.status, 302);
  }
});

test("session version rotation revokes an otherwise valid session", async () => {
  const { session } = await establishSession();
  const response = await onRequest(context(
    "https://pathway.example/",
    { headers: { Cookie: `__Host-apc_pathway_session=${session}` } },
    { APC_PATHWAY_PREVIEW_SESSION_VERSION: "2" },
  ));
  assert.equal(response.status, 302);
});

test("same-origin logout clears the scoped session", async () => {
  const { session } = await establishSession();
  const response = await onRequest(context("https://pathway.example/logout", {
    method: "POST",
    headers: { Cookie: `__Host-apc_pathway_session=${session}`, Origin: "https://pathway.example" },
    body: new URLSearchParams({ action: "logout" }),
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://pathway.example/login");
  assert.match(response.headers.get("set-cookie") || "", /__Host-apc_pathway_session=;.*Max-Age=0/);
});

test("authenticated preview assets reject unexpected write methods", async () => {
  const { session } = await establishSession();
  const response = await onRequest(context("https://pathway.example/portal-data.js", {
    method: "POST",
    headers: { Cookie: `__Host-apc_pathway_session=${session}` },
  }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});

test("invalid or absent sessions cannot read preview assets", async () => {
  const response = await onRequest(context("https://pathway.example/portal-data.js"));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://pathway.example/login");
});

test("preview build remains isolated from the production site build", async () => {
  const result = await buildPathwayPreview();
  assert.deepEqual(result.files, [...PUBLIC_FILES].sort());
  const rootBuild = await readFile(new URL("../../scripts/build-site.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(rootBuild, /pathway-preview|client-pathway/);
  assert.deepEqual((await readdir(new URL("../dist/", import.meta.url))).sort(), [...PUBLIC_FILES].sort());
});

test("preview has no production data bindings or public booking route", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.vars.APC_PATHWAY_PRODUCTION_ENABLED, "false");
  assert.equal(config.vars.APC_PATHWAY_D1_MODE, "synthetic-stub");
  assert.equal(config.vars.APC_PATHWAY_R2_MODE, "synthetic-stub");
  assert.equal(config.vars.APC_PATHWAY_PREVIEW_BRANCH, "codex-client-pathway-preview");
  assert.equal(config.vars.APC_PATHWAY_PREVIEW_SESSION_VERSION, "1");
  assert.deepEqual(config.d1_databases, []);
  assert.deepEqual(config.r2_buckets, []);

  const publicSource = await Promise.all(PUBLIC_FILES.map(file => readFile(new URL(`../public/${file}`, import.meta.url), "utf8")));
  const combined = publicSource.join("\n");
  assert.doesNotMatch(combined, /api\/content-os\/practice|APC_CONTENT_OS_DB|APC_CALM_FEEDBACK_DB|APC_ANALYTICS_CONNECTOR/);
  assert.doesNotMatch(combined, /first-step-call|availability:\s*\[/);
  assert.match(combined, /privateBookingUrl:\s*""/);
});

test("readiness evidence keeps every production and governance gate fail closed", async () => {
  const evidence = JSON.parse(await readFile(new URL("../docs/portal-technical-readiness.json", import.meta.url), "utf8"));
  assert.equal(evidence.scope, "SYNTHETIC_PREVIEW_ONLY");
  assert.equal(evidence.syntheticTechnicalReadinessScore, 9.5);
  assert.equal(evidence.productionReadinessScore, null);
  assert.equal(evidence.productionAuthorized, false);
  assert.equal(evidence.realClientDataAuthorized, false);
  assert.ok(evidence.controls.every(control => ["PASS", "EXTERNAL_BLOCKED"].includes(control.status)));
  assert.ok(evidence.controls.filter(control => control.status === "EXTERNAL_BLOCKED").length > 0);

  const gates = JSON.parse(await readFile(new URL("../docs/portal-release-gates.json", import.meta.url), "utf8"));
  assert.ok(gates.mandatoryGates.every(gate => gate.state === "BLOCKED"));
  assert.equal(gates.mandatoryGates.find(gate => gate.id === "OPS-HOLD-003")?.state, "BLOCKED");
  assert.equal(gates.mandatoryGates.find(gate => gate.id === "SECURITY-001")?.state, "BLOCKED");
});

test("client profile contract excludes diagnostic and internal case fields", async () => {
  const schema = await readFile(new URL("../docs/client-profile.schema.json", import.meta.url), "utf8");
  for (const forbidden of ["diagnosis", "private_notes", "full_child_name", "case_history"]) {
    assert.doesNotMatch(schema.toLowerCase(), new RegExp(forbidden));
  }
});
