# Pathways school release tracker

Updated 18 September 2026. Local implementation evidence only. No Cloudflare access or deployment during this increment.

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
