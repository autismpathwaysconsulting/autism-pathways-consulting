const INSTAGRAM_REEL_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
]);
const INSTAGRAM_REEL_SHORTCODE = /^[A-Za-z0-9_-]{5,64}$/;

export function canonicalInstagramReelPostRef(value) {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error("Instagram Reel reference must be a URL or shortcode without surrounding whitespace.");
  }
  if (INSTAGRAM_REEL_SHORTCODE.test(value)) {
    return `https://www.instagram.com/reel/${value}/`;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Instagram Reel reference must be a valid HTTPS URL or shortcode.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
      !INSTAGRAM_REEL_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("Instagram Reel URL must use an approved Instagram HTTPS host.");
  }
  const match = /^\/reel\/([A-Za-z0-9_-]{5,64})\/?$/.exec(parsed.pathname);
  if (!match) throw new Error("Instagram Reel URL must contain one valid Reel shortcode.");
  return `https://www.instagram.com/reel/${match[1]}/`;
}

export async function canonicalInstagramReelPublicationId(postRef) {
  const canonicalPostRef = canonicalInstagramReelPostRef(postRef);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`Instagram\n${canonicalPostRef}`),
  );
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return `pub_${hex.slice(0, 32)}`;
}
