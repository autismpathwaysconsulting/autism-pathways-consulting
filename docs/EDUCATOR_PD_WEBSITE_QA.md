# APC Educator PD Website QA Checklist

Use before merging PR #71 and again after deployment.

## 1. Claims and scope

- [ ] No claim of speech-language therapy, language therapy, diagnosis, psychology, medical or crisis services.
- [ ] No claim that APC is a therapy clinic.
- [ ] No claim that Hanen participants become Hanen-certified providers.
- [ ] No claim that SCERTS training makes CJ an official SCERTS trainer/certifier.
- [ ] No HRD Corp claimability claim.
- [ ] No KPM recognition/accreditation claim.
- [ ] No MQA / university-credit claim.
- [ ] No guaranteed child developmental or behavioural outcome.
- [ ] Hanen programmes are clearly identified as early-childhood educator programmes, not autism-specific programmes.
- [ ] APC autism-specific support is clearly separated from Hanen programmes.

## 2. Credential accuracy

- [ ] MA Special and Inclusive Education wording accurate.
- [ ] Learning Language and Loving It™ Certified Member wording accurate.
- [ ] ABC and Beyond™ Certified Member wording accurate.
- [ ] Teacher Talk™ licence described as arising from LLLI certification.
- [ ] Teacher Talk™ full series listed as 22.5 PD hours only where appropriate.
- [ ] SCERTS described only as professional-development training.
- [ ] SPARK not presented as a public clinical service.

## 3. Hanen/IP safety

- [ ] No member-only Hanen slides reproduced publicly.
- [ ] No embedded Hanen training videos reproduced publicly.
- [ ] No proprietary Hanen handouts made downloadable publicly.
- [ ] No adapted Hanen curriculum represented as APC's own course.
- [ ] No unauthorized Hanen logo use added.
- [ ] Programme names include correct ™ / ® styling where applicable.
- [ ] Participant certificate wording remains noncommittal until Hanen replies.

## 4. Privacy and safeguarding

- [ ] School enquiry form explicitly asks users not to include identifiable student information.
- [ ] Form does not ask for child name, diagnosis, DOB, school ID or medical details.
- [ ] WhatsApp message contains only organisation-level enquiry fields unless user voluntarily adds more.
- [ ] Privacy policy already covers enquiries/contact data.
- [ ] LLLI/ABC video feedback is not advertised for paid delivery until consent/storage/deletion procedure is ready.

## 5. UX desktop

- [ ] Hero is readable without horizontal scrolling.
- [ ] Primary CTA jumps to School Enquiry.
- [ ] Secondary CTA jumps to programme options.
- [ ] Three Hanen programme cards render correctly.
- [ ] Autism-specific APC cards render correctly.
- [ ] Trainer credentials are readable.
- [ ] Scope/transparency panel is not visually hidden.
- [ ] Enquiry form labels are visible.
- [ ] Footer links work.

## 6. UX mobile

Test at approximately 390px width.

- [ ] Header fits without overlap.
- [ ] Navigation remains usable.
- [ ] Hero buttons become full width without clipping.
- [ ] Programme cards stack correctly.
- [ ] Five-step implementation sequence stacks correctly.
- [ ] Trainer/scope columns stack correctly.
- [ ] Form fields stack to one column.
- [ ] Text is readable without zoom.
- [ ] No horizontal scroll.

## 7. Enquiry flow

Use synthetic organisation data only.

- [ ] Complete the form.
- [ ] WhatsApp opens successfully.
- [ ] Message includes name, organisation, role, team size, contact, interest and need.
- [ ] No duplicate submission behaviour.
- [ ] Success message appears.
- [ ] Back/reload does not expose sensitive information in URL parameters.

## 8. SEO/share preview

- [ ] Page title: Professional Development for Schools & Educators | Autism Pathways Consulting.
- [ ] Meta description accurately describes educator PD/implementation support.
- [ ] OpenGraph title/description match the new service.
- [ ] Social preview image works.
- [ ] Canonical remains `/schools`.
- [ ] Structured data describes professional development / educational consultation, not therapy.

## 9. About page regression

- [ ] Parent route still works.
- [ ] Schools & PD route works.
- [ ] Credentials are accurate.
- [ ] Parent support is explicitly APC-owned and separate from Hanen educator programmes.
- [ ] No previous useful scope disclaimer was accidentally lost.

## 10. Post-deploy smoke test

- [ ] `https://autismpathwaysconsulting.com/schools` returns 200.
- [ ] `https://autismpathwaysconsulting.com/about` returns 200.
- [ ] Mobile layout visually checked.
- [ ] School enquiry WhatsApp flow tested once with synthetic data.
- [ ] No console/runtime errors visible during basic navigation.
- [ ] Parent `/services` route remains unchanged and functional.
- [ ] Pathways Lab release is unaffected.

## Release rule

Do not merge/deploy solely because the copy is ready. Merge only after the visual preview and synthetic enquiry smoke test pass.
