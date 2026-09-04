const realm = "APC Content OS";
const authHashKey = "apc-content-os:auth:sha256";
const MAX_AUTHORIZATION_LENGTH = 2048;
const SESSION_COOKIE = "__Host-apc_content_os_session";
const LOGIN_CSRF_COOKIE = "apc_content_os_login_csrf";
const SESSION_SECONDS = 8 * 60 * 60;
const STRICT_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  "style-src-attr 'none'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "media-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");

function securityHeaders(response, allowForm = false) {
  const secured = new Response(response.body, response);
  secured.headers.set("Cache-Control", "private, no-store");
  secured.headers.set("Pragma", "no-cache");
  secured.headers.set("Expires", "0");
  const vary = secured.headers.get("Vary");
  if (!vary) secured.headers.set("Vary", "Authorization");
  else if (!vary.split(",").some(value => value.trim().toLowerCase() === "authorization")) {
    secured.headers.set("Vary", `${vary}, Authorization`);
  }
  secured.headers.set("Content-Security-Policy", allowForm ? STRICT_CSP.replace("form-action 'none'", "form-action 'self'") : STRICT_CSP);
  secured.headers.set("Referrer-Policy", "no-referrer");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  secured.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  secured.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return secured;
}

async function sessionToken(secret, expires) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${expires}.${toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(expires)))) )}`;
}

async function validSession(secret, cookieHeader) {
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookieHeader || "");
  if (!match || !/^\d{10,13}\.[a-f0-9]{64}$/.test(match[1])) return false;
  const [expiresText] = match[1].split(".");
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= Date.now() || expires > Date.now() + SESSION_SECONDS * 1000) return false;
  return sameCredential(match[1], await sessionToken(secret, expires));
}

async function loginPage(secret, error = false) {
  const csrf = crypto.randomUUID();
  const message = error ? '<p role="alert">The password was not accepted. Please try again.</p>' : "";
  const response = new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in | APC Content OS</title><link rel="stylesheet" href="/content-os/app.css"></head><body><main class="shell"><section class="panel"><p class="eyebrow">AUTISM PATHWAYS CONSULTING</p><h1>Sign in to Content OS</h1>${message}<form method="post" action="/content-os/login/"><label for="password">Content OS password</label><input id="password" name="password" type="password" required autocomplete="current-password"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="next" value="/content-os/episodes/"><button type="submit">Sign in</button></form></section></main></body></html>`, { status: error ? 401 : 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  response.headers.set("Set-Cookie", `${LOGIN_CSRF_COOKIE}=${await sessionToken(secret, csrf)}; Path=/content-os/login/; Max-Age=600; Secure; HttpOnly; SameSite=None`);
  return securityHeaders(response, true);
}

