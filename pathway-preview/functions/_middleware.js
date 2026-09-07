const SESSION_COOKIE = "__Host-apc_pathway_session";
const CSRF_COOKIE = "__Host-apc_pathway_csrf";
const SESSION_SECONDS = 60 * 60;
const MAX_FORM_BYTES = 4096;

const SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  "style-src-attr 'none'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

function secure(response) {
  const result = new Response(response.body, response);
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("Pragma", "no-cache");
  result.headers.set("Expires", "0");
  result.headers.set("Content-Security-Policy", SECURITY_POLICY);
  result.headers.set("Referrer-Policy", "no-referrer");
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("X-Frame-Options", "DENY");
  result.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  result.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  result.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  result.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return result;
}

function toHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function sameValue(actual, expected) {
  const [actualHash, expectedHash] = await Promise.all([sha256(actual), sha256(expected)]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) difference |= actualHash[index] ^ expectedHash[index];
  return difference === 0;
}

async function signature(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function cookieValue(request, name) {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get("Cookie") || "");
  return match ? match[1] : "";
}

async function sessionToken(secret, clientId, expires) {
  const payload = `${clientId}.${expires}`;
  return `${payload}.${await signature(secret, payload)}`;
}

async function authenticatedClient(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  const match = /^([A-Z0-9-]{8,64})\.(\d{13})\.([a-f0-9]{64})$/.exec(token);
  if (!match || match[1] !== env.APC_PATHWAY_ALLOWED_CLIENT_ID) return null;
  const expires = Number(match[2]);
  if (!Number.isSafeInteger(expires) || expires <= Date.now() || expires > Date.now() + SESSION_SECONDS * 1000) return null;
  const expected = await sessionToken(env.APC_PATHWAY_PREVIEW_SESSION_SECRET, match[1], expires);
  return await sameValue(token, expected) ? match[1] : null;
}

function configuredPreview(env) {
  return env.APC_PATHWAY_ENVIRONMENT === "preview" &&
    env.APC_PATHWAY_PRODUCTION_ENABLED === "false" &&
    env.APC_PATHWAY_D1_MODE === "synthetic-stub" &&
    env.APC_PATHWAY_R2_MODE === "synthetic-stub" &&
    /^DEMO-[A-Z0-9-]{6,48}$/.test(env.APC_PATHWAY_ALLOWED_CLIENT_ID || "") &&
    /^[a-f0-9]{64}$/.test(env.APC_PATHWAY_PREVIEW_INVITE_SHA256 || "") &&
    typeof env.APC_PATHWAY_PREVIEW_SESSION_SECRET === "string" &&
    env.APC_PATHWAY_PREVIEW_SESSION_SECRET.length >= 32;
}

async function csrfToken(secret, nonce) {
  return `${nonce}.${await signature(secret, nonce)}`;
}

async function loginPage(env, error = false) {
  const nonce = crypto.randomUUID();
  const csrf = await csrfToken(env.APC_PATHWAY_PREVIEW_SESSION_SECRET, nonce);
  const message = error ? '<p class="error" role="alert">That invitation code was not accepted.</p>' : "";
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Client Pathway Preview | APC</title><link rel="stylesheet" href="/login.css"></head><body><main><section><p class="eyebrow">AUTISM PATHWAYS CONSULTING</p><h1>Open your pathway preview</h1><p>This protected preview contains synthetic information only.</p>${message}<form method="post" action="/login"><input type="hidden" name="csrf" value="${csrf}"><label for="invite">Invitation code</label><input id="invite" name="invite" type="password" required autocomplete="one-time-code"><button type="submit">Continue</button></form><p class="boundary">No real client information is stored here. Production access remains disabled.</p></section></main></body></html>`;
  const response = secure(new Response(body, { status: error ? 401 : 200, headers: { "Content-Type": "text/html; charset=utf-8" } }));
  response.headers.append("Set-Cookie", `${CSRF_COOKIE}=${csrf}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Strict`);
  return response;
}

async function handleLogin(context) {
  if (context.request.method === "GET") return loginPage(context.env);
  if (context.request.method !== "POST" || Number(context.request.headers.get("Content-Length") || 0) > MAX_FORM_BYTES) {
    return secure(new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } }));
  }
  const requestUrl = new URL(context.request.url);
  const origin = context.request.headers.get("Origin");
  if (origin && origin !== requestUrl.origin) return loginPage(context.env, true);
  let form;
  try { form = await context.request.formData(); } catch { return loginPage(context.env, true); }
  const suppliedCsrf = String(form.get("csrf") || "");
  const cookieCsrf = cookieValue(context.request, CSRF_COOKIE);
  const nonce = suppliedCsrf.split(".", 1)[0];
  const validCsrf = suppliedCsrf === cookieCsrf && /^[0-9a-f-]{36}\.[a-f0-9]{64}$/.test(suppliedCsrf) &&
    await sameValue(suppliedCsrf, await csrfToken(context.env.APC_PATHWAY_PREVIEW_SESSION_SECRET, nonce));
  const inviteHash = toHex(await sha256(String(form.get("invite") || "")));
  const validInvite = await sameValue(inviteHash, context.env.APC_PATHWAY_PREVIEW_INVITE_SHA256);
  if (!validCsrf || !validInvite) return loginPage(context.env, true);

  const expires = Date.now() + SESSION_SECONDS * 1000;
  const response = secure(new Response(null, { status: 303, headers: { Location: new URL("/", requestUrl).toString() } }));
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${await sessionToken(context.env.APC_PATHWAY_PREVIEW_SESSION_SECRET, context.env.APC_PATHWAY_ALLOWED_CLIENT_ID, expires)}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Strict`);
  response.headers.append("Set-Cookie", `${CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`);
  return response;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (context.env.CF_PAGES_BRANCH === "main" || context.env.APC_PATHWAY_PRODUCTION_ENABLED !== "false") {
    return secure(new Response("Not found", { status: 404 }));
  }
  if (!configuredPreview(context.env)) return secure(new Response("Pathway preview is not configured.", { status: 503 }));
  if (url.pathname === "/login.css" && context.request.method === "GET") return secure(await context.next());
  if (url.pathname === "/login" || url.pathname === "/login/") return handleLogin(context);

  let clientId;
  try { clientId = await authenticatedClient(context.request, context.env); } catch { return secure(new Response("Pathway authentication is unavailable.", { status: 503 })); }
  if (!clientId) return secure(Response.redirect(new URL("/login", url), 302));

  const response = await context.next();
  response.headers.set("X-APC-Pathway-Scope", clientId);
  return secure(response);
}

