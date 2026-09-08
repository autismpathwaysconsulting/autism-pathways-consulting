# Synthetic preview operations

This runbook is for the separate protected review environment only. Commands must be run from the repository root. Do not reuse an APC production resource, real email address, real client identifier or live service record.

## Resource boundary

1. Use the Pages project `apc-client-pathway-preview`.
2. Use the D1 database `apc-client-pathway-preview-synthetic`.
3. Confirm the Wrangler variables keep both production and real-client-data flags `false`.
4. Set `APC_PATHWAY_PREVIEW_SESSION_SECRET` and `APC_PATHWAY_PREVIEW_OPERATOR_SECRET` as independent random Cloudflare secrets of at least 32 characters.
5. Apply migrations to the synthetic database by immutable database name, not a production binding alias.
6. Set `APC_PATHWAY_PREVIEW_BRANCH` to the exact review branch and deploy `pathway-preview/dist` only to that branch.
7. Confirm the main-branch URL returns `404`, the review URL is access-protected, and no custom domain is attached.

## Synthetic invitation rehearsal

The operator endpoint is intentionally undocumented in the browser UI. An authorised operator tool sends `X-APC-Preview-Operator` and a same-origin JSON POST to:

- `/api/operator/invitations/issue`
- `/api/operator/invitations/recover`
- `/api/operator/invitations/revoke`

The issue/recovery response returns the raw one-time token once. Store it only long enough to run the rehearsal. D1 stores its hash. Recovery revokes outstanding invitations and sessions from the superseded invitation. Revocation invalidates associated sessions immediately.

## Consent and session rehearsal

Invitation acceptance creates a one-hour synthetic session and redirects to `/consent`. The portal stays unavailable until the authenticated account accepts the exact configured notice and terms versions. Changing either version makes existing sessions return to consent without rewriting earlier evidence.

## Booking rehearsal

`/api/operator/booking-links/assign` accepts one operator-assigned HTTPS `cal.com` event URL for the synthetic account. Public First Step Call, parent strategy session and availability routes are rejected. A new assignment revokes the prior link. `/api/operator/booking-links/revoke` removes it from the client projection. The portal never queries slots or stores an appointment.

## Record lifecycle rehearsal

- `GET /api/export` exports only the authenticated synthetic client projection and appends an audit event.
- `/api/operator/retention/rehearse` is dry-run only and requires an explicit cutoff. It reports `UNAPPROVED_NO_AUTOMATIC_RETENTION`; it never infers a duration or deletes rows.
- `/api/operator/deletion/rehearse` requires the exact phrase `DELETE DEMO-CLIENT-001`. It deletes only synthetic journals and booking links, revokes invitations/sessions, and preserves the immutable audit and rehearsal rows.

Recreate the preview database from migrations after a deletion rehearsal. Do not interpret successful rehearsal mechanics as an approved legal retention or erasure decision.

## Stop conditions

Do not deploy if any test fails, the D1 name or ID is not the dedicated synthetic resource, either safety flag changes, a forbidden integration appears, preview access protection is absent, or the branch is `main`. Do not merge PR #51, close `OPS-HOLD-003`, attach the production hostname or enable real client invitations from this runbook.