async function validLoginCsrf(secret, form, cookieHeader) {
  const csrf = String(form.get("csrf") || "");
  const match = new RegExp(`(?:^|;\\s*)${LOGIN_CSRF_COOKIE}=([^;]+)`).exec(cookieHeader || "");
  return /^[0-9a-f-]{36}$/.test(csrf) && Boolean(match) && await sameCredential(match[1], await sessionToken(secret, csrf));
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function toHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

async function sameCredential(actual, expected) {
  const [actualHash, expectedHash] = await Promise.all([sha256(actual), sha256(expected)]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= actualHash[index] ^ expectedHash[index];
  }
  return difference === 0;
}

function parseBasicAuthorization(supplied) {
  if (typeof supplied !== "string" || supplied.length === 0 || supplied.length > MAX_AUTHORIZATION_LENGTH) {
    return null;
  }
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(supplied);
  if (!match) return null;

  try {
    const binary = atob(match[1]);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function authResponse(status, message) {
  const response = Response.json({ error: message }, { status });
  if (status === 401) {
    response.headers.set("WWW-Authenticate", `Basic realm="${realm}", charset="UTF-8"`);
  }
  return securityHeaders(response);
}

function isExplicitPreview(context) {
  const branch = context.env.CF_PAGES_BRANCH;
  return context.env.APC_CONTENT_OS_PREVIEW_AUTH_ENABLED === "true" &&
    context.env.APC_CONTENT_OS_ENVIRONMENT === "preview" &&
    branch !== "main";
}

function pathIsWithin(pathname, root) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

async function productionCredentialIsValid(secret, supplied) {
  const credential = parseBasicAuthorization(supplied);
  if (!credential) return false;
  const passwordMatches = await sameCredential(credential.password, secret);
  return credential.username === "apc" && passwordMatches;
}

async function previewCredentialIsValid(context, supplied) {
  const verifier = context.env.APC_CONTENT_OS_PREVIEW_AUTH;
  const credential = parseBasicAuthorization(supplied);
  if (!verifier || !credential) return false;

  const storedHash = await verifier.get(authHashKey);
  if (typeof storedHash !== "string" || !/^[a-f0-9]{64}$/i.test(storedHash)) {
    throw new Error("Preview credential verifier is not configured.");
  }
  const passwordHash = toHex(await sha256(credential.password));
  const passwordMatches = await sameCredential(passwordHash, storedHash.toLowerCase());
  return credential.username === "apc" && passwordMatches;
}

async function continueWithSecurityHeaders(context) {
  try {
    return securityHeaders(await context.next());
  } catch (error) {
    console.error(JSON.stringify({
      message: "Protected Content OS request failed",
      errorType: String(error?.name || "Error"),
    }));
    return authResponse(503, "APC Content OS is temporarily unavailable.");
  }
}

function authBackendFailure(error) {
  console.error(JSON.stringify({
    message: "Content OS authentication verifier failed",
    errorType: String(error?.name || "Error"),
  }));
  return authResponse(503, "APC Content OS authentication is temporarily unavailable.");
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  let decodedPathname = url.pathname;
  try { decodedPathname = decodeURIComponent(url.pathname); } catch {}
  const isContentOsPage = pathIsWithin(url.pathname, "/content-os") ||
    pathIsWithin(decodedPathname, "/content-os");
  const isContentOsApi = pathIsWithin(url.pathname, "/api/content-os") ||
    pathIsWithin(decodedPathname, "/api/content-os");
  if (!isContentOsPage && !isContentOsApi) {
    return context.next();
  }

  const isResearchGithubIngest = context.request.method === "POST" &&
    url.pathname === "/api/content-os/ingest/research-github";
  if (isResearchGithubIngest) {
    return continueWithSecurityHeaders(context);
  }

  if (isContentOsApi && !context.env.APC_CONTENT_OS_DB) {
    return authResponse(503, "APC Content OS storage is not configured.");
  }

  const supplied = context.request.headers.get("Authorization") || "";
  const environment = context.env.APC_CONTENT_OS_ENVIRONMENT;

  if (environment === "preview") {
    if (!isExplicitPreview(context) || !context.env.APC_CONTENT_OS_PREVIEW_AUTH) {
      return authResponse(503, "APC Content OS authentication is not configured.");
    }
    let valid;
    try {
      valid = await previewCredentialIsValid(context, supplied);
    } catch (error) {
      return authBackendFailure(error);
    }
    if (!valid) {
      return authResponse(401, "Authentication required.");
    }
    return continueWithSecurityHeaders(context);
  }

  if (environment !== "production") {
    return authResponse(503, "APC Content OS authentication is not configured.");
  }

  const secret = context.env.APC_CONTENT_OS_AUTH;
  if (typeof secret === "string" && secret.length > 0) {
    if (url.pathname === "/content-os/login/" || url.pathname === "/content-os/login") {
      if (context.request.method === "GET") return loginPage(secret, false);
      if (context.request.method !== "POST" || Number(context.request.headers.get("Content-Length") || 0) > 4096) return loginPage(secret, true);
      let form;
      try { form = await context.request.formData(); } catch { return loginPage(secret, true); }
      if (!await validLoginCsrf(secret, form, context.request.headers.get("Cookie")) || !await sameCredential(String(form.get("password") || ""), secret)) return loginPage(secret, true);
      const expires = Date.now() + SESSION_SECONDS * 1000;
      const response = new Response(null, { status: 303, headers: { Location: new URL("/content-os/episodes/", url).toString() } });
      response.headers.set("Set-Cookie", `${SESSION_COOKIE}=${await sessionToken(secret, expires)}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Strict`);
      return securityHeaders(response);
    }
    let valid;
    try {
      valid = await productionCredentialIsValid(secret, supplied) || await validSession(secret, context.request.headers.get("Cookie"));
    } catch (error) {
      return authBackendFailure(error);
    }
    if (!valid) {
      if (isContentOsPage && context.request.method === "GET") return securityHeaders(Response.redirect(new URL("/content-os/login/", url), 302));
      return authResponse(401, "Authentication required.");
    }
    return continueWithSecurityHeaders(context);
  }

  return authResponse(503, "APC Content OS authentication is not configured.");
}
