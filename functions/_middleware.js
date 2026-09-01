const realm = "APC Content OS";
const authHashKey = "apc-content-os:auth:sha256";

function securityHeaders(response) {
  const secured = new Response(response.body, response);
  secured.headers.set("Cache-Control", "private, no-store");
  secured.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  secured.headers.set("Referrer-Policy", "no-referrer");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  return secured;
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

function authResponse(status, message) {
  const response = Response.json({ error: message }, { status });
  if (status === 401) response.headers.set("WWW-Authenticate", `Basic realm="${realm}", charset="UTF-8"`);
  return securityHeaders(response);
}

function isExplicitPreview(context) {
  const branch = context.env.CF_PAGES_BRANCH || "";
  return context.env.APC_CONTENT_OS_PREVIEW_AUTH_ENABLED === "true" &&
    context.env.CF_PAGES === "1" &&
    Boolean(branch) &&
    branch !== "main";
}

async function previewCredentialIsValid(context, supplied) {
  const verifier = context.env.APC_CONTENT_OS_PREVIEW_AUTH;
  if (!verifier) return false;
  const storedHash = await verifier.get(authHashKey);
  if (!storedHash) return false;
  try {
    const decoded = supplied.startsWith("Basic ") ? atob(supplied.slice(6)) : "";
    const separator = decoded.indexOf(":");
    const username = separator >= 0 ? decoded.slice(0, separator) : "";
    const password = separator >= 0 ? decoded.slice(separator + 1) : "";
    const passwordHash = toHex(await sha256(password));
    return username === "apc" && await sameCredential(passwordHash, storedHash);
  } catch { return false; }
}

export async function onRequest(context) {
  const secret = context.env.APC_CONTENT_OS_AUTH;
  const supplied = context.request.headers.get("Authorization") || "";

  if (secret) {
    const valid = await sameCredential(supplied, `Basic ${btoa(`apc:${secret}`)}`);
    if (!valid) return authResponse(401, "Authentication required.");
    return securityHeaders(await context.next());
  }

  if (!isExplicitPreview(context) || !context.env.APC_CONTENT_OS_PREVIEW_AUTH) {
    return authResponse(503, "APC Content OS authentication is not configured.");
  }
  if (!(await previewCredentialIsValid(context, supplied))) return authResponse(401, "Authentication required.");

  return securityHeaders(await context.next());
}
