import {
  LOGIN_CSRF_COOKIE,
  RequestError,
  SESSION_COOKIE,
  SESSION_SECONDS,
  cookieValue,
  expireCookie,
  hasExactFormFields,
  readFormData,
  requestOriginIsValid,
  sameValue,
  secure,
  signature,
} from "./lib/security.js";
import { acceptInvitation, authenticateSession, configuredPreview } from "./lib/pathway-store.js";

function methodNotAllowed(allow) {
  return secure(new Response("Method not allowed", { status: 405, headers: { Allow: allow } }));
}

async function csrfToken(secret, nonce) {
  return `${nonce}.${await signature(secret, nonce)}`;
}

async function loginPage(env, reason = "") {
  const nonce = crypto.randomUUID();
  const csrf = await csrfToken(env.APC_PATHWAY_PREVIEW_SESSION_SECRET, nonce);
  const messages = {
    invalid: "That invitation is invalid, expired, already used or revoked. Ask CJ for a replacement invitation.",
    unavailable: "The protected preview is temporarily unavailable. Please try again later.",
  };
  const message = messages[reason] ? `<p class="error" role="alert">${messages[reason]}</p>` : "";
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Client Pathway Preview | APC</title><link rel="stylesheet" href="/login.css"></head><body><a class="skip-link" href="#login-main">Skip to invitation</a><main id="login-main"><section><p class="eyebrow">AUTISM PATHWAYS CONSULTING</p><h1>Open your pathway preview</h1><p>This protected preview contains synthetic information only.</p>${message}<form method="post" action="/login"><input type="hidden" name="csrf" value="${csrf}"><label for="invite">Invitation code</label><input id="invite" name="invite" type="password" required autocomplete="one-time-code" spellcheck="false"><button type="submit">Continue</button></form><p class="boundary">Invitations expire, work once and can be revoked. No real client information belongs here.</p></section></main></body></html>`;
  const response = secure(new Response(body, { status: reason ? 401 : 200, headers: { "Content-Type": "text/html; charset=utf-8" } }));
  response.headers.append("Set-Cookie", `${LOGIN_CSRF_COOKIE}=${csrf}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Strict`);
  return response;
}

async function handleLogin(context) {
  if (context.request.method === "GET") return loginPage(context.env);
  if (context.request.method !== "POST") return methodNotAllowed("GET, POST");
  if (!requestOriginIsValid(context.request)) return secure(new Response("Forbidden", { status: 403 }));
  let form;
  try { form = await readFormData(context.request); }
  catch (error) {
    if (error instanceof RequestError) return secure(new Response(error.message, { status: error.status }));
    return secure(new Response("Invalid request", { status: 400 }));
  }
  if (!hasExactFormFields(form, ["csrf", "invite"])) return loginPage(context.env, "invalid");
  const suppliedCsrf = String(form.get("csrf") || "");
  const cookieCsrf = cookieValue(context.request, LOGIN_CSRF_COOKIE);
  const nonce = suppliedCsrf.split(".", 1)[0];
  const validCsrf = suppliedCsrf === cookieCsrf && /^[0-9a-f-]{36}\.[a-f0-9]{64}$/.test(suppliedCsrf) &&
    await sameValue(suppliedCsrf, await csrfToken(context.env.APC_PATHWAY_PREVIEW_SESSION_SECRET, nonce));
  if (!validCsrf) return loginPage(context.env, "invalid");
  let accepted;
  try { accepted = await acceptInvitation(context.env, String(form.get("invite") || "")); }
  catch (error) {
    console.error(JSON.stringify({ message: "preview invitation acceptance failed", error: error instanceof Error ? error.message : String(error) }));
    return loginPage(context.env, "unavailable");
  }
  if (!accepted) return loginPage(context.env, "invalid");
  const response = secure(new Response(null, { status: 303, headers: { Location: new URL("/consent", context.request.url).toString() } }));
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${accepted.sessionToken}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Strict`);
  response.headers.append("Set-Cookie", expireCookie(LOGIN_CSRF_COOKIE));
  return response;
}

function failClosed() {
  return secure(new Response("Not found", { status: 404 }));
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (context.env.CF_PAGES_BRANCH === "main" || context.env.APC_PATHWAY_PRODUCTION_ENABLED !== "false") return failClosed();
  if (!configuredPreview(context.env)) return secure(new Response("Pathway preview is not configured.", { status: 503 }));
  if (url.pathname === "/login.css") {
    if (context.request.method !== "GET" && context.request.method !== "HEAD") return methodNotAllowed("GET, HEAD");
    return secure(await context.next());
  }
  if (url.pathname === "/health") {
    if (context.request.method !== "GET") return methodNotAllowed("GET");
    return secure(await context.next());
  }
  if (url.pathname === "/login" || url.pathname === "/login/") return handleLogin(context);
  if (url.pathname.startsWith("/api/operator/")) return secure(await context.next());

  let identity;
  try { identity = await authenticateSession(context.request, context.env, cookieValue(context.request, SESSION_COOKIE)); }
  catch (error) {
    console.error(JSON.stringify({ message: "preview authentication unavailable", error: error instanceof Error ? error.message : String(error) }));
    return secure(new Response("Pathway authentication is unavailable.", { status: 503 }));
  }
  if (!identity) return secure(Response.redirect(new URL("/login", url), 302));
  context.data = { ...(context.data || {}), pathwayIdentity: identity };
  const consentRoute = url.pathname === "/consent" || url.pathname === "/consent/" || url.pathname === "/api/session/logout";
  if (!identity.consent && !consentRoute) {
    if (url.pathname.startsWith("/api/")) return secure(Response.json({ error: "Current consent acceptance is required." }, { status: 428 }));
    return secure(Response.redirect(new URL("/consent", url), 302));
  }
  if (!url.pathname.startsWith("/api/") && !consentRoute && context.request.method !== "GET" && context.request.method !== "HEAD") {
    return methodNotAllowed("GET, HEAD");
  }
  const response = await context.next();
  response.headers.set("X-APC-Pathway-Scope", identity.client_id);
  return secure(response);
}
