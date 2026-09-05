import { decryptJson, encryptJson } from "./crypto";
import { fetchJson, formBody, ProviderHttpError } from "./http";
import {
  ConnectionRow,
  integerValue,
  isRecord,
  JsonRecord,
  NormalizedMetrics,
  numberValue,
  parseJsonRecord,
  record,
  textValue,
} from "./model";

export interface ProviderMetrics {
  metrics: NormalizedMetrics;
  sourceSystem: "Meta Business Suite" | "Instagram Insights" | "TikTok Analytics" | "YouTube Studio";
  collectionMethod: "meta_connector" | "tiktok_connector" | "youtube_connector";
  sourceMetricVersion: string;
}

function emptyMetrics(): NormalizedMetrics {
  return { views: null, reach: null, averageWatchTimeSeconds: null, totalWatchTimeSeconds: null, likes: null, commentsCount: null, saves: null, shares: null };
}

async function decryptedToken(ciphertext: string, env: Env): Promise<string> {
  const value = await decryptJson(ciphertext, env.APC_CONNECTOR_DATA_KEY_V1);
  if (typeof value !== "string" || !value) throw new Error("Stored provider token is invalid.");
  return value;
}

async function refreshIfNeeded(connection: ConnectionRow, env: Env): Promise<string> {
  const accessToken = await decryptedToken(connection.access_token_ciphertext, env);
  if (!connection.token_expires_at || Date.parse(connection.token_expires_at) > Date.now() + 5 * 60 * 1000) return accessToken;
  if (connection.provider === "meta" || !connection.refresh_token_ciphertext) {
    throw new ProviderHttpError("Provider connection needs authorization again.", 401, "reconnect_required", false);
  }
  const refreshToken = await decryptedToken(connection.refresh_token_ciphertext, env);
  let response: JsonRecord;
  if (connection.provider === "tiktok") {
    response = record(await fetchJson("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: refreshToken }),
    }, 1));
  } else {
    response = record(await fetchJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: refreshToken }),
    }, 1));
  }
  const nextAccessToken = textValue(response.access_token);
  if (!nextAccessToken) throw new ProviderHttpError("Provider token refresh failed.", 401, "reconnect_required", false);
  const rotatedRefresh = textValue(response.refresh_token) || refreshToken;
  const fallbackSeconds = connection.provider === "tiktok" ? 86400 : 3600;
  const expiresIn = typeof response.expires_in === "number" ? response.expires_in : fallbackSeconds;
  const now = new Date().toISOString();
  await env.APC_CONTENT_OS_DB.prepare(`UPDATE content_analytics_connections SET
    access_token_ciphertext = ?, refresh_token_ciphertext = ?, token_expires_at = ?,
    last_refreshed_at = ?, last_error_code = NULL, status = 'active', updated_at = ?
    WHERE connection_id = ? AND status = 'active'`)
    .bind(
      await encryptJson(nextAccessToken, env.APC_CONNECTOR_DATA_KEY_V1),
      await encryptJson(rotatedRefresh, env.APC_CONNECTOR_DATA_KEY_V1),
      new Date(Date.now() + expiresIn * 1000).toISOString(), now, now, connection.connection_id,
    ).run();
  return nextAccessToken;
}

function metaInsightValue(payload: unknown): number | null {
  const root = isRecord(payload) ? payload : {};
  const first = Array.isArray(root.data) && isRecord(root.data[0]) ? root.data[0] : null;
  const firstValue = first && Array.isArray(first.values) && isRecord(first.values[0]) ? first.values[0].value : null;
  return numberValue(firstValue);
}

async function fetchMetaMetric(base: string, remoteMediaId: string, metric: string, token: string): Promise<number | null> {
  const url = new URL(`${base}/${encodeURIComponent(remoteMediaId)}/insights`);
  url.search = new URLSearchParams({ metric, access_token: token }).toString();
  try { return metaInsightValue(await fetchJson(url.toString(), {}, 2)); }
  catch (error) {
    if (error instanceof ProviderHttpError && [400, 403, 404].includes(error.status)) return null;
    throw error;
  }
}

