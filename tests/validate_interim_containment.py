#!/usr/bin/env python3
"""Deterministic fail-closed checks for the interim website safety projection."""

from __future__ import annotations

from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Mapping
import json
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = Path(__file__).with_name("interim_containment.json")
AUTHORITY_PATH = Path(__file__).with_name("website_authority.json")
NOTICE_PAGES = ("index.html", "services.html", "start.html", "terms.html", "pay/index.html")
FORBIDDEN_PAYMENT_PATHS = frozenset({"QR_Payment.JPG", "pay.html.backup-payment-price"})
EXPECTED_SEQUENCE = [
    "REQUEST",
    "FOUNDER_SUITABILITY_AND_CAPACITY_REVIEW",
    "INDIVIDUAL_PERMISSION_TO_PAY",
    "BANK_TRANSFER_OR_DUITNOW_QR",
    "PROOF_RECEIVED",
    "FOUNDER_PAYMENT_VERIFICATION",
    "FOUNDER_BOOKING_CONFIRMATION",
]
EXPECTED_PROVENANCE = {
    "apc_ai_os_repository": "autismpathwaysconsulting/APC-AI-OS",
    "apc_ai_os_main_commit": "b4d2820334be9a3e12f5a4c827bfc4e4ad1a8893",
    "canonical_audited_ancestor": "b7206744965929ce1469295129661a863bbdf733",
    "authority_version": "1.2",
    "canonical_state": "CANDIDATE",
    "canonical_source_sha256": "sha256:3c8a9ea6dd7fc0f85769c87a8a9a4cfd961c9eec4f913ca5707869871fbd560f",
    "governed_projection_sha256": "sha256:ebc93120addfedecd17b16ea99d21474a34782aef32b9cecbb25dc709d212f29",
    "website_repository": "autismpathwaysconsulting/autism-pathways-consulting",
    "website_main_commit": "01b9565fc2891dd9354985c1acd4fd43adabe1b9",
    "website_pr14_candidate_commit": "7e62a470db496942e640267b52acaf6c3c312ece",
}


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def normalise(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(value)).strip().lower()


def visible_text(source: str) -> str:
    parser = TextExtractor()
    parser.feed(source)
    parser.close()
    return normalise(" ".join(parser.parts))


def load_json(path: Path) -> Mapping[str, Any]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, Mapping):
        raise ValueError(f"{path.name} must contain a JSON object")
    return value


def validate_manifest(
    manifest: Mapping[str, Any], authority: Mapping[str, Any]
) -> list[str]:
    findings: list[str] = []
    if manifest.get("schema_version") != 1:
        findings.append("containment.manifest_schema")
    if manifest.get("projection_role") != "INTERIM_RISK_CONTAINMENT_PROJECTION_ONLY":
        findings.append("containment.projection_role")

    provenance = manifest.get("provenance")
    if provenance != EXPECTED_PROVENANCE:
        findings.append("containment.stale_or_untraceable_provenance")
    authority_provenance = authority.get("provenance", {})
    if isinstance(provenance, Mapping):
        if provenance.get("canonical_audited_ancestor") != authority_provenance.get(
            "source_candidate_commit"
        ):
            findings.append("containment.authority_commit_drift")
        if provenance.get("canonical_source_sha256") != authority_provenance.get(
            "canonical_source_sha256"
        ):
            findings.append("containment.authority_hash_drift")
        if provenance.get("governed_projection_sha256") != authority_provenance.get(
            "governed_projection_sha256"
        ):
            findings.append("containment.projection_hash_drift")

    permissions = manifest.get("authority_permissions")
    expected_permissions = {
        "public_launch_authorised": False,
        "deployment_authorised": False,
        "publication_authorised": False,
        "live_booking_or_payment_change_authorised": False,
        "canonical_promotion_authorised": False,
        "hold_closure_authorised": False,
    }
    if permissions != expected_permissions:
        findings.append("containment.authority_promotion")

    holds = manifest.get("holds")
    expected_holds = {f"OPS-HOLD-00{number}": "OPEN" for number in range(1, 7)}
    if holds != expected_holds:
        findings.append("containment.false_hold_closure")

    controls = manifest.get("public_controls")
    if not isinstance(controls, Mapping):
        findings.append("containment.public_controls_missing")
    else:
        required = {
            "paid_services_are_candidate_only": True,
            "general_availability": False,
            "international_services_available": False,
            "international_payments_available": False,
            "public_payment_details_available": False,
            "payment_permission_is_individual": True,
            "payment_instructions_delivered_privately": True,
            "automatic_booking_confirmation": False,
        }
        if any(controls.get(key) is not value for key, value in required.items()):
            findings.append("containment.public_controls_weakened")
        if controls.get("booking_sequence") != EXPECTED_SEQUENCE:
            findings.append("containment.booking_sequence_manifest")
    return findings


