# Audience pages and blog audit

Reviewed: 17 September 2026. Scope: the ten parent guides other than the previously approved KL/PJ places article; new parent and blog pages; the existing school page; public header navigation.

## Changes implemented

- `/parents`: a clear introduction to parent support, the established free call and paid offers, practical routes into relevant guides, scope and booking conditions.
- `/schools`: staff-training topics and possible formats, enquiry process, scope, FAQs and the existing contact details. The form now prepares a WhatsApp link and clearly asks the visitor to review and send it themselves. Submission does not claim delivery or send a message automatically.
- `/blog`: all 11 articles, organised by topic, with the existing places cover as the featured image.
- Services and Resources native disclosure menus on 31 public pages, with keyboard focus, Escape dismissal, outside-click dismissal and a mobile panel constrained to the header width. Navigation remains available without JavaScript.
- Ten guides retain their canonical URLs, main titles, author photos and the approved title, “Autism Educator & Founder of APC”. They now have compact mid-article and bottom CTAs, practical sections, optional supporting detail, visible referral guidance, references and an accurate review date.

## Substantive article findings and repairs

| Article | Material issue found | Repair |
| --- | --- | --- |
| Meltdowns | “Brain offline” language, a single build-up explanation and implied reliable improvement | Describe possible contributors, individual responses and safety; remove improvement promises; add professional-help guidance |
| After-school collapse | Home distress treated as proof of masking and safety at home | Identify the phrase as descriptive, consider alternatives and compare school/home observations; address safeguarding concerns directly |
| Mornings | Claims that committed chart use almost always works within two weeks; parental blame | Accessible formats, supported use, manageable steps and review without an improvement deadline |
| Communication | All behaviour assigned a communicative meaning; changes dismissed as not regression | Distinguish observation from interpretation, include AAC and a way to refuse; advise prompt review of lost established skills |
| Bedtime | Fixed routines presented as the main solution; advice to minimise returning regardless of requests | Consider multiple causes, respond to needs and distress, retain a sleep diary and add medical assessment signals; remove casual weighted-bedding advice |
| Mealtimes | Reassurance that most highly selective eaters sustain themselves; exposure framed as reliably effective | Protect accepted foods, make exploration optional and acknowledge nutritional risk, pain and swallowing concerns |
| Task initiation | Assumed willingness and a fixed two-minute support period | Check task difficulty, discomfort and understanding; adapt support, workload and stopping points |
| Screens | Escalation framed as testing boundaries; promised smaller reactions | Individual transition cues and review, safety during distress and explicit protection of AAC access |
| Echolalia | Repetition treated as evidence of understanding and a predictable development process | Multiple possible functions, cautious interpretation and communication/participation goals rather than reduced repetition |
| Public sensory overwhelm | All sensory input described as equally intense; bystander judgment dismissed as imagined | Individual sensory preferences, realistic preparation, optional roles, breaks and practical support for parents |

Examples are educational suggestions, not treatment protocols. Anecdotal efficacy claims were removed rather than presented as verified evidence. No experience-duration claim was added to these revised guides.

## Sources checked

- [NICE CG170 recommendations](https://www.nice.org.uk/guidance/cg170/chapter/recommendations), including assessment of contributing factors, sleep and restricted diets.
- [ASHA autism practice portal](https://www.asha.org/practice-portal/clinical-topics/autism/), including echolalia, individual communication assessment and caution about generalising developmental frameworks.
- [ASHA public AAC guidance](https://helpingyoucommunicate.org/article/augmentative-and-alternative-communication-aac).
- National Autistic Society guidance on [communication](https://www.autism.org.uk/advice-and-guidance/about-autism/autism-and-communication), [sensory processing](https://www.autism.org.uk/advice-and-guidance/about-autism/sensory-processing), [meltdowns](https://www.autism.org.uk/advice-and-guidance/behaviour/meltdowns/all-audiences), [eating](https://www.autism.org.uk/advice-and-guidance/behaviour/eating/all-audiences) and [sleep](https://www.autism.org.uk/advice-and-guidance/physical-health/sleep/parents).

The existing services page was the source of truth for prices, session lengths and booking conditions. No training price or accreditation was invented.

## Acceptance checks

- Build emits 118 allowlisted files; source and deployed bundle match.
- All eight existing site-build checks pass, including protected-route handling and asset-version checks.
- Five focused navigation/enquiry tests pass: disclosure dismissal and focus restoration, focus transitions, origin-aware current-page marking, encoded WhatsApp preparation with validation, and all 31 header instances.
- Static audit of all 13 new/revised content pages passes: one H1, canonical URL, unique IDs, valid JSON-LD, image dimensions/alt text, local links and fragments, sitemap inclusion and current asset hashes.
- Ten revised guides contain both author blocks, the exact approved title, two compact CTA areas, sources and visible review dates. Article structured data includes the same modification date and references. Existing section fragments remain available.
- No message, booking or payment was sent during testing.

Browser rendering, actual keyboard interaction in a browser, Lighthouse scores and authenticated Search Console data have not been verified in this session. The user requested their own browser, so checks use code, structural analysis and HTTP responses. No claim is made about AI-detection results, ranking, indexing or a numerical SEO score.

## High-impact next checks after release

1. In the user's own browser, check the Services and Resources menus at desktop and narrow mobile widths, then tab through and close each with Escape. Review the new page headings, card spacing and article sections.
2. Use the school's enquiry form with non-sensitive test text, confirm the prepared message in WhatsApp and close it without sending if testing only.
3. In the user's Search Console session, inspect `/blog`, `/parents` and `/schools`, verify their selected canonical URLs and check the submitted sitemap. Request indexing if appropriate; this does not guarantee inclusion or position.
4. Review search queries and article-to-enquiry journeys once enough real data is available. Prioritise useful content gaps and confusing routes over arbitrary SEO scores.
5. Recheck venue information when it changes, and review health-related wording and referral advice periodically against the linked primary guidance.
