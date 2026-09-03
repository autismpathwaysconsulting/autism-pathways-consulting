# APC Content OS v2.3

## Outcome

The private APC dashboard keeps the useful v2.2 features and adds three separate, governed data layers:

- Planning state: calendar, Topic Bank, Prompt Builder, Product Board, and Book Builder.
- Analytics: manual aggregate platform snapshots with separate views and reach, real null values, and 24-hour, 7-day, and 28-day checkpoints.
- Research: a bounded weekly inbox of sourced findings and topic candidates. Research never becomes an APC rule or publishes automatically.

The private app is served at `/content-os/`.

## Security model

- Pages middleware protects the dashboard and authenticated APIs with private, no-store responses.
- The exact GitHub webhook route is the only Basic Auth bypass. It accepts POST only and independently requires an enabled production flag, raw-body HMAC SHA-256, a private pinned repository, approved sender and author, one label, one title pattern, a fresh weekly run ID, and a strict schema.
- Content Security Policy permits self-hosted CSS, JavaScript, images, and same-origin API calls only. Inline scripts, inline styles, event attributes, objects, frames, and form submissions are blocked.
- D1 is the sole canonical server store.
- Production D1 is not bound to local or preview environments. Preview can load the authenticated interface, but it remains local-only.
- State, analytics, research, deliveries, and decisions use strict allowlisted schemas. Unknown fields, prototype-shaped objects, and oversized planning states are rejected.
- The dashboard stores aggregate counts and short deidentified patterns only. Contact-like data is rejected in persisted free text. Do not enter names, handles, contact details, screenshots, or message text.

Basic Auth remains a temporary single-user control. Cloudflare Access with MFA and per-user audit logs is the recommended later replacement.

## Data and recovery

### Planning state

`content_os_state` stores the current v2.3 planning state with optimistic concurrency. Every accepted update also creates an immutable row in `content_os_revisions`. Lost-response retries are idempotent. Import, reset, and restore are server-first operations.

### Analytics

Publications and snapshots are separate from planning state. A snapshot preserves:

- views and reach as different metrics;
- total and average watch time;
- likes, raw comment count, saves, and shares;
- substantive-comment, problem-DM, request, interest, and paid counts;
- a short deidentified theme summary;
- the platform source, metric version, checkpoint, capture time, and correction revision.

A blank metric is stored as null with a reason. It is never converted to zero. Corrections append a new revision. Deidentified aggregate analytics are retained indefinitely so APC can compare old and new content without pulling the same data from Meta again. API reads are bounded and cursor-paginated, and the browser loads validated pages up to its documented safety cap.

The standard comparison checkpoints are 24 hours, 7 days, and 28 days. A publication time is required for manual and Meta snapshots. The API accepts a 24-hour capture from 18 to 36 hours after publication, a 7-day capture from 6 to 9 days, and a 28-day capture from 25 to 35 days. Old 72-hour entries remain labelled `72h_legacy` and are visible as history but never mixed into recommendations, baselines, or product gates.

### Research

The weekly automation creates at most five findings and three topic candidates. The secure GitHub webhook writes only validated research rows and delivery audit records. Research reads are bounded and cursor-paginated. The Founder can keep useful findings, archive noise, add a candidate to the planner, or attach exact governed research context to Prompt Builder. Prompt Builder also includes a concise deidentified analytics learning summary for the selected problem area. Automation cannot edit planning state, change governance, create permanent rules, or publish content.

### Ongoing planner

The calendar is not tied to a campaign month. It stores up to 500 canonical plan entries by ISO date, subject to the stricter 220 KiB state limit, supports month navigation, and lets the Founder add, edit, delete, or complete an entry. Topic Bank and Research can add entries to the same planner. The existing September starter plan appears only for a genuinely new, empty dashboard and does not overwrite imported, local, or cloud state.

### Browser cache

LocalStorage and IndexedDB support fast loading and offline planning. Manual analytics can queue offline and retry after reconnection. The queue rejects new entries at its safety limit instead of silently deleting old work. The JSON reference archive includes the planning state plus the complete validated analytics and research data loaded by the browser. Its import action restores planning state and merges the offline analytics queue only. Analytics and research inside the archive are reference copies and are not re-uploaded. Canonical analytics and research disaster recovery uses a tested D1 backup and restore. Local recovery lists validated planning checkpoints and restores server-first as a new revision so recovery never silently replaces the canonical state.

## Production activation order

Do not merge or deploy without separate Founder approval.

1. Back up the current production D1 database and verify the backup can be restored into a disposable D1 database.
2. Run `npm run build` and inspect the generated `dist` allowlist. Configure the Cloudflare Pages project build command as `npm run build` and its output directory as `dist`.
3. Apply `migrations/0002_content_os_v23_hardening.sql` to production D1.
4. Create the private APC-AI-OS label `apc-dashboard-feed`.
5. Create an Issues-only GitHub webhook pointing to:
   `https://autismpathwaysconsulting.com/api/content-os/ingest/research-github`
6. Use `application/json` and one new high-entropy webhook secret.
7. Store the same secret as the encrypted Cloudflare secret `APC_CONTENT_OS_GITHUB_WEBHOOK_SECRET`.
8. Confirm production alone has `APC_CONTENT_OS_AUTOMATION_ENABLED=true`.
9. Deploy the reviewed website commit.
10. Confirm `/CLAUDE.md`, `/wrangler.jsonc`, `/docs/`, `/tests/`, `/migrations/`, and `/package.json` return 404 in the deployed environment. Confirm `/content-os/` and its private APIs return 401 without credentials.
11. Before production activation, test one signed, schema-valid synthetic weekly issue against a disposable D1 environment. Confirm one accepted run and an idempotent replay, then discard the disposable database. Do not write synthetic rows to the immutable production log.
12. On the first real scheduled production run, confirm the genuine weekly bundle is accepted once and its replay is idempotent.
13. Verify the dashboard, APIs, privacy headers, manual analytics, paginated history, recovery restore, offline queue, conflict behavior, and 390 by 844 mobile layout.
14. Keep the public website unchanged.

The automation must use:

- Issue title: `APC Research Bundle: apc-weekly-topic-review:YYYY-Www`
- Label: `apc-dashboard-feed`
- Body: raw `apc.research_bundle.v1` JSON without Markdown fences

## Local verification

Run:

```sh
npm run build
npm run test:site-build
npm run test:content-os
python3 tests/run_authority_tests.py
```

The generated `dist` directory is ignored by Git and must be rebuilt for every release. The two D1 migrations can also be applied to a clean local database to verify schema, legacy-client compatibility, and immutable-history triggers.

## Rollback

The database migration is additive. Do not roll back to the v2.2 application after a v2.3 state save because v2.2 does not understand the v2.3 schema. If application rollback is required, keep the v2.3 database intact, disable automation, and restore service with a forward-fix branch. D1 backup and immutable revision history are the canonical recovery sources. The JSON archive remains an independent planning recovery and analytics/research reference copy.

## Residual limitations

- An open session sees another device's changes after reload or the next sync event. There is no live push.
- First-ever offline launch still requires a previously cached page.
- Scheduled research cannot see D1 directly. It feeds sourced weekly research to the dashboard, while the dashboard combines selected research with its own deidentified analytics when generating a prompt.
- The webhook, encrypted secret, D1 migration, and branch protection require production administration outside the repository.
