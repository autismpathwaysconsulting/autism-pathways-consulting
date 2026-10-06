# Pathways five-day trial

Prepared 6 October 2026. Synthetic validation only. Use the isolated Student A demo, never a real pupil's details. This is a trial protocol, not evidence that reporting is faster or school adoption is ready.

## Purpose

Check whether one aide record can support accurate, audience-appropriate updates and evidence review with less total effort. Keep safety, usefulness and speed as separate outcomes.

## Scenario cards

The exact machine-readable records and approved comparison wording are in `tests/fixtures/pathways-five-day-trial.mjs`.

| Day | Rough notes for the aide | Expected interpretation |
| --- | --- | --- |
| Monday 5 Oct | Started after 45 seconds. Written steps. No aide prompt. Asked teacher about last question. | One task-starting criterion met. Asking the teacher for clarification is appropriate help-seeking. |
| Tuesday 6 Oct | One aide prompt at 90 seconds. Started at 110 seconds. Continued without another prompt. | Partly/emerging: within the time target, but the no-aide-prompt condition was not met. Do not describe this as fully independent. |
| Wednesday 7 Oct | Aide did not observe the lesson. No teacher report available. | No recorded evidence. Do not infer either success or failure. |
| Thursday 8 Oct | Started at four minutes after two prompts. SENCO adds a written-steps follow-up while aide is editing. | Criterion not met in this observation. Resolve the conflict without dropping either the aide's draft or the SENCO follow-up. |
| Friday 9 Oct | Requested a quieter place during group activity. Request supported. Rejoined after five minutes. No familiar written-task opportunity. | Record the request and response without assuming why it happened. Mark the written-task goal not measured. |

Synthetic goal: begin a familiar written task within two minutes after teacher instructions, with written steps available and without an aide initiation prompt. Ordinary teacher clarification is permitted. Review date: 30 October 2026.

Expected week evidence: three rated opportunities (one met, one partly/emerging, one not met), one explicitly not measured, and one lesson without an observation. This is not a five-day success percentage or proof of a trend.

## Aide trial

1. Use the same five scenario cards for both methods: your current reporting process and Pathways. Practice one separate example first.
2. Alternate which method is used first across scenarios. Record the order because repetition can improve speed.
3. Start timing when reading the rough notes. Stop after the full internal record and family/teacher updates have been checked and are ready to share. Do not send them.
4. Include entry, corrections, review, copying and recovery time. Log interruptions separately. Do not count an unfinished or inaccurate report as a speed win.
5. For Thursday, use two authorized test sessions on the same synthetic student. Make the second session's change after the first session loads the record. Verify that the draft recovery copy is available, compare with the saved record and re-enter only the intended changes. Do not perform this against a real record.
6. For Friday, keep the uncertainty in the internal record. Do not turn a possible sensory explanation into an established fact in either update.

| Scenario | Method first | Current method minutes | Pathways minutes | Corrections required | Help needed | Facts omitted or added | Complete? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Monday | | | | | | | |
| Tuesday | | | | | | | |
| Wednesday | | | | | | | |
| Thursday | | | | | | | |
| Friday | | | | | | | |

Calculate time saved as `(total current-method minutes - total Pathways minutes) / total current-method minutes`. Report the totals and per-scenario times. The proposed 50% reduction is a stretch target, not a claim. This small synthetic comparison is affected by practice, familiarity and scenario order; a real pilot must confirm any benefit.

## SENCO trial

After normal onboarding, ask the SENCO to work without live coaching:

- Find the initiation goal, its condition and permitted support.
- Find the latest rated opportunity and the underlying lesson observation.
- Explain why Wednesday and Friday must not be counted as failed opportunities.
- Distinguish Tuesday's aide prompting from Monday's use of written steps and teacher clarification.
- Identify one question worth following up and state what additional evidence is needed. Do not require a change in support just to complete this task.

Target: find the goal and relevant evidence within two minutes. Record actual time, navigation errors, requests for help and whether the interpretation was correct. A fast incorrect interpretation fails.

## Access and device checks

Using already authorized synthetic test accounts, verify that an assigned staff viewer sees reviewed teacher text, cannot open raw notes/history/export, and cannot see another unassigned student. Verify family sharing is blocked without current authority. Do not create credentials or expand access during this trial without the appropriate authorization.

Repeat the core record/save/reopen/review journey on laptop and iPad. Check readable text, reachable buttons, scrolling, keyboard focus, modal dismissal and portrait/landscape layout. Repeat on the school network. These are pending human/browser checks, not covered by passing Node tests.

## Decision rules

Stop for any unauthorized disclosure, silent overwrite, unsupported statement in a final approved update, or unrecoverable loss within the promised recovery boundary. Record the exact scenario and repair it before another trial.

If accuracy and access pass but reporting time does not improve, remove unnecessary entry/review steps before adding capabilities. If evidence is hard to find, revise goal navigation and labels. If both are useful, propose a bounded current-school pilot after its privacy, training, backup and support gates are met.

## Verified automated evidence and limits

The five-day integration test runs the actual state and summary handlers against temporary SQLite using the existing D1 adapter. It checks saved record fidelity, exact human-authored reviewed text, internal-detail exclusion from the family draft, goal counts, missing observations, conflict refusal and explicit reconciliation. It is not a browser/device test, AI writing evaluation, live network test or user-time measurement. All fixture summary wording is supplied by a human-equivalent test input; the test does not generate summaries from rough notes.

Known current limitations:

- Later record edits invalidate earlier reviewed summaries globally, even for another day. The test verifies this conservative behavior; it is not evidence that the behavior is convenient. Assess its review burden before claiming ongoing reporting savings.
- Conflict recovery is manual and temporary. Browser-page refresh, student switching, sign-out or access refusal clears the retained draft.
- Live session persistence, clipboard behavior, assigned-viewer usability and laptop/iPad visual review remain unverified due to browser credential-observation restrictions.
- The software does not establish educational effectiveness, independence outside recorded opportunities, aide competence or willingness to pay.
