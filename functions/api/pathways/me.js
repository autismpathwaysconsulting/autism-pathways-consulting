import { authenticate, json } from '../../lib/pathways/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  return json({
    user: auth.user,
    csrfToken: auth.csrfToken,
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  return onRequestGet(context);
}
