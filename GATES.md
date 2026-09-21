# Gates: APC audience page theme
OWNS: Parents, Schools and Services theme consistency
Scope: Unify visual language with the homepage; preserve approved support routes and school enquiries. Publish the existing review preview only.

- [ ] G1: Visual consistency at the published preview
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

Completion status: Final school disclosure repair awaiting published recheck. This is a reviewed preview, not a production release. Existing production migration and release gates remain outside this visual-theme task.

Final repair: scoped Services process-panel rules to Services so the school booking disclosure keeps its neutral background and readable text.
