export const CONSENT_VERSION = 'programmes-2026-09-v1';
export const PROGRAMMES = ['volunteering', 'money', 'camp'];
export const AGES = ['under-6', '6-8', '9-12', '13-17', '18-plus'];
export const STATUSES = ['new', 'contacted', 'verified', 'duplicate', 'closed'];
export function reply(value, status = 200) {
 return Response.json(value, {status, headers: {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer'}});
}
export function sameOrigin(request) {
 return request.headers.get('Origin') === new URL(request.url).origin;
}
export async function readBody(request) {
 if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) throw new Error('Invalid content type');
 const reader = request.body?.getReader();
 if (!reader) throw new Error('Missing body');
 let bytes = 0; const chunks = [];
 try {
  while (true) { const {done, value} = await reader.read(); if (done) break; bytes += value.length; if (bytes > 8192) {await reader.cancel(); throw new Error('Body too large');} chunks.push(value); }
 } finally { reader.releaseLock(); }
 const combined = new Uint8Array(bytes); let offset = 0;
 for (const chunk of chunks) {combined.set(chunk, offset); offset += chunk.length;}
 return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(combined));
}
function text(value, max, required = true) {
 if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid text');
 const result = value.trim(); if (required && !result) throw new Error('Missing text'); return result;
}
function choice(value, allowed) { if (!allowed.includes(value)) throw new Error('Invalid choice'); return value; }
function choices(value, allowed) {if (!Array.isArray(value) || !value.length || value.length > allowed.length || new Set(value).size !== value.length) throw new Error('Invalid choices'); return value.map(x=>choice(x,allowed));}
export function validate(value) {
 if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid request');
 const programmes = choices(value.programmes, PROGRAMMES);
 const email = text(value.email, 254).toLowerCase();
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
 const phone = text(value.phone || '', 24, false);
 if (phone && !/^[+\d ()-]{7,24}$/.test(phone)) throw new Error('Invalid phone');
 if (value.consent !== true || value.adult !== true || typeof value.updates !== 'boolean' || value.consentVersion !== CONSENT_VERSION) throw new Error('Consent required');
 return {name:text(value.name,80), email, phone, programmes, firstChoice:choice(value.firstChoice,programmes), ages:choices(value.ages,AGES), location:text(value.location,80), saturday:choice(value.saturday,['morning','afternoon','either','unavailable','unsure']), adultAvailability:choice(value.adultAvailability,['yes','sometimes','no','unsure']), supportDiscussion:choice(value.supportDiscussion || 'not-now',['yes','not-now']), updates:value.updates};
}
export async function purgeExpired(db) {
 const cutoff = new Date(Date.now()-180*86400000).toISOString();
 await db.prepare('DELETE FROM programme_interest WHERE created_at < ?').bind(cutoff).run();
}
