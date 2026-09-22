# Programme package review

Reviewed all five preparation items before implementing this revision.

| Finding | Change | Acceptance evidence |
| --- | --- | --- |
| Adult accompaniment was easy to miss inside an expandable explanation. | Show the condition in the volunteering panel and the resources entry. | Rendered mobile and desktop review. |
| Parents could type into a closed form. | Keep fields disabled until the API confirms the list is open; show availability before the fields and retain email contact. | Closed-state browser scenario verifies disabled contact fields and submit button. |
| The transition after expressing interest was unclear. | Add a three-stage explanation and clearer receipt. | Copy reviewed against scouting and partner documents. |
| Selection controls remained available after a successful save. | Hide the controls with the saved form so edits cannot imply a database update. | Successful-save browser scenario. |
| Follow-up dates were stored without a review queue. | Add due-date and no-date filters, with overdue records first. | Browser verifies due, no-date and all-record views. |
| Scouting findings needed a practical review step. | Add a protected eight-area interactive checklist and an action log in the scouting pack. | Browser checks unresolved and all-confirmed states, reload behaviour and anonymous access denial. |
| The two-person team needed clearer disruption responses. | Expand scouting scenarios and clarify planning capacity in the partner brief. | All six scouting pages and the one-page brief rendered and visually inspected. |

The checklist and documents use CJ's supplied coaching sequence as an APC adaptation. No official Hanen programme or endorsement is claimed. Existing privacy statements remain unchanged; the JPDP [personal-data principles](https://www.pdp.gov.my/ppdpv1/en/principles-of-personal-data-protection/) were checked during review. This is not a legal compliance opinion.

Local checks cover 320px, 390px and 1440px programme layouts, keyboard interactions, preference synchronisation, failed-save recovery, successful SQLite storage, private review and deletion, closed capture, resource discovery and readiness interactions. Production Turnstile and D1 still need the authorised activation checks in README.md.

The authority validator continues to report the same executable-JavaScript findings described in README.md. No validator or authority rule was changed. The draft and disabled capture flags remain in place.
