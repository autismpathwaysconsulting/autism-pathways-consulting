# APC website: working rules for this repo

Static HTML site for Autism Pathways Consulting (APC), founded by CJ Lim (MA Special and
Inclusive Education). No build step: edit HTML/CSS in place. The public-launch state is
`PREPARATION_NOT_LAUNCHED / NOT_AUTHORISED`. Production deployment, launch, merge, and marking
a draft PR ready for review require separate Founder authorization.

## Non-negotiable brand rules (apply to every change)
- **No em dashes anywhere, ever.** Use commas, colons, or full stops. Before committing, confirm zero em-dash characters remain in changed files (count must be 0).
- **No therapy-replacement, diagnosis, cure, "method/framework", or guaranteed-outcome language.**
  APC is parent education and structured parent support, not therapy, diagnosis, or treatment.
- Tone: warm, calm, practical. Card/guide titles use the parent's felt moment, not a clinical
  topic label.
- Scope line where relevant: "APC works with you, not instead of the therapists your child is already seeing."
- Parent-facing CTAs should route by readiness rather than forcing every parent through the same path:
  - **Unsure what support fits:** Free 15-Min First Step Call, Cal.com event `first-step-call`.
  - **One recurring concern:** Submit a Home Clarity Session booking request through the existing Cal.com `parent-strategy-session` flow. The Founder must confirm suitability and availability and give permission before payment. Do not require a First Step Call first when suitability and scope are already clear.
  - **Ready for structured Home Support:** Start with the Free 15-Min First Step Call so CJ can check whether the APC Home Support Programme is a good fit.
- Keep the Free 15-Min First Step Call clearly available for parents who are unsure and as the fit-check path for Home Support.
- Do not turn Home Support into unrestricted direct checkout or create a new intake form unless separately approved.

## Footer requirement (every parent-facing page)
- Scope disclaimer present, and the SSM line:
  `CJ Special and Inclusive Consultancy (003030209-T) · Reg. 201903282307`
- Main pages use the shared `.apc-footer` block (brand + Explore/Support/Contact columns + bottom bar).
  Guide pages use a minimal footer; both must carry scope + SSM.

## Founder-approved offer ladder, 25 Aug 2026
1. **Free 15-Min First Step Call**: fit check, no cost. Cal.com slug `first-step-call`.
2. **Home Clarity Session**: RM450, 60 minutes, Google Meet, one recurring parent concern,
   focused pattern review and one practical next step. Submit a booking request first. The Founder
   reviews suitability and availability and gives permission before payment. Pay only by approved
   APC payment methods, then submit payment proof if requested. The Founder verifies payment before
   manually confirming the booking and Google Meet details. A request or payment is not automatic
   booking confirmation. Cal.com slug remains `parent-strategy-session` until separately changed.
3. **APC Home Support Programme**: RM2,200, four 60-minute implementation consultations over approximately
   6–8 weeks. Includes a personalised Home Support Plan, bounded WhatsApp clarification related to the
   agreed plan, APC Parent Toolkit, short Parent Essentials micro-learning resources, a Keep-Going Plan,
   and one 30-minute follow-up check-in after the programme. The programme is for concerns that need
   implementation, review, and adjustment over time, not simply four consultations.
4. **Parent Review**: RM300, 30 minutes, for existing or past APC families who need focused help thinking
   through a new situation. Invitation or Founder approval only. It is not a substitute for a new Home
   Support Programme where broader implementation support is needed.

Do not add extra public tiers, memberships, unlimited messaging, large course bundles, or low-ticket
products without a validated demand signal and separate Founder approval. The Parent Essentials
component is a concise micro-library, not a four-week homework course.

## Offer positioning rules
- Core promise: practical autism support for the moments that are hardest at home.
- Lead with the parent's felt problem, then explain APC's role.
- APC sells interpretation, prioritisation, implementation support, and adjustment, not generic autism information.
- Distinguish the two main paid entry paths clearly:
  - Home Clarity Session: one recurring concern, understand the pattern, decide what to try next.
  - Home Support Programme: when the concern needs real-life implementation, review, and adjustment over time.
- Do not use fake scarcity, countdown timers, fabricated value totals, or guaranteed behaviour-change claims.
- Legitimate capacity language is permitted when true: APC works with a limited number of programme families at one time so there is enough capacity for preparation, review, and follow-through.
- Never discount automatically in response to hesitation. If the programme is too extensive for the concern, route to the Home Clarity Session instead.

## Brand standards
- Palette: dark teal `#073734`, teal `#2DD4BF`, coral `#E8997A`, sage `#6B9E7A`, cream `#FFF9F1` (note/callout boxes).
- Fonts as built: **DM Serif Display** (headings), **DM Sans** (body). Match the existing aesthetic.
- Primary logo: `apc-option-d-primary-logo.webp` (served as WebP; original `.png` kept as fallback).

## Visual and UX authority
- `DESIGN.md` is authoritative for visual and UX decisions. Future page work must follow it, preserve the funnel rules, begin mobile-first, and reduce unnecessary visual complexity rather than add it.

## Site conventions
- `/page.html` 308-redirects to extensionless `/page` (and `/index.html` → `/`). Canonical, `og:url`,
  and `sitemap.xml` all use the extensionless form. `pay/index.html` serves `/pay/`; `connect/index.html` serves `/connect`.
- Payment: `/pay/` (real page, filtered by approved offer amount); root `pay.html` redirects to it.
- Clean payment routes should redirect to the matching filtered view of `/pay/`.
- Brevo email capture: free parent guide (on `resources.html` + homepage card) and the course waitlist
  (`course-waitlist.html`) are separate Brevo forms. The course sales page is `/connect`.
- Booking is embedded inline via the Cal.com embed on `index.html`.
- The Services page uses direct CTA links:
  - Unsure parents: Free 15-Min First Step Call.
  - One recurring parent concern: Home Clarity Session booking request, subject to Founder suitability and availability confirmation before payment.
- Do not reintroduce the large inline Cal.com calendar on `services.html` unless separately approved.
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
