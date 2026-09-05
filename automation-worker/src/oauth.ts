import { decryptJson, encryptJson, pkceChallenge, randomToken, sha256Hex } from "./crypto";
import { fetchJson, formBody } from "./http";
import { isRecord, Provider, ProviderAccount, record, textValue } from "./model";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function callbackUrl(env: Env, provider: Provider): string {
  return new URL(`/api/content-os/connections/${provider}/callback`, env.APC_CONTENT_OS_BASE_URL).toString();
}

function configured(env: Env, provider: Provider): boolean {
  if (provider === "meta") return Boolean(env.META_APP_ID && env.META_APP_SECRET);
  if (provider === "tiktok") return Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET);
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function approvedReturnTo(value: string | null): string {
  if (!value) return "/content-os/#results";
  try {
    const parsed = new URL(value, "https://content-os.invalid");
    if (parsed.origin !== "https://content-os.invalid" || !parsed.pathname.startsWith("/content-os/")) return "/content-os/#results";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 500);
  } catch { return "/content-os/#results"; }
}

export async function beginOauth(request: Request, env: Env, provider: Provider): Promise<Response> {
  if (!configured(env, provider)) {
    return Response.json({ error: `${provider} OAuth is not configured.`, code: "provider_not_configured" }, { status: 503 });
  }
  const now = new Date();
  const state = randomToken();
  const verifier = randomToken(48);
  const returnTo = approvedReturnTo(new URL(request.url).searchParams.get("returnTo"));
  await env.APC_CONTENT_OS_DB.prepare(`INSERT INTO content_oauth_states
    (state_hash, provider, pkce_verifier_ciphertext, return_to, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?)`)
    .bind(
      await sha256Hex(state),
      provider,
      await encryptJson(verifier, env.APC_CONNECTOR_DATA_KEY_V1),
      returnTo,
      new Date(now.getTime() + OAUTH_STATE_TTL_MS).toISOString(),
      now.toISOString(),
    ).run();

  const redirectUri = callbackUrl(env, provider);
  const challenge = await pkceChallenge(verifier);
  let authorization: URL;
  if (provider === "meta") {
    authorization = new URL(`https://www.facebook.com/${env.META_GRAPH_API_VERSION}/dialog/oauth`);
    authorization.search = new URLSearchParams({
      client_id: env.META_APP_ID,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: "pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights",
    }).toString();
  } else if (provider === "tiktok") {
    authorization = new URL("https://www.tiktok.com/v2/auth/authorize/");
    authorization.search = new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "user.info.basic,video.list",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
  } else {
    authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorization.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
      state,
      access_type: "offline",
      prompt: "consent",
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
  }
  return Response.redirect(authorization.toString(), 302);
}

interface OauthStateRow {
  state_hash: string;
  provider: string;
  pkce_verifier_ciphertext: string | null;
  return_to: string;
  expires_at: string;
  used_at: string | null;
}

async function consumeState(env: Env, provider: Provider, rawState: string): Promise<{ verifier: string; returnTo: string } | null> {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(rawState)) return null;
  const hash = await sha256Hex(rawState);
  const now = new Date().toISOString();
  const result = await env.APC_CONTENT_OS_DB.prepare(`UPDATE content_oauth_states
    SET used_at = ? WHERE state_hash = ? AND provider = ? AND used_at IS NULL AND expires_at > ?`)
    .bind(now, hash, provider, now).run();
  if (Number(result.meta.changes || 0) !== 1) return null;
  const row = await env.APC_CONTENT_OS_DB.prepare(`SELECT state_hash, provider, pkce_verifier_ciphertext, return_to, expires_at, used_at
    FROM content_oauth_states WHERE state_hash = ?`).bind(hash).first<OauthStateRow>();
  if (!row?.pkce_verifier_ciphertext) return null;
  const decrypted = await decryptJson(row.pkce_verifier_ciphertext, env.APC_CONNECTOR_DATA_KEY_V1);
  return typeof decrypted === "string" ? { verifier: decrypted, returnTo: row.return_to } : null;
}

