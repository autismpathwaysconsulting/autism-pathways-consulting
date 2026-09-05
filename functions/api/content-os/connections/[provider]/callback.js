import { forwardAnalyticsConnector } from "../../../../lib/content-os/analytics-connector-proxy.js";

export async function onRequestGet(context) {
  return forwardAnalyticsConnector(context);
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return Response.json({ error: "Only GET is supported." }, { status: 405, headers: { Allow: "GET" } });
}
