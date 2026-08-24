# APC UX and Visual Design Contract

This document is authoritative for visual and UX decisions across the Autism Pathways Consulting website. It governs future page design and refinement. It does not change the offer ladder, pricing, service labels, or funnel.

## 1. Experience and brand intent

Every parent-facing journey should help a parent move through this emotional sequence:

**confused -> understood -> calmer -> clear next step**

The experience should feel calm, modern, editorial, warm, premium, parent-centred, trustworthy, and uncluttered.

Avoid clinical hospital styling, SaaS dashboard styling, excessive cards, childish autism iconography, purposeless gradients, giant shadows, glassmorphism, decorative progress bars, aggressive sales patterns, fake urgency, autoplay animation, excessive rounded containers, and animation used only for decoration.

## 2. Information architecture

### One page, one primary job

| Page | Primary job |
| --- | --- |
| Homepage | Understand APC and choose a next step |
| Services | Choose Free, RM350, or RM1,800 support |
| Start | Route immediately |
| Payment | Complete an already-decided payment |
| Resources | Find useful support |
| About | Establish trust in CJ |
| Legal | Provide necessary detail |

Use progressive disclosure for secondary information. A page should reveal detail when it becomes useful, not present every available fact at once.

Critical decision conditions must remain visible. Never hide them in accordions or behind optional interactions. These include:

- RM1,800 requires fit confirmation.
- RM350 booking requests can be submitted without a First Step Call when the scope is clear, but Founder suitability and availability permission is required before payment.
- APC provides parent education and structured parent support, not diagnosis or therapy.

## 3. Mobile-first design

The primary design viewport is **390 x 844 px**. Start layout and content decisions there, then expand the same hierarchy for larger screens.

- Prevent horizontal overflow.
- Make content easy to scan and operate with one hand.
- Give interactive controls a minimum 44 px target, with 46 px or more preferred.
- Avoid very tall cards and endless stacks of cards.
- Keep decision cards to roughly three key points at most.
- Preserve comfortable vertical rhythm.
- Do not repeat calls to action on every screen.
- Keep paragraphs within a readable mobile measure.

Desktop expands the mobile information hierarchy. Extra space is not a reason to add unnecessary information.

## 4. Typography

Use **DM Serif Display** for primary headings and **DM Sans** for body copy, controls, and supporting text. Do not introduce unrelated font families.

Headings should be editorial, expressive but restrained. Use a strong scale difference, short line lengths, and `text-wrap: balance` where supported and appropriate.

Body copy should use an effective reading size of 16 to 18 px, generous line-height, and short paragraphs. Keep desktop reading measure around 60 to 75 characters, normally within 620 to 700 px. Use `text-wrap: pretty` as a progressive enhancement for prose where it improves wrapping.

## 5. Colour

The APC palette is fixed:

| Role | Value |
| --- | --- |
| Dark teal | `#073734` |
| Primary teal | `#0F766E` |
| Bright teal | `#2DD4BF` |
| Cream | `#FFF9F1` |
| Warm off-white | `#F8F5EF` |
| Coral | `#E8997A` |
| Sage | `#6B9E7A` |
| Primary text | `#253532` |
| Muted text | `#5B6B68` |

Use dark and primary teal as the main interface colours. Use coral and sage only as small accents. Avoid multicolour interfaces. Colour must retain appropriate contrast and must not be the only way meaning is communicated.

## 6. Layout and rhythm

Use a primary content width of approximately 1080 to 1120 px and a readable text width of approximately 620 to 700 px.

Prefer whitespace, alternating visual rhythm, considered asymmetry, and editorial image with text compositions. Do not place every section inside a card, centre every paragraph, or make every section visually identical.

Spacing should follow shared design tokens. Section spacing may compress on small screens, but relationships between headings, copy, controls, and sections should remain clear.

## 7. Cards

Use cards when a parent needs to choose, compare, pay, interact, or distinguish grouped information. Ordinary explanatory prose should usually be a heading, short text, and whitespace.

Future page refinements should aim for roughly 30 to 50 percent fewer visible cards on current long pages. This is a directional reduction, not permission to remove information needed for a decision.

## 8. Call-to-action hierarchy

Use only three interaction levels:

