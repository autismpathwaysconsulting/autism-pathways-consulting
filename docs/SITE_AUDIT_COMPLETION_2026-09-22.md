# Website audit completion

## Acceptance gates

1. Failed programme submissions retain answers and expose retry if security stalls. Late callbacks cannot reopen submission.
2. Course pages and sharing metadata describe Understanding Escalation at Home, in development, with no old prices or endorsement claim.
3. Resource guide links lead to the relevant guides; private programme labels match the shared configuration.
4. Responsive, enlarged-text, keyboard, build, authority and regression checks pass on the release commit.
5. Production pages and access protections are checked after deployment. Real Turnstile plus saved-record verification remain a separate gate.

## Course email-form handoff

The old external Brevo form describes a communication course and promises a special price. It is removed from the website journey until its copy and any automation can be reviewed in the authenticated account. Existing contacts are not migrated, deleted or subscribed to a different topic.

Current website route: email enquiry to CJ. Clicking opens the visitor's email app; the visitor must send the message. No automatic confirmation or marketing subscription is promised.

Proposed replacement form copy, not yet applied:

- Title: Understanding Escalation at Home
- Introduction: A short parent education course is in development. Ask to receive an update when the course details are ready.
- Optional name, required adult email address.
- Specific consent: Email me about Understanding Escalation at Home. I can unsubscribe at any time.
- Action: Send me a course update
- Confirmation: Your request for course updates has been received. This does not reserve a place or require payment.

Before restoring capture, inspect the actual Brevo list, consent fields, double-opt-in setting, confirmation page, email template, unsubscribe link and welcome automation. Match confirmation wording to the actual opt-in behaviour. Do not silently repurpose prior communication-course consent. Do not restore a form without testing the confirmation and stored consent in that service.

## Production form check

Use one clearly labelled synthetic APC test entry with an authorised adult email. Leave optional marketing updates unchecked. Verify the on-page confirmation, exactly one tracker record, programme selections, first preference and consent. Repeat the email with different answers and confirm the original record and consent are preserved. Permanent test-record deletion requires confirmation at action time when performed through the browser.

The automated browser tests use local SQLite and simulated Turnstile. Passing them does not establish that production Turnstile or the production save works.

## Existing pull requests

This release incorporates the two wording fixes from PR #88 and extends private-name drift checks. PR #82 remains a separate reconciliation task: its page work was already brought into #87, while analytics migration and other differences remain. Do not merge #82 wholesale. No analytics migration or analytics activation is included here.

## Documents

The scouting pack and partner brief concern APC Community Crew, the volunteering project's secondary name. Their private filenames and document identities are retained. Neither document claims that a date, host, participant place or launch is confirmed.
