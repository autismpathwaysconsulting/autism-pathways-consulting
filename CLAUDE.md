# APC website: working rules for this repo

Static HTML site for Autism Pathways Consulting (APC), founded by CJ Lim (MA Special and
Inclusive Education). Deployed via GitHub → Cloudflare Pages at autismpathwaysconsulting.com.
No build step: edit HTML/CSS in place. Work directly on `main`; pushing auto-deploys to production.

## Non-negotiable brand rules (apply to every change)
- **No em dashes anywhere, ever.** Use commas, colons, or full stops. Before committing, confirm zero em-dash characters remain in changed files (count must be 0).
- **No therapy-replacement, diagnosis, cure, "method/framework", or guaranteed-outcome language.**
  APC is parent education and structured parent support, not therapy, diagnosis, or treatment.
- Tone: warm, calm, practical. Card/guide titles use the parent's felt moment, not a clinical
  topic label (e.g. "When the meltdown comes out of nowhere", not "Meltdowns at home").
- Scope line where relevant: "APC works with you, not instead of the therapists your child is already seeing."
- Parent-facing CTAs should route by readiness rather than forcing every parent through the same path:
  - **Unsure what support fits:** Free 15-Min First Step Call (Cal.com event `first-step-call`).
  - **One clear repeated concern:** Apply for a One-Concern Parent Session through the existing Parent Intake Form. Do not require a First Step Call first.
  - **Ready for structured support:** Apply for APC Home Support through the existing Parent Intake Form. Do not require a First Step Call first.
- Keep the Free 15-Min First Step Call clearly available for parents who are unsure. Do not make it a mandatory gate for RM350 or RM1,800 support.
- RM350 and RM1,800 applications remain subject to APC fit review. Do not turn these into unrestricted payment or self-booking flows unless separately approved.

## Footer requirement (every parent-facing page)
- Scope disclaimer present, and the SSM line:
  `CJ Special and Inclusive Consultancy (003030209-T) · Reg. 201903282307`
- Main pages use the shared `.apc-footer` block (brand + Explore/Support/Contact columns + bottom bar).
  Guide pages use a minimal footer; both must carry scope + SSM.

## Locked offer ladder (use exactly, no variations)
1. **Free 15-Min First Step Call**: fit check, no cost. Cal.com slug `first-step-call`.
2. **One-Concern Parent Session**: RM350, 45 min online, one repeated concern, focused pattern
   review, one practical next step. Cal.com slug `parent-strategy-session` (slug unchanged; label is "One-Concern").
3. **APC Home Support Programme**: RM1,800, four sessions once every two weeks, personalised Home
   Support Plan, WhatsApp clarification throughout, plus one check-in about a month after the final session.

**Never reintroduce these dropped offers:** RM950 / 3-Session Starter Pack, RM2,500 / Comprehensive,
Quick Clarity, Full Implementation, Intensive, Progress Check Call, Parent Strategy Session, Focused Parent Support.

## Brand standards
- Palette: dark teal `#073734`, teal `#2DD4BF`, coral `#E8997A`, sage `#6B9E7A`, cream `#FFF9F1` (note/callout boxes).
- Fonts as built: **DM Serif Display** (headings), **DM Sans** (body). Match the existing aesthetic.
- Primary logo: `apc-option-d-primary-logo.webp` (served as WebP; original `.png` kept as fallback).

## Site conventions
- `/page.html` 308-redirects to extensionless `/page` (and `/index.html` → `/`). Canonical, `og:url`,
  and `sitemap.xml` all use the extensionless form. `pay/index.html` serves `/pay/`; `connect/index.html` serves `/connect`.
- Payment: `/pay/` (real page, supports `?s=350` / `?s=1800`); root `pay.html` redirects to it.
- Brevo email capture: free parent guide (on `resources.html` + homepage card) and the course waitlist
  (`course-waitlist.html`) are separate Brevo forms. The course sales page is `/connect`.
- Booking is embedded inline via the Cal.com embed on `index.html` and `services.html` (no click-out).
- Custom `404.html` + `_redirects` (`/* /404.html 404`). Accessibility baseline: `<style id="apc-a11y">`,
  a skip link, and `id="main-content"` on each `<main>` already exist on live pages; do not re-add.

## Images
- Convert inline-rendered rasters to WebP; keep originals as fallback. **Encode with Python Pillow**
  (`Image.open(x).save(y,"WEBP",quality=90,method=6)`) because `sips` can read but not write WebP here.
- Keep `og-image.png` and the JSON-LD `"logo"` as PNG (social scrapers / structured data).

## Workflow
- Verify edits with `grep -c` before committing. Confirm em-dash count is 0.
- Commit messages: **no AI attribution lines.** Push: `git add <files>` → `git commit` → `git push origin main`.
- Do not edit or commit `_backup_*/`, `_local_backups/`, `backups/`, or `.claude/` (all gitignored;
  historical snapshots / local dev config).
- Local preview: serve with Node (`.claude/static-server.js` on :8899); `python3 -m http.server` is sandbox-blocked.
