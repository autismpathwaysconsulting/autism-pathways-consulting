# APC Coordinated Legal and Privacy Review

## Outcome first

**Operational drafting score:** 9.4/10
**Legal-validity score:** Not scored
**Publication verdict:** NO-GO
**Reason:** The package now reflects APC's actual no-change-of-mind-refund position without falsely claiming that every refund or remedy can be excluded. It uses milestone billing to avoid holding payment for unstarted work, prohibits publication of CJ's home address, and contains concrete communication, retention, incident, and acceptance controls. It still cannot be called legally valid or published: a qualified Malaysian lawyer has not approved enforceability, a valid public business/service address is missing, provider and cross-border facts are not verified, the Bahasa Malaysia disclosure has not been professionally reviewed, and the acceptance flow has not been implemented or tested.

This is an independent risk review, not legal advice.

## Coordinated package

- `docs/APC_WEBSITE_LEGAL_COPY_REVIEW_DRAFT_2026-09-07.md`
- `docs/APC_PARENT_SUPPORT_AGREEMENT_LEGAL_REVIEW_DRAFT_2026-09-07.md`
- `docs/APC_CAL_COM_COORDINATED_COPY_LEGAL_REVIEW_DRAFT_2026-09-07.md`
- `docs/APC_CLIENT_DATA_ACCEPTANCE_AND_REFUND_CONTROL_DRAFT_2026-09-07.md`

The candidate sources now use the same proposed rules: no retrospective expiry, a 12-week review point rather than automatic forfeiture, four RM450 payment milestones for the RM1,800 programme, no change-of-mind refunds, manual credit exceptions, preservation of mandatory remedies, a defined WhatsApp allowance, record-specific retention, recorded bilingual pre-payment acceptance, no automated consumer-rights decisions, and no additional post-programme check-in.

The public `terms.html`, `cancellation-policy.html`, and `privacy.html` remain under interim containment. This review branch corrects the stale Home Support check-in promise across the offer surfaces, but it does not publish the unapproved legal clauses. The candidate website wording stays in the controlled review document until the remaining legal and privacy gates are closed.

## Verified Google Drive copies

- Folder: https://drive.google.com/drive/folders/1zz7EbsbH0KXNYJEyfGGmUu5Q1RWow9lM
- Website legal copy: https://docs.google.com/document/d/1KsKM9k2qSdDQzLyFFPaQLGgYQnggaWT5tz_tIiVQiB4/edit
- Parent Support Agreement: https://docs.google.com/document/d/1LngWTHB5-BmIUvUyE_ulTK8RVEBOv0lZXQXQmDcYUVw/edit
- Cal.com coordinated copy: https://docs.google.com/document/d/1xzrOWYjQlbmp6ggl6eqqSrS8BVLoGApd7TjrqWiKDY4/edit
- Review and launch blockers: https://docs.google.com/document/d/1rnJBitIN5SjFndASm4kQ-h1cbeMGCVv_kp-nVupRfsg/edit
- Client data, acceptance, and refund control: https://docs.google.com/document/d/1-76R97SQCPF4yDkE3Lxv_GZV-kHLxhKN8zJhxs6jGEc/edit

Connector readback on 7 September 2026 confirmed that all four documents are native Google Docs, contain the expected headings and lists, and are stored in the private `ChatGPT/APC Legal Review` folder.

## GitHub review record

- Draft pull request: https://github.com/autismpathwaysconsulting/autism-pathways-consulting/pull/42
- Review branch: `codex/legal-terms-coordinated-draft`
- Publication, merge, deployment, and live Cal.com changes remain unauthorised.

## Current-law checks