1. **Primary:** solid primary teal.
2. **Secondary:** outlined or visually quiet.
3. **Text action:** simple teal text or link treatment.

Most sections should not have their own button. A long page may use one primary call to action near the top, one relevant action around the middle, and one final call to action. Avoid constant repetition.

Button labels must describe the next step clearly. Visual styling must not imply urgency that does not exist.

## 9. Motion

Motion must clarify interaction or add subtle polish.

Allowed motion includes:

- Hover and focus transitions from 120 to 220 ms.
- A button lift of 1 to 2 px.
- Subtle opacity and translate reveals for key content.
- Gentle page-state transitions when browser-native and safe.
- Accordion transitions where a native implementation supports them cleanly.

Prefer animating `opacity` and `transform`. Avoid bouncing, large spring movement, parallax on parent-support content, spinning, continuous loops, or motion required to understand content.

Respect `prefers-reduced-motion`. When reduced motion is requested, remove nonessential transitions and reveals. Do not add a JavaScript animation library for APC v1.

## 10. Modern CSS

Prefer current native CSS when browser support and fallbacks are sensible:

- `text-wrap: balance` and `text-wrap: pretty`.
- Container queries when a component genuinely needs them.
- `content-visibility` only for meaningfully long below-fold content, with appropriate intrinsic sizing.
- `:focus-visible` for clear keyboard focus.
- `prefers-reduced-motion` for motion preferences.
- Grid and flexbox for layout.
- Native `details` and `summary` for appropriate progressive disclosure.

Enhancement must be progressive. Do not add a feature simply because it is new.

## 11. Accessibility

Visual polish must never reduce accessibility. Preserve semantic heading order, keyboard navigation, skip links, visible focus, appropriate contrast, meaningful link and button labels, adequate touch targets, useful alt text, and accessible accordion semantics.

Core content and critical decisions must remain understandable without motion, colour, hover, or JavaScript enhancement.

## 12. Copy design

UI copy should be short, calm, concrete, parent-facing, and non-clinical unless technical language is necessary.

- Express one idea per paragraph.
- Use no more than three bullets in a decision card where possible.
- Ask: "Can this be said in half as many words without losing meaning?"
- Avoid repeating the same APC philosophy across multiple sections.
- Name parent-facing cards and guides by the parent's felt moment rather than a clinical topic label.

## 13. Funnel contract

The funnel is locked:

| Parent's situation | Required route |
| --- | --- |
| Unsure | Free 15-Min First Step Call |
| One focused parent concern | Submit an RM350 One-Concern Parent Session booking request; Founder review and permission are required before payment. |
| Structured ongoing support | Free 15-Min First Step Call first, CJ confirms fit, then RM1,800 APC Home Support Programme payment |

Do not alter this routing during visual redesigns. The RM350 booking-request route remains directly available without a First Step Call when the scope is clear. A request is not automatic confirmation, and Founder suitability and availability permission is required before payment. The RM1,800 programme is not an unrestricted direct-checkout offer.

Where scope clarification is relevant, use: "APC works with you, not instead of the therapists your child is already seeing."

## 14. Page-length guidance

Directional targets for mobile:

| Page | Meaningful screens |
| --- | ---: |
| Start | 2 to 3 |
| Homepage | 6 to 10 |
| Services | 6 to 10 |
| Filtered payment | 5 to 8 |
| About | 5 to 7 |
| Resources | May be longer, with categorisation and progressive disclosure |

These are UX targets, not fixed pixel assertions. If a page materially exceeds its range, document why the additional content is necessary for the page's primary job.

## 15. Design-system governance

`apc-design-system.css` is the shared implementation layer for this contract. It should provide typography, spacing, width, radius, shadow, interaction, focus, motion, and colour tokens without becoming a second page-specific stylesheet.

Future changes must:

- Follow this contract.
- Preserve the funnel and locked offer ladder.
- Begin with the 390 x 844 px mobile viewport.
- Reduce unnecessary visual complexity rather than add it.
- Use progressive enhancement and retain accessible fallbacks.
- Keep page-specific exceptions small and justified.

When an existing page conflicts with this contract, update the page in a separately scoped task. Do not silently weaken the contract to match legacy styling.
