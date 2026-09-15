# APC Parent Price + Package Migration Checklist

Status: Internal release checklist. No public price migration should occur until CJ approves the effective date and the whole change set is QA'd together.

## 1. Proposed new public offer names / prices

Malaysia:
- APC One-Concern Parent Session: RM450 / 60 minutes
- APC Home Implementation Programme: RM2,400 / implementation cycle

Singapore:
- APC One-Concern Parent Session: S$200
- APC Home Implementation Programme: S$980

Singapore prices should normally be quoted directly rather than displayed on the Malaysia-focused public services page initially.

## 2. Public website files known to contain old price/package wording

Update in one coordinated release:
- `services.html`
- `start.html`
- `pay/index.html`
- `terms.html`
- `booking-confirmed-session.html`
- any homepage/service CTA containing RM350 / RM1,800
- any resources page / article CTA that describes the free call as personalised advice rather than fit/routing

Search again immediately before release for:
- `RM350`
- `RM1,800`
- `RM1800`
- `45 minutes`
- `Four sessions`
- `Home Support Programme`

Do not assume this list is exhaustive.

## 3. SEO / structured data

Update together with visible copy:
- page title / meta descriptions where prices or old service names appear,
- FAQ schema answers,
- OpenGraph descriptions if affected,
- sitemap last-modified dates for changed pages.

## 4. Terms / payment

Before publishing new prices, align:
- exact service names,
- session duration,
- what's included,
- clarification/messaging boundaries,
- payment confirmation process,
- cancellation/reschedule rules,
- quote validity,
- existing-client price protection,
- international payment wording.

## 5. Existing-client transition

- Existing fully paid clients keep their purchased package.
- Active RM1,800 clients are not repriced or stripped of agreed inclusions.
- Existing accepted RM350 arrangements stay at the agreed amount unless CJ and the client mutually re-scope before payment.
- Existing written quotations remain valid until their stated expiry.
- New pricing applies only from the chosen public effective date.

## 6. Practice Console / data model

Current internal service codes are price-coupled (`RM350`, `RM1800`).

Do **not** simply rename them in production data without a migration because functions/tests/current records depend on them.

Recommended future architecture:
- stable service identity: `ONE_CONCERN`
- stable service identity: `HOME_IMPLEMENTATION`
- separate commercial price/currency fields or pricing configuration

Migration work should include:
- existing data mapping,
- API validation changes,
- UI labels,
- journey templates,
- D1 migration if required,
- tests,
- backwards compatibility / legacy handling.

This should be a separate technical change after the offer specification is approved, not an incidental copy edit.

## 7. Repository / documentation files to update after approval

At minimum review:
- `CLAUDE.md`
- `DESIGN.md`
- operating docs referring to RM350/RM1,800
- website authority fixtures / canonical-copy tests
- Practice Console tests
- any payment / booking documentation

Internal historical records should not be rewritten merely to hide old prices.

## 8. Automated / test surfaces likely affected

Known references include:
- `tests/content-os-operations.test.mjs`
- `tests/test_website_authority.py`
- `tests/website_authority.json`
- Practice Console source/API tests and fixtures

Run the repository's normal build/test suite after migration.

## 9. Release QA

Before merge:
- [ ] no contradictory old/new price appears on a public route,
- [ ] all service names match,
- [ ] Free Call remains fit/routing only,
- [ ] One-Concern clearly differs from Home Implementation,
- [ ] no new clinical/therapy claims,
- [ ] no Hanen/SCERTS programme is implied inside parent packages,
- [ ] payment/terms wording matches the actual operational process,
- [ ] mobile/desktop service cards render correctly,
- [ ] booking links work,
- [ ] parent-client transition policy is documented.

After deployment:
- [ ] check `/services`, `/start`, `/pay`, `/terms`, confirmation route,
- [ ] test one synthetic fit-call flow,
- [ ] verify search/social metadata,
- [ ] verify no old price is surfaced in prominent public copy.

## 10. Release rule

Do not publish the new price on only one page. Treat the parent-offer price change as one coordinated release.
