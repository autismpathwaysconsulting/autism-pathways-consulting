# APC Content OS v2.2 cloud sync

## Purpose

This adds private cross-device persistence to the locked APC Content OS. The September v2.1 methodology, taxonomy, prompts, measurement windows, product gates, and winner criteria remain unchanged.

The private app is served at `/content-os/`. Its API is `/api/content-os/state`.

## Architecture

- Cloudflare Pages serves the existing static site and the private Content OS route.
- Pages middleware protects only `/content-os*` and `/api/content-os/*` with HTTP Basic authentication. Username: `apc`. Production uses the `APC_CONTENT_OS_AUTH` Pages secret; preview deployments verify the same high-entropy password against a one-way SHA-256 verifier stored in the dedicated KV namespace.
- Workers KV binding `APC_CONTENT_OS_STATE` holds one canonical JSON record at `apc-content-os:v2.1:state`.
- The browser's existing localStorage and IndexedDB data remain a fast cache, offline fallback, and migration source.
- GET returns the current state, revision, schema version, and cloud timestamp.
- PUT requires `expectedRevision`. A mismatch returns HTTP 409 and the current cloud record; the client preserves the local version and asks before loading cloud state.
- Saves are debounced to respect KV's write rate for a single key.

## Migration and recovery

On first authenticated load:

1. The local v2.1 state renders immediately.
2. The client fetches cloud state.
3. If cloud is empty, it stores a local recovery copy and uploads the local v2.1 state as revision 1.
4. If both local and cloud contain data on first link, it stops with a visible conflict instead of choosing a winner.

Recovery copies are stored in localStorage under `apcContentOSv21Recovery`. Normal cache data remains under `apcContentOSv21`. JSON exports include `schemaVersion`, `cloudRevision`, `cloudUpdatedAt`, and `exportedAt`.

Browser same-origin rules prevent a Pages URL from reading localStorage created by a downloaded `file://` copy or another domain. For that case, export JSON from the old v2.1 copy and import it once through the v2.2 backup panel; import preserves a recovery copy and queues the data for cloud sync.

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

- Workers KV is eventually consistent and does not offer an atomic compare-and-swap operation. Revision checks prevent ordinary sequential stale overwrites, but two truly simultaneous writes can both pass the read check. The intended single-operator workflow, visible conflict handling, and save debounce reduce that risk.
- Basic authentication is the smallest secure route-scoped fallback available from the authenticated CLI. Cloudflare Access should replace it when dashboard Access administration is available.
- A recovery copy is per browser profile. Keep periodic JSON exports for independent recovery.

## Future work

- Move `/content-os/*` and `/api/content-os/*` behind a Cloudflare Access application and remove Basic authentication after validating iPhone and Mac sign-in.
- If the tool becomes multi-user or concurrent editing is expected, move canonical state to a Durable Object or another transactional store.
- Add automated full-browser regression coverage to the website CI once this private route is merged.

## Provenance

- Source artifact: `APC_Content_OS_v2.1_FINAL_TEST_LOCK.html`, recovered unchanged before cloud-sync edits.
- Implementation branch: `codex/content-os-cloud-sync`.
- Cloudflare project: `autism-pathways-consulting`.
