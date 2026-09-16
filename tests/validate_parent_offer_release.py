#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).casefold()


def require(path: str, *phrases: str) -> None:
    value = normalized(text(path))
    missing = [phrase for phrase in phrases if normalized(phrase) not in value]
    if missing:
        raise AssertionError(f"{path}: missing approved wording: {missing}")


def forbid(path: str, *phrases: str) -> None:
    value = normalized(text(path))
    present = [phrase for phrase in phrases if normalized(phrase) in value]
    if present:
        raise AssertionError(f"{path}: contains retired/unapproved wording: {present}")


# Parent offer authority for this release.
require(
    "services.html",
    "One-Concern Parent Session",
    "RM350",
    "45 minutes",
    "APC One-Concern Action Note",
    "within 2 working days",
    "one clarification message within 7 days",
    "APC Home Implementation Programme",
    "RM1,800",
    "Four sessions",
    "60 minutes each",
    "About 6–8 weeks",
    "WhatsApp clarification throughout the active programme",
    "limited to the agreed plan",
    "Final APC Maintenance Summary",
    "One check-in about a month after the final session",
    "included in the programme fee",
    "not a consultation, assessment, diagnostic service, or advice session",
)

require(
    "start.html",
    "One-Concern Parent Session",
    "RM350",
    "APC Home Implementation Programme",
    "RM1,800",
)

require(
    "pay/index.html",
    "One-Concern Parent Session",
    "RM350",
    "APC One-Concern Action Note",
    "APC Home Implementation Programme",
    "RM1,800",
    "maintenance check is included in the programme fee",
)

require(
    "terms.html",
    "One-Concern Parent Session (RM350)",
    "APC One-Concern Action Note",
    "APC Home Implementation Programme (RM1,800)",
    "personalised APC Home Support Plan",
    "WhatsApp clarification throughout the active programme limited to the agreed plan",
    "maintenance check is included in the programme fee",
    "APC does not keep adding strategies solely to justify completing the programme",
)

for path in ("services.html", "start.html", "pay/index.html", "terms.html"):
    forbid(
        path,
        "RM450",
        "RM2,400",
        "APC Home Support Programme",
        "Atome",
        "Stripe",
        "unlimited WhatsApp",
    )

# School/educator enquiry launch remains deliberately bounded.
forbid(
    "schools.html",
    "HRD Corp claimable",
    "KPM accredited",
    "KPM recognised",
    "SCERTS-certified",
)
require(
    "schools.html",
    "Attendance does not make participants Hanen-certified providers",
    "No current claim of HRD Corp or KPM accreditation",
    "No guaranteed child outcomes",
    "Public paid course dates are not yet being advertised",
)

print("Parent/school release copy validation passed.")
