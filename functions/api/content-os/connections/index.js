import { forwardAnalyticsConnector } from "../../../lib/content-os/analytics-connector-proxy.js";

export async function onRequestGet(context) {
  const response = await forwardAnalyticsConnector(context);
  if (!response.ok) return response;
  let body;
  try { body = await response.json(); } catch { return response; }
  return Response.json({
    ...body,
    externalProviders: {
      meta: context.env.APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED === "true",
    },
  }, {
    status: response.status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return Response.json({ error: "Only GET is supported." }, { status: 405, headers: { Allow: "GET" } });
}
