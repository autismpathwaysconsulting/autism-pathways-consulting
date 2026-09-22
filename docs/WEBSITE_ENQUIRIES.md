# Website enquiries, 8 September 2026

User requested the complete booking test and privacy-conscious conversion tracking.

The counters at `/content-os/website/` use existing Content OS authentication. The separate `apc-site-metrics` D1 database contains daily counts only; it never uses client records or episode analytics. Its migration directory is `site-metrics-migrations`. Production alone binds this database. Preview traffic is not counted.

Metrics cover Home, Services, Start Here, About and Resources. They count page views, booking link clicks, calendar load requests, and successful new submissions from Cal.com's documented `bookingSuccessfulV2` embed event. Callbacks discard the complete event payload. They do not count confirmation-page visits as bookings. Direct Cal.com completions cannot be attributed by this tracker. Cal.com remains the booking source of truth.

Counters are per page load, not unique people. Refreshes count again; repeated actions within one page load do not. No visitor identifier or cross-page attribution is created. DNT and GPC opt-outs are respected. The request body accepts only enumerated page and action fields and is capped at 128 bytes. Credentials and referrers are omitted by the client. The database has no IP, user-agent, contact, booking-ID or form-answer fields. Cloudflare still processes network information as the hosting provider.

Counts are indicative, browser-reported activity, and can be affected by blockers or automated requests. Do not use them as verified bookings, revenue or a matched conversion rate. Daily totals are UTC and expire after 90 days on the next incoming event. No historical traffic is invented.

## Booking settings inspected

- First Step Call event ID 5641724; free 15-minute phone call, Asia/Kuala Lumpur.
- Default attendee confirmations enabled.
- Custom `Booking Confirmation - First Step Call` workflow 372073 also enabled on this one event, triggered when a new event is booked. Its subject and body say Reminder, so a new booking is configured to receive a duplicate reminder-style message.
- Workflow 344172 sends attendee email 24 hours before an event and is shared across four events.
- Attendee cancellation and rescheduling are enabled.
- Custom post-booking redirect is upgrade-gated. The static APC confirmation URL does not prove booking completion.
- The booking form requires phone, email, child age, main concern and what usually happens. Child questions add friction to the stated fit-and-routing scope.
- The live test reached the form for 10 September, 21:30 Malaysia time. Submission requires email verification and explicitly accepts Cal.com terms. No test booking was submitted, so email delivery, reminder execution, rescheduling and cancellation are not claimed as tested.

## Operation and rollback

Run `node --test tests/site-metrics.test.mjs` and the existing build and authority checks. Apply only the separate metrics migration with `npx wrangler d1 migrations apply apc-site-metrics --env production --remote` before deploying.

To stop collection, revert this release through a PR or remove its production `APC_SITE_METRICS_DB` binding and deploy. An unavailable collector never blocks navigation or booking. Retain the separate database for recovery; no client or episode database migration is involved.

References: https://cal.com/help/embedding/embed-events and https://developers.cloudflare.com/d1/worker-api/prepared-statements/.
