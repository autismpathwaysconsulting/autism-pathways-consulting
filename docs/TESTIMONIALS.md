# Adding parent testimonials

The homepage shows one featured parent account. Add at most two shorter, text-only testimonials beneath it when the wording and public use have been approved. Do not add empty cards or repeat the same photo. If more than three accounts are approved, put the rest on a separate stories page rather than lengthening the homepage section.

## Collect and approve

Keep the original message in a private client record, not this repository. Ask the parent to approve the exact excerpt, the level of attribution (for example, “APC parent, Malaysia”), and where it may appear. Ask separately before using any identifiable photo. Do not present a generated image as the family in the quote. Avoid promising that the same change will happen for another child.

For each approved quote, record privately:

- Exact original wording and approved public excerpt.
- Parent-approved attribution and permission date.
- Approved placement: homepage, another page, or both.
- Whether any contextual detail may be included.

## Homepage layout

The featured card retains its short exact excerpt and a disclosure containing the full approved account. Once another excerpt is available, add a `.home-testimonial-more` container after the featured `.apc-quote-visual` in `#parent-story`. Use one or two cards. The prepared CSS makes two columns on desktop and one on mobile. Each card needs a verbatim excerpt and approved attribution. Keep the quotation visible rather than hiding it in a carousel.

Example structure, using placeholders only in this internal instruction file:

```html
<div class="wrap home-testimonial-more" aria-label="More parent experiences">
  <figure class="home-testimonial-small">
    <blockquote>“[Exact approved excerpt]”</blockquote>
    <figcaption>[Approved attribution]</figcaption>
  </figure>
</div>
```

Never publish the placeholders. Run the site build, allowlist tests, and desktop and mobile visual checks before requesting a live release.