1. Malaysia's Personal Data Protection Act applies to personal-data processing connected with commercial transactions. Child health or diagnosis information can be sensitive personal data and requires stricter handling, including express consent where the Act requires it.
2. The 2024 amendment introduced current requirements including data breach notification, processor security duties, DPO rules for threshold or monitoring cases, and revised cross-border transfer controls. DPO appointment is not assumed for APC. APC must document whether a threshold applies.
3. The Commissioner's cross-border guideline requires an applicable transfer condition, written notice of the recipient class and purpose, security precautions, and records capable of proving compliance. A vendor list by itself is insufficient.
4. The 2024 Consumer Protection (Electronic Trade Transaction) Regulations took effect on 25 December 2024 and revoked the 2012 regulations. The online disclosure schedule includes supplier identity, website, email, telephone, operating address, service characteristics, full price and other costs, payment method, terms, and estimated service timing, and requires the information in the national language. CJ's home address is now prohibited from the candidate public surfaces; APC needs a valid alternative public business/service address before online sale.
5. Section 6 of the Consumer Protection Act 1999 states that the Act operates despite a contrary agreement and prohibits suppliers from purporting to contract out of it. Parts VIII and IX provide service guarantees and consumer remedies, including correction, cancellation, damages, and refund consequences in qualifying cases. APC can refuse refunds for parent change of mind, but an absolute “no refunds under any circumstances” clause is not defensible.
6. Royal Malaysian Customs describes consultancy, training, and tutoring as potentially taxable service categories, with a published RM500,000 threshold and an 8% general service-tax rate for taxable services. Sole-proprietor status alone does not establish exemption. The candidate therefore states only that APC does not currently add a separate tax amount and requires classification confirmation before launch.
7. HASiL's current sole-proprietor guidance states that supporting business records are kept for seven years. The draft therefore separates essential contract/accounting retention from a shorter 24-month period for detailed child-related working notes.
8. The Commissioner's current breach guideline requires qualifying notification to the Commissioner as soon as practicable and no later than 72 hours from occurrence. The incident procedure uses that deadline but still requires current affected-person timing to be confirmed during implementation.

## Red-team pass 1

### Content accuracy

- Corrected Home Support to four 60-minute sessions over approximately six to eight weeks.
- Removed the stale additional check-in promise.
- Preserved the controlled RM350 and RM1,800 prices.

### Parent experience

- The 12-week point is now a clear review point, not a surprise expiry trap.
- Parents receive options to book, pause with a date, or discuss early closure.
- Existing clients are protected from retrospective terms.

### Business protection

- The 24-hour rule, late arrival boundary, manual exception review, written variations, and acceptance evidence reduce avoidable disputes.
- The draft now matches APC's business rule: no cash refunds for parent change of mind, cancellation, inactivity, or non-attendance.
- Four RM450 milestone payments prevent APC from holding the full RM1,800 for future work that has not begun. This is materially safer than taking full advance payment and trying to make it absolutely non-refundable.
- The policy preserves rescheduling, discretionary credits, APC non-delivery remedies, and rights that Malaysian law does not allow APC to remove.

### Privacy and security

- The privacy draft now names client-record categories, Google Drive use, Cloudflare D1 risk, possible AI-assisted drafting, cross-border requirements, retention, incidents, and human review.
- A separate implementation control now defines minimum use, blocked systems, retention, deletion, incidents, acceptance evidence, and release gates.
- Provider contracts, transfer routes, settings, and deletion behaviour remain unverified; the register does not pretend otherwise.

### Cross-channel consistency

- Website, agreement, and Cal.com text now express the same service boundary and scheduling rule.
- Live Cal.com and the live website remain unchanged, so operational drift is still possible until approved deployment.

## Corrections after pass 1

- Replaced automatic-expiry language with a review point.
- Replaced the earlier refund formula with APC's stated no-change-of-mind-refund position, milestone billing, and a separate mandatory-remedy path.
- Added non-retroactivity throughout.
- Added durable acceptance and version evidence.
- Added a hard privacy gate before identifiable D1 or generative-AI use.
- Removed the Founder-supplied home address from every current candidate document and made non-publication an explicit release gate.
- Reframed confidentiality so APC does not promise legal privilege or overstate a mandatory reporting duty.
- Reframed the liability clause so it does not purport to remove non-excludable rights.
- Replaced refund discretion with four prospective RM450 payments, a defined milestone-start event, discretionary credits, and a mandatory-remedy exception.
- Replaced “bounded WhatsApp” with days, hours, response time, weekly volume, scope, media restrictions, and dormancy rules.
- Added record-specific retention, deletion, acceptance, consent, incident, and change-control procedures.
- Corrected the tax rationale: sole-proprietor status alone is not an SST exemption.

## Red-team pass 2

### Strongest objections

