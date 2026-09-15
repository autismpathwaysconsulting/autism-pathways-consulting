# Practice Console Service-Code Migration Design

Status: Design only. Do not implement until CJ approves new public parent pricing/effective date and a migration PR is explicitly authorised.

## 1. Current problem

The Practice Console currently uses price-based service identifiers such as:
- `RM350`
- `RM1800`

This couples the data model to the price. A future price increase then forces operational code, tests and historical data to change even though the underlying service is the same.

## 2. Target model

Use stable service identifiers independent of price:

- `TBD`
- `ONE_CONCERN`
- `HOME_IMPLEMENTATION`
- `CUSTOM`

Keep price/currency as separate fields or commercial metadata.

Suggested display labels:
- One-Concern Parent Session
- Home Implementation Programme

Suggested commercial metadata fields if/when the schema is extended:
- `quoted_currency` (`MYR`, `SGD`, etc.)
- `quoted_amount_minor` (integer minor units, e.g. 45000 sen)
- `quote_date`
- `price_version` (e.g. `2026-09-parent-v2`)
- `supported_rate` boolean
- `payment_plan` (`FULL`, `TWO_PART`, `CUSTOM`)

Do not infer price from service code after migration.

## 3. Backward compatibility

Historical records should remain interpretable.

Recommended mapping:
- historical `RM350` -> `ONE_CONCERN`, retain legacy quoted amount RM350
- historical `RM1800` -> `HOME_IMPLEMENTATION`, retain legacy quoted amount RM1,800
- `CUSTOM` remains `CUSTOM`
- `TBD` remains `TBD`

Do not overwrite historical commercial facts with new prices.

## 4. Journey templates

### ONE_CONCERN
Suggested stages/tasks:
1. FIT_REVIEW / request review
2. APPROVED_TO_PAY
3. PAYMENT_PROOF_RECEIVED
4. PAYMENT_VERIFIED
5. BOOKED
6. PREPARATION
7. SESSION_READY
8. IN_SESSION
9. DOCUMENTATION_DRAFT
10. CJ_APPROVED
11. DELIVERED
12. CLARIFICATION_WINDOW
13. COMPLETE

### HOME_IMPLEMENTATION
Suggested journey:
1. FIT_REVIEW
2. APPROVED_TO_PAY
3. PAYMENT_PROOF_RECEIVED
4. PAYMENT_VERIFIED
5. BOOKED
6. BASELINE_INTAKE
7. SESSION_1_READY
8. SESSION_1_COMPLETE
9. PLAN_DRAFT
10. CJ_APPROVED
11. IMPLEMENTATION_1
12. SESSION_2_READY
13. SESSION_2_COMPLETE
14. IMPLEMENTATION_2
15. SESSION_3_READY
16. SESSION_3_COMPLETE
17. IMPLEMENTATION_3
18. SESSION_4_READY
19. SESSION_4_COMPLETE
20. MAINTENANCE_SUMMARY_DRAFT
21. CJ_APPROVED
22. MAINTENANCE_CHECK_DUE
23. MAINTENANCE_CHECK_COMPLETE
24. COMPLETE

Exact stage implementation should be reconciled with existing database constraints before coding.

## 5. Fit-call handling

The current model can route a lead as:
- service `TBD`
- stage `FIT_REVIEW`

This is acceptable in the short term.

A future improvement could add a distinct `FIT_CALL` event/type without forcing it to be a paid service record. Do not over-engineer this before the parent price migration.

## 6. Migration sequence

1. Inventory all code/tests/SQL constraints referencing `RM350` or `RM1800`.
2. Add new stable service identifiers to schema/API while still accepting legacy values.
3. Add explicit price/currency metadata.
4. Backfill existing records with stable service identity + historical price.
5. Update UI to display service name and quoted price separately.
6. Update journey-template selection.
7. Update API validation.
8. Update website authority tests if they depend on price labels.
9. Add migration regression tests.
10. Verify existing client records remain readable/editable.
11. Only then remove dependence on legacy identifiers for new records.

## 7. Required regression tests

- legacy RM350 record loads as One-Concern with historical RM350 commercial value
- legacy RM1800 record loads as Home Implementation with historical RM1,800 commercial value
- new MYR One-Concern can store RM450
- new SGD One-Concern can store S$200
- new MYR Home Implementation can store RM2,400
- new SGD Home Implementation can store S$980
- supported-rate flag does not alter scope/service identity
- instalment plan does not alter total quoted fee
- no old record is silently repriced
- service journey remains correct after migration
- concurrent record revision protections remain intact

## 8. Do not do this

- do not rename `RM350` to `RM450` and `RM1800` to `RM2400`
- do not infer country from currency alone
- do not overwrite old invoice/quote facts
- do not mix service identity with payment status
- do not create a separate service code for every future price

## 9. Trigger to implement

Implementation should begin only after:
- CJ approves new parent prices,
- CJ chooses effective date,
- website/terms/payment migration is ready,
- a dedicated migration PR can be tested independently.
