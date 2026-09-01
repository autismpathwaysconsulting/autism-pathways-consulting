# APC Content OS v2.2 cloud sync

## Purpose

This adds private cross-device persistence to the locked APC Content OS. The September v2.1 methodology, taxonomy, prompts, measurement windows, product gates, and winner criteria remain unchanged.

The private app is served at `/content-os/`. Its API is `/api/content-os/state`.

## Architecture

- Cloudflare Pages serves the existing static site and the private Content OS route.
- Pages middleware protects only `/content-os*` and `/api/content-os/*` with HTTP Basic authentication. Username: `apc`. When `APC_CONTENT_OS_AUTH` is configured it is the only accepted credential; a failed production credential never falls back to another verifier. Only an explicit non-production Pages preview with no production secret may use the one-way SHA-256 verifier in the preview-auth KV namespace.
- Cloudflare D1 database `apc-content-os`, bound as `APC_CONTENT_OS_DB`, is the only canonical application-state store. Its single `content_os_state` row starts at revision 0 with a null state.
- The KV binding `APC_CONTENT_OS_PREVIEW_AUTH` is limited to the preview password verifier. It never contains canonical Content OS state.
- The browser's existing localStorage and IndexedDB data remain a fast cache, offline fallback, and migration source.
- GET returns the current state, revision, schema version, and cloud timestamp.
- PUT performs one conditional D1 update using `WHERE id = 1 AND revision = expectedRevision`. Exactly one writer can advance a revision. If no row changes, the API reads and returns the current canonical record with HTTP 409; the client preserves the local version and asks before loading cloud state.
- Saves remain debounced to avoid unnecessary network and database operations.

## Migration and recovery

On first authenticated load:

1. The local v2.1 state renders immediately.
2. The client fetches cloud state.
3. If cloud is empty, it stores a local recovery copy and uploads the local v2.1 state as revision 1.
4. If both local and cloud contain data on first link, it stops with a visible conflict instead of choosing a winner.

Recovery copies are stored in localStorage under `apcContentOSv21Recovery`. Normal cache data remains under `apcContentOSv21`. JSON exports include `schemaVersion`, `cloudRevision`, `cloudUpdatedAt`, and `exportedAt`.

Browser same-origin rules prevent a Pages URL from reading localStorage created by a downloaded `file://` copy or another domain. For that case, export JSON from the old v2.1 copy and import it once through the v2.2 backup panel; import preserves a recovery copy and queues the data for cloud sync.

After deployment QA, the canonical D1 row is intentionally restored to revision 0 with a null state so the first real migration starts cleanly.

## Cloudflare setup

Apply the checked-in migration to local and remote D1 before serving or deploying:

```sh
npx wrangler d1 migrations apply apc-content-os --local
npx wrangler d1 migrations apply apc-content-os --remote
```

The deployment remains within Cloudflare's Free plan: one small D1 database, one canonical row, the existing Pages project, and the existing preview-auth KV namespace. No external state service is required.

## Local verification

Run the unit suite:

```sh
npm run test:content-os
```

For a local Pages session, create an ignored `.dev.vars` containing `APC_CONTENT_OS_AUTH`, then run:

```sh
npx wrangler pages dev .
```

Log in with username `apc` and the local secret.

## Limitations

- Basic authentication is the smallest secure route-scoped fallback available from the authenticated CLI. Cloudflare Access should replace it when dashboard Access administration is available.
- A recovery copy is per browser profile. Keep periodic JSON exports for independent recovery.

## Future work

- Move `/content-os/*` and `/api/content-os/*` behind a Cloudflare Access application and remove Basic authentication after validating iPhone and Mac sign-in.
- Add automated full-browser regression coverage to the website CI once this private route is merged.

## Provenance

- Source artifact: `APC_Content_OS_v2.1_FINAL_TEST_LOCK.html`, recovered unchanged before cloud-sync edits.
- Implementation branch: `codex/content-os-cloud-sync`.
- Cloudflare project: `autism-pathways-consulting`.
