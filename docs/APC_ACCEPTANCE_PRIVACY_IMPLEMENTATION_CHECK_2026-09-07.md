# APC Acceptance and Privacy Implementation Check

## Independent repository and live-site check

**Checked:** 7 September 2026
**Status:** Containment is working, but the client acceptance and identifiable-data systems are not launch-ready.

## Overall Score: 6.2/10

The score measures current implemented protection, not draft quality. The legal drafting package scores materially higher, but most of its protection has not been implemented in the live customer journey.

## Strengths

- The live Terms clearly label RM350 and RM1,800 as candidate services that are not generally available.
- The live Terms state that there is no public paid-booking route and require individual Founder permission before payment.
- Payment account details are not exposed publicly.
- Production configuration sets `APC_PRACTICE_LIVE_WRITES_ENABLED` to `false`.
- The Practice Console API rejects writes while that flag is false and uses same-origin, content-type, body-size, schema, and revision controls.
- Current coordinated Google Docs are private and unshared.
- Parent-export fields are separated from facilitator notes in the Practice Console design.

## Risks

### Acceptance and payment

- No parent-facing versioned acceptance form exists in the reviewed website files.
- There are no required checkboxes for service terms, authority to share another person's data, or sensitive-data consent.
- There is no implemented durable-copy workflow proving what the parent received and accepted before payment.
- There is no tested link among accepted version, service, price, timestamp, payment reference, and later variation.
- The proposed four RM450 milestones are drafting only and are not yet implemented as a controlled payment workflow.

**Decision:** **BLOCKED** for new paid online onboarding.

### Live privacy notice

- The live privacy page is older than the coordinated privacy draft.
- It does not fully explain the current provider inventory, proposed Practice Console, AI restriction, record-specific retention, deletion, cross-border assessment, sensitive-data consent, incident handling, or automated-decision boundary.
- Its broad confidentiality wording could create expectations that conflict with necessary processor access and legally required disclosure.
- A privacy notice does not establish that provider contracts, settings, transfer conditions, MFA, deletion, and incident procedures are actually configured.

**Decision:** Current notice is acceptable only as interim containment while paid onboarding remains closed. **BLOCKED** for the proposed identifiable cloud workflow.

### Practice Console

- Identifiable writes are correctly disabled in production.
- The data schema would store names, age, region, concerns, intake information, facilitator notes, parent summaries, action plans, and materials in D1 if enabled.
- Application security controls do not resolve the unverified processor, location, transfer, notice, consent, retention, deletion, backup, access-administration, and incident requirements.
- The interface says Drive export is prepared, but actual Drive archiving still requires an external file creation step and manual provider file ID confirmation.

**Decision:** Fictional and irreversibly de-identified testing is **APPROVED**. Identifiable client use remains **BLOCKED**.

### DPO and data-controller registration indicators

- Based on the presently known scale of two active clients, APC is far below the published numerical DPO indicators of more than 20,000 data subjects or more than 10,000 people whose sensitive or financial data is processed.
- No reviewed feature performs regular and systematic monitoring of identifiable client behaviour. If that changes, the DPO conclusion must be revisited.
- No evidence reviewed establishes that APC is a registered private school, private educational institution, or another listed mandatory data-controller class. The service description and any licence held must still be checked against the current 13-class order.

**Decision:** A mandatory DPO appears **NOT CURRENTLY TRIGGERED ON KNOWN FACTS**, but this is an inference, not legal confirmation. Data-controller registration status is **HUMAN-ONLY / LEGAL CONFIRMATION REQUIRED**.

### Current private Google Drive

- The five coordinated legal-review documents checked through the connected account report `shared: false` and reside in the controlled review folder.
- This confirms file visibility for those documents only. It does not verify every client folder, Workspace administrator setting, MFA state, device access, download, export, deletion, backup, processor term, or cross-border condition.

**Decision:** Legal-review documents are **APPROVED** for private drafting. Identifiable client-record storage remains **HUMAN-ONLY** and restricted until the account-level evidence is completed.

### Tax

- The Founder reports that APC does not currently meet the requirement to charge service tax.
- The reviewed material does not contain the official or adviser confirmation, date, threshold calculation, service classification, or evidence location.

**Decision:** Record this as **FOUNDER-CONFIRMED, EVIDENCE PENDING**. APC may accurately state that no separate service-tax amount is currently charged, but must not claim that sole-proprietor status creates an exemption.

### Insurance

- The Founder reports no professional indemnity, public liability, or cyber/privacy insurance.
- Contract clauses do not replace insurance and may be restricted by mandatory law or unfair-terms rules.

**Decision:** **HUMAN-ONLY RISK ACCEPTANCE** before serving another paid client. Obtain quotations and advice on suitable cover. Do not tell parents APC is insured.

## Recommended Fixes

1. Keep public paid booking and identifiable Practice Console writes disabled.
2. Obtain and verify a non-residential business address, then update SSM within the applicable period if the registered business address changes.
3. Send the English and Bahasa Malaysia packs to a Malaysian lawyer with consumer-contract and personal-data experience.
4. Obtain competent Bahasa Malaysia review of the final pre-contract disclosures.
5. Build one versioned pre-payment acceptance page with separate mandatory and optional controls.
6. Generate an immediate durable acceptance copy and store its content hash, version, timestamps, service, price, and payment reference.
7. Complete provider-by-provider evidence for Cal.com, Google Workspace, Zoho, WhatsApp, Cloudflare, Maybank, Wise, Brevo, Gumroad, and any AI workspace.
8. Inventory current client data before moving or copying anything. Use the original agreement for each existing client.
9. Save the evidence supporting the no-service-tax conclusion and set a review date.
10. Obtain professional indemnity and cyber/privacy insurance quotations and record the decision before the next new client.

## Verification limits

This review inspected the repository, production configuration, live public legal pages, and metadata for the coordinated private Google Docs. It did not access provider administrator consoles, contracts, MFA settings, device settings, deleted files, client folders, bank systems, or insurance records. Those items cannot be marked verified from code or public pages.
