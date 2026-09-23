# Big Reactions email capture contract

## Purpose

Deliver the free Big Reactions Quick Check and two short usage emails without mixing this audience into the existing Malaysian Parent Guide or Communication Course waitlist lists.

## Required fields

Only:
- first name;
- email address.

Do not request:
- child's name;
- diagnosis;
- health or medication information;
- school information;
- behaviour description;
- therapist information;
- free-text case details.

## Consent

Required delivery disclosure:
"We will email you the Quick Check and two short follow-up emails on how to use it."

Separate optional ongoing-marketing checkbox:
"Send me occasional APC parent resources and updates."

The download must not depend on opting into broader marketing.

## Delivery sequence

### Immediately
- redirect to /thank-you-big-reactions;
- provide an immediate PDF download;
- send Email 1 with the same download link.

### Day 2
Send Email 2: compare a second similar moment and notice easier moments too.

### Day 5
Send Email 3: review what keeps showing up and route to personalised APC support only if needed.

## Segmentation

Recommended audience tag / list:
BIG_REACTIONS_QUICK_CHECK

Recommended optional marketing property:
APC_MARKETING_OPT_IN = true / false

## Failure behaviour

If email delivery is unavailable:
- the thank-you page must still provide the resource;
- never claim an email was sent unless the provider accepted the request;
- show a clear retry or support route.

## Provider state

No dedicated Big Reactions provider/form is connected in this branch.
Do not reuse the existing Free Malaysian Parent Guide or Communication Course waitlist forms.

## Launch gate

The lead funnel remains noindex and unlinked from Resources until:
- a dedicated form/list is connected;
- email delivery is tested;
- immediate download works;
- consent text matches the live provider form;
- one end-to-end mobile test passes.
