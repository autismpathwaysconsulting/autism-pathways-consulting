# Pathways readiness checkpoint, 7 October 2026

## Release target

Preview branch: `codex/pathways-simple-workflow`. No main or live-beta merge.
Last deployed preview commit: `0ca473cb436453cbe99f52c2ade97830e27f3ede`.
URL: https://9d77b902.autism-pathways-consulting.pages.dev/pathways/
This preview shares the synthetic D1 database with the beta.

## Support and authentication changes retained in the deployed release

- Plain-language optional observation categories with examples, preserving stored domain codes.
- Participation guidance separates taking part from independence or correct answers.
- Aide involvement choices now describe the existing None/Light/Moderate/High values.
- New support fields: timing, method and internal detail. New entries do not default to no aide help, teacher support or a guessed purpose.
- Server state validation limits timing/method to supported options and detail to 1,200 characters. Existing records without these fields remain valid.
- Teacher drafts include support detail. Family drafts do not automatically include it.
- Authentication rejects malformed, duplicate or empty session cookies without throwing a server error; invalid session expiry fails closed. Cookie security attributes remain unchanged.

## Evidence

- 114 Pathways tests passed; 8 site-build tests passed; diff whitespace check passed.
- New regression test reproduced malformed-cookie URIError before repair and passed afterward.
- Tests cover valid cookie ordering, malformed/duplicate cookies and invalid expiry.
- Database-backed test saves/reloads support fields, rejects invalid inputs and verifies family-draft exclusion.
- Existing suite covers student isolation, viewer restrictions, consent, CSRF, revision conflicts and erasure.
- Source and checked-in browser assets match.

## Live evidence and unresolved checks

Live verification on deployment 300145a2 confirmed sign-in, all seven Wednesday timetable blocks, the existing Bahasa note, and a labelled synthetic EAL test save. Reload restored the session after initial loading, and reopening EAL confirmed support timing, method and detail persisted. The initial login-screen flash was a loading state, not proof of session loss.

The latest deployed release adds reviewed sentence drafting, dated/weekly IEP evidence, versioned goal edits, review-planning fields, touch/responsive improvements, an explicit loading screen, an API exception boundary, administrator diagnostics and a read-only availability probe. See `pathways-next-release-gates.md` and `pathways-operations-runbook.md` for acceptance and dependencies. This release is now deployed at the URL above. Desktop live checks passed for sign-in, session restoration, dated evidence and weekly display, administrator database checks, and synthetic review-planning save/reload. Actual iPad checks and live AI evaluation remain pending. Do not edit enhanced records from an older client that does not know the added fields.

## Remaining product work

- Sentence rewriting is implemented with mocked-provider tests; provider configuration and live synthetic semantic evaluation remain outstanding. A follow-up configuration enables synthetic-only evaluation with `gpt-4.1-mini-2025-04-14`; live provider success is not yet verified.
- Visual IEP evidence and review-planning notes are deployed and the review-planning save/reload was verified. Per-task support context, multiple support purposes and a formal SENCO approval workflow remain future scope; review planning is not approval.
- Real-data operational readiness: monitoring/alerts, backup restore exercise, incident process, privacy arrangements and role-based pilot acceptance.
- No verified iSAMS/Google integration or parent accounts.
- No verified paid-school or real-student readiness claim. Product value and time savings require a measured pilot.

Pause before Cloudflare work so CJ can switch to hotspot. Do not enable real-data AI processing or merge to main as part of this checkpoint.

## Outstanding execution checkpoint

Cloudflare dashboard sign-in returned a verification failure after one reload. No AI configuration, remote recovery operation or external monitor was completed in this session. The execution sheet is `pathways-outstanding-acceptance.md`; unexecuted checks remain pending.

Follow-up configuration: CJ reports the Preview `OPENAI_API_KEY` secret is saved. The model and switch are managed in `wrangler.jsonc`; only this branch preview is enabled. All 114 Pathways and 8 build tests passed after the configuration change. Provider, iPad, alerts and remote recovery gates remain open.
