# Pathways school release tracker

Updated 6 October 2026. The dated sections below preserve historical verification; the current checkpoint supersedes their release status.

## Current checkpoint: 6 October 2026

Pathways is scoped to current-school research and a bounded pilot. External-school sales, subscription pricing and integrations remain deferred. Teacher Talk A remains APC's main priority.

The beta branch before this reliability increment was `ad02f74d08294c26e4e5fca1a2fc25b4cb18ed52`. Reviewed summaries, restricted staff viewers and daily navigation were published on 27 September; their older “local” labels below describe the evidence at that time.

Live synthetic checks on 6 October confirmed saving a Mathematics preparation item, a lesson observation and a reviewed teacher summary. All three remained present after signing in again. Internal preparation/task details were excluded from the family draft; WhatsApp was disabled without family-sharing authority. The recorded objective result was Not measured, so this does not verify counted IEP progress. No real student information was used.

### Block 2 reliability increment

Confirmed and repaired failed-save state leakage: edits are now staged separately and installed in the displayed record only after server confirmation. A failed new-objective save retains the form and cannot duplicate the objective on retry or silently ride along with another save. Lesson, overview, timetable and persistent-item edits use the same boundary. Concurrent saves for the same loaded student are refused with a wait-and-retry message. Late responses remain isolated from another student or session.

Session expiry retains the HTTP status, clears protected records and displays a sign-in message. A connection/server failure during workspace restoration now displays a reload instruction instead of silently looking like a normal signed-out state. Cookie policy and session security were not weakened.

Verification before deployment: 88/88 Pathways tests and 8/8 site-build checks passed; the build contains 90 allowlisted public files. New behavioral tests cover failed objective and lesson retries, unrelated-save isolation, overlapping saves, session expiry and workspace restoration. Source and checked-in assets match.

Remaining limitations: the automation browser returned to login on reload and later blocked observation because of native credential protection. The cause is not established; these changes do not claim to fix that observation. Live reload/session persistence, clipboard confirmation, staff-viewer access and laptop/iPad visual checks remain outstanding. A lost save response may still mean the server committed; no automatic retry is added. Existing conflict handling reloads the current version and does not preserve a conflict draft. No offline storage or complete offline recovery is claimed.

### Follow-up: concurrent reviews and lost responses

The first reliability increment was deployed as `32d507e`; Cloudflare reported success. A further live-browser attempt still reached sign-in after navigation and encountered native-credential observation restrictions. No additional live session or staff-viewer pass is claimed.

A database-backed regression reproduced a false 403 when an editor's snapshot predates a summary review in another session. The state endpoint now returns a 409 version conflict in that case, without writing the stale record. Attempts to alter reviewed text at the current revision remain forbidden. A simulated lost-response test confirms that retrying an already committed save cannot add another revision or restore an invalidated summary. This exercises real handlers and SQLite, not a live network interruption.

Follow-up verification: 90/90 Pathways tests and 8/8 site-build checks passed. The 13 summary/access tests cover assigned-viewer projections, raw-route denials, assignment revocation, inactive users, suspended organizations, cross-organization access, authority boundaries and the two new recovery cases. Conflict handling still reloads the current record and does not preserve a conflict draft. Live role checks, clipboard behavior, laptop/iPad review and school-network acceptance remain outstanding.

### Conflict-draft recovery increment

Conflict handling now keeps a readable, temporary copy of the changed lesson, overview, preparation/reminder, goal or timetable entries before loading the latest record. A recovery notice and dialog let the editor review/copy that text and explicitly discard it after deciding what to re-enter. Nothing is automatically merged or resubmitted. Other saves are blocked until the draft is resolved so another conflict cannot replace the retained copy.

The draft stays in page memory only. It survives a failed latest-record load and same-student record reloads, but clears on student/organization change, sign-out/session reset, access refusal, or browser-page refresh. This is manual recovery, not durable offline storage. Editors must check whether an uncertain earlier save already committed before re-entering a new item. Summary-review drafts retain their existing handling; this increment covers canonical record saves.

Verification: 95/95 Pathways tests and 8/8 site-build checks passed. Five new behavior tests cover preservation without overwriting newer state, failed reload/retry, student switching and stale responses, confirmed discard/copy isolation, and revoked access. Source and generated assets match. The recovery dialog uses the existing responsive dialog styles; its live laptop/iPad appearance and clipboard behavior remain unverified because of the browser observation restriction. The previous paragraphs describing lost conflict drafts are historical and superseded by these bounded recovery controls.

