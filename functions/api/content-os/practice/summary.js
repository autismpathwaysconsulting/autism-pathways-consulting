function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

export async function onRequestGet({ env }) {
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Practice summary storage is not configured." }, 503);
  try {
    const [clients, documents] = await env.APC_CONTENT_OS_DB.batch([
      env.APC_CONTENT_OS_DB.prepare(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN archived_at IS NOT NULL OR stage IN ('COMPLETE', 'REFERRED', 'CANCELLED') THEN 1 ELSE 0 END) AS finished,
        SUM(CASE WHEN archived_at IS NULL AND stage IN ('RECORD_REVIEW_REQUIRED', 'FIT_REVIEW', 'APPROVED_TO_PAY', 'PAYMENT_PROOF_RECEIVED', 'PAYMENT_VERIFIED') THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN archived_at IS NULL AND stage NOT IN ('RECORD_REVIEW_REQUIRED', 'FIT_REVIEW', 'APPROVED_TO_PAY', 'PAYMENT_PROOF_RECEIVED', 'PAYMENT_VERIFIED', 'COMPLETE', 'REFERRED', 'CANCELLED') THEN 1 ELSE 0 END) AS active
        FROM practice_clients`),
      env.APC_CONTENT_OS_DB.prepare(`SELECT
        SUM(CASE WHEN document_status IN ('CJ_APPROVED', 'EXPORTED') THEN 1 ELSE 0 END) AS awaiting_action
        FROM practice_sessions`),
    ]);
    const clientRow = clients.results?.[0] || {};
    const documentRow = documents.results?.[0] || {};
    return json({
      schemaVersion: "apc.practice_summary.v1",
      writesEnabled: env.APC_PRACTICE_LIVE_WRITES_ENABLED === "true",
      clients: {
        total: Number(clientRow.total || 0),
        new: Number(clientRow.new_count || 0),
        active: Number(clientRow.active || 0),
        finished: Number(clientRow.finished || 0),
      },
      actions: Number(documentRow.awaiting_action || 0),
    });
  } catch (error) {
    console.error(JSON.stringify({ message: "Practice summary read failed", errorType: String(error?.name || "Error") }));
    return json({ error: "Practice summary is unavailable." }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ error: "Only GET is supported." }, 405, { Allow: "GET" });
}
