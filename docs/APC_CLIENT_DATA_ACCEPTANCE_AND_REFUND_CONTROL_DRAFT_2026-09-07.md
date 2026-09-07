# APC Client Data, Acceptance, and Refund Control

## Internal implementation draft

**Status:** Draft only. Not effective. Not authorised for client use or identifiable cloud storage.
**Prepared:** 7 September 2026
**Control version:** `APC-CONTROLS-DRAFT-2026-09-07`

This is an operating control, not legal advice. It converts the candidate parent-facing clauses into steps APC can audit. It must not be used to impose new terms on an existing client retrospectively.

## 1. Release gates

Do not open a new paid booking or identifiable cloud-client workflow until all of these are evidenced:

1. A qualified Malaysian lawyer approves or revises the service agreement, cancellation/refund terms, liability wording, sensitive-data consent, Bahasa Malaysia disclosure, and electronic acceptance method.
2. A qualified Malaysian tax adviser or Royal Malaysian Customs confirms APC's current service-tax classification and registration position. Sole-proprietor status is not treated as an exemption.
3. APC obtains and verifies a valid public business/service address. CJ's home address is prohibited from the website, Cal.com, public terms, invoices supplied publicly, metadata, or any other public disclosure.
4. Every live provider has an owner, approved purpose, minimum data set, access rule, transfer basis, retention/deletion rule, and incident contact.
5. Identifiable Cloudflare D1 and generative-AI processing remains disabled until the applicable vendor, transfer, notice/consent, security, and deletion gates are approved and tested.
6. The booking flow displays the complete pre-contract information in Bahasa Malaysia, records separate affirmative acceptance and sensitive-data consent, and sends a durable copy.
7. A test booking proves the accepted versions, price, timestamp, consent state, payment reference, and copy-delivery record can be retrieved.

## 2. Current provider register

`Blocked` means APC must not use that provider for identifiable client content until the missing facts and controls are resolved.

| Provider or channel | Proposed minimum use | Identifiable client content | Current control decision | Required evidence before approval |
| --- | --- | --- | --- | --- |
| Cal.com | Booking name, contact details, service, date, attendance | Yes, minimum booking data only | Restricted | Current terms/DPA, subprocessor and transfer information, account access, deletion test |
| Google Workspace / private Drive | Signed agreement, intake, notes, summaries, plans, acceptance evidence | Yes | Restricted to approved private account and minimum necessary data; no link-sharing | Workspace configuration, MFA, access list, DPA/terms, transfer condition, deletion and export test |
| Zoho Mail | Enquiry, service email, durable-copy delivery | Yes, minimum necessary | Restricted | MFA, retention, DPA/terms, transfer and deletion information |
| WhatsApp | Logistics and bounded Home Support clarification | Yes, but no routine child video, medical report, or school record | Restricted | Device lock, two-step verification, backup setting, export/deletion procedure, notice and transfer review |
| Maybank / Wise | Payment confirmation and refund | Payment identity/reference only | Restricted | Account access, statement retention, transaction reconciliation, relevant terms |
| Brevo | Opt-in marketing | No client-service or child records | Segregated | Separate marketing consent, unsubscribe and suppression process, DPA/transfer review |
| Gumroad | Only a separately approved digital product | No Home Support client record | Segregated | Product-specific data map, terms, transfer, retention and deletion review |
| Cloudflare Pages / Turnstile | Public site security and anti-abuse | Avoid client case content | Limited | Current fields, logs, retention, privacy disclosure, DPA/transfer review |
| Cloudflare D1 | Proposed Practice Console | Yes | **Blocked** | Field-level minimisation, access control, encryption assessment, audit log, DPA/transfer, retention/deletion test, incident procedure, approved notice/consent |
| Codex or another generative-AI workspace | Proposed note organisation and drafting | Potentially | **Blocked for identifiable data** | Approved account/workspace, provider terms and settings, processing/retention/transfer assessment, permitted fields, human review, deletion test, approved notice/consent |

No table entry is legal approval. Provider facts must be rechecked against current contracts and settings before the status changes.

## 3. Data minimisation and identifiers

- Use an internal client ID in the Practice Console. Keep the identity key in the approved controlled record, not in analytics or research tables.
- Record only information needed for the agreed parent-support purpose.
- Do not copy whole WhatsApp threads, recordings, school files, or medical records when a short factual note is sufficient.
- Keep facilitator working notes separate from the parent-facing summary and mark objective observations, parent reports, and APC interpretations distinctly.
- Never put passwords, identity documents, full card or bank credentials, unrelated family details, or a child's image or recording into the Practice Console or an AI prompt.
- No automated system may decide service eligibility, session forfeiture, refunds, safeguarding action, or a child's needs.

## 4. Retention and deletion schedule

| Record category | Proposed active location | Retention trigger and period | End action |
| --- | --- | --- | --- |
| Unconverted enquiry | Approved email/booking system | 12 months from last meaningful contact | Delete or anonymise |
| Booking and attendance logistics | Booking system and essential service log | 24 months after completion/closure | Delete detail; retain only what supports an essential contract or accounting record |
| Detailed intake, template answers, facilitator notes, session notes, child-related working records | Approved private client folder | 24 months after completion/closure | Delete or irreversibly anonymise |
| Parent summaries, action plans, material service decisions, completion record | Approved private client folder | 24 months after completion/closure; retain a minimum contract record longer only if legally necessary | Delete detail or retain a minimised legal record |
| Agreement, policy versions, acceptance and consent evidence, written variations | Approved legal/contract record | Seven years from the applicable tax-return year or longer only under documented legal hold | Secure deletion |
| Invoice, payment, refund and accounting evidence | Approved finance record | Seven years from the applicable tax-return year | Secure deletion |
| Material complaint or dispute | Restricted dispute file | Seven years after closure or until a longer documented hold ends | Secure deletion |
| WhatsApp operational content | Designated business device | 90 days after completion/closure once material decisions are transferred | Delete from APC-controlled device and available APC-controlled backup; recipient copies remain outside APC's control |
| Security and access log | Approved security log | 12 months | Delete or aggregate |
| Recoverable backup copy | Approved backup | No more than 90 days after source deletion | Expire automatically |
| Marketing contact | Marketing system only | Until withdrawal/unsubscribe; retain the minimum suppression record needed to honour opt-out | Delete marketing profile; preserve suppression marker |