### Next blocks

1. Core synthetic workflow: passed for the scenario above.
2. Login and reliability: local repairs verified; live reload, disconnected/ambiguous-response recovery and conflict checks remain.
3. Roles and sharing: automated negative checks pass; live assigned-viewer checks remain.
4. Laptop/iPad usability: pending observation and user acceptance.
5. Demo: freeze only after the preceding gates; prepare the 15-minute journey and backup recording.
6. Pilot operations: school owner, privacy boundaries, staff training, backup restoration, incident response and exit procedure remain gates.
7. Current-school pilot: four weeks, 3–5 students only after the school agrees and real-data gates pass. No real-data launch is certified here.


## Product boundary

A child-centred support workspace connecting aides, SENCOs, teachers, heads of year and families. APC provides school/aide training and bounded consultancy. It complements the school's existing student information system. Google sign-in and iSAMS integration are requirements, not verified capabilities. School agreement and IT participation are needed before either is promised.

Use synthetic Student A for demonstrations. Do not import real student documents into demonstration fixtures.

## Increment 1: structured lesson preparation

Implemented in the existing persistent-items interface. An authorized editor selects **Prepare a lesson (internal)** and records a title, topic, task and intended learning outcome. Optional fields capture a materials reference, differentiated work and planned aide support. A due date and subject are available. This is not file uploading or a teacher-specific portal.

Preparation is stored as an optional object on an existing upcoming-task item, through the existing versioned student-state save endpoint. Existing records need no migration. Server-side schema validation requires internal visibility and meaningful required fields. Parent-report generation also excludes preparation independently of its visibility flag.

New persistent items default to internal. Failed preparation saves retain form input and remove the unsaved local item; repeated clicks during a pending save are blocked. A lost network response can still mean the server committed: existing revision conflict handling must resolve subsequent retries. This increment does not claim complete offline recovery.

Planned support stays separate from support actually observed during a lesson. Existing viewers can still receive the full student state, including internal items. “Internal” here means excluded from the parent report, not a new authorization boundary. Do not provision summary-only teachers or parents using the existing viewer role.

## Local acceptance evidence

- 8/8 focused lesson-preparation tests passed: legacy compatibility, serialization, required data, internal visibility, malformed/oversized data, report exclusion, failed-save retry and duplicate-click handling.
- 56/56 existing Pathways production/security/database/configuration tests passed after regenerating dist.
- 8/8 site-build tests passed; build generated 90 allowlisted public files.
- Browser application syntax check passed.
- The new tests are included in the normal Pathways production test command.
- No live login, live database roundtrip, school network test, laptop/iPad visual review or independent security review was performed for this increment. Unit tests exercise extracted save-handler code; they do not establish browser usability.
- Initial regression run failed because dist had not yet been rebuilt; the subsequent run passed after build.

## Next increments and release gates

| Requirement | Current finding | Acceptance gate |
| --- | --- | --- |
| Full notes for aide/SENCO; summaries for teachers/HoY | Existing state API returns the whole student state | Server-enforced role projections and explicit student grants; negative tests for raw state, revisions, exports and other students |
| Selected family updates | Existing report includes every saved lesson narrative | Select/review important highlights; retain full notes internally; preview exactly what is shared |
| Teacher lesson preparation and comments | Structured preparation implemented for existing editors only | Teacher permissions; comments on progress/support; upcoming lesson coordination without raw-note access |
| SENCO follow-through | No verified issue-owner workflow | Flag visible to relevant staff; named owner, action, due date and closure evidence |
| Measurable IEP tracking | Objectives and observations exist | Baseline and review date; goal history; distinguish professional estimates from counted opportunities and classroom from therapy evidence |
| Independence | Aide involvement and support fields exist | No aide prompt/guidance recorded separately from classroom adjustments; appropriate help-seeking is not treated as failure |
| External recommendations | No verified provenance workflow | Authorized aide/SENCO records author, date, source and recommendation; visibility and review decision |
| Google and iSAMS | Unverified | School-approved sign-in/domain controls; confirm available interfaces before integration commitments |
| Reliable saving | Revision/conflict controls exist | Real browser tests for competing edits, disconnected network, ambiguous save results and recoverable drafts |
| Safe operation | Not established by deployment success | Tested backup restoration, monitoring, incident contact, rollback and realistic support hours for a solo operator |
| Privacy and pilot boundaries | Still requires school-specific agreement | Agree access, data use, retention, export/deletion and exit procedure; obtain appropriate review before real-data pilot |
| Usability | No visual approval for this increment | Aide and SENCO complete the main workflow on laptop/iPad without coaching; test on school network |

