# School analytics continuation

Brevo is deferred by CJ. This work isolates the remaining school counters from PR #82 on top of the released website fixes in PRs #87 and #89. It does not merge the old branch or alter the programme security check.

## Step 1: Live programme submission

Status: BLOCKED. The production page loads the released recovery script, but the security check stalls in this browser. The private tracker requires sign-in. Local simulated checks do not prove a production save.

Use a clearly labelled synthetic test with CJ's authorised adult contact address. No child details or marketing opt-in. Verify one stored record, selections, first preference and consent. A second submission with the same email must not overwrite the original consent. Do not permanently delete a test record through the browser without action-time confirmation.

Continuation prompt: "Complete one clearly labelled programme test submission and verify exactly one record, its preferences and consent in the private tracker. Keep Brevo deferred."

## Step 2: Prepare school analytics

This branch adds only two fixed aggregate actions: school_enquiry_prepared and school_whatsapp_click. These are message reviews and requests to open WhatsApp, never confirmed messages, bookings or payments. No form values enter the counters. Existing privacy signals, production-only writes and once-per-page-load deduplication apply. Measurement failure must not block an enquiry.

Checks cover existing-row preservation, rollback of an injected migration failure in SQLite, the old schema, unsupported payloads, privacy signals, stale drafts and unavailable measurement. SQLite tests are not proof that the remote migration has run.

Continuation prompt: "Review the isolated school analytics PR and its checks, then verify the production database prerequisites before applying its migration. Preserve the current website pages and leave Brevo deferred."

## Step 3: Production migration and release

Status: NOT APPLIED. No authenticated Cloudflare database session is available. Do not merge or enable the school calls before migration verification.

Target from wrangler.jsonc: production database apc-site-metrics, ID 61cf5958-c99a-4d3c-a5e1-695c3028be94, binding APC_SITE_METRICS_DB, directory site-metrics-migrations. Never apply this migration to apc-content-os or the programme records database.

In an authenticated checkout of this branch:

```sh
npx wrangler d1 migrations list apc-site-metrics --env production --remote
npx wrangler d1 export apc-site-metrics --env production --remote --output /tmp/apc-site-metrics-before-school.sql
npx wrangler d1 execute apc-site-metrics --env production --remote --command "SELECT type,name,sql FROM sqlite_schema WHERE tbl_name='daily_counts'; SELECT day,page,event,count FROM daily_counts ORDER BY day,page,event;"
```

Verify the database identity, a completed export kept securely outside git, the expected four columns and constraints, no custom index or trigger that would be lost, and the exact pending migration list. If 0002 is already applied, inspect its schema instead of replaying the file. Stop for unexpected migrations or schema differences. Record before/after totals; concurrent new traffic can increase totals, while retention can remove expired dates, so investigate differences at row level.

Only after those checks:

```sh
npx wrangler d1 migrations apply apc-site-metrics --env production --remote
npx wrangler d1 migrations list apc-site-metrics --env production --remote
npx wrangler d1 execute apc-site-metrics --env production --remote --command "SELECT sql FROM sqlite_schema WHERE name='daily_counts'; SELECT day,page,event,count FROM daily_counts ORDER BY day,page,event;"
```

Verify 0002 is applied, the two new action names are accepted by the schema, and retained historical rows remain. Then require green CI on the current PR head before merge. After deployment, use a labelled synthetic school enquiry, verify no personal fields in analytics requests, confirm prepared/click counts in the private report, and check that these are not described as bookings. Opening WhatsApp for verification must not send a message.

Application rollback: revert the isolated application commit and leave the expanded schema, which supports the old events. Do not drop new totals or restore an older database over newer traffic as a routine rollback.

Cloudflare documents versioned migration tracking and rollback of a failed migration. Use its supported migration command, not hand-run fragments of this SQL. Sources: https://developers.cloudflare.com/d1/reference/migrations/ and https://developers.cloudflare.com/d1/wrangler-commands/ (checked 22 September 2026).

Continuation prompt: "With authenticated Cloudflare access, verify and back up apc-site-metrics, apply only the reviewed school analytics migration, confirm preserved totals, then merge and smoke-test the isolated PR. Leave Brevo deferred."
