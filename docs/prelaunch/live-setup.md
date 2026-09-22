# Programme interest: live setup runbook

Prepared 22 September 2026. Scope: collect interest for all three ideas, with Community Crew first to develop. No booking, payment, confirmed Saturday, host partnership or project place is created by this release.

**Current state: preparation complete for account setup, release blocked.** PR #83 remains draft; capture is disabled in every committed environment. Cloudflare account access, production configuration, database schema and real Turnstile have not been verified. Local and CI results are not evidence of a working live form.

## 1. Resolve the release gate and confirm access

Owner: CJ for the release decision; repository maintainer for the technical gate.

- [ ] Review the latest PR head and any intervening main-branch changes. Record the exact approved commit and latest CI results.
- [ ] Resolve `authority.executable_javascript_forbidden` through maintainer review. The broad detector flags ordinary form/API code and existing Pathways Lab files. Do not bypass it, rename files to evade it, or treat functional QA as a waiver.
- [ ] Obtain CJ's separate authorization for merge/deployment and interest-list activation. Repository `CLAUDE.md` requires this; “get ready” does not authorize publication.
- [ ] Use an authenticated Cloudflare dashboard or operator terminal. Keep account credentials, API tokens and Turnstile secret out of chat, screenshots, source and issue comments. Preserve existing Content OS authentication.
- [ ] Verify the actual Pages project, production branch, custom domain, build command/output, current deployment and bindings. Record a known-good deployment ID privately. The repository declares project `autism-pathways-consulting` and output `dist`; confirm these against the account.

Wrangler configuration is the deployment source of truth when used. Compare it with the live account before release. If using `wrangler pages download config`, run it in a separate temporary directory because it overwrites the local configuration. Do not replace this repository's configuration automatically. [Cloudflare Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)

## 2. Prepare storage with capture still closed

Owner: technical operator. Do not execute remote writes before the approved setup window.

| Item | Reviewed repository value |
| --- | --- |
| Environment | `production` |
| Binding | `APC_CONTENT_OS_DB` |
| Database | `apc-content-os` |
| Database ID | `7a642992-b0a8-4806-9ab9-517b2b0142fa` |
| New table | `programme_interest` |
| Exact migration | `migrations/0012_programme_interest.sql` |

From the reviewed checkout in an authenticated operator terminal, inspect the database identity, pending migrations and table definition. These commands do not read household records:

```sh
npx wrangler d1 info apc-content-os --env production --json
npx wrangler d1 migrations list apc-content-os --env production --remote
npx wrangler d1 execute apc-content-os --env production --remote --command "SELECT name,sql FROM sqlite_master WHERE name='programme_interest' OR tbl_name='programme_interest';"
npx wrangler d1 time-travel info apc-content-os --env production --json
```

- [ ] Confirm the database ID. Stop on any mismatch. Save the pre-change Time Travel bookmark privately.
- [ ] Back up the shared database to an approved, access-controlled location outside the checkout. Use `wrangler d1 export apc-content-os --env production --remote --output` with a private destination. Confirm the export succeeds and is nonempty; it may contain unrelated private records.
- [ ] Inspect any existing `programme_interest` table. `IF NOT EXISTS` does not repair an incompatible table. If the schema differs, stop and review a repair migration first.
- [ ] Review the exact new SQL and apply only this file during the approved window:

```sh
npx wrangler d1 execute apc-content-os --env production --remote --file migrations/0012_programme_interest.sql
```

This direct-file path deliberately avoids applying unrelated pending migrations. It does not register the file as applied in the migrations ledger. Record that fact in the change log; the maintainer must reconcile migration tracking before a later bulk migration operation. Do not improvise writes to the ledger. The supplied migration is idempotent and has been rehearsed twice locally with unrelated data preserved.

- [ ] Re-read the table definition and `PRAGMA table_info(programme_interest); PRAGMA index_list(programme_interest);`. Confirm all 16 columns, case-insensitive unique email, the status/update constraints and the `programme_interest_created` index match the file.

Command semantics and migration-list behavior are documented in [Cloudflare D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/). The database is shared: rollback does not mean restoring the whole database or dropping the new table.

## 3. Configure security and rehearse the closed release

Owner: technical operator, with CJ verifying private access.

| Setting | Required action |
| --- | --- |
| `APC_PROGRAMME_INTEREST_ENABLED` | Keep `false` until all setup checks pass. |
| `APC_PROGRAMME_TURNSTILE_SITEKEY` | Configure the real widget's public key in the production environment. |
| `APC_PROGRAMME_TURNSTILE_SECRET` | Store the matching value as a production secret, never in source. |
| `APC_CONTENT_OS_AUTH` | Preserve and verify the existing private login. |
| Preview and local flags | Leave closed. Use a separate test database if remote staging is needed. |

