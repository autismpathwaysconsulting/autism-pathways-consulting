import { forwardAnalyticsConnector } from "../../../lib/content-os/analytics-connector-proxy.js";

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function externalProviderFallback(externalProviders) {
  return Response.json({
    configuredProviders: {},
    connections: [],
    ingestionEnabled: false,
    enabledProviders: [],
    externalProviders,
  }, { status: 200, headers: responseHeaders() });
}

export async function onRequestGet(context) {
  const externalProviders = {
    meta: context.env.APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED === "true",
  };
  const response = await forwardAnalyticsConnector(context);
  if (!response.ok) {
    return externalProviders.meta ? externalProviderFallback(externalProviders) : response;
  }
  let body;
  try {
    body = await response.json();
  } catch {
    return externalProviders.meta
      ? externalProviderFallback(externalProviders)
      : Response.json({ error: "Analytics connector returned an invalid response." }, {
        status: 502,
        headers: responseHeaders(),
      });
  }
  return Response.json({
    ...body,
    externalProviders,
  }, {
    status: response.status,
    headers: responseHeaders(),
  });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return Response.json({ error: "Only GET is supported." }, { status: 405, headers: { Allow: "GET" } });
}
