# Public image-led visual pass, 23 September 2026

The main service routes retain their locked roles. Existing parent and programme imagery is preserved. Learning & Workshops gains a workshop concept hero and three image cards; Schools & Educator Training gains a classroom concept photograph; the planned course pages gain a study concept photograph. Start Here, Resources, APC Calm App and homepage cards have additional relevant imagery.

## Image provenance

Created with the built-in image generation tool, then exported as 480px and 960px WebP files. All images are illustrative concepts, not evidence of an actual APC event, venue, app interface or launched course. Captions retain that distinction. No new service availability, enrolment or payment claims were added.

| Assets (source and matching dist) | Prompt specification |
| --- | --- |
| learning-workshop-480.webp; learning-workshop-960.webp | Natural editorial 3:2 photograph of three adult Malaysian caregivers at a learning table, faces outside the crop; hands, cream notebook, sage/coral picture cards, teal linen binder, pencil and ceramic cup; warm daylight, oak and linen textures; no readable text, logos, children, badges or screens; concept workshop setting. |
| school-classroom-480.webp; school-classroom-960.webp | Natural editorial 3:2 photograph of an unoccupied inclusive primary classroom in Malaysia; shared oak table, simple visual next-step board, exercise book, pencils, teal pinboard, bookshelf and school chairs; cream/sage/coral palette and warm daylight; no people, readable text, logos, certificates or puzzle motifs; concept classroom rather than actual venue. |
| course-study-480.webp; course-study-960.webp | Natural editorial 3:2 photograph of quiet home learning; blank cream notebook, pencil, teal linen notebook, simple task/pause/next-step cards, tea cup, linen and laptop with screen facing away; warm oak and window light; no people, logos, readable text or invented course interface; concept setting rather than finished materials. |

Each 960px asset is under 72KB and each 480px asset is under 27KB. Explicit dimensions and responsive image sources reserve space and reduce transfer size. Below-fold card images are lazy-loaded. Decorative thumbnails use empty alt text; hero images have descriptive alt text.

## Acceptance checks

- Current main and PR head inspected before edits; non-force branch updates only.
- Exact source/dist parity for all public files, including six new WebP assets and the new stylesheet.
- Existing copy and interactions retained except descriptive image captions and alternative text.
- Responsive test coverage includes homepage, all four service routes, both course routes, Resources, Start Here and APC Calm App at 320, 390, 768 and 1440px.
- Live preview visual review checks hero proportions, card cropping, legibility, loaded images and service-status wording.
- Production merge remains a separate Founder decision.