Use a Turnstile widget restricted to the actual production hostname(s). Test on the final canonical hostname. Site keys identify the widget; secrets remain server-side. The handler verifies success, the request hostname and action `programme-interest`. Never use test keys on production. [Cloudflare widget management](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/) · [Server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

In the correct Pages project, open Settings > Variables and Secrets > Add. Add the production secret with Encrypt selected, preserving existing secrets and bindings. Save before deployment. Verify how the site key is supplied alongside the committed Wrangler configuration. A later deployment must not remove it. [Cloudflare Pages bindings and secrets](https://developers.cloudflare.com/pages/functions/bindings/)

- [ ] Run the repository build, authority gate and programme QA at the exact release commit. Review mobile and desktop pages.
- [ ] Deploy the approved closed release through the existing release process. Confirm its commit and production environment.
- [ ] Run the read-only smoke check below with `closed`. Missing/unavailable tables must also keep advertised availability closed.
- [ ] Sign in normally to Content OS. Open the resource hub, tracker and readiness page; download both PDF and Word resources. Confirm intended reviewer access. Do not share CJ's login with the helper unless that is an explicitly agreed access arrangement.

```sh
node scripts/check-programme-live.mjs https://autismpathwaysconsulting.com closed
```

The smoke check submits nothing and uses no credentials. It checks availability and anonymous access protection. A failure is a failed check, not proof of its underlying cause. Investigate before continuing.

## 4. Activate, test, then share

Owner: technical operator activates; CJ accepts the parent journey.

- [ ] Confirm the bilingual notice, contact route, selected-programme update permission and 180-day handling practice match actual operations. This runbook does not certify legal compliance.
- [ ] Change only the production flag to `true` in the deployment source of truth and review the diff. Keep preview/local closed. Update the resource hub's static “disabled in this draft” sentence so it does not contradict the activated state. Rebuild committed `dist`, rerun gates and use the approved deployment process.
- [ ] Run `node scripts/check-programme-live.mjs https://autismpathwaysconsulting.com open`.
- [ ] Complete real Turnstile and submit synthetic adult details with a controlled test email, all three interests, one first choice and updates off. No child information is needed. Confirm the receipt, exactly one private record and the opt-out preserved.
- [ ] Repeat that email with a new Turnstile token and changed answers. Confirm the original record and consent remain unchanged, with no duplicate count. Verify it privately, check totals, then delete only the test record and confirm removal. Public receipt alone is not proof of storage.
- [ ] In a signed-out browser, confirm private pages and downloads require login and the private API rejects access. Check narrow mobile layout, keyboard navigation and the visible contact fallback.
- [ ] Record the release commit, deployment ID, check time, test outcome and CJ's acceptance without personal details. Share the interest URL only after all checks pass. No automatic confirmation email is implemented; the on-screen receipt is the acknowledgement.

Opening the interest list does not establish readiness for a volunteering visit. Venue-specific consent, support/emergency records, staffing, host agreement, insurance and safeguarding arrangements remain part of the separate scouting-to-pilot decision.

## 5. Monitor and recover

Owner: CJ manages contacts; helper supports scouting and blank-resource preparation within agreed access. Technical operator handles availability failures.

- [ ] Check capture and contact fallback after release and the next day. Set a weekly manual tracker review while recruiting and a monthly retention review. These are internal routines, not advertised response-time promises.
- [ ] Confirm households before marking records verified. Programme totals overlap; use first-choice counts to prioritize. Only verified contacts with update permission receive selected-programme updates. No messages are sent automatically.
- [ ] If capture or privacy checks fail, stop sharing the link, set the production flag to `false` in the authoritative configuration, and deploy through the approved recovery process. Rerun the `closed` smoke check and confirm the email fallback remains available. Recheck this state after any deployment rollback.
- [ ] Preserve valid records and existing tables. Do not restore the shared database or delete production records as an automatic rollback. Investigate using status codes and request identifiers, without logging submitted personal details.
- [ ] Correct the cause, repeat the real save/duplicate/delete and access checks, and obtain the agreed reopening decision before sharing again.

## Evidence and remaining limits

The readiness repair checks the full column contract with a zero-row query: no household data is returned or changed. It catches a missing table, incomplete columns or unavailable storage. It does not prove write permission, constraints, real Turnstile or live delivery; the migration review and real save test cover those separately.

Prepared automated coverage includes 23 focused API/navigation/resource tests, local migration idempotence and unrelated-data preservation, full browser journeys and the read-only deployment check. Exact CI results belong to the final PR head. Production access and all live checks remain outstanding until completed in the account.
