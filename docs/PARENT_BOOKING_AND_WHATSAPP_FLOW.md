# APC Parent Booking + WhatsApp Flow

Status: approved operating design, pending Cal.com / WhatsApp setup.

## Decisions locked

- Home Implementation parents use the **same private 60-minute Cal.com link** for Sessions 1–4.
- Parent chooses only the **next** session, usually about two weeks later.
- Parent-facing materials are sent as **PDF only**; APC keeps editable master templates.
- Maintenance check may use a separate shorter booking link after Session 4.

## Recommended booking architecture

### Event 1 — Free 15-Min First Step Call
Public Cal.com event. Fit/routing only.

### Event 2 — APC Home Implementation — Existing Clients
Private / unlisted Cal.com event.

Use for Sessions 1–4.

Suggested settings:
- 60 minutes
- online
- same direct link reused throughout programme
- phone number required
- email required
- no child name / diagnosis / school / sensitive booking notes
- booking instruction: "Please book only your next session, usually about two weeks after your current session."
- optional booking question: "Which session are you booking?" with Session 1 / 2 / 3 / 4

### Event 3 — APC Maintenance Check — Existing Clients
Private / unlisted event.

Use after Session 4 only.

Suggested duration: 20–30 minutes, according to the final service standard.

## Parent journey

1. Parent completes First Step Call where needed.
2. CJ confirms fit, scope, capacity and payment instructions.
3. After payment verification, CJ sends one onboarding message containing the private Home Implementation booking link.
4. Parent books Session 1.
5. After each session, the same private link remains in the Home Support Plan and "What We're Testing" card.
6. Parent books only the next session, usually about two weeks later.
7. Cal.com confirmation / reschedule link handles appointment changes.
8. After Session 4, CJ sends the separate maintenance-check link.

## Why same link

- no repeated manual link sending
- parent always knows where to book
- one event type keeps availability rules consistent
- rescheduling remains inside Cal.com
- easier to include in PDF materials and onboarding

## WhatsApp automation options

### Option A — Native Cal.com WhatsApp workflow
Cal.com supports WhatsApp workflow actions triggered by booking events. Current Cal.com help states WhatsApp workflow messages cannot currently be customized and use a predetermined default message.

Use this if the goal is simply an automated booking/reminder message and sender customization is not important.

### Option B — APC's own WhatsApp Business number via automation
Use Cal.com booking-created trigger / webhook -> Make or Zapier -> WhatsApp Business Cloud / WhatsApp Business.

This is the preferred architecture if CJ wants messages to come from APC's own registered WhatsApp Business sender and use APC-written confirmation copy.

Requirements may include:
- Meta Business Manager / WhatsApp Business Account
- registered WhatsApp Business sender
- recipient opt-in for service-related WhatsApp messages
- approved message template when required outside the 24-hour customer-service window
- international-format phone numbers

Do not assume the existing WhatsApp Business app number can be connected to Cloud API without checking the specific Meta / provider setup first.

## Proposed booking-confirmation WhatsApp copy

> Hi {first name}, your APC Home Implementation session is confirmed for {date} at {time}. You can use your Cal.com confirmation to reschedule if needed. Your private booking link for the next session is also included in your current Home Support Plan / What We're Testing card. Please avoid sending your child's full name, school or sensitive health details in booking notes.

Keep the confirmation logistical. Do not include case details.

## Consent wording for booking form

Working draft:

> By providing your mobile number, you agree to receive appointment and service-related WhatsApp messages from Autism Pathways Consulting. This is not marketing consent.

Verify final privacy / Meta wording before activating automated WhatsApp messages.

## Parent materials integration

The Home Support Plan and What We're Testing card should include:
- private booking link
- "book only your next 60-minute session"
- approximate two-week timing
- reschedule-via-Cal.com instruction
- privacy reminder not to enter child-identifying / sensitive details in booking notes

## Data-minimisation rule

Cal.com booking data should contain only what is needed to schedule:
- parent / caregiver name
- email
- mobile number
- session number if useful

Do not collect the child's name, diagnosis, school, detailed concern or case history in the booking form.
