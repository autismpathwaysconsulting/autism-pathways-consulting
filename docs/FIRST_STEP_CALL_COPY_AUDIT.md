# APC First Step Call — Copy Audit

Status: Internal audit. Purpose: prevent the free call from drifting into a promise of personalised advice while still giving the parent a clear outcome.

## Canonical promise

The Free 15-Min First Step Call should answer:

- Is APC an appropriate route?
- Which APC service, if any, fits best?
- Is another professional more appropriate?
- What is the next step?

It should not promise:
- explanation of why the child is doing something,
- personalised strategy recommendations,
- assessment/diagnosis,
- treatment/therapy,
- detailed planning.

## Existing containment already found in the repository

The current repository already includes strong containment in several places:
- booking confirmation describes the call as a fit-and-routing conversation,
- booking confirmation explicitly says it is not an advice session,
- free-tool route describes it as checking fit and choosing a route,
- website authority tests include a First Step boundary requirement,
- interim-containment tests cover First Step pages.

This is good and should remain.

## Current website wording goal

Recommended public outcome line:

> "By the end of the call, you should know whether your concern is within APC's scope, which APC route fits best, whether another professional may be more appropriate, and what the next step is."

Boundary line:

> "This is a fit-and-routing call, not a problem-solving consultation, assessment, diagnosis or therapy session."

## Risk words to search for before future releases

Flag if used to describe the free call positively:
- reframe
- initial direction on your child's concern
- personalised advice
- strategy
- recommendation for what to do at home
- action plan
- analyse your child's behaviour
- assessment
- consultation

These words may appear elsewhere on the site legitimately. The risk is when they are attached to the free call promise.

## Future regression requirement

When parent-offer pricing is migrated, keep automated tests that assert:
- free call remains free,
- duration remains 15 minutes unless intentionally changed,
- no personalised-strategy promise,
- no automatic paid-service acceptance,
- no clinical claim,
- routing outcome remains clear.
