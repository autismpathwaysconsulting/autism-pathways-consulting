# APC Coordinated Legal and Privacy Review

## Outcome first

**Operational drafting score:** 9.0/10  
**Legal-validity score:** Not scored  
**Publication verdict:** NO-GO  
**Reason:** The documents are now materially clearer and mutually consistent, but unresolved facts and decisions prevent lawful, reliable launch. A qualified Malaysian lawyer has not approved enforceability. APC has not completed the data map, processor and cross-border transfer records, retention schedule, incident procedure, or the acceptance implementation.

This is an independent risk review, not legal advice.

## Coordinated package

- `docs/APC_WEBSITE_LEGAL_COPY_REVIEW_DRAFT_2026-09-07.md`
- `docs/APC_PARENT_SUPPORT_AGREEMENT_LEGAL_REVIEW_DRAFT_2026-09-07.md`
- `docs/APC_CAL_COM_COORDINATED_COPY_LEGAL_REVIEW_DRAFT_2026-09-07.md`

All three candidate sources use the same proposed rules: no retrospective expiry, a 12-week review point rather than automatic forfeiture, manual exceptions, recorded pre-payment acceptance, no automatic refund decisions, and no additional post-programme check-in.

The public `terms.html`, `cancellation-policy.html`, and `privacy.html` remain under interim containment. This review branch corrects the stale Home Support check-in promise across the offer surfaces, but it does not publish the unapproved legal clauses. The candidate website wording stays in the controlled review document until the remaining legal and privacy gates are closed.

## Verified Google Drive copies

- Folder: https://drive.google.com/drive/folders/1zz7EbsbH0KXNYJEyfGGmUu5Q1RWow9lM
- Website legal copy: https://docs.google.com/document/d/1KsKM9k2qSdDQzLyFFPaQLGgYQnggaWT5tz_tIiVQiB4/edit
- Parent Support Agreement: https://docs.google.com/document/d/1LngWTHB5-BmIUvUyE_ulTK8RVEBOv0lZXQXQmDcYUVw/edit
- Cal.com coordinated copy: https://docs.google.com/document/d/1xzrOWYjQlbmp6ggl6eqqSrS8BVLoGApd7TjrqWiKDY4/edit
- Review and launch blockers: https://docs.google.com/document/d/1rnJBitIN5SjFndASm4kQ-h1cbeMGCVv_kp-nVupRfsg/edit

Connector readback on 7 September 2026 confirmed that all four documents are native Google Docs, contain the expected headings and lists, and are stored in the private `ChatGPT/APC Legal Review` folder.

## GitHub review record

- Draft pull request: https://github.com/autismpathwaysconsulting/autism-pathways-consulting/pull/42
- Review branch: `codex/legal-terms-coordinated-draft`
- Publication, merge, deployment, and live Cal.com changes remain unauthorised.

## Current-law checks

1. Malaysia's Personal Data Protection Act applies to personal-data processing connected with commercial transactions. Child health or diagnosis information can be sensitive personal data and requires stricter handling, including express consent where the Act requires it.
2. The 2024 amendment introduced current requirements including data breach notification, processor security duties, DPO rules for threshold or monitoring cases, and revised cross-border transfer controls. DPO appointment is not assumed for APC. APC must document whether a threshold applies.
3. The Commissioner's cross-border guideline requires an applicable transfer condition, written notice of the recipient class and purpose, security precautions, and records capable of proving compliance. A vendor list by itself is insufficient.
4. The 2024 Consumer Protection (Electronic Trade Transaction) Regulations took effect on 25 December 2024 and revoked the 2012 regulations. The online disclosure schedule includes supplier identity, website, email, telephone, operating address, service characteristics, full price and other costs, payment method, terms, and estimated service timing. APC's full business operating address is not present in the repository and must not be invented.
5. A blanket liability cap or no-refund rule may be vulnerable under consumer and unfair-contract principles. The proposed pages therefore preserve mandatory rights and leave the final financial and liability language for qualified review.

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
- The draft still lacks a final refund formula, communication service level, and enforceability review.

### Privacy and security

