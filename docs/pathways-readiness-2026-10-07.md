# Pathways readiness checkpoint, 7 October 2026

## Release target

Preview branch: `codex/pathways-simple-workflow`. No main or live-beta merge.
Last deployed preview commit: `3a6461e57c362699b84039cb5b60fa4fb87facef`.
URL: https://718844bb.autism-pathways-consulting.pages.dev/pathways/
This preview shares the synthetic D1 database with the beta.

## Prepared locally after that deployment

- Plain-language optional observation categories with examples, preserving stored domain codes.
- Participation guidance separates taking part from independence or correct answers.
- Aide involvement choices now describe the existing None/Light/Moderate/High values.
- New support fields: timing, method and internal detail. New entries do not default to no aide help, teacher support or a guessed purpose.
- Server state validation limits timing/method to supported options and detail to 1,200 characters. Existing records without these fields remain valid.
- Teacher drafts include support detail. Family drafts do not automatically include it.
- Authentication rejects malformed, duplicate or empty session cookies without throwing a server error; invalid session expiry fails closed. Cookie security attributes remain unchanged.

## Evidence

- 100 Pathways tests passed; 8 site-build tests passed; diff whitespace check passed.
- New regression test reproduced malformed-cookie URIError before repair and passed afterward.
- Tests cover valid cookie ordering, malformed/duplicate cookies and invalid expiry.
- Database-backed test saves/reloads support fields, rejects invalid inputs and verifies family-draft exclusion.
- Existing suite covers student isolation, viewer restrictions, consent, CSRF, revision conflicts and erasure.
- Source and checked-in browser assets match.

## Live evidence and unresolved checks

The full supplied Week 1 timetable was submitted through Student A Administration. The dialog closed and the app displayed Saved. Reload then returned the agent browser to sign-in. Persisted timetable has not been independently re-read. The session incident's root cause is unconfirmed; the cookie hardening is not proof that incident is resolved.

This local release has not been deployed or visually accepted. Required next checks: desktop/iPad layout, sign-in/reload, save/reopen a synthetic lesson, support-field retention and reviewed-update flow. Do not edit newly enhanced records from older preview/beta clients during acceptance, because older forms do not know the added fields.

## Remaining product work

- Controlled rough-note sentence rewriting, provider configuration and synthetic evaluation. AI remains disabled.
- Per-task support context, multiple support purposes, visual IEP evidence and SENCO review decisions.
- Real-data operational readiness: monitoring/alerts, backup restore exercise, incident process, privacy arrangements and role-based pilot acceptance.
- No verified iSAMS/Google integration or parent accounts.
- No verified paid-school or real-student readiness claim. Product value and time savings require a measured pilot.

Pause before Cloudflare work so CJ can switch to hotspot. Do not enable real-data AI processing or merge to main as part of this checkpoint.
