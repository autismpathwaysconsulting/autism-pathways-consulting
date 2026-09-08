import { metricResponse } from "../../lib/site-metrics.js";

// The existing Content OS middleware authenticates this read-only report.
export async function onRequest({ request, env }) {
  if (request.method !== "GET") return metricResponse(405);
  if (new URL(request.url).search) return metricResponse(400);
  if (!env.APC_SITE_METRICS_DB) return metricResponse(503, { error: "Website counters are not configured." });
  try {
    const { results } = await env.APC_SITE_METRICS_DB.prepare("SELECT page, event, SUM(count) AS count FROM daily_counts WHERE day >= date('now', '-29 days') GROUP BY page, event ORDER BY page, event LIMIT 20").all();
    return metricResponse(200, { days: 30, timezone: "UTC", rows: results, measuredAt: new Date().toISOString() });
  } catch { return metricResponse(503, { error: "Website counters are temporarily unavailable." }); }
}
