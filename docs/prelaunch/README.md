# Programme interest package

Prepared for CJ's approved five-part prelaunch task. This change does not publish a programme, confirm a TASK partnership, open bookings or enable payments.

## Included

1. `/programmes`: one parent-facing page for Community Crew, Everyday Money and Community Adventure Camp. Community Crew is first to develop; Saturday is provisional.
2. One household interest form with multiple interests, one first choice, age bands, town, Saturday and accompanying-adult availability. Phone and a private support conversation are optional. No child name, diagnosis, medical history or full address is requested.
3. On-screen receipt after database acceptance and `/content-os/programmes/`, protected by existing Content OS authentication. Homepage discovery and a private-dashboard link are included.
4. The separately supplied five-page Saturday scouting pack includes observation records, host questions, staffing responsibilities, coaching activities and proceed/adapt/postpone criteria.
5. The separately supplied one-page partner brief can be taken to a scouting discussion. It makes no confirmed-partner or launch claims.

## How interest is counted

One case-insensitive email address has one record. A repeated anonymous submission receives the same acknowledgement but cannot overwrite the original answers or consent. A person cannot discover whether another email already exists. To change an entry, CJ verifies the request, deletes the old record and invites a fresh submission. This preserves explicit consent rather than inferring it.

Two adult email addresses can belong to the same household. CJ confirms the adult contact, current interest and household uniqueness before marking one record verified. Mark the other duplicate. New and contacted records are not verified households. Only verified records contribute to programme demand totals. Multiple programme totals overlap; first-choice counts provide the prioritisation measure. Verification does not establish suitability for a project.

Future updates require both verified status and update permission and must relate only to selected programmes. This package sends no email or WhatsApp messages automatically. Enquiry responses can be handled individually by CJ. Never use a group chat that exposes parent contact details without separate agreement.

CJ reviews the list monthly, handles access/correction/removal requests from the registered address and deletes expired or withdrawn records. Records older than 180 days are also removed on a new submission or tracker visit. Open the tracker during a monthly review even without new submissions. Do not put private child information in the tracker, issue tracker, source repository or test fixtures.

## Infrastructure and activation

The feature is deliberately disabled in every committed environment. Missing configuration fails closed, the form says it is not open and does not claim a save.

After separate Founder release authorization and resolution of release checks:

1. Check the applied migration history and back up the existing D1 database. Apply only the new reviewed `migrations/0012_programme_interest.sql` to the existing `APC_CONTENT_OS_DB` binding. Do not blindly apply other pending migrations from unrelated work.
2. Create or approve a Turnstile widget for the intended production hostname. Set `APC_PROGRAMME_TURNSTILE_SITEKEY` and the server-only secret `APC_PROGRAMME_TURNSTILE_SECRET` in the correct environment. Never commit a secret. Test environments need their own database and approved hostname; do not bind a public preview to production family data.
3. Confirm existing Content OS authentication, authorised reviewers and the bilingual notice, including Cloudflare processing and the 180-day review practice. This technical package is not a legal compliance opinion.
4. Run the repository build and relevant tests, review the rendered page, and deploy only with Founder authorization. Enable `APC_PROGRAMME_INTEREST_ENABLED=true` only when database and Turnstile checks are ready. The public API validates the token's hostname and `programme-interest` action server-side.
5. With authorised synthetic details, submit once through real Turnstile, confirm one stored record privately, try the same email again, verify no double count and delete the test record. Confirm unauthenticated users cannot read `/api/content-os/programmes` or the private page. Only then share the interest link.

If capture fails, disable the feature flag, keep the contact fallback and investigate without logging submitted personal information. Do not delete legitimate interest records during rollback. The new table is independent of existing practice records.

## Verification evidence

Local API tests cover accepted storage, all three interests in one record, separate update opt-in, duplicate protection, validation, cross-origin rejection, disabled/missing configuration, failed security checks, storage failure, private authentication, review changes, deletion and retention.

The local browser test uses real HTTP handlers and SQLite with synthetic data, and simulates only the Turnstile provider. It covers 390px mobile and 1440px desktop layout, a failed save retaining answers, successful receipt, private tracker counts, verification, deletion and the no-JavaScript contact fallback. It does not certify real Turnstile, Cloudflare deployment or production storage.

Commands:

```sh
node --test tests/programme-interest.test.mjs tests/audience-navigation.test.mjs
npm run build
npm run test:site-build
python3 tests/validate_website_authority.py
```

The added GitHub workflow runs a full build and browser tests without publishing anything. Browser QA output contains synthetic records only.

## Authority review remains a release condition

The existing authority validator reports `authority.executable_javascript_forbidden` for the public interest handler, shared validation module, form script and related test scripts. Its broad detector combines ordinary form `name` and HTTP `method` words. It also reports the existing Pathways Lab `app.js` and `model.js` files. These findings require an explicit maintainer review of the detector and application boundary. This change does not loosen the validator, alter offer authority, close existing holds or treat a passing browser test as permission to publish. Keep the PR in draft until the required checks and Founder release decision are resolved.

## References

- TASK Volunteer Guide supplied by CJ, July 2026, pp. 1-2. Operational details must be reconfirmed with the host.
- CJ's supplied parent-coaching notes. The four-step preparation, demonstration, practice/reflection and next-step sequence is used as an APC adaptation, not an official Hanen programme.
- [Hanen public programme information](https://www.hanen.org/home).
- [Malaysia JPDP personal-data principles](https://www.pdp.gov.my/ppdpv1/prinsip-perlindungan-data-peribadi/).
- [Cloudflare server-side Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
