# Website visuals and SEO follow-through

17 September 2026. Scope: parents, schools and blog landing pages; topic illustrations on ten existing guides; training enquiry and social CTA preparation.

## Implemented visuals

- Parents: existing APC path illustration, with a caption explaining the practical support process. The main free-call link stays in the opening text, before the visual on mobile.
- Schools: CJ's existing portrait and a concise fictional classroom example: notice, ask, try and review. It communicates the approach without pretending to show an actual workshop or pupil case.
- Blog: ten consistent, small SVG topic illustrations. The existing places cover and venue photographs remain in their appropriate article.
- Guides: matching topic illustrations alongside the opening, with the approved wide headings retained.
- All ten new SVGs together total 4,781 bytes. They contain no scripts, links or embedded external assets. Decorative illustrations use empty alt text; CJ's portrait retains an accessible name. Dimensions reserve image space. Blog-card illustrations below the opening load lazily.

## Public technical SEO checks

Fresh HTTP checks of /parents, /schools and /blog returned 200. Each has one H1, the intended self-canonical URL, a description and parseable structured data. None of the three responses had a noindex meta tag or noindex response header.

robots.txt returned 200 and declares the production sitemap. sitemap.xml returned 200 and contains 26 URLs, including the three audience routes. Internal links and structured data are also checked in the local build.

These are technical crawlability checks, not proof that Google has crawled, indexed or ranked a page.

## Performance and Search Console limits

A mobile PageSpeed Insights API request for /parents returned HTTP 429 / RESOURCE_EXHAUSTED, with a daily quota error. No Lighthouse performance, accessibility, best-practices or SEO score was returned. The same failed request was not repeated for other pages or devices, and no score was inferred from source code.

The user's Google sign-in is in their own browser and is not accessible in this workspace. Search Console property access, submitted-sitemap status, selected canonicals, indexed URLs and search performance have not been checked or changed. A cloud browser was not used.

Own-browser links if required:

- https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fautismpathwaysconsulting.com%2Fparents&form_factor=mobile
- https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fautismpathwaysconsulting.com%2Fschools&form_factor=mobile
- https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fautismpathwaysconsulting.com%2Fblog&form_factor=mobile
- https://search.google.com/search-console

In Search Console, choose the verified APC property, inspect the three complete URLs, and check the submitted sitemap at https://autismpathwaysconsulting.com/sitemap.xml. Only request indexing after confirming the live page and canonical are correct. Do not assume that a request guarantees indexing.

## Contact routes

The existing focused enquiry test validates required-field handling and URL encoding and verifies that the form prepares a link rather than sending a message. Navigation dismissal/focus tests pass. Prior live link checks found the free-call calendar, Calm and WhatsApp reachable; Instagram redirected to sign-in. No calendar slot, booking, enquiry or message has been submitted.

## Drafts and remaining decisions

The companion training-and-social-draft.md consolidates the existing 90-minute workshop, enquiry replies, draft worksheets, quote structure and CTA map. It is not part of the public website build. Fees, format, group cap, dates and booking terms are not invented or published. No social profile or post has been changed.

The SVG illustrations were rasterised and visually inspected. Full desktop/mobile browser rendering and real browser interactions remain unverified because this session does not use the user's browser or a substitute cloud browser.

## References

- [Google PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started)
- [Google: request a recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [Google: helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

Quality is assessed through useful, accurate content, clear authorship and usable pages. AI-detector results or a promised ranking are not acceptance criteria.
