import { metricResponse, validMetric } from "../lib/site-metrics.js";

const ORIGIN = "https://autismpathwaysconsulting.com";

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (request.method !== "POST") return metricResponse(405);
  if (url.pathname !== "/api/site-metrics" || url.search || url.origin !== ORIGIN ||
      request.headers.get("Origin") !== ORIGIN || request.headers.get("Sec-Fetch-Site") !== "same-origin") {
    return metricResponse(403);
  }
  if (env.APC_CONTENT_OS_ENVIRONMENT !== "production" || !env.APC_SITE_METRICS_DB) return metricResponse(503);
  if (request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1") return metricResponse(204);
  if (request.headers.get("Content-Type") !== "application/json") return metricResponse(415);
  if (Number(request.headers.get("Content-Length") || 0) > 128) return metricResponse(413);
  const reader = request.body?.getReader();
  if (!reader) return metricResponse(400);
  let value;
  try {
    const bytes = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 128) { await reader.cancel(); return metricResponse(413); }
      bytes.push(...chunk.value);
    }
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes)));
  } catch { return metricResponse(400); }
  if (!validMetric(value)) return metricResponse(400);
  try {
    await env.APC_SITE_METRICS_DB.batch([
      env.APC_SITE_METRICS_DB.prepare("INSERT INTO daily_counts (day, page, event, count) VALUES (date('now'), ?, ?, 1) ON CONFLICT(day, page, event) DO UPDATE SET count = min(count + 1, 1000000)").bind(value.page, value.event),
      env.APC_SITE_METRICS_DB.prepare("DELETE FROM daily_counts WHERE day < date('now', '-89 days')"),
    ]);
    return metricResponse(204);
  } catch { return metricResponse(503); }
}