async function metaMetrics(connection: ConnectionRow, publication: JsonRecord, remoteMediaId: string, env: Env): Promise<ProviderMetrics> {
  const token = await refreshIfNeeded(connection, env);
  const base = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;
  const platform = publication.platform;
  const metrics = emptyMetrics();
  if (platform === "Instagram") {
    const mediaUrl = new URL(`${base}/${encodeURIComponent(remoteMediaId)}`);
    mediaUrl.search = new URLSearchParams({ fields: "like_count,comments_count", access_token: token }).toString();
    const media = record(await fetchJson(mediaUrl.toString(), {}, 2));
    metrics.likes = integerValue(media.like_count);
    metrics.commentsCount = integerValue(media.comments_count);
    const values = await Promise.all([
      fetchMetaMetric(base, remoteMediaId, "views", token),
      fetchMetaMetric(base, remoteMediaId, "reach", token),
      fetchMetaMetric(base, remoteMediaId, "ig_reels_avg_watch_time", token),
      fetchMetaMetric(base, remoteMediaId, "ig_reels_video_view_total_time", token),
      fetchMetaMetric(base, remoteMediaId, "saved", token),
      fetchMetaMetric(base, remoteMediaId, "shares", token),
    ]);
    metrics.views = values[0] === null ? null : Math.round(values[0]);
    metrics.reach = values[1] === null ? null : Math.round(values[1]);
    metrics.averageWatchTimeSeconds = values[2] === null ? null : values[2] / 1000;
    metrics.totalWatchTimeSeconds = values[3] === null ? null : values[3] / 1000;
    metrics.saves = values[4] === null ? null : Math.round(values[4]);
    metrics.shares = values[5] === null ? null : Math.round(values[5]);
    return { metrics, sourceSystem: "Instagram Insights", collectionMethod: "meta_connector", sourceMetricVersion: `meta-graph-${env.META_GRAPH_API_VERSION}` };
  }
  const postUrl = new URL(`${base}/${encodeURIComponent(remoteMediaId)}`);
  postUrl.search = new URLSearchParams({ fields: "shares,likes.limit(0).summary(true),comments.limit(0).summary(true)", access_token: token }).toString();
  const post = record(await fetchJson(postUrl.toString(), {}, 2));
  const likes = isRecord(post.likes) && isRecord(post.likes.summary) ? post.likes.summary.total_count : null;
  const comments = isRecord(post.comments) && isRecord(post.comments.summary) ? post.comments.summary.total_count : null;
  const shares = isRecord(post.shares) ? post.shares.count : null;
  metrics.likes = integerValue(likes);
  metrics.commentsCount = integerValue(comments);
  metrics.shares = integerValue(shares);
  metrics.views = integerValue(await fetchMetaMetric(base, remoteMediaId, "post_video_views", token));
  metrics.reach = integerValue(await fetchMetaMetric(base, remoteMediaId, "post_impressions_unique", token));
  return { metrics, sourceSystem: "Meta Business Suite", collectionMethod: "meta_connector", sourceMetricVersion: `meta-graph-${env.META_GRAPH_API_VERSION}` };
}

async function tiktokMetrics(connection: ConnectionRow, remoteMediaId: string, env: Env): Promise<ProviderMetrics> {
  const token = await refreshIfNeeded(connection, env);
  const response = record(await fetchJson("https://open.tiktokapis.com/v2/video/query/?fields=id,create_time,duration,like_count,comment_count,share_count,view_count", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filters: { video_ids: [remoteMediaId] } }),
  }, 2));
  const videos = isRecord(response.data) && Array.isArray(response.data.videos) ? response.data.videos : [];
  const video = isRecord(videos[0]) ? videos[0] : null;
  if (!video) throw new ProviderHttpError("TikTok video was not found.", 404, "remote_media_not_found", false);
  return {
    metrics: {
      views: integerValue(video.view_count), reach: null, averageWatchTimeSeconds: null, totalWatchTimeSeconds: null,
      likes: integerValue(video.like_count), commentsCount: integerValue(video.comment_count), saves: null, shares: integerValue(video.share_count),
    },
    sourceSystem: "TikTok Analytics", collectionMethod: "tiktok_connector", sourceMetricVersion: "tiktok-display-v2",
  };
}

function utcDate(value: string): string {
  return value.slice(0, 10);
}

async function youtubeMetrics(connection: ConnectionRow, publication: JsonRecord, remoteMediaId: string, env: Env): Promise<ProviderMetrics> {
  const token = await refreshIfNeeded(connection, env);
  const dataUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  dataUrl.search = new URLSearchParams({ part: "statistics", id: remoteMediaId }).toString();
  const data = record(await fetchJson(dataUrl.toString(), { headers: { Authorization: `Bearer ${token}` } }, 2));
  const video = Array.isArray(data.items) && isRecord(data.items[0]) ? data.items[0] : null;
  const statistics = video && isRecord(video.statistics) ? video.statistics : null;
  if (!statistics) throw new ProviderHttpError("YouTube video was not found.", 404, "remote_media_not_found", false);
  const publishedAt = textValue(publication.publishedAt);
  const analyticsUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  analyticsUrl.search = new URLSearchParams({
    ids: "channel==MINE",
    startDate: publishedAt ? utcDate(publishedAt) : utcDate(new Date(Date.now() - 35 * 86400000).toISOString()),
    endDate: utcDate(new Date().toISOString()),
    metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares",
    filters: `video==${remoteMediaId}`,
  }).toString();
  let analytics: JsonRecord = {};
  try { analytics = record(await fetchJson(analyticsUrl.toString(), { headers: { Authorization: `Bearer ${token}` } }, 2)); }
  catch (error) { if (!(error instanceof ProviderHttpError && [400, 403].includes(error.status))) throw error; }
  const row = Array.isArray(analytics.rows) && Array.isArray(analytics.rows[0]) ? analytics.rows[0] : [];
  return {
    metrics: {
      views: integerValue(statistics.viewCount), reach: null,
      averageWatchTimeSeconds: numberValue(row[2]),
      totalWatchTimeSeconds: numberValue(row[1]) === null ? null : numberValue(row[1])! * 60,
      likes: integerValue(statistics.likeCount) ?? integerValue(row[3]),
      commentsCount: integerValue(statistics.commentCount) ?? integerValue(row[4]),
      saves: null, shares: integerValue(row[5]),
    },
    sourceSystem: "YouTube Studio", collectionMethod: "youtube_connector", sourceMetricVersion: "youtube-data-v3-analytics-v2",
  };
}

export async function fetchProviderMetrics(connection: ConnectionRow, publication: JsonRecord, remoteMediaId: string, env: Env): Promise<ProviderMetrics> {
  parseJsonRecord(connection.metadata_json);
  if (connection.provider === "meta") return metaMetrics(connection, publication, remoteMediaId, env);
  if (connection.provider === "tiktok") return tiktokMetrics(connection, remoteMediaId, env);
  return youtubeMetrics(connection, publication, remoteMediaId, env);
}
