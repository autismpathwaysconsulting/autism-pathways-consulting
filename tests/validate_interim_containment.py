#!/usr/bin/env python3
"""Deterministic fail-closed checks for the interim website safety projection."""

from __future__ import annotations

from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import unquote, urlsplit
import json
import posixpath
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = Path(__file__).with_name("interim_containment.json")
AUTHORITY_PATH = Path(__file__).with_name("website_authority.json")
NOTICE_PAGES = ("index.html", "services.html", "start.html", "terms.html", "pay/index.html")
FORBIDDEN_PAYMENT_PATHS = frozenset({"QR_Payment.JPG", "pay.html.backup-payment-price"})
PAID_CAL_PATH = "cal.com/autismpathwaysconsulting/parent-strategy-session"
FREE_CAL_URL = "https://cal.com/autismpathwaysconsulting/first-step-call"
EXPECTED_FORM_COUNTS = {"schools.html": 1}
PRIVATE_AUTHENTICATED_HTML_SURFACES = frozenset({"content-os/index.html"})
NON_SOURCE_DIRECTORIES = frozenset(
    {".git", "dist", "node_modules", ".wrangler", ".Codex", "_local_backups", "backups"}
)


def is_non_source_path(path: Path) -> bool:
    return any(
        part in NON_SOURCE_DIRECTORIES or part.startswith("_backup_")
        for part in path.parts
    )