async function exchangeMeta(code: string, env: Env): Promise<ProviderAccount> {
  const tokenUrl = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/oauth/access_token`);
  tokenUrl.search = new URLSearchParams({ client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: callbackUrl(env, "meta"), code }).toString();
  const initial = record(await fetchJson(tokenUrl.toString(), {}, 1));
  const shortToken = textValue(initial.access_token);
  if (!shortToken) throw new Error("Meta did not return an access token.");
  const longUrl = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/oauth/access_token`);
  longUrl.search = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: shortToken }).toString();
  const long = record(await fetchJson(longUrl.toString(), {}, 1));
  const userToken = textValue(long.access_token) || shortToken;
  const pagesUrl = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/me/accounts`);
  pagesUrl.search = new URLSearchParams({ fields: "id,name,access_token,instagram_business_account", limit: "100", access_token: userToken }).toString();
  const pages = record(await fetchJson(pagesUrl.toString(), {}, 1));
  const candidates = Array.isArray(pages.data) ? pages.data.filter(isRecord) : [];
  const page = candidates.find(candidate => isRecord(candidate.instagram_business_account)) || candidates[0];
  if (!page) throw new Error("No eligible Meta Page was found.");
  const pageId = textValue(page.id);
  const pageName = textValue(page.name, 200);
  const pageToken = textValue(page.access_token);
  if (!pageId || !pageName || !pageToken) throw new Error("Meta Page details were incomplete.");
  const instagram = isRecord(page.instagram_business_account) ? textValue(page.instagram_business_account.id) : null;
  const expiresIn = typeof long.expires_in === "number" ? long.expires_in : null;
  return {
    provider: "meta", accountId: pageId, accountName: pageName, accessToken: pageToken, refreshToken: null,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    scopes: ["pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_manage_insights"],
    metadata: { instagramBusinessAccountId: instagram },
  };
}

async function exchangeTikTok(code: string, verifier: string, env: Env): Promise<ProviderAccount> {
  const token = record(await fetchJson("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: "authorization_code", redirect_uri: callbackUrl(env, "tiktok"), code_verifier: verifier }),
  }, 1));
  const accessToken = textValue(token.access_token);
  const refreshToken = textValue(token.refresh_token);
  const openId = textValue(token.open_id);
  if (!accessToken || !refreshToken || !openId) throw new Error("TikTok token response was incomplete.");
  const info = record(await fetchJson("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", { headers: { Authorization: `Bearer ${accessToken}` } }, 1));
  const user = isRecord(info.data) && isRecord(info.data.user) ? info.data.user : {};
  const accountName = textValue(user.display_name, 200) || "TikTok account";
  const expiresIn = typeof token.expires_in === "number" ? token.expires_in : 86400;
  return { provider: "tiktok", accountId: openId, accountName, accessToken, refreshToken, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), scopes: ["user.info.basic", "video.list"], metadata: {} };
}

async function exchangeGoogle(code: string, verifier: string, env: Env): Promise<ProviderAccount> {
  const token = record(await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: callbackUrl(env, "youtube") }),
  }, 1));
  const accessToken = textValue(token.access_token);
  const refreshToken = textValue(token.refresh_token);
  if (!accessToken || !refreshToken) throw new Error("Google did not return an offline refresh token.");
  const channels = record(await fetchJson("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=1", { headers: { Authorization: `Bearer ${accessToken}` } }, 1));
  const channel = Array.isArray(channels.items) && isRecord(channels.items[0]) ? channels.items[0] : null;
  const channelId = channel ? textValue(channel.id) : null;
  const snippet = channel && isRecord(channel.snippet) ? channel.snippet : {};
  if (!channelId) throw new Error("No YouTube channel was found.");
  const expiresIn = typeof token.expires_in === "number" ? token.expires_in : 3600;
  return { provider: "youtube", accountId: channelId, accountName: textValue(snippet.title, 200) || "YouTube channel", accessToken, refreshToken, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), scopes: ["youtube.readonly", "yt-analytics.readonly"], metadata: {} };
}

async function saveAccount(account: ProviderAccount, env: Env): Promise<void> {
  const now = new Date().toISOString();
  const connectionId = `conn_${(await sha256Hex(`${account.provider}|${account.accountId}`)).slice(0, 32)}`;
  await env.APC_CONTENT_OS_DB.prepare(`INSERT INTO content_analytics_connections (
      connection_id, provider, account_id, account_name, access_token_ciphertext,
      refresh_token_ciphertext, token_expires_at, scopes_json, metadata_json, status,
      last_refreshed_at, last_error_code, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)
    ON CONFLICT(provider, account_id) DO UPDATE SET
      account_name = excluded.account_name,
      access_token_ciphertext = excluded.access_token_ciphertext,
      refresh_token_ciphertext = COALESCE(excluded.refresh_token_ciphertext, content_analytics_connections.refresh_token_ciphertext),
      token_expires_at = excluded.token_expires_at,
      scopes_json = excluded.scopes_json,
      metadata_json = excluded.metadata_json,
      status = 'active', last_refreshed_at = excluded.last_refreshed_at,
      last_error_code = NULL, updated_at = excluded.updated_at`)
    .bind(
      connectionId, account.provider, account.accountId, account.accountName,
      await encryptJson(account.accessToken, env.APC_CONNECTOR_DATA_KEY_V1),
      account.refreshToken ? await encryptJson(account.refreshToken, env.APC_CONNECTOR_DATA_KEY_V1) : null,
      account.expiresAt, JSON.stringify(account.scopes), JSON.stringify(account.metadata),
      now, now, now,
    ).run();
}

export async function finishOauth(request: Request, env: Env, provider: Provider): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const saved = await consumeState(env, provider, state);
  if (!saved) return Response.redirect(new URL("/content-os/?connection=invalid#results", env.APC_CONTENT_OS_BASE_URL).toString(), 303);
  if (url.searchParams.has("error")) return Response.redirect(new URL("/content-os/?connection=cancelled#results", env.APC_CONTENT_OS_BASE_URL).toString(), 303);
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096) return Response.redirect(new URL("/content-os/?connection=failed#results", env.APC_CONTENT_OS_BASE_URL).toString(), 303);
  try {
    const account = provider === "meta" ? await exchangeMeta(code, env) : provider === "tiktok" ? await exchangeTikTok(code, saved.verifier, env) : await exchangeGoogle(code, saved.verifier, env);
    await saveAccount(account, env);
    const destination = new URL(saved.returnTo, env.APC_CONTENT_OS_BASE_URL);
    destination.searchParams.set("connection", `${provider}-connected`);
    return Response.redirect(destination.toString(), 303);
  } catch (error) {
    console.error(JSON.stringify({ message: "OAuth callback failed", provider, errorType: error instanceof Error ? error.name : "Error" }));
    return Response.redirect(new URL(`/content-os/?connection=${provider}-failed#results`, env.APC_CONTENT_OS_BASE_URL).toString(), 303);
  }
}
