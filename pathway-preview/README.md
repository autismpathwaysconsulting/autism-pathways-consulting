# APC Client Pathway protected preview

This isolated Cloudflare Pages project adapts the reviewed synthetic prototype from APC-AI-OS PR #58 at commit `47282cbd0c72f4d60368a78478dd894327d4c73a`.

## Safety boundary

- Preview branch only. Requests on a `main` deployment fail closed with `404`.
- `APC_PATHWAY_PRODUCTION_ENABLED` must remain `false`.
- Synthetic profile `DEMO-CLIENT-001` only.
- D1 and R2 are explicit synthetic stubs. No database or bucket is bound.
- No Content OS, Practice Console, Meta, Calm Companion, or production database binding is present.
- The invitation code is stored only as a SHA-256 secret and the session signing secret is never committed.
- The session contains one allowed synthetic client ID. A future API must derive ownership from that server-side identity and apply `WHERE client_id = ?` to every object read and write.
- No public paid booking route exists. Cal.com remains the booking source of truth, and a follow-up link can appear only when CJ publishes a client-specific URL and eligibility state. The synthetic preview has no assigned link.
- Journal and check-in interactions remain in browser memory and disappear on reload.

## Production gates

OPS-HOLD-003 remains open. Production is blocked until APC approves and tests invitation recovery and revocation, consent, minimum-data rules, client/CJ roles, object-level authorisation, data location, subprocessors, retention, export, deletion, audit logs, incident response, file scanning, accessibility, recovery, and AI-processing boundaries.

The recommended eventual custom hostname is `pathway.autismpathwaysconsulting.com`, attached only after the production gates are closed. Until then, use a protected branch URL on the separate `apc-client-pathway-preview` Pages project.

## Preview setup

Set project secrets `APC_PATHWAY_PREVIEW_INVITE_SHA256` and `APC_PATHWAY_PREVIEW_SESSION_SECRET`, build with `npm run build:pathway-preview`, then deploy `pathway-preview/dist` to a non-main branch of the separate Pages project. Never attach the production hostname during preview review.