KNOWN_HEADING_SKIPS = {
    ("course-waitlist.html", 1, 3),
    ("schools.html", 2, 4),
}
EXPECTED_SEQUENCE = [
    "REQUEST",
    "FOUNDER_SUITABILITY_AND_CAPACITY_REVIEW",
    "INDIVIDUAL_PERMISSION_TO_PAY",
    "BANK_TRANSFER_DUITNOW_QR_OR_WISE",
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
    "governed_projection_sha256": "sha256:a06364128950ed255be223b1df7ae701d12c607e260453bf51668d36f34e14e6",
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


class SurfaceExtractor(HTMLParser):
    """Collect public links, controls, forms, images, and heading order."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []
        self.assets: list[str] = []
        self.forms: list[dict[str, str]] = []
        self.inputs: list[dict[str, str]] = []
        self.images: list[dict[str, str]] = []
        self.headings: list[int] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): (value or "") for key, value in attrs}
        tag = tag.lower()
        if tag == "a" and values.get("href"):
            self.links.append(values["href"])
        if tag in {"img", "script", "source", "link"}:
            target = values.get("src") or values.get("href")
            if target:
                self.assets.append(target)
        if tag == "form":
            self.forms.append(values)
        if tag in {"input", "textarea", "select", "button"}:
            self.inputs.append(values | {"tag": tag})
        if tag == "img":
            self.images.append(values)
        if re.fullmatch(r"h[1-6]", tag):
            self.headings.append(int(tag[1]))


def parse_surface(source: str) -> SurfaceExtractor:
    parser = SurfaceExtractor()
    parser.feed(source)
    parser.close()
    return parser


def normalise_request_path(value: str) -> str:
    """Canonicalise safe URL syntax while preserving case for fail-closed routing."""
    path = unquote(urlsplit(value).path)
    suffix = "/" if path.endswith("/") and path != "/" else ""
    return posixpath.normpath("/" + path.lstrip("/")) + suffix


def local_target(source_path: str, value: str) -> str | None:
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or value.startswith(("mailto:", "tel:", "data:", "javascript:")):
        return None
    decoded = unquote(parsed.path)
    if not decoded:
        return None if value.startswith("#") else source_path
    if decoded == "/":
        return "index.html"
    if decoded.startswith("/"):
        candidate = decoded.lstrip("/")
    else:
        candidate = posixpath.normpath(posixpath.join(posixpath.dirname(source_path), decoded))
    candidate = candidate.rstrip("/")
    return candidate or "index.html"


def target_exists(target: str, present_paths: set[str]) -> bool:
    return any(
        candidate in present_paths
        for candidate in (target, f"{target}.html", f"{target}/index.html")
    )


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
            "paid_services_are_candidate_only": False,
            "general_availability": False,
            "international_services_available": True,
            "international_payments_available": True,
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
    if re.search(r"\bwise payment is supported\b", all_html, re.IGNORECASE):
        findings.append("containment.wise_public_wording")
    if re.search(r"\binternational services are available\b", all_html, re.IGNORECASE):
        findings.append("containment.international_availability")
    if PAID_CAL_PATH in all_html_normalised:
        findings.append("containment.paid_cal_link")
    if re.search(r"\bpersonalised (?:direction|guidance|strategy|advice)\b", all_html_normalised):
        findings.append("containment.first_step_scope_expansion")
    if re.search(r'href=["\']/pay/(?:350|1800)', all_html, re.IGNORECASE):
        findings.append("containment.direct_payment_route")
    if re.search(
        r"\b(?:pay now|continue to (?:the )?payment|complete your payment|checkout now)\b",
        all_html_normalised,
    ):
        findings.append("containment.immediate_payment_permission")
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

    policy_patterns = {
        "fixed_notice_period": r"\b(?:at least|less than) 24 hours?\b",
        "forfeiture": r"\bforfeit(?:ed|ure)?\b",
        "fixed_no_refund": r"\b(?:no refunds?|non-?refundable)\b",
        "no_show_penalty": r"\bno-?shows?\b.{0,100}\b(?:restrict|penalt|fee|refund|forfeit)",
    }
    for name, pattern in policy_patterns.items():
        if re.search(pattern, all_html_normalised):
            findings.append(f"containment.final_policy_rule:{name}")

    if re.search(r"\b(?:send|submit|upload) (?:your )?(?:payment )?receipt\b", all_html_normalised):
        findings.append("containment.public_receipt_request")

    for path in NOTICE_PAGES:
        source = sources.get(path, "")
        text = visible_text(source)
        if "paid support" not in text or "subject to" not in text:
            findings.append(f"containment.review_notice_missing:{path}")
        if "international clients may be accepted" not in text:
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
        "sent privately",
        "submitting payment proof does not automatically confirm a booking",
    )
    for phrase in required_pay_phrases:
        if phrase not in pay_text:
            findings.append(f"containment.payment_notice_missing:{phrase}")

    sequence_phrases = (
        "submit a request",
        "suitability and capacity review",
        "permission to pay",
        "maybank business account or duitnow qr",
        "wise bank-transfer",
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
    if "/booking-confirmed-session/ /booking-confirmed-session.html 302" not in redirects:
        findings.append("containment.legacy_route_redirect_missing")

    legacy_text = visible_text(sources.get("booking-confirmed-session.html", ""))
    for phrase in (
        "this page does not confirm a booking",
        "only a written acceptance notice sent by apc establishes an appointment",
        "do not pay without permission",
        "paid support requires confirmation",
    ):
        if phrase not in legacy_text:
            findings.append(f"containment.legacy_confirmation_missing:{phrase}")
    for phrase in (
        "session is booked",
        "session confirmed",
        "send your receipt",
        "booking record can be confirmed",
    ):
        if phrase in legacy_text:
            findings.append(f"containment.legacy_confirmation_unsafe:{phrase}")

    first_step_pages = (
        "index.html",
        "services.html",
        "start.html",
        "about.html",
        "resources.html",
        "free-tool.html",
        "booking-confirmed-call.html",
    )
    for path in first_step_pages:
        text = visible_text(sources.get(path, ""))
        required = ("fit", "consultation", "assessment", "advice", "therapy")
        if any(term not in text for term in required):
            findings.append(f"containment.first_step_boundary_missing:{path}")

    for path in ("terms.html", "cancellation-policy.html"):
        text = visible_text(sources.get(path, ""))
        for phrase in (
            "ops-hold-002",
            "not a final legal policy",
            "existing written client agreement",
            "do not pay",
        ):
            if phrase not in text:
                findings.append(f"containment.interim_policy_missing:{path}:{phrase}")

    if "unlimited messaging" not in all_html_normalised:
        findings.append("containment.messaging_boundary_missing")
    for boundary in ("diagnosis", "therapy", "medical treatment", "crisis", "guaranteed outcomes"):
        if boundary not in pay_text:
            findings.append(f"containment.scope_boundary_missing:{boundary}")

    form_counts: dict[str, int] = {}
    integration_signals = re.compile(
        r"\b(?:fetch\s*\(|xmlhttprequest|localstorage|sessionstorage|document\.cookie|gtag\s*\(|google-analytics|plausible\.io)",
        re.IGNORECASE,
    )
    for path, source in sorted(sources.items()):
        if not path.endswith(".html"):
            continue
        surface = parse_surface(source)
        if path not in PRIVATE_AUTHENTICATED_HTML_SURFACES and surface.forms:
            form_counts[path] = len(surface.forms)
        if path not in PRIVATE_AUTHENTICATED_HTML_SURFACES and integration_signals.search(source):
            findings.append(f"containment.new_integration_surface:{path}")
        if path not in PRIVATE_AUTHENTICATED_HTML_SURFACES and any(control.get("type", "").lower() == "file" for control in surface.inputs):
            findings.append(f"containment.public_file_input:{path}")
        for image in surface.images:
            if "alt" not in image:
                findings.append(f"containment.image_alt_missing:{path}")
        if surface.headings:
            if surface.headings.count(1) != 1:
                findings.append(f"containment.h1_count:{path}")
            for previous, current in zip(surface.headings, surface.headings[1:]):
                if current > previous + 1 and (path, previous, current) not in KNOWN_HEADING_SKIPS:
                    findings.append(f"containment.heading_skip:{path}:h{previous}-h{current}")
                    break
        for value in surface.links:
            parsed = urlsplit(value)
            if parsed.netloc == "cal.com" and value.rstrip("/") != FREE_CAL_URL:
                findings.append(f"containment.unapproved_cal_url:{path}")
            target = local_target(path, value)
            if target is not None and not target_exists(target, present_paths):
                findings.append(f"containment.broken_internal_link:{path}:{value}")
        for value in surface.assets:
            target = local_target(path, value)
            if target is not None and not target_exists(target, present_paths):
                findings.append(f"containment.missing_asset:{path}:{value}")
    if form_counts != EXPECTED_FORM_COUNTS:
        findings.append("containment.form_inventory_changed")

    privacy = sources.get("privacy.html", "")
    if "display: inline-flex" not in privacy or "min-height: 24px" not in privacy:
        findings.append("containment.privacy_target_guard_missing")
    return sorted(set(findings))


def load_public_sources(root: Path = ROOT) -> tuple[dict[str, str], set[str]]:
    sources: dict[str, str] = {}
    present_paths: set[str] = set()
    for path in root.rglob("*"):
        if not path.is_file() or is_non_source_path(path):
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