- The privacy draft now names client-record categories, Google Drive use, Cloudflare D1 risk, possible AI-assisted drafting, cross-border requirements, retention, incidents, and human review.
- This disclosure is not a substitute for implementing the controls.

### Cross-channel consistency

- Website, agreement, and Cal.com text now express the same service boundary and scheduling rule.
- Live Cal.com and the live website remain unchanged, so operational drift is still possible until approved deployment.

## Corrections after pass 1

- Replaced automatic-expiry language with a review point.
- Replaced a blanket no-refund position with a written human decision based on delivery, unused sessions, agreement, circumstances, and law.
- Added non-retroactivity throughout.
- Added durable acceptance and version evidence.
- Added a hard privacy gate before identifiable D1 or generative-AI use.
- Added the missing-business-address blocker rather than inventing an address.
- Reframed confidentiality so APC does not promise legal privilege or overstate a mandatory reporting duty.
- Reframed the liability clause so it does not purport to remove non-excludable rights.

## Red-team pass 2

### Strongest objections

1. A document cannot protect APC if the parent never receives and affirmatively accepts it before payment.
2. A privacy notice cannot cure undisclosed past processing. APC must inventory any identifiable client information already placed in Google Drive, Cloudflare, or AI systems and decide lawful retention, restriction, export, or deletion.
3. The 12-week review point does not resolve unused-session finances. That decision still needs qualified advice and a clear prospective clause.
4. "Exceptional circumstances" needs a short internal decision guide to prevent inconsistent treatment.
5. Bounded WhatsApp support is still too vague. Days, response window, channel, volume, and escalation rule are required before promising it to another client.
6. The business operating address and any tax treatment or additional cost are missing from the online-sale disclosure set.
7. A DPO may not be mandatory at APC's present scale, but APC must document the threshold assessment, especially if regular and systematic monitoring is introduced.
8. Breach duties require an implemented response process, not a privacy-page sentence.

## Must-fix launch sequence

1. Supply the legal business operating address and confirm price, tax, and other-cost disclosure.
2. Complete a data inventory for Cal.com, email, WhatsApp, Google Drive, Cloudflare, payments, Brevo, Gumroad, and every AI workspace used.
3. Document each provider's role, country or processing location, contract terms, access, retention, deletion, incident handling, and cross-border transfer condition.
4. Decide and document retention periods by record category.
5. Decide the exact WhatsApp support boundary.
6. Obtain qualified Malaysian legal review of cancellation, no-show, early closure, refunds, liability, consumer rights, sensitive child data, and the acceptance method.
7. Revise all five documents from one marked-up source.
8. Approve one version and effective date.
9. Implement affirmative pre-payment acceptance and durable parent copies.
10. Test every booking and payment path, then publish all channels together.
11. Keep prior agreement versions and acceptance evidence.
12. Run a post-launch audit after the first new paid client.

## Official sources checked

- Malaysia Personal Data Protection Commissioner, Act 709 application and official guidance: https://www.pdp.gov.my/ppdpv1/en/akta709/
- Malaysia Personal Data Protection Commissioner, data breach notification guidance: https://www.pdp.gov.my/ppdpv1/en/akta/personal-data-protection-guidelines-on-data-breach-notification-dbn/
- Malaysia Personal Data Protection Commissioner, cross-border transfer guidance: https://www.pdp.gov.my/ppdpv1/en/akta/personal-data-protection-guidelines-on-cross-border-transfer-of-personal-data-cbpdt/
- Malaysia Personal Data Protection Commissioner, DPO FAQ: https://www.pdp.gov.my/ppdpv1/en/faq/
- Malaysia Ministry of Domestic Trade and Cost of Living, Consumer Protection (Electronic Trade Transaction) Regulations 2024: https://repositori.kpdn.gov.my/bitstream/123456789/5299/1/PERATURAN%20URUSNIAGA%20PERDAGANGAN%20DALAM%20ELEKTRONIK%202024.pdf
- Malaysia Ministry of Domestic Trade and Cost of Living, Consumer Protection Act 1999: https://www.kpdn.gov.my/images/2024/awam/akta/ttpm/Act%20599.pdf