Run a quarterly deletion review. Record category, client ID, action, date, operator, exception or hold, and verification result. Do not retain detailed child information merely because storage is available.

## 5. Sensitive-data consent and withdrawal

Use a separate unchecked control for express consent. Record the exact wording and version. If consent is withdrawn, stop future consent-based processing, identify any record that must lawfully be retained, explain the consequence to the parent, and determine whether the service can safely continue with less data. Withdrawal does not erase a transaction or other record APC must lawfully retain.

Do not make marketing consent a condition of service. Do not treat a general terms checkbox as sensitive-data consent.

## 6. Acceptance workflow

### Before payment

1. Display provider identity, registration, operating address, website, email, telephone, service characteristics, total price and every additional cost, payment method, terms, and expected timing in Bahasa Malaysia; English may also be supplied.
2. Link the exact versioned Terms, Cancellation and Refund Policy, Privacy Policy, and Parent Support Agreement.
3. Show the required service-acceptance checkbox, required authority confirmation, separate sensitive-data consent, and separate optional marketing consent.
4. Do not pre-tick any box. Do not allow payment until required controls are affirmatively completed.

### Acceptance record

Record the parent name and email, service, total price, agreement and policy version IDs, Malaysia-time and UTC timestamps, state of every checkbox, payment reference, and any later written variation. Do not collect an IP address solely for evidence unless the approved privacy notice and minimisation assessment justify it.

### Durable copy

Immediately after acceptance, send the parent a non-editable copy or email containing the accepted terms, service, total price, session or programme timing, cancellation/refund rules, and contact channel. Preserve delivery evidence with the acceptance record. A link to a page that can silently change is not the only durable copy.

## 7. Cancellation, credit, and mandatory-remedy control

1. Record the request with client ID, accepted version, payment or milestone, notice timing, stated reason, work already started or delivered, and requested outcome.
2. Classify the request: parent change of mind/cancellation; exceptional-circumstances credit request; APC non-delivery; alleged service failure; or another mandatory-rights issue.
3. For parent change of mind or cancellation, apply the accepted no-change-of-mind-refund rule and the applicable reschedule or credit option. Do not describe this as removing mandatory consumer rights.
4. For Home Support, use four RM450 milestone payments. Confirm that no future milestone was charged before its written milestone-start confirmation. APC should not collect RM1,800 in full in advance while using this policy.
5. If APC cannot deliver paid work, or the parent alleges a failure covered by a statutory service guarantee, stop the standard no-refund workflow and assess the legally required remedy.
6. Record the legal/contract basis, facts, work delivered, reasons, decision-maker, parent communication, credit or remedy, transaction reference, and completion date.
7. Never force a credit in place of a mandatory remedy, apply a new term retrospectively, or let software make the final decision.

## 8. Inactivity and overdue programmes

At the 12-week review point, or earlier when the schedule is materially off-track:

1. Reconcile sessions delivered, milestones completed, written outputs supplied, sessions remaining, last contact, and any agreed pause.
2. Send one reactivation message requesting a response within seven days, followed by one reminder.
3. Offer three written options: book the remaining session(s), agree a dated pause/restart, or discuss early closure under the agreement that was actually accepted.
4. Pause between-session WhatsApp support while dormant.
5. Do not expire, forfeit, or reprice an existing client's paid session automatically.
6. For Jasvini and Mages, use only their original agreement plus a mutually agreed recovery timetable; do not apply this draft retrospectively.

## 9. Incident response

1. Contain the incident, protect accounts, preserve evidence, and start the incident log immediately.
2. Identify records, people, systems, locations, likely harm, and whether the event is a personal data breach.
3. Apply the current Malaysian notification criteria. If they are met, notify the Commissioner as soon as practicable and no later than 72 hours from occurrence.
4. Determine and meet the current affected-person notification deadline; prepare clear risk and protective-step information.
5. Record the legal basis, decision, notifications, remediation, and prevention actions.
6. Do not wait for a vendor to finish its investigation before starting APC's own assessment.

## 10. Change control and audit evidence

- One master version controls the website, Cal.com, agreement, booking checkboxes, email copy, and Practice Console fields.
- Any change to price, scope, milestone allocation, cancellation, refunds, support limits, providers, data fields, or retention creates a new version and review.
- Preserve prior versions and the acceptance evidence linked to each client.
- Run a test before release and an audit after the first new paid client.

## 11. Approval record

- Founder operational approval: `[name, decision, date, version]`
- Malaysian lawyer review: `[name, firm, scope, decision, date, version]`
- Tax classification confirmation: `[adviser or RMCD channel, conclusion, date]`
- Bahasa Malaysia review: `[reviewer, scope, decision, date, version]`
- Privacy/vendor controls approved: `[name, decision, date, evidence location]`
- Test booking passed: `[tester, date, evidence location]`
- Effective date: `[only after every required gate passes]`