def validate_surfaces(sources: Mapping[str, str], present_paths: set[str]) -> list[str]:
    findings: list[str] = []
    all_html = "\n".join(
        source for path, source in sources.items() if path.endswith(".html")
    )
    all_html_normalised = normalise(all_html)

    for path in sorted(FORBIDDEN_PAYMENT_PATHS & present_paths):
        findings.append(f"containment.public_payment_asset:{path}")
    if re.search(r"\bwise\b", all_html, re.IGNORECASE):
        findings.append("containment.wise_public_wording")
    if re.search(r'href=["\']/pay/(?:350|1800)', all_html, re.IGNORECASE):
        findings.append("containment.direct_payment_route")
    if re.search(
        r"\b(?:pay now|continue to (?:the )?payment|complete your payment|checkout now)\b",
        all_html_normalised,
    ):
        findings.append("containment.immediate_payment_permission")
    if re.search(
        r"\b(?:international|overseas) (?:services?|payments?) "
        r"(?:is|are) (?:currently )?(?:available|accepted|supported|open)\b",
        all_html_normalised,
    ):
        findings.append("containment.international_availability")
    if re.search(r"\b(?:bookings? open|open for bookings?|generally available)\b", all_html_normalised):
        for allowed in ("not generally available", "are not generally available"):
            all_html_normalised = all_html_normalised.replace(allowed, "")
        if re.search(r"\b(?:bookings? open|open for bookings?|generally available)\b", all_html_normalised):
            findings.append("containment.unrestricted_availability")
    if re.search(
        r"\b(?:guaranteed?|guarantees?)\b.{0,50}\b(?:improvement|outcome|result|change)\b",
        all_html_normalised,
    ) and not re.search(
        r"\b(?:no|not|does not|cannot)\b.{0,50}\b(?:guarantee|guaranteed)\b",
        all_html_normalised,
    ):
        findings.append("containment.unsupported_guarantee")

    for path in NOTICE_PAGES:
        source = sources.get(path, "")
        text = visible_text(source)
        if "candidate service" not in text or "not generally available" not in text:
            findings.append(f"containment.candidate_label_missing:{path}")
        if "international services and payments are currently unavailable" not in text:
            findings.append(f"containment.international_notice_missing:{path}")
        if "suitability" not in text or "capacity" not in text or "availability" not in text:
            findings.append(f"containment.capacity_review_missing:{path}")

    pay = sources.get("pay/index.html", "")
    pay_text = visible_text(pay)
    forbidden_pay_signals = (
        "account number",
        "qr_payment",
        "send payment receipt",
        "completed my apc payment",
        "data-payment-mode",
        "urlsearchparams",
        "#bank-transfer",
        "#duitnow",
    )
    for signal in forbidden_pay_signals:
        if signal in normalise(pay):
            findings.append(f"containment.public_payment_detail:{signal}")
    required_pay_phrases = (
        "payment details are not available on this website",
        "sent to you privately",
        "submitting payment proof does not automatically confirm a booking",
    )
    for phrase in required_pay_phrases:
        if phrase not in pay_text:
            findings.append(f"containment.payment_notice_missing:{phrase}")

    sequence_phrases = (
        "submit a request",
        "suitability and capacity review",
        "permission to pay",
        "maybank bank transfer or duitnow qr",
        "payment proof",
        "verifies the payment",
        "confirms the booking",
    )
    sequence_text = pay_text[pay_text.find("the required sequence cannot be skipped") :]
    positions = [sequence_text.find(phrase) for phrase in sequence_phrases]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        findings.append("containment.booking_sequence_page")

    redirects = normalise(sources.get("_redirects", ""))
    if "?s=" in redirects:
        findings.append("containment.filtered_payment_redirect")

    first_step_pages = ("index.html", "services.html", "start.html", "booking-confirmed-call.html")
    for path in first_step_pages:
        text = visible_text(sources.get(path, ""))
        required = ("fit", "not a consultation", "assessment", "advice", "therapy")
        if any(term not in text for term in required):
            findings.append(f"containment.first_step_boundary_missing:{path}")

    if "unlimited messaging" not in all_html_normalised:
        findings.append("containment.messaging_boundary_missing")
    for boundary in ("diagnosis", "therapy", "medical treatment", "crisis", "guaranteed outcomes"):
        if boundary not in pay_text:
            findings.append(f"containment.scope_boundary_missing:{boundary}")
    return sorted(set(findings))


def load_public_sources(root: Path = ROOT) -> tuple[dict[str, str], set[str]]:
    sources: dict[str, str] = {}
    present_paths: set[str] = set()
    for path in root.rglob("*"):
        if not path.is_file() or ".git" in path.parts:
            continue
        relative = path.relative_to(root).as_posix()
        present_paths.add(relative)
        if relative.endswith(".html") or relative == "_redirects":
            sources[relative] = path.read_text(encoding="utf-8")
    return sources, present_paths


def validate_repository(root: Path = ROOT) -> list[str]:
    manifest = load_json(root / "tests/interim_containment.json")
    authority = load_json(root / "tests/website_authority.json")
    sources, present_paths = load_public_sources(root)
    return validate_manifest(manifest, authority) + validate_surfaces(sources, present_paths)


def main() -> int:
    findings = validate_repository()
    if findings:
        for finding in findings:
            print(f"FAIL [{finding}]")
        return 1
    print("PASS: interim containment provenance, payment, international, authority, and scope checks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
