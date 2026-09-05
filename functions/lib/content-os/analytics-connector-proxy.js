function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function forwardAnalyticsConnector(context, { write = false } = {}) {
  const connector = context.env.APC_ANALYTICS_CONNECTOR;
  if (!connector || typeof connector.fetch !== "function") {
    return json({ error: "Automatic analytics is not configured.", code: "connector_unavailable" }, 503);
  }
  if (write) {
    const origin = context.request.headers.get("Origin");
    if (!origin || origin !== new URL(context.request.url).origin) {
      return json({ error: "Cross-origin writes are not allowed.", code: "cross_origin_write" }, 403);
    }
    if (context.request.headers.get("X-APC-Content-OS") !== "1") {
      return json({ error: "Missing Content OS request header.", code: "missing_intent_header" }, 400);
    }
  }
  try {
    return await connector.fetch(context.request);
  } catch (error) {
    console.error(JSON.stringify({
      message: "Analytics connector service call failed",
      errorType: String(error?.name || "Error"),
    }));
    return json({ error: "Automatic analytics is temporarily unavailable.", code: "connector_unavailable" }, 503);
  }
}
