# Gates: APC audience page theme
OWNS: Parents, Schools and Services theme consistency
Scope: Unify visual language with the homepage; preserve approved support routes and school enquiries. Publish the existing review preview only.

- [x] G1: Visual consistency at the published preview
  CHECK: manual browser inspection of homepage and all three audience pages
  EXPECT: shared cream palette, serif headings, teal actions, consistent cards and footer; no desktop overflow or unloaded imagery
  EVIDENCE: Published implementation 8a2a7e62a95e1024568816459657412489222454 at https://bf37e27e.autism-pathways-consulting.pages.dev. Homepage and three audience routes inspected. All use DM Serif Display H1 and rgb(251, 248, 242) background, with no desktop overflow. Hero images loaded. Shared footer matches homepage HTML. Inspected offer cards, resources, process bands, school formats and enquiry layout. Repaired old Services 780px width restriction, dark-panel eyebrow contrast, card alignment and process-heading alignment.
- [x] G2: Navigation and interactions remain usable
  CHECK: manual browser inspection of links, disclosures, school topic/format selection, enquiry validation and booking loader
  EXPECT: correct destinations and state transitions without submitting a real enquiry or booking
  EVIDENCE: Browser checked Parents and Services offer disclosures and approved link destinations. Schools communication topic and Team discussion carry into enquiry, blank identity fields block preparation, valid name/school with no phone prepares review, editing removes stale send link. Classroom Transitions radio shows corresponding example. Services booking loader displays Cal.com calendar and available times. No message, booking or payment submitted. Tests cover navigation dismiss/focus behavior.
- [x] G3: Build and final regression pass
  CHECK: npm run build; node --test tests/site-build-output.test.mjs tests/audience-navigation.test.mjs tests/school-topic-journey.test.mjs tests/site-metrics.test.mjs; python -m unittest discover -s tests -p test_school_booking_handoff.py; git diff --check
  EXPECT: successful build, all 31 focused tests pass, clean diff, successful preview deployment and final rendered-page check
  EVIDENCE: Build emits 135 allowlisted files; 29 Node tests and 2 Python handoff tests pass. Source checks pass for unique IDs, one H1, local links/fragments, shared footer, stylesheet content version and no em dashes. git diff --check passes. Cloudflare Pages and pathways-qa succeeded for 8a2a7e6. Final rendered preview inspected after contrast/layout repairs. New stylesheet missing from committed dist was caught and corrected before final pass.

Limits: The browser environment has no viewport emulation. Real mobile and 200% zoom rendering are not included in the three checks. No production deployment or external form submission.

Completion status: PASS for all three defined checks. This is a reviewed preview, not a production release. Existing production migration and release gates remain outside this visual-theme task.

Final repair: scoped Services process-panel rules to Services so the school booking disclosure keeps its neutral background and readable text.

Final verification: implementation 2d0d0e35df063fcb4add000467343a022bb48523, preview https://c35e5cc0.autism-pathways-consulting.pages.dev. Schools booking disclosure opened in browser; dark teal summary and strong labels sit on the cream page with no overflow. Repaired section visually inspected. Cloudflare Pages and pathways-qa both succeeded. Build and all 31 focused tests rerun after this repair and pass.

## Follow-up audit: spacing and decision barriers
Scope: Homepage, Parents, Schools and Services. Retain offer facts and preview-only release.
- [x] A1: Reduce artificial space without clipping content; keep consistent typography and readable supporting text.
  EVIDENCE: Browser inspection on reviewed previews: homepage sections changed from 859px each to content-led 403-643px. Services comparison cards reduced from 668px to about 592px; aligned parent resource links; removed misleading hover lift on informational offer cards. Important school and parent notes enlarged; footer brand restored from 14.08px to 21.6px. Final action type is 15.36px, targets 48-50px. Four routes have no desktop horizontal overflow. Responsive breakpoint rules reviewed in source; real phone/zoom remains unverified.
- [x] A2: Each support route has an actionable next step; booking feedback does not imply loading forever.
  EVIDENCE: Homepage RM350 panel now has the existing WhatsApp request link and a separated 44px details link, with permission-before-payment conditions visible. Parents hero links to support options. Services FAQ correctly distinguishes direct RM350 requests from free-call routing. All homepage tabs exercised; only selected panel visible. Calendar loaded with corrected neutral status. School missing-name/school validation, message preparation and stale-message removal exercised without sending.
- [x] A3: Build and focused regression checks pass; inspect repaired pages in the published browser.
  EVIDENCE: Build emits 135 files; 29 Node plus 2 Python focused checks pass after repairs. Unique IDs, one H1, anchors, asset versions, no em dashes and git diff checks pass. Unrelated route HTML differences are cache-version updates only. Implementation ca5c2664b3e4e6aff1a4b917a5c0a40264ad1df4 deployed successfully at https://ae06aa80.autism-pathways-consulting.pages.dev; Cloudflare and pathways-qa pass. Final comparison cards rendered with stable transforms and consistent font size. No production change.
Known browser limit: phone, tablet and 200% zoom emulation remain unavailable. Source breakpoint review is not a rendered-device check.

## Parent Home Support wording and tactile artwork
Scope: Rename the public parent-support category, match the Schools material photography on homepage, Parents and Services, preserve approved offers and routes.
- [x] V1: Inspect artwork, hierarchy, spacing and loaded images on all four rendered pages.
- [x] V2: Verify the longer shared navigation label, support links and offer disclosures.
- [x] V3: Build, focused regression tests, asset references and published preview verification pass.

Evidence: Implementation c7143714071227d6e52f35e6a656b785f783aca3, reviewed at https://7b73c6b2.autism-pathways-consulting.pages.dev. Three coordinated still-life assets replace flat offer icons; home-routine hero replaces abstract path on homepage and Parents. School photograph used as the visual reference. Public category wording, metadata, breadcrumbs, all 31 shared headers and footers use Parent Home Support. Offer product names remain intact.
V1: Browser screenshots of all four page heroes and both offer grids inspected. Cream, teal, sage and coral materials have consistent light and texture. Card image frames measure 310 x 155px, aligned. Images loaded, one H1 per route, no desktop horizontal overflow at 1363px.
V2: Renamed dropdown fits and navigates; parent support anchor, session-details destination and parent/service disclosures exercised. The session link reaches /services#service-slide-session. Free-call and existing WhatsApp destinations retained. No external submission.
V3: Build emits 139 public files; 29 Node and 2 Python tests pass. Caught and repaired stale nested-page CSS versions and category labels. Headings, unique IDs, anchors, raster paths and no em dashes checked. Local tree 8c2d52140684d8cf0d0cca633f2d444537010386 exactly matches published implementation tree. Cloudflare and pathways-qa succeed.
Limits: Desktop visual check only. Phone/tablet/200% zoom unavailable in supported browser. New raster WebPs total 117158 bytes, lazy-loaded in offer cards. Review branch only; production unchanged.
