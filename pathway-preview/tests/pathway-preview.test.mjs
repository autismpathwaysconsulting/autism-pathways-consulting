import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { onRequest } from "../functions/_middleware.js";
import { buildPathwayPreview, PUBLIC_FILES } from "../scripts/build.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const invite = "synthetic-preview-invite";
const env = {
  CF_PAGES_BRANCH: "codex-client-pathway-preview",
  APC_PATHWAY_ENVIRONMENT: "preview",
  APC_PATHWAY_PRODUCTION_ENABLED: "false",
  APC_PATHWAY_D1_MODE: "synthetic-stub",
  APC_PATHWAY_R2_MODE: "synthetic-stub",
  APC_PATHWAY_ALLOWED_CLIENT_ID: "DEMO-CLIENT-001",
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

test("production branch fails closed even with preview credentials", async () => {
  const response = await onRequest(context("https://pathway.example/", {}, { CF_PAGES_BRANCH: "main" }));
  assert.equal(response.status, 404);
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("preview fails closed when invitation secrets are absent", async () => {
  const response = await onRequest(context("https://pathway.example/", {}, { APC_PATHWAY_PREVIEW_SESSION_SECRET: "" }));
  assert.equal(response.status, 503);
});

test("invitation establishes a client-scoped synthetic session", async () => {
  const login = await onRequest(context("https://pathway.example/login"));
  assert.equal(login.status, 200);
  const html = await login.text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf);

  const form = new URLSearchParams({ csrf, invite });
  const accepted = await onRequest(context("https://pathway.example/login", {
    method: "POST",
    headers: { Cookie: `__Host-apc_pathway_csrf=${csrf}`, Origin: "https://pathway.example" },
    body: form,
  }));
  assert.equal(accepted.status, 303);
  const cookies = accepted.headers.get("set-cookie") || "";
  const session = cookies.match(/__Host-apc_pathway_session=([^;]+)/)?.[1];
  assert.ok(session);
  assert.match(cookies, /Secure/);
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /SameSite=Strict/);

  const asset = await onRequest(context("https://pathway.example/", { headers: { Cookie: `__Host-apc_pathway_session=${session}` } }));
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("x-apc-pathway-scope"), "DEMO-CLIENT-001");
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
  assert.deepEqual(config.d1_databases, []);
  assert.deepEqual(config.r2_buckets, []);

  const publicSource = await Promise.all(PUBLIC_FILES.map(file => readFile(new URL(`../public/${file}`, import.meta.url), "utf8")));
  const combined = publicSource.join("\n");
  assert.doesNotMatch(combined, /api\/content-os\/practice|APC_CONTENT_OS_DB|APC_CALM_FEEDBACK_DB|APC_ANALYTICS_CONNECTOR/);
  assert.doesNotMatch(combined, /first-step-call|availability:\s*\[/);
  assert.match(combined, /privateBookingUrl:\s*""/);
});

test("client profile contract excludes diagnostic and internal case fields", async () => {
  const schema = await readFile(new URL("../docs/client-profile.schema.json", import.meta.url), "utf8");
  for (const forbidden of ["diagnosis", "private_notes", "full_child_name", "case_history"]) {
    assert.doesNotMatch(schema.toLowerCase(), new RegExp(forbidden));
  }
});

