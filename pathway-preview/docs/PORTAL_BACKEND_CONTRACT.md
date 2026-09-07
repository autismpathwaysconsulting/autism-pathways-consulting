# Portal backend contract

This is the intended production boundary. The adjacent implementation is a synthetic D1 rehearsal only, not a live client API or approved production record system.

The minimum client account shape is defined in [`client-profile.schema.json`](client-profile.schema.json). It intentionally omits diagnosis, full child name, free-form case history and internal notes. Consent evidence and adult access are separate versioned records defined in [`consent-record.schema.json`](consent-record.schema.json) and [`access-grant.schema.json`](access-grant.schema.json); a profile-level status is never treated as proof of consent or authority.

## Implemented preview projection

`GET /api/portal` applies this projection to the single allowed `DEMO-*` account. Every query repeats server-derived client and account predicates. The production projection remains blocked.

The authenticated client receives only:

- their active APC pathway and current stage;
- the current published plan;
- resources assigned to them or available in the approved library;
- stage items explicitly published for their account;
- booking eligibility and the one private Cal.com follow-up action CJ has assigned;
- their own journal entries and booking history.

Draft practitioner notes, other clients, internal risk notes, private scheduling rules and unapproved files must never be present in this response.

## CJ publish workflow

1. CJ creates or updates a report, form, log, resource assignment or stage-history event in the protected backend.
2. It remains `draft` and invisible to the client.
3. CJ selects **Publish to parent** and the backend records publisher, timestamp, client, stage and version.
4. The client projection returns the published item in the relevant stage and marks it `new` until opened.
5. Corrections create a new version; they do not silently replace audit history.
6. Revocation removes client access while preserving the governed backend audit record.

The Console OS **Client Publisher** is the intended operator surface for this workflow. Its present implementation is synthetic and in-memory; production must route every read and write through authenticated server-side client ownership and role checks.

## Preview writes and rehearsals

- Client creation remains migration-only and synthetic; there is no public or runtime client-creation route.
- `POST /api/journals` stores a client-owned date, optional time, optional title and entry in isolated preview D1.
- Booking remains in Cal.com for v1. The portal does not create or hold appointments in a second calendar.
- `POST /api/uploads`  -  file metadata after MIME verification, malware scanning, metadata handling and private-object acceptance succeed.
- `POST /api/stage-items/:id/opened`  -  clears the client-facing `new` state.

Every preview write requires server-side identity, client ownership, bounded inputs and audit metadata. Production also requires approved stage/service permissions and idempotency policy; the preview does not claim those gates are complete. Browser state is never authoritative.

Production client creation must generate a random opaque ID server-side, normalise but never expose contact fields in logs, reject booking or invitation activation without a current versioned consent record and active verified-adult access grant, and send invitations only through the approved provider after an explicit operator action. The synthetic preview uses a committed opaque fixture and returns a one-time test invitation only to the authenticated operator caller; it sends no email or message.

Every read, download and write must enforce account-to-client ownership at the object level. Route authentication without object-level authorisation is insufficient. Two-account cross-client tests, revoked-access tests and expired-invitation tests are mandatory release evidence.

## Consent and adult authority

- Portal terms, privacy-notice acknowledgement, authority to act for the child, service-record processing and any relevant sensitive-information decision are recorded separately from optional WhatsApp, media and marketing/testimonial choices.
- The evidence record stores notice and terms versions, Bahasa Malaysia and English presentation, time, method, responsible account and withdrawal or supersession history.
- Marketing/testimonial consent is never required for portal access or service delivery.
- A second caregiver receives a separate verified account and access grant. Access is never inherited from another adult's account or shared email link.
- A change in caregiver authority suspends affected access pending operator review; automation does not resolve family or legal disputes.

## Cal.com boundary

- Cal.com remains the booking source of truth for v1. The portal never maintains a separate slot inventory.
- A private Cal.com follow-up URL appears only after CJ assigns it to the authenticated client. No public First Step Call link, full calendar, unrelated event title or private availability rule is exposed.
- Removing eligibility or revoking portal access removes the link from the client projection. Cal.com confirmation remains authoritative.
- Booking titles and questions remain logistics-only: opaque client reference, date, time, time zone and necessary contact fields. Child name, diagnosis, behaviour, reports, journal content and case notes are prohibited.
- Cancellation, rescheduling, expiry and no-show enforcement remains disabled until OPS-HOLD-002 is legally reviewed and approved.

## WhatsApp boundary

- WhatsApp may receive only a fixed, minimal notification such as “I added an update in my private APC portal for review.”
- Journal text, plan details, reports, forms and media are not inserted into click-to-chat URLs.
- WhatsApp does not become the canonical client record. Material decisions are recorded in the approved client record by the responsible human.
- Secure portal upload, not WhatsApp attachment sharing, is the intended path for child or family media.

## Storage shape

- Structured records and permissions: D1 or an equivalently approved relational store.
- Media, PDFs and reports: R2 or equivalently approved private object storage.
- Files are served through short-lived authorised access, never public permanent URLs.
- Files are encrypted in transit and at rest, access is logged, and public bucket/object access is prohibited.
- WhatsApp remains a user-initiated minimal-notification shortcut. The portal does not send journal, report or media content through it.

## Record and lifecycle boundary

- The approved client-record system is canonical. Portal projections, WhatsApp, email, AI chats and local exports cannot become competing authoritative records.
- Parent-facing summaries distinguish parent report, CJ observation, interpretation and agreed action.
- Corrections create a new version and visible correction note; revocation does not silently erase the audit trail.
- Retention, closure access, export, deletion, backups and legal holds are driven by an approved record-class schedule. No default duration is inferred in code.
- Internal facilitator notes, safeguarding working records, security records and other restricted material are never included in the parent projection unless an approved human process expressly authorises it.

## Incident and operational boundary

- Security and privacy events create a restricted incident record without copying unnecessary client content into logs.
- The incident owner controls containment, evidence, risk assessment and any regulator or affected-person notification under the approved current procedure.
- The portal is not monitored as an emergency service. Open-text submissions do not trigger autonomous risk grading, referral, authority contact or safeguarding decisions.
- AI may not access identifiable portal records until the approved-tool register expressly permits the tool, purpose, fields, account settings, retention, processors and transfer controls.

## Minimum production gates

The machine-readable [`portal-release-gates.json`](portal-release-gates.json) must remain fail-closed. Authentication, per-client authorisation, verified-adult authority, versioned consent, bilingual notice, file scanning, data location and transfer review, retention, deletion/export, audit logs, incident response, applicable SPEC-006 hold closure, qualified external review and Founder approval are required before this contract handles real client data.
