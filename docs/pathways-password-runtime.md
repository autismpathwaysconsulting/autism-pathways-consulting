# Pathways password runtime compatibility

Status: synthetic preview only. Real-student readiness is not approved.

On 17 September 2026 the hosted bootstrap returned
`PATHWAYS_PASSWORD_HASH_RUNTIME_LIMIT` when deriving a 160,000-iteration
PBKDF2-HMAC-SHA256 password record, before the database batch executed.

New records and dummy login derivations now use 100,000 iterations to fit the
hosted runtime limit. Salt length (16 random bytes), hash length (32 bytes),
password length rules, constant-time comparison and account lockout remain.
Existing records retain their stored iteration count; verification must never
silently truncate it or rewrite a hash on runtime failure.

This is a reduction from the previous configured work factor, not equivalent
offline password protection. It is a synthetic-demo compatibility measure.
Before real-student use, review and implement a runtime-supported password
storage design against current security guidance, including managed identity
as an option, and verify authentication in the hosted environment. Passing
local tests or deploying successfully does not close that gate.

Regression checks must enforce the 100,000 cap while exercising bootstrap,
correct-password login and unknown, inactive, locked and wrong-password paths.
They must also check that a higher-count existing record is not downgraded.