1. A document cannot protect APC if the parent never receives and affirmatively accepts it before payment.
2. A privacy notice cannot cure undisclosed past processing. APC must inventory any identifiable client information already placed in Google Drive, Cloudflare, or AI systems and decide lawful retention, restriction, export, or deletion.
3. APC's no-change-of-mind-refund position is coherent only if parents see and accept it before payment and APC does not represent it as overriding statutory remedies.
4. Four RM450 milestone payments materially reduce refund disputes. Collecting the full RM1,800 in advance would reopen the unresolved risk around unperformed future work and should remain disabled.
5. The weekly WhatsApp allowance is now measurable, but CJ must capacity-test it with realistic client load and closure periods.
6. A valid public business/service address is still required for online-sale disclosure. CJ's home address is prohibited from publication, so launch remains blocked until an acceptable alternative is verified.
7. The tax wording is now accurate as a statement of charging practice, not tax status. APC still needs a classification and threshold check.
8. A DPO may not be mandatory at APC's present scale, but APC must document the threshold assessment, especially if regular and systematic monitoring is introduced.
9. The provider register is deliberately blocked where facts are unknown. Identifiable D1 and AI use remains NO-GO until contract, transfer, notice/consent, security, and deletion evidence exists.
10. English drafting does not satisfy the national-language implementation requirement. The Bahasa Malaysia version and acceptance UI remain launch blockers.

## Must-fix launch sequence

1. Obtain and verify a valid public business/service address without using CJ's home address.
2. Obtain written Malaysian tax classification confirmation; monitor the applicable rolling threshold.
3. Obtain qualified Malaysian legal review of the coordinated draft, including the no-change-of-mind-refund policy, RM450 milestone billing, late cancellation, APC non-delivery, mandatory remedies, liability, sensitive child data, Bahasa Malaysia disclosure, and electronic acceptance.
4. Verify every provider's role, processing location or transfer route, contract terms, access, retention, deletion, incident handling, and cross-border transfer condition.
5. Complete the historical data audit for identifiable information already present in email, WhatsApp, Drive, Cloudflare, or AI systems.
6. Capacity-test the WhatsApp boundary, milestone invoicing, rescheduling, credits, and mandatory-remedy administration.
7. Produce and professionally review the Bahasa Malaysia disclosure and checkbox wording.
8. Implement the versioned pre-payment acceptance and durable-copy workflow without activating identifiable D1 or AI processing.
9. Run a non-client test booking and deletion exercise and retain evidence.
10. Revise all controlled documents from one marked-up source, approve one version and effective date, then publish all channels together.
11. Preserve prior agreement versions and linked acceptance evidence.
12. Run a post-launch audit after the first new paid client.

## Official sources checked

- Malaysia Personal Data Protection Commissioner, Act 709 application and official guidance: https://www.pdp.gov.my/ppdpv1/en/akta709/
- Malaysia Personal Data Protection Commissioner, data breach notification guidance: https://www.pdp.gov.my/ppdpv1/en/akta/personal-data-protection-guidelines-on-data-breach-notification-dbn/
- Malaysia Personal Data Protection Commissioner, cross-border transfer guidance: https://www.pdp.gov.my/ppdpv1/en/akta/personal-data-protection-guidelines-on-cross-border-transfer-of-personal-data-cbpdt/
- Malaysia Personal Data Protection Commissioner, DPO FAQ: https://www.pdp.gov.my/ppdpv1/en/faq/
- Malaysia Ministry of Domestic Trade and Cost of Living, Consumer Protection (Electronic Trade Transaction) Regulations 2024: https://repositori.kpdn.gov.my/bitstream/123456789/5299/1/PERATURAN%20URUSNIAGA%20PERDAGANGAN%20DALAM%20ELEKTRONIK%202024.pdf
- Malaysia Ministry of Domestic Trade and Cost of Living, Consumer Protection Act 1999: https://www.kpdn.gov.my/images/2024/awam/akta/ttpm/Act%20599.pdf
- Royal Malaysian Customs Department, MySST Business FAQ: https://mysst.customs.gov.my/faq-business/
- Royal Malaysian Customs Department, MySST Service Tax FAQ: https://mysst.customs.gov.my/faq-services-tax/
- Inland Revenue Board of Malaysia, Tax Savvy Business Owner 2025: https://www.hasil.gov.my/media/fqphzxud/tax-savvy-business-owner-e-b-2025.pdf
