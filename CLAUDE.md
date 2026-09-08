# APC website: working rules for this repo

Static HTML site for Autism Pathways Consulting (APC), founded by CJ Lim (MA Special and
Inclusive Education). Edit HTML/CSS in place, then run the allowlisted `npm run build` release step. The public-launch state is
`PREPARATION_NOT_LAUNCHED / NOT_AUTHORISED`. Production deployment, launch, merge, and marking
a draft PR ready for review require separate Founder authorization.

APC-AI-OS is the canonical offer authority. The locked offer facts below are operational
instructions derived from that source together with the Founder-approved 2026-09-03 international
payment and Home Support clarification. `tests/website_authority.json` is a non-authoritative
derived mirror and website projection that must pass exact provenance and hash validation. Change its projected facts
only when the Founder has given an explicit instruction, then update its projection hash.

This branch is an `INTERIM_RISK_CONTAINMENT_PROJECTION_ONLY`. Authority version 1.2 remains
`CANDIDATE`; public launch, deployment, publication, live booking or payment changes, and canonical
promotion remain unauthorised. OPS-HOLD-001 through OPS-HOLD-006 remain open. The containment
projection may reduce public risk but cannot approve an offer, close a hold, or grant payment permission.

## Non-negotiable brand rules (apply to every change)
- **No em dashes anywhere, ever.** Use commas, colons, or full stops. Before committing, confirm zero em-dash characters remain in changed files (count must be 0).
- **No therapy-replacement, diagnosis, cure, "method/framework", or guaranteed-outcome language.**
  APC is parent education and structured parent support, not therapy, diagnosis, or treatment.
- Tone: warm, calm, practical. Card/guide titles use the parent's felt moment, not a clinical
  topic label (e.g. "When the meltdown comes out of nowhere", not "Meltdowns at home").
- Scope line where relevant: "APC works with you, not instead of the therapists your child is already seeing."
- Parent-facing CTAs should route by readiness rather than forcing every parent through the same path:
  - **Unsure what support fits:** Free 15-Min First Step Call (Cal.com event `first-step-call`).
  - **One focused parent concern:** The One-Concern Parent Session has no public paid booking route. The Founder must confirm suitability, capacity, and availability and give explicit written permission before payment.
  - **Ready for structured Home Support:** Start with the Free 15-Min First Step Call so CJ can check whether the RM1,800 APC Home Support Programme is a good fit.
- Keep the Free 15-Min First Step Call clearly available for parents who are unsure and as the fit-check path for Home Support.
- Do not turn Home Support into unrestricted direct checkout or create a new intake form unless separately approved.

## Footer requirement (every parent-facing page)
- Scope disclaimer present, and the SSM line:
  `CJ Special and Inclusive Consultancy (003030209-T) · Reg. 201903282307`
- Main pages use the shared `.apc-footer` block (brand + Explore/Support/Contact columns + bottom bar).
  Guide pages use a minimal footer; both must carry scope + SSM.

## Locked offer ladder (use exactly, no variations)
1. **Free 15-Min First Step Call**: fit check, no cost. Cal.com slug `first-step-call`.
2. **One-Concern Parent Session**: RM350, 45 minutes online, one repeated concern,
   focused pattern review, one practical next step. Submit a booking request first. The Founder
   reviews suitability, capacity, and availability and gives individual permission before payment.
   Public pages must not expose account details, a payment QR, or a direct payment route. The Founder
   sends local clients the current Maybank bank transfer or DuitNow QR details privately after permission.
   International clients receive Wise bank-transfer details privately after permission. The Founder receives
   payment proof, verifies payment, and manually confirms the booking details. A
   request, payment, or proof is not automatic booking confirmation. Cal.com slug
   Do not publish or link the paid `parent-strategy-session` event while containment is active.
3. **APC Home Support Programme**: RM1,800, four 60-minute sessions over approximately six to eight
   weeks, personalised Home Support Plan, bounded weekly parent updates and WhatsApp clarification
   during the active programme, final written plan or summary, and no additional post-programme
   check-in. There is no unlimited messaging.

Paid support is not an unrestricted public checkout. Every request remains subject to individual
Founder suitability, capacity, and availability review and written permission before payment.
International clients may be accepted for online support. Local payment uses Maybank business-account
transfer or DuitNow QR, and international payment uses bank transfer through Wise. Current details are
sent privately only after permission.

**Never reintroduce these dropped offers:** RM950 / 3-Session Starter Pack, RM2,500 / Comprehensive,
Quick Clarity, Full Implementation, Intensive, Progress Check Call, Parent Strategy Session, Focused Parent Support.

## Brand standards
- Palette: dark teal `#073734`, teal `#2DD4BF`, coral `#E8997A`, sage `#6B9E7A`, cream `#FFF9F1` (note/callout boxes).
- Fonts as built: **DM Serif Display** (headings), **DM Sans** (body). Match the existing aesthetic.
- Primary logo: `apc-option-d-primary-logo.webp` (served as WebP; original `.png` kept as fallback).

## Visual and UX authority
- `DESIGN.md` is authoritative for visual and UX decisions. Future page work must follow it, preserve the funnel rules, begin mobile-first, and reduce unnecessary visual complexity rather than add it.

## Site conventions
- `/page.html` 308-redirects to extensionless `/page` (and `/index.html` → `/`). Canonical, `og:url`,
  and `sitemap.xml` all use the extensionless form. `pay/index.html` serves `/pay/`; `connect/index.html` serves `/connect`.
- Payment safety notice: `/pay/` is informational only and exposes no payment instructions, account
  details, QR asset, receipt-submission CTA, or selector. Root `pay.html`, `/pay/350`, and `/pay/1800`
  redirect to that same containment notice. Individual payment details are sent privately by the
  Founder only after permission.
- Brevo email capture: free parent guide (on `resources.html` + homepage card) and the course waitlist
  (`course-waitlist.html`) are separate Brevo forms. The course sales page is `/connect`.
- Booking embeds the public Free 15-Min First Step Call Cal.com event inline on `index.html` and
  `services.html`. Other parent-facing pages may link to the same free event.
- The Services page uses the Free 15-Min First Step Call as its primary CTA. Paid support remains
  subject to Founder suitability, capacity, and availability confirmation and written permission before payment.
- `apc-design-system.css` is the authoritative shared visual layer for the main parent-facing pages. Load it after page-specific styles so its tokens and consistency overrides apply last.
- Custom `404.html` + `_redirects` (`/* /404.html 404`). Accessibility baseline: `<style id="apc-a11y">`,
  a skip link, and `id="main-content"` on each `<main>` already exist on live pages; do not re-add.

## Images
- Convert inline-rendered rasters to WebP; keep originals as fallback. **Encode with Python Pillow**
  (`Image.open(x).save(y,"WEBP",quality=90,method=6)`) because `sips` can read but not write WebP here.
- Keep `og-image.png` and the JSON-LD `"logo"` as PNG (social scrapers / structured data).

## Workflow
- Verify edits with `grep -c` before committing. Confirm em-dash count is 0.
- Commit messages: **no AI attribution lines.** Push only the authorized review branch normally,
  without force. Do not push to `main`, merge, mark a draft PR ready, deploy, or launch without
  separate Founder authorization.
- Do not edit or commit `_backup_*/`, `_local_backups/`, `backups/`, or `.claude/` (all gitignored;
  historical snapshots / local dev config).
- Local preview: serve with Node (`.claude/static-server.js` on :8899); `python3 -m http.server` is sandbox-blocked.
