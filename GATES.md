# Gates: APC audience page theme
OWNS: Parents, Schools and Services theme consistency
Scope: Unify visual language with the homepage; preserve approved support routes and school enquiries. Publish the existing review preview only.

- [ ] G1: Visual consistency at the published preview
  CHECK: manual browser inspection of homepage and all three audience pages
  EXPECT: shared cream palette, serif headings, teal actions, consistent cards and footer; no desktop overflow or unloaded imagery
  EVIDENCE: pending
- [ ] G2: Navigation and interactions remain usable
  CHECK: manual browser inspection of links, disclosures, school topic/format selection, enquiry validation and booking loader
  EXPECT: correct destinations and state transitions without submitting a real enquiry or booking
  EVIDENCE: pending
- [ ] G3: Build and final regression pass
  CHECK: npm run build; node --test tests/site-build-output.test.mjs tests/audience-navigation.test.mjs tests/school-topic-journey.test.mjs tests/site-metrics.test.mjs; python -m unittest discover -s tests -p test_school_booking_handoff.py; git diff --check
  EXPECT: successful build, all 31 focused tests pass, clean diff, successful preview deployment and final rendered-page check
  EVIDENCE: pending

Limits: The browser environment has no viewport emulation. Real mobile and 200% zoom rendering are not included in the three checks. No production deployment or external form submission.