## Demonstration and adoption sequence

Demonstrate a 15-minute synthetic journey: teacher preparation, aide observation, IEP evidence, SENCO review and a selected family update. Only show completed functionality as working. Mark prototypes or missing steps explicitly.

Proceed to a bounded four-week pilot with 3–5 students only after access, privacy, recovery and support gates are met. Agree success measures with the school: time spent reporting, consistency of records, follow-up completion and whether staff can find the relevant goal and evidence. Subscription pricing and ongoing consultancy scope remain proposals until agreed.

Cloudflare access remains paused until CJ confirms hotspot availability for the next deployment or live verification session.

## Increment 2: reviewed summaries and staff-viewer boundaries (local, not deployed)

Implemented after approval of the quality-improvement sequence. Based on deployed commit `bc291ec` in branch `codex/pathways-reviewed-sharing`.

- Existing `viewer` accounts now mean **Staff summary viewer**. They must be assigned to the student and see only explicitly reviewed teacher-summary text and minimal student identification. This is a narrowing of existing viewer access, not a new parent role.
- Direct viewer requests for raw state, revision lists, individual revisions, complete exports, consent records, assignments and audit records are denied. The student roster excludes unnecessary identifiers and metadata for viewers.
- Authorized editors select Parent or Teacher output, choose **Review and edit highlights**, remove irrelevant/private content and confirm review. Full notes remain intact. This is human editing, not automated summarization.
- Review metadata is stamped by the server. Ordinary state saves cannot forge or modify it. Each review goes through the existing atomic revision/audit mechanism.
- Copying a Parent or Teacher update fetches the reviewed text from the server. Parent copying and WhatsApp preparation both require current effective family-sharing authority. This does not prevent authorized full-record staff manually copying information elsewhere.
- Any underlying state edit invalidates summaries until reviewed again. This includes changes on another day or to goals/preparation. Saving another summary does not invalidate existing summaries. Import, reset and historical restore clear reviews. This conservative first version does not yet offer independent historical publications or per-day invalidation.
- Summary retrieval and creation require current school-use authority for non-demo records. Synthetic demo provenance does not waive family-sharing authority.
- Viewer access is read-only. Teacher comments, teacher preparation permissions, parent accounts, invitations, Google sign-in, iSAMS integration, dashboard redesign, SENCO follow-up, richer IEP measurement and student voice remain subsequent work.
- No database migration is required. Reviewed text is an optional field within existing versioned student state and is subject to its size limit.

### Release checks still needed

Local verification passed: 78/78 Pathways tests (including 11 summary endpoint/database tests and browser-state isolation checks), 8/8 site-build tests, JavaScript syntax checks and git diff whitespace checks. These are automated code checks, not a visual or live-school acceptance test. Before deployment, visually review the full-staff and viewer flows on laptop/iPad and verify live review/save/reload with synthetic data. Cloudflare requires CJ's hotspot confirmation. Do not describe this local increment as deployed or fully school-ready.

## Function review and daily navigation follow-up (local)

Reviewed the summary handlers, authority checks, viewer access and asynchronous browser flows. Reopening a reviewed summary previously regenerated its full draft and discarded the saved selection. The editor now starts with the saved highlights; **Use latest lesson draft** explicitly confirms replacement. The editor is locked while a review save is pending to avoid losing edits during the subsequent reload.

The daily screen now has four direct actions: **Prepare a lesson**, **Record observations**, **Review goals**, **Review updates**. Preparation opens the existing internal lesson form. Other shortcuts scroll to and focus the existing sections. Viewer/read-only restrictions remain enforced. Navigation labels now use Today, Goals & progress and Record history. This is an incremental navigation change; the full profile/follow-up dashboard is not implemented.

Verification: 82/82 Pathways tests and 8/8 site-build tests passed after regeneration of dist. Additional tests cover saved-highlight preservation, explicit regeneration, pending-save locks, shortcut permissions and reduced-motion navigation. No live Cloudflare calls, visual browser inspection or live authenticated writes were performed in this follow-up. Deployment and laptop/iPad review remain pending.
