# PR 82 release reconciliation, 22 September 2026

## Scope and evidence

- Verified old PR head: d401fc9fd51079601cedbbf92a51815f2299fa42.
- Verified current main: 70097c1e479648d9ec80dd3483d833861c532edd. The PR API returned an older base SHA; direct branch lookup is authoritative.
- PR 87 and PR 89 incorporated and extended the website work. Use main's complete tree as the reconciled baseline, retaining both commit histories. Old assets, drafts and audits remain recoverable in the first parent.
- School event instrumentation and migration remain isolated in draft PR 91, head 7c33da726781160fbb46e28df1599bf9e2a38cd0. Do not activate them through this PR.
- Correct the shared static menu order to Parent Home Support, Learning & Workshops, Schools & Educator Training, Upcoming Programmes. Resources remain separate.
- Correct homepage metadata, the cancellation-policy heading, APC Calm App sharing titles and the Learning & Workshops eyebrow. All changed public source files have identical dist copies.
- Preserve current course and programme interest semantics, form recovery, protections, illustrations and parent-service facts from main. No launch, enrolment, booking or new payment flow is introduced.
- Course strategy remains Understanding Escalation at Home, approximately 30-40 minutes, initially testing RM199; validate with 10 paid buyers before course 2, a resource library or membership. This milestone does not establish business sustainability. Current course-interest capture is an email enquiry, not a launched product.

## Acceptance gates

- [x] Inspect current main, PR head, workflows and preview deployment.
- [x] Review public static labels and verify source/dist blob equality on main.
- [x] Existing local navigation/enquiry tests: 5 passed. Existing content regression tests: 4 passed. Label synchronisation check passes.
- [ ] New-head CI: build, public journeys, responsive/browser tests and full authority regression suite.
- [ ] New-head Cloudflare preview: confirm static labels, rendered menu and critical routes.
- [ ] Final merge/deployment decision after current-head checks. No production change in this reconciliation.

## Independent remaining gates

Production programme submission and saved-record verification remain unverified. Automated journeys use local SQLite and simulated Turnstile. No real booking, payment, WhatsApp message or interest submission was made. PR 91 production database backup/migration/row verification is a separate release gate. Browser surface used for manual inspection cannot resize viewport; new-head responsive evidence must come from CI.

## Final static handoff correction

A further comparison recovered an unreconciled safety fix from the old PR: direct opening of the First Step Call page must not claim an appointment is confirmed. Restore the conditional confirmation wording and the two booking-handoff regression checks. The current school's payment sequence already passes that check. Also align the school breadcrumb (visible and structured data) and programme eyebrow with the locked page labels. These corrections are static source/dist changes.
