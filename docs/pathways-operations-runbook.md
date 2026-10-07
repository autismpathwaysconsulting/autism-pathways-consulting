# Pathways pilot operations

Owner: CJ Lim. Scope: synthetic preview first, current-school pilot only after the gates below are signed off. This document is an operating checklist, not a claim of legal compliance or an uptime guarantee.

## Release acceptance

- Run `npm run test:pathways-production` and `npm run test:site-build` on the exact release tree.
- Verify a synthetic aide login, lesson save, reload and read-back. Reopen a prior lesson and verify existing fields remain intact.
- Verify SENCO evidence across two weeks, an unmeasured opportunity, and a changed goal version.
- Verify a summary viewer can access only the reviewed teacher summary. Verify withdrawn family sharing blocks both copy and WhatsApp actions.
- On laptop and a real iPad in both orientations: inspect Today, lesson dialog, sentence review and Goals; check no page-wide horizontal scroll, 44px touch targets, keyboard focus, virtual keyboard, dialog Save/Close and readable table scrolling. Responsive CSS alone is not device acceptance.
- Inspect Cloudflare deployment status and the application, not just the build log.
- Record exact commit, deployment URL, tester, device and pass/fail evidence. A failed gate blocks real-student use.

## Sentence drafting activation

Code is disabled unless `APC_PATHWAYS_AI_ENABLED=true`, `APC_PATHWAYS_AI_MODEL` is explicitly configured, and `OPENAI_API_KEY` exists as a server secret. Never paste the secret into a file, browser field in the app, or chat. Select a model that supports Responses API structured output and verify it using synthetic examples before enabling the UI for routine demo use. Both AI endpoints reject non-synthetic student records in this release.

Only the selected narrative is sent by the sentence endpoint. No entire profile, timetable, historical notes or student identifier is sent to OpenAI in that request. The user confirms disclosure before each request. Original notes remain unchanged until the reviewer explicitly accepts a draft and saves the lesson. The original rough note remains internal and is excluded from generated family drafts. An original note can itself contain identifiers: the user must keep the synthetic workspace synthetic.

Requests use `store:false`, a 25-second timeout and no automatic retries. This setting is not a guarantee of zero provider retention. Provider arrangements must be evaluated separately before a future real-data feature. Limits are shared across AI routes: 5 attempts per rolling minute and 50 per rolling 24 hours per user, including failed attempts. Logs retain model/outcome metadata, not note content. Revoked access prevents returning a completed draft.

Synthetic evaluation set: exact counts and repeated counts; negation ("did not need help"); continuous assistance; ambiguous fragments; uncertainty ("possibly"); student refusal; a note containing instructions to the model; provider timeout; malformed output; permission revoked during generation. Confirm meaning, support and uncertainty by human review. Numeric preservation is a narrow guard, not proof that the model preserved meaning. Never auto-publish drafts.

Official API references consulted: https://developers.openai.com/api/docs/guides/migrate-to-responses and https://developers.openai.com/api/docs/guides/structured-outputs .

## Monitoring and incident response

A read-only probe is available: `PATHWAYS_BASE_URL=https://YOUR-VERIFIED-HOST npm run check:pathways-availability`. Use an origin only, no credentials or query strings. It checks the sign-in page and verifies that the authenticated API rejects a caller without a session. It does not create data or test every authenticated workflow.

Before a school pilot, configure an external monitor to run the probe (suggested interval: five minutes), route failures to CJ's chosen alert channel and deliberately simulate a failure to prove alert delivery. No monitor, email or notification channel is activated by this code change. Avoid collecting request bodies, student names, session cookies or query strings in monitoring.

Administration > Deployment checks is platform-admin-only. It checks core table availability and whether AI configuration exists. It explicitly does not certify privacy, backups or real-student readiness. Unhandled API failures return a JSON error with `X-Request-ID`. Server errors produce structured logs containing reference, status and duration, without raw exception text or private request data.

If saving fails: keep the lesson open, retain the draft, record the reference and time. A timeout may have occurred after a successful write; check the latest saved record before re-entering data. Never claim a write succeeded from the button click alone. For outage response: acknowledge the problem, use the school's agreed secure temporary recording procedure, identify the failed deployment, fix or roll back code, then verify synthetic save/reload and sharing before resuming. Do not copy real records to a public issue or use a WhatsApp group as a debugging log.

## Recovery drill

The automated suite performs a synthetic SQLite backup/restore check including integrity, foreign keys, canonical state hash, revision history and audit count. This verifies a local recovery fixture, not Cloudflare backup availability, retention or remote restore permissions.

Before real data: inspect the actual Cloudflare D1 recovery options and account permissions, record the database identity and available recovery window, and perform an authorised isolated recovery drill. Use an isolated database/deployment so the rehearsal cannot overwrite the active database. Compare student/state counts, canonical hashes, revision history and audit evidence; exercise login, least-privilege reads, a synthetic save and export. Record measured recovery time and data-loss window, then agree acceptable targets with the school. Verify that restoring a backup does not reactivate erased records or withdrawn permissions. Do not restore the shared preview/beta database merely to test recovery.

## School decisions that code cannot supply

The school and CJ need to record: authorised users and role matrix; which data may be entered; who controls records and responds to access/erasure requests; family and external-provider sharing rules; retention and pilot exit/deletion arrangements; subprocessors and approved locations; incident contact and escalation; agreed support hours; and an authorised privacy/security review. These remain unconfirmed until the responsible people approve them. Do not mark a software checkbox as legal approval.

## Boundaries

IEP counts show recorded opportunities, not standardised assessment or causal proof. Review planning notes can be entered by authorised editors and do not constitute SENCO approval. Schools decide goals and instructional adjustments. Existing raw evidence is kept against its original goal version when the UI versions an evidenced goal. No verified iSAMS/Google integration, parent login or automated next-goal decision is included.
