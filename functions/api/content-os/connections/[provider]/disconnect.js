import { forwardAnalyticsConnector } from "../../../../lib/content-os/analytics-connector-proxy.js";

export async function onRequestPost(context) {
  return forwardAnalyticsConnector(context, { write: true });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return Response.json({ error: "Only POST is supported." }, { status: 405, headers: { Allow: "POST" } });
}
