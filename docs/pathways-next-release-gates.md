# Next Pathways preview release acceptance

Date: 7 October 2026. Target branch: codex/pathways-simple-workflow. No main/live-beta merge. No database migration required. Preview and beta currently share synthetic data; use the latest client for enhanced records.

| Deliverable | Gate | Evidence / remaining dependency |
|---|---|---|
| Sentence drafting | Original retained; explicit disclosure and review; no automatic save; failures safe | Database and browser-controller tests; provider is mocked. Live provider configuration and synthetic semantic evaluation still required. |
| AI safety | CSRF, assignment, synthetic-only, quota, timeout, access recheck | Integration tests reject unauthorised and real-record requests before disclosure; provider requests use only selected note. |
| IEP evidence | Dated observations, weekly counts, missing evidence excluded, context shown | Model tests; linked observations retain support and numeric zero. No ability score or automatic goal decision. |
| Goal review | Review notes persist; changed evidenced criterion creates new version | Save/reload and controller regression tests; original goal retains original criterion. |
| Tablet/accessibility | Touch sizing, associated labels, responsive evidence, no login flash | Source changes prepared. Actual laptop/iPad visual acceptance still pending deployment. |
| Reliability | API failures JSON; no private error logs; session loading state | Exception and existing auth/session tests. |
| Operations | Monitor probe, diagnostic checks, recovery fixture and runbook | Probe failure tests; platform-admin boundary tests; local SQLite recovery test. External alert delivery and Cloudflare recovery drill remain pending. |
| School rollout | Human privacy/role/support agreement | Not completed by code. See operations runbook. |

Cloudflare work requires CJ's hotspot confirmation. Do not activate AI for real records or claim paid-school readiness from automated tests alone.

Local verification: 114 Pathways tests and 8 site-build tests passed on 7 October 2026. JavaScript syntax and git diff whitespace checks passed. Source and checked-in browser assets match. No Cloudflare deployment or AI activation was performed for this release.
