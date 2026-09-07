# APC Client Pathway protected synthetic preview

This Cloudflare Pages project is an isolated, non-production review surface derived from APC website PR #51. It persists only the committed `DEMO-*` fixture in a dedicated preview D1 database.

## Enforced boundary

- A `main` Pages deployment returns `404` before it reads D1.
- `APC_PATHWAY_PRODUCTION_ENABLED` and `APC_PATHWAY_REAL_CLIENT_DATA_ENABLED` must both remain `false`.
- `PATHWAY_DB` must point only to `apc-client-pathway-preview-synthetic`; no APC production database is referenced.
- Client IDs must match `DEMO-*`, and the runtime allows only `DEMO-CLIENT-001`.
- R2 and file uploads are disabled. No Content OS, Practice Console, Meta, Calm Companion or canonical client-record binding exists.
- Invitation and session tokens are random; D1 stores SHA-256 hashes only. Operator and session secrets are Cloudflare secrets, never repository variables.
- Every client object query derives `client_id` and `account_id` from the server-side session and repeats both predicates in SQL.
- Audit rows are insert-only. SQLite triggers reject updates and deletes, including during deletion rehearsal.
- Cal.com remains the only booking source. Only an operator-authenticated CJ assignment can expose one private follow-up event URL; the preview stores no availability or appointments.

## Implemented synthetic rehearsals

- invitation issue, one-time acceptance, expiry, recovery and revocation;
- active account/grant/session checks on every authenticated request;
- exact privacy-notice and portal-terms version acceptance before portal access;
- D1-backed journal creation, scoped read and JSON export;
- operator-only private Cal.com link assignment, replacement, expiry filtering and revocation;
- explicit retention dry-run with no inferred schedule;
- confirmed synthetic deletion of journals, booking links and active access while preserving audit/lifecycle evidence;
- connection-failure recovery UI, keyboard focus, skip links, live status and narrow-screen layouts.

These controls are preview evidence only. They do not close `OPS-HOLD-003`, approve legal wording, authorise real client data or establish the production client-record system.

## Local verification

```sh
npm run build:pathway-preview
npm run test:pathway-preview
npx wrangler d1 migrations apply apc-client-pathway-preview-synthetic --local --config pathway-preview/wrangler.jsonc
npx wrangler types pathway-preview/worker-configuration.d.ts --config pathway-preview/wrangler.jsonc
```

The Node tests execute both migrations against SQLite and exercise the Pages middleware/API with a D1-compatible adapter.

## Protected preview deployment

Follow [`docs/PREVIEW_OPERATIONS.md`](docs/PREVIEW_OPERATIONS.md). Use only the separate `apc-client-pathway-preview` Pages project, a non-main branch, the dedicated synthetic D1 database and generated preview secrets. Never attach `pathway.autismpathwaysconsulting.com`.

## Remaining production blockers

The fail-closed states in [`docs/portal-release-gates.json`](docs/portal-release-gates.json) remain authoritative. Legal/privacy approval, real identity and recovery design, canonical record ownership, data location/transfers, approved retention schedule, production deletion/export, incident response, file scanning/private object delivery, external security/accessibility review and Founder approval remain human gates.
