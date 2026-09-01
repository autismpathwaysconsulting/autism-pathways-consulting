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

function authResponse(status, message, configuration = "unknown") {
  const response = Response.json({ error: message }, { status });
  if (status === 401) response.headers.set("WWW-Authenticate", `Basic realm="${realm}", charset="UTF-8"`);
  response.headers.set("X-APC-Auth-Configuration", configuration);
  return securityHeaders(response);
}

export async function onRequest(context) {
  const secret = context.env.APC_CONTENT_OS_AUTH;
  const supplied = context.request.headers.get("Authorization") || "";
  let authorized = false;
  const configuration = [supplied ? "header" : "no-header", secret ? "secret" : "no-secret"];

  if (secret) {
    authorized = await sameCredential(supplied, `Basic ${btoa(`apc:${secret}`)}`);
  }
  if (!authorized && context.env.APC_CONTENT_OS_STATE) {
    configuration.push("kv");
    const storedHash = await context.env.APC_CONTENT_OS_STATE.get(authHashKey);
    configuration.push(storedHash ? "hash" : "no-hash");
    try {
      const decoded = supplied.startsWith("Basic ") ? atob(supplied.slice(6)) : "";
      const separator = decoded.indexOf(":");
      const username = separator >= 0 ? decoded.slice(0, separator) : "";
      const password = separator >= 0 ? decoded.slice(separator + 1) : "";
      const passwordHash = toHex(await sha256(password));
      authorized = username === "apc" && Boolean(storedHash) && await sameCredential(passwordHash, storedHash);
    } catch { authorized = false; }
  } else if (!secret) {
    return authResponse(503, "APC Content OS authentication is not configured.");
  }

  if (!authorized) {
    return authResponse(401, "Authentication required.", configuration.join(","));
  }

  return securityHeaders(await context.next());
}
