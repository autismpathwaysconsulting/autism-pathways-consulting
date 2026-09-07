export const SESSION_COOKIE = "__Host-apc_pathway_session";
export const LOGIN_CSRF_COOKIE = "__Host-apc_pathway_login_csrf";
export const SESSION_SECONDS = 60 * 60;
export const MAX_BODY_BYTES = 16 * 1024;

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

export function secure(response) {
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

export function json(value, status = 200) {
  return secure(Response.json(value, { status }));
}

export function cookieValue(request, name) {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get("Cookie") || "");
  return match ? match[1] : "";
}

export function toHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function sameValue(actual, expected) {
  const [actualHash, expectedHash] = await Promise.all([sha256Hex(actual), sha256Hex(expected)]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= actualHash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return difference === 0;
}

export async function signature(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function isoNow() {
  return new Date().toISOString();
}

export function requestOriginIsValid(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function readJson(request) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    throw new RequestError(415, "Expected application/json.");
  }
  try {
    const value = JSON.parse(await readBoundedText(request, MAX_BODY_BYTES));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid body");
    return value;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "Request body is invalid.");
  }
}

export async function readFormData(request, maximumBytes = 4096) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    throw new RequestError(415, "Expected a form submission.");
  }
  const text = await readBoundedText(request, maximumBytes);
  return new URLSearchParams(text);
}

async function readBoundedText(request, maximumBytes) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maximumBytes) throw new RequestError(413, "Request body is too large.");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new RequestError(413, "Request body is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new RequestError(400, "Request body is invalid."); }
}

export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function expireCookie(name) {
  return `${name}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;
}
