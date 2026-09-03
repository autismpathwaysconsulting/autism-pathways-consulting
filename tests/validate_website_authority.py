#!/usr/bin/env python3
"""Fail-closed validation for APC website and launch authority."""

from __future__ import annotations

from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable, Mapping
import hashlib
import json
import math
import re
import subprocess
import sys
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
FLAGS = re.IGNORECASE | re.DOTALL
AUTHORITY_MANIFEST_PATH = Path(__file__).with_name("website_authority.json")
SOURCE_REPOSITORY = "autismpathwaysconsulting/APC-AI-OS"
SOURCE_REPOSITORY_ORIGIN = "https://github.com/autismpathwaysconsulting/APC-AI-OS.git"
CANONICAL_SPECIFICATION_PATH = "governance/APC_FOUNDER_RECONCILIATION_REVENUE_SPRINT_DAY0_2026-08-21.authority.json"
GENERATION_METHOD = "node tools/outcome-offer/generate-website-authority.js"


def stable_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def validate_authority_manifest(manifest: Mapping[str, Any]) -> None:
    if manifest.get("schema_version") != 2:
        raise ValueError("stale website mirror schema version")
    if manifest.get("authority_role") != "NON_AUTHORITATIVE_DERIVED_MIRROR":
        raise ValueError("website authority data must be a non-authoritative derived mirror")
    provenance = manifest.get("provenance")
    if not isinstance(provenance, Mapping):
        raise ValueError("website mirror provenance is required")
    expected = {
        "source_repository": SOURCE_REPOSITORY,
        "source_repository_origin": SOURCE_REPOSITORY_ORIGIN,
        "canonical_specification_path": CANONICAL_SPECIFICATION_PATH,
        "source_authority_record_id": "APC-REV-DAY0-2026-08-21",
        "source_schema_version": "1.2",
        "source_authority_version": "1.2",
        "generation_method": GENERATION_METHOD,
    }
    for field, value in expected.items():
        if provenance.get(field) != value:
            raise ValueError(f"website mirror canonical source identity or version is invalid: {field}")
    if not re.fullmatch(r"[0-9a-f]{40}", str(provenance.get("source_candidate_commit", ""))):
        raise ValueError("website mirror exact APC-AI-OS candidate commit is invalid")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", str(provenance.get("canonical_source_sha256", ""))):
        raise ValueError("website mirror canonical source SHA256 is invalid")
    projection = {
        key: value
        for key, value in manifest.items()
        if key not in {"schema_version", "authority_role", "provenance"}
    }
    projection_hash = "sha256:" + hashlib.sha256(stable_json(projection).encode()).hexdigest()
    if provenance.get("governed_projection_sha256") != projection_hash:
        raise ValueError("website mirror projection hash is invalid; regenerate it")
    controls = manifest.get("payment_controls", {})
    if controls.get("approved_methods") != ["BANK_TRANSFER", "DUITNOW_QR"]:
        raise ValueError("website mirror expands approved payment methods")
    if controls.get("automatic_confirmation") is not False:
        raise ValueError("website mirror weakens manual payment confirmation")
    if controls.get("request_payment_attempt_or_screenshot_confirms_booking") is not False:
        raise ValueError("website mirror allows proof to confirm a booking")


def load_authority_manifest() -> Mapping[str, Any]:
    with AUTHORITY_MANIFEST_PATH.open(encoding="utf-8") as handle:
        manifest = json.load(handle)
    validate_authority_manifest(manifest)
    return manifest


AUTHORITY = load_authority_manifest()
GOVERNED_PAGES = frozenset(
    path
    for offer in AUTHORITY["offers"].values()
    for path in offer["bindings"]
)
PROTECTED_APPLICATION_PAGES = frozenset({"content-os/index.html"})
EXECUTABLE_JAVASCRIPT_SUFFIXES = (".js", ".mjs", ".cjs")
NON_PUBLIC_EXECUTABLE_MODULES = frozenset({"scripts/build-site.mjs"})
CONTENT_OS_TEST_MODULE = re.compile(
    r"^tests/content-os(?:[/-][A-Za-z0-9._-]+)*\.test\.(?:js|mjs|cjs)$"
)


def _is_content_os_executable_authority_exempt(path: str) -> bool:
    """Limit authority exemptions to private Content OS code and its tests."""
    if not path.endswith(EXECUTABLE_JAVASCRIPT_SUFFIXES):
        return False
    if path.startswith("/") or "\\" in path:
        return False
    parts = path.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        return False
    return (
        path in NON_PUBLIC_EXECUTABLE_MODULES
        or path.startswith("content-os/")
        or path.startswith("functions/api/content-os/")
        or path == "functions/_middleware.js"
        or CONTENT_OS_TEST_MODULE.fullmatch(path) is not None
    )


@dataclass(frozen=True)
class Requirement:
    identifier: str
    pattern: str


@dataclass(frozen=True)
class Rule:
    identifier: str
    pattern: str
    context: str | None = None
    negation: str | None = None
    kinds: frozenset[str] | None = None


@dataclass(frozen=True)
class OfferPolicy:
    identifier: str
    context: str
    allowed_price: str
    allowed_duration: str
    allowed_delivery: tuple[str, ...]


@dataclass(frozen=True)
class Surface:
    path: str
    kind: str
    text: str
    fields: tuple[tuple[str, str], ...] = ()
    structured_path: tuple[str, ...] = ()


@dataclass(frozen=True, order=True)
class Finding:
    identifier: str
    path: str
    kind: str


RETIRED_MUTATORS = frozenset(
    {
        "apc_final_cta_cleanup.py",
        "apc_services_conversion_cleanup.py",
        "apc_services_final_polish.py",
        "apc_waitlist_cta_final_fix.py",
        "apc_website_positioning_patch.py",
        "final-cleanup-resources-and-first-step-url.py",
        "fix-resources-and-free-tool-links.py",
        "fix_apc_post_patch_cleanup.py",
        "update-resources-page.py",
    }
)

PAGE_REQUIREMENTS: Mapping[str, tuple[Requirement, ...]] = {
    "services.html": (
        Requirement("session_name", r"\bone-concern parent session\b"),
        Requirement("session_price", r"\brm\s*350\b"),
        Requirement("session_duration", r"\b45(?:-|\s)minute(?:s)?\b"),
        Requirement("session_delivery", r"\bgoogle meet\b"),
        Requirement("session_scope", r"\bone focused parent concern\b"),
        Requirement("suitability", r"\bsuitability\b.{0,80}\bavailability\b"),
        Requirement("permission_before_payment", r"\bfounder confirmation required before payment\b"),
        Requirement("rm350_methods", r"\bbank transfer\b.{0,80}\bduitnow qr\b"),
        Requirement("not_automatic", r"\b(?:not|does not)\b.{0,60}\bautomatic booking confirmation\b"),
        Requirement("manual_after_verification", r"\bverifies payment before confirming\b"),
        Requirement("home_price", r"\brm\s*1,?800\b"),
        Requirement("home_sessions", r"\bfour 60-minute sessions\b"),
        Requirement("home_window", r"\bapproximately 6\s*[–-]\s*8 weeks\b"),
        Requirement("home_no_checkin", r"\bno additional post-programme check-in\b"),
        Requirement("positioning", r"\bchoose the level of support that fits what you need right now\b"),
        Requirement("first_step_boundary", r"\bnot a consultation, assessment, diagnostic service, or advice session\b"),
        Requirement("rm350_promise", r"\bone repeated concern\. one clear next step\b"),
        Requirement("rm350_working_understanding", r"\bworking understanding of the pattern\b"),
        Requirement("rm350_observe", r"\bworth observing or investigating\b"),
        Requirement("rm350_response", r"\bone practical response to try\b"),
        Requirement("rm350_summary", r"\bconcise written next-step summary\b"),
        Requirement("home_promise", r"\bturn autism advice into a practical home plan you can actually use\b"),
        Requirement("home_priority", r"\bprioritise the most important concern\b"),
        Requirement("home_plan", r"\bpractical home-support plan\b"),
        Requirement("home_implementation", r"\bimplementation guidance\b"),
        Requirement("home_review", r"\breview what happened\b"),
        Requirement("home_adjust", r"\badjust the plan based on your family’s experience\b"),
        Requirement("home_summary", r"\bfinal written plan or summary\b"),
    ),
    "terms.html": (
        Requirement("session_name", r"\bone-concern parent session\b"),
        Requirement("session_price", r"\brm\s*350\b"),
        Requirement("session_duration", r"\b45(?:-|\s)minute(?:s)?\b"),
        Requirement("session_delivery", r"\bgoogle meet\b"),
        Requirement("session_scope", r"\bone focused parent concern\b"),
        Requirement("suitability", r"\bsuitability\b.{0,80}\bavailability\b"),
        Requirement("permission_before_payment", r"\bonly after that permission should payment be made\b"),
        Requirement("rm350_methods", r"\bbank transfer\b.{0,80}\bduitnow qr\b"),
        Requirement("not_automatic", r"\bdoes not create automatic booking confirmation\b"),
        Requirement("manual_after_verification", r"\bverifies payment before confirming\b"),
        Requirement("home_price", r"\brm\s*1,?800\b"),
        Requirement("home_sessions", r"\bfour 60-minute sessions\b"),
        Requirement("home_window", r"\bapproximately 6\s*[–-]\s*8 weeks\b"),
        Requirement("home_no_checkin", r"\bno additional post-programme check-in\b"),
    ),
    "pay/index.html": (
        Requirement("session_name", r"\bone-concern parent session\b"),
        Requirement("session_price", r"\brm\s*350\b"),
        Requirement("session_duration", r"\b45(?:-|\s)minute(?:s)?\b"),
        Requirement("session_delivery", r"\bgoogle meet\b"),
        Requirement("session_scope", r"\bone focused parent concern\b"),
        Requirement("suitability", r"\bsuitability\b.{0,80}\bavailability\b"),
        Requirement("permission_before_payment", r"\bonly then should you pay\b"),
        Requirement("rm350_methods", r"\bmaybank\b.{0,120}\bduitnow qr\b"),
        Requirement("not_automatic", r"\bnot automatic booking confirmation\b"),
        Requirement("manual_after_verification", r"\bverifies payment\b.{0,80}\bconfirms the booking\b"),
        Requirement("home_price", r"\brm\s*1,?800\b"),
        Requirement("home_sessions", r"\bfour 60-minute sessions\b"),
        Requirement("home_window", r"\bapproximately 6\s*[–-]\s*8 weeks\b"),
        Requirement("home_no_checkin", r"\bno additional post-programme check-in\b"),
    ),
}


def historical_or_prohibited(term: str) -> str:
    marker = r"\b(?:historically|formerly|previously|retired|superseded|not offered|not available|do not use|never reintroduce|must not be used)\b"
    return rf"(?:{marker}.{{0,80}}(?:{term})|(?:{term}).{{0,80}}{marker})"


GLOBAL_RULES = (
    Rule(
        "retired.parent_strategy_session",
        r"\bparent strategy session\b",
        negation=historical_or_prohibited(r"\bparent strategy session\b"),
    ),
    Rule(
        "retired.focused_parent_support",
        r"\bfocused parent support\b",
        negation=historical_or_prohibited(r"\bfocused parent support\b"),
    ),
    Rule(
        "retired.quick_clarity",
        r"\bquick clarity\b",
        negation=historical_or_prohibited(r"\bquick clarity\b"),
    ),
    Rule(
        "retired.full_implementation",
        r"\bfull implementation\b",
        negation=historical_or_prohibited(r"\bfull implementation\b"),
    ),
    Rule(
        "retired.progress_check_call",
        r"\bprogress check call\b",
        negation=historical_or_prohibited(r"\bprogress check call\b"),
    ),
    Rule(
        "retired.free_discovery_call",
        r"free-discovery-call",
        negation=historical_or_prohibited(r"free-discovery-call"),
    ),
    Rule(
        "retired.rm950",
        r"\brm\s*950\b",
        negation=historical_or_prohibited(r"\brm\s*950\b"),
    ),
    Rule(
        "retired.rm2500",
        r"\brm\s*2,?500\b",
        negation=historical_or_prohibited(r"\brm\s*2,?500\b"),
    ),
    Rule(
        "scope.repeated_concern",
        r"\bone\s+repeated\s+concern\b",
        negation=r"\bone repeated concern[.,]\s*one clear next step\b|\b(?:not|never|does not|do not|is not)\b.{0,60}\bone\s+repeated\s+concern\b",
    ),
    Rule(
        "scope.repeated_pattern",
        r"\b(?:(?:one|a)\s+repeated[-\s]+pattern|repeated[-\s]+pattern\s+positioning)\b",
        negation=r"\b(?:not|never|does not|do not|is not)\b.{0,60}\brepeated[-\s]+pattern\b",
    ),
    Rule(
        "delivery.generic_online",
        r"\bon\s*line\b",
        context=r"\b(?:one-concern parent session|rm\s*350)\b",
        negation=r"\b(?:not|never|does not|is not|cannot)\b.{0,50}\bon\s*line\b",
        kinds=frozenset({"article", "li", "div", "p", "text", "jsonld_record", "application_json_record"}),
    ),
    Rule(
        "booking.automatic_confirmation",
        r"\b(?:automatic booking confirmation|automatically confirmed|automatically booked)\b",
        negation=r"\b(?:not|no|never|does not|is not|cannot)\b.{0,50}\b(?:automatic|automatically)\b",
    ),
    Rule(
        "booking.direct_confirmation",
        r"\bdirect(?:ly)?\b.{0,40}\b(?:booking )?confirm(?:ation|ed)?\b|\bconfirm(?:ation|ed)?\b.{0,40}\bdirect(?:ly)?\b",
        negation=r"\b(?:not|no|never|does not|is not|cannot)\b.{0,60}\bdirect(?:ly)?\b",
    ),
    Rule(
        "payment.before_permission",
        r"\b(?:pay|payment)\b.{0,80}\bbefore\b.{0,120}\b(?:founder|cj)\b.{0,120}\b(?:permission|review|suitability|availability|confirm)\w*\b",
        context=r"\b(?:one-concern parent session|rm\s*350)\b",
        kinds=frozenset({"article", "li", "div", "p", "text", "jsonld_record", "application_json_record"}),
    ),
    Rule(
        "home.additional_checkin",
        r"\badditional\b.{0,50}\b(?:post-programme )?check-in\b",
        negation=r"\b(?:no|not|never|without)\b.{0,35}\badditional\b",
    ),
    Rule(
        "launch.authorized",
        r"(?:\b(?:public\s+)?launch\b.{0,50}\b(?:authori[sz]ed|approved|live)\b|\b(?:authori[sz]ed|approved|live)\b.{0,50}\b(?:public\s+)?launch\b)",
        negation=r"\b(?:not|never|without|preparation_not_launched\s*/\s*not_authorised)\b.{0,50}\b(?:authori[sz]ed|approved|live|launch)\b|\bnot_authori[sz]ed\b",
    ),
    Rule(
        "launch.public_availability",
        r"(?:\b(?:pilot|apc|service|programme|website)\b.{0,60}\b(?:now\s+)?publicly available\b|\b(?:open|available) to the public\b|\bnow publicly available\b)",
        negation=r"\b(?:not|never|is not|isn't|historically|previously|not yet)\b.{0,60}\b(?:publicly available|open to the public|available to the public)\b",
    ),
)

MUTATION_SIGNAL = re.compile(
    r"(?:write_text|write_bytes)\s*\(|open\s*\([^\n]*[, ]\s*['\"](?:w|a|x)[+b]?['\"]",
    FLAGS,
)
HTML_TARGET_SIGNAL = re.compile(
    r"\.html\b|glob\s*\(\s*['\"][^'\"]*\.html|html_files|resources_html",
    FLAGS,
)
BLOCK_TAGS = frozenset(
    {
        "article", "li", "ol", "ul", "section", "div", "p",
        "h1", "h2", "h3", "h4", "h5", "h6",
    }
)
RELEVANT_ATTRIBUTES = frozenset({"href", "src", "action", "content", "value", "aria-label"})
OFFER_BLOCK_KINDS = frozenset(
    {"article", "li", "ol", "p", "jsonld_record", "application_json_record"}
)
SESSION_AUTHORITY = AUTHORITY["offers"]["one_concern"]
HOME_AUTHORITY = AUTHORITY["offers"]["home_support"]
SESSION_POLICY = OfferPolicy(
    identifier="session",
    context=(
        r"\b(?:one-concern parent session|rm\s*350|"
        r"(?:current\s+)?session\s+(?:price|duration|delivery platform|payment method))\b"
    ),
    allowed_price=str(SESSION_AUTHORITY["price"]["value"]),
    allowed_duration=str(SESSION_AUTHORITY["duration_minutes"]),
    allowed_delivery=tuple(
        rf"\b{re.escape(value)}\b" for value in SESSION_AUTHORITY["delivery_platforms"]
    ),
)
HOME_CONTEXT = re.compile(
    r"\b(?:apc home support programme|home support programme|structured home support|home support|rm\s*1,?800)\b",
    FLAGS,
)
DELIVERY_ASSERTION = re.compile(
    r"\b(?:delivery platform|delivered\s+(?:via|on|through|using|by)|held\s+(?:via|on)|"
    r"conducted\s+(?:via|on)|takes place\s+(?:via|on)|session\s+(?:is\s+)?(?:via|on)|"
    r"video[-\s]+call delivery)\b",
    FLAGS,
)
REORDERED_SEQUENCE = re.compile(
    r"(?:\b(?:pay|payment)\s+first\b|"
    r"\b(?:pay|payment)\b.{0,60}\bthen\b.{0,60}\b(?:submit\w*\s+(?:a\s+)?request|request\w*\s+(?:approval|permission)|review\w*\s+(?:the\s+)?request)\b|"
    r"\b(?:confirm|confirmation)\w*\s+first\b|"
    r"\bconfirm(?:s|ed|ing)?\s+(?:the\s+)?booking\b.{0,100}\bbefore\b.{0,100}\b(?:payment proof|verification|request|review)\b|"
    r"\breview\w*\b.{0,100}\bafter\b.{0,30}\b(?:receiv\w*|receipt\s+of)\s+payment\b|"
    r"\bapproval\b.{0,100}\bafter\b.{0,100}\bpayment\b|"
    r"\bbooking\b.{0,80}\bconfirm\w*\s+immediately\b.{0,160}\b(?:proof|verification|checked)\b.{0,80}\bafterwards\b)",
    FLAGS,
)
PAYMENT_METHOD_TOKEN = re.compile(
    r"\b(?:maybank(?:\s+bank)?\s+transfer|bank transfer|duitnow qr|paypal|stripe|cash|"
    r"credit cards?|debit cards?|cards?|cryptocurrency|crypto|wise|e-?wallets?|"
    r"grabpay|venmo|touch\s*['’]?n\s*go)\b|paypal\.",
    FLAGS,
)
UNAPPROVED_PAYMENT_TOKEN = re.compile(
    r"\b(?:paypal|stripe|cash|credit cards?|debit cards?|cards?|cryptocurrency|crypto|"
    r"wise|e-?wallets?|grabpay|venmo|touch\s*['’]?n\s*go)\b|paypal\.",
    FLAGS,
)
UNAPPROVED_DELIVERY_TOKEN = re.compile(
    r"\b(?:zoom|microsoft teams|teams|webex|skype|jitsi|facetime|whatsapp\s+video|"
    r"telephone|phone(?:\s+call)?|video\s*call|in[-\s]?person|hybrid|on\s*line)\b",
    FLAGS,
)
PRICE_VALUE = re.compile(
    r"\b(?:r\s*m|myr)\s*([0-9](?:[0-9,]|\s(?=[0-9]))*)\b",
    FLAGS,
)
MINUTE_VALUE = re.compile(
    r"\b([0-9](?:\s*[0-9]){0,2})(?:-|\s)minute(?:s)?\b",
    FLAGS,
)
HOUR_VALUE = re.compile(r"\b([0-9]+(?:\.[0-9]+)?)\s*hours?\b", FLAGS)
STRUCTURED_PRICE_KEYS = frozenset({"price", "amount", "fee", "value"})
STRUCTURED_CURRENCY_KEYS = frozenset({"pricecurrency", "currency"})
STRUCTURED_DURATION_KEYS = frozenset({"duration", "durationminutes", "sessionduration"})
STRUCTURED_DELIVERY_KEYS = frozenset(
    {"delivery", "deliveryplatform", "meetingplatform", "platform", "location"}
)
STRUCTURED_PAYMENT_KEYS = frozenset(
    {"payment", "paymentmethod", "paymentmethods", "checkout", "href", "action"}
)
STRUCTURED_LAUNCH_KEYS = frozenset(
    {"availability", "booking", "bookings", "confirmation", "launch", "status"}
)
PUBLIC_STATE_PATTERN = re.compile(
    r"\b(?:"
    r"(?:enrolment|enrollment|bookings?)\s+(?:is\s+|are\s+)?(?:now\s+)?open|"
    r"(?:programme|program|service|website|pilot|apc)?\s*(?:is\s+|are\s+)?now\s+available(?:\s+nationwide)?|"
    r"available\s+nationwide|open\s+to\s+(?:everyone|the\s+public)|"
    r"available\s+to\s+the\s+public|generally\s+available|publicly\s+available|"
    r"officially\s+launched|live\s+for\s+public\s+booking"
    r")\b",
    FLAGS,
)
SEQUENCE_EVENTS = (
    ("request", re.compile(r"\b(?:submit(?:ting)? (?:a )?(?:booking )?request|booking form (?:as|submits) a request)\b", FLAGS)),
    ("review", re.compile(r"\breview\w*\b.{0,100}\bsuitability\b.{0,80}\bavailability\b", FLAGS)),
    ("permission", re.compile(r"\b(?:permission|confirm\w*\s+whether\s+(?:(?:the )?request|it)\s+can proceed|confirmed that (?:the )?request can proceed)\b", FLAGS)),
    ("payment", re.compile(r"\b(?:pay|payment)\b", FLAGS)),
    ("proof", re.compile(r"\b(?:payment )?proof\b", FLAGS)),
    ("verification", re.compile(r"\bverif(?:y|ies|ied|ication)\b", FLAGS)),
    ("manual_confirmation", re.compile(r"\bconfirm(?:s|ed|ing)? (?:the )?booking\b|\bmanually confirm\b", FLAGS)),
)


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", unescape(value))
    return re.sub(r"\s+", " ", value).strip()


def split_claims(value: str) -> list[str]:
    return [
        normalize(part)
        for part in re.split(
            r"(?<=[.!?;])\s+|\bbut\b|\bhowever\b|,?\s+or\s+the\s+(?=rm\s*[0-9])",
            normalize(value),
            flags=re.IGNORECASE,
        )
        if normalize(part)
    ]


def split_clauses(value: str) -> list[str]:
    return [
        normalize(part)
        for part in re.split(
            r"(?<=[.!?;])\s+|,?\s+\b(?:and|but|however)\b\s+",
            normalize(value),
            flags=re.IGNORECASE,
        )
        if normalize(part)
    ]


def _is_historical(value: str) -> bool:
    return bool(
        re.search(r"\b(?:historically|formerly|previously|retired|superseded)\b", value, FLAGS)
    )


def _match_is_negated(clause: str, match: re.Match[str]) -> bool:
    prefix = clause[max(0, match.start() - 70):match.start()]
    suffix = clause[match.end():match.end() + 70]
    return bool(
        re.search(
            r"\b(?:not|never|no|does not|do not|is not|isn't|cannot|can't|must not)\b"
            r"(?:\W+\w+){0,5}\W*$",
            prefix,
            FLAGS,
        )
        or re.search(
            r"^\W*(?:is|are|was|were|will be|remains?)?\W*"
            r"(?:not|never)\b.{0,40}\b(?:accepted|supported|available|offered|used|allowed|confirmed|open)\b",
            suffix,
            FLAGS,
        )
    )


def _has_active_target(value: str, target: re.Pattern[str] | str) -> bool:
    pattern = re.compile(target, FLAGS) if isinstance(target, str) else target
    for clause in split_clauses(value):
        if _is_historical(clause):
            continue
        for match in pattern.finditer(clause):
            if not _match_is_negated(clause, match):
                return True
    return False


def _target_is_negated(value: str, target: re.Pattern[str] | str) -> bool:
    pattern = re.compile(target, FLAGS) if isinstance(target, str) else target
    matches = [
        (clause, match)
        for clause in split_clauses(value)
        for match in pattern.finditer(clause)
    ]
    return bool(matches) and all(_match_is_negated(clause, match) for clause, match in matches)


def _canonical_number(raw: str) -> str:
    return re.sub(r"[\s,]", "", raw)


def _field_map(surface: Surface) -> dict[str, str]:
    return {normalize(key).casefold(): normalize(value) for key, value in surface.fields}


STRUCTURED_CONTEXT_KEYS = frozenset({"name", "offer", "service", "product", "title"})
STRUCTURED_INVALID_VALUE = "__apc_invalid_structured_value__"
STRUCTURED_CONTEXT_STATUS_KEY = "__apc_structured_context_status__"
STRUCTURED_CONTEXT_INVALID = "invalid"
STRUCTURED_CONTEXT_PENDING = "pending"
STRUCTURED_CONTEXT_UNRELATED = "unrelated"
STRUCTURED_CONTEXT_OBJECT = "__apc_structured_context_object__"
STRUCTURED_GOVERNED_KEYS = frozenset().union(
    STRUCTURED_PRICE_KEYS,
    STRUCTURED_CURRENCY_KEYS,
    STRUCTURED_DURATION_KEYS,
    STRUCTURED_DELIVERY_KEYS,
    STRUCTURED_PAYMENT_KEYS,
    STRUCTURED_LAUNCH_KEYS,
)


def _compact_structured_key(key: str) -> str:
    return re.sub(r"[^a-z]", "", normalize(key).casefold())


def _structured_governing_key(key: str, inherited: str | None = None) -> str | None:
    normalized = normalize(key)
    if _compact_structured_key(normalized) in STRUCTURED_GOVERNED_KEYS:
        return normalized
    return inherited


def _structured_scalar_text(value: object) -> str:
    if value is None or isinstance(value, bool):
        return STRUCTURED_INVALID_VALUE
    if isinstance(value, float) and not math.isfinite(value):
        return STRUCTURED_INVALID_VALUE
    if isinstance(value, (str, int, float)):
        rendered = normalize(str(value))
        return rendered or STRUCTURED_INVALID_VALUE
    return STRUCTURED_INVALID_VALUE


def _context_status(context: Iterable[tuple[str, str]]) -> str | None:
    return next(
        (
            normalize(value).casefold()
            for key, value in context
            if normalize(key).casefold() == STRUCTURED_CONTEXT_STATUS_KEY
        ),
        None,
    )


def _context_with_status(
    context: tuple[tuple[str, str], ...],
    status: str,
    evidence: Iterable[tuple[str, str]] = (),
) -> tuple[tuple[str, str], ...]:
    material = tuple(
        item for item in context if normalize(item[0]).casefold() != STRUCTURED_CONTEXT_STATUS_KEY
    )
    local = tuple((normalize(key), normalize(value)) for key, value in evidence)
    combined = tuple(item for item in material if item not in local) + local
    return combined + ((STRUCTURED_CONTEXT_STATUS_KEY, status),)


def _governed_context_fields(
    fields: Iterable[tuple[str, str]],
    inherited: tuple[tuple[str, str], ...] = (),
) -> tuple[tuple[str, str], ...]:
    local = tuple(
        (normalize(key), normalize(value))
        for key, value in fields
        if _compact_structured_key(key) in STRUCTURED_CONTEXT_KEYS
    )
    if not local:
        return inherited

    malformed = any(value == STRUCTURED_INVALID_VALUE for _, value in local)
    has_object = any(value == STRUCTURED_CONTEXT_OBJECT for _, value in local)
    scalar = tuple(
        (key, value)
        for key, value in local
        if value not in {STRUCTURED_INVALID_VALUE, STRUCTURED_CONTEXT_OBJECT}
    )
    classifications = set()
    for _, value in scalar:
        has_session = bool(re.search(SESSION_POLICY.context, value, FLAGS))
        has_home = bool(HOME_CONTEXT.search(value))
        if has_session and has_home:
            classifications.add(STRUCTURED_CONTEXT_INVALID)
        elif has_session:
            classifications.add("session")
        elif has_home:
            classifications.add("home")
        else:
            classifications.add(STRUCTURED_CONTEXT_UNRELATED)

    if malformed or len(classifications) > 1 or STRUCTURED_CONTEXT_INVALID in classifications:
        return _context_with_status(inherited, STRUCTURED_CONTEXT_INVALID, scalar)
    if classifications:
        classification = next(iter(classifications))
        if classification == STRUCTURED_CONTEXT_UNRELATED:
            return _context_with_status((), STRUCTURED_CONTEXT_UNRELATED, scalar)
        return scalar
    if has_object:
        return inherited or ((STRUCTURED_CONTEXT_STATUS_KEY, STRUCTURED_CONTEXT_PENDING),)
    return _context_with_status(inherited, STRUCTURED_CONTEXT_INVALID)


def _json_context_fields(value: object, key: str) -> tuple[tuple[str, str], ...]:
    normalized_key = normalize(key)
    if isinstance(value, str):
        return ((normalized_key, normalize(value) or STRUCTURED_INVALID_VALUE),)
    if isinstance(value, list):
        if not value:
            return ((normalized_key, STRUCTURED_INVALID_VALUE),)
        return tuple(
            item
            for child in value
            for item in _json_context_fields(child, normalized_key)
        )
    if isinstance(value, dict):
        marker = STRUCTURED_CONTEXT_OBJECT if value else STRUCTURED_INVALID_VALUE
        return ((normalized_key, marker),)
    return ((normalized_key, STRUCTURED_INVALID_VALUE),)


def _contextual_fields(
    fields: Iterable[tuple[str, str]],
    context: tuple[tuple[str, str], ...],
) -> tuple[tuple[str, str], ...]:
    local = tuple((normalize(key), normalize(value)) for key, value in fields)
    inherited = tuple(item for item in context if item not in local)
    return inherited + local


# Complete JavaScript MIME essence set from the MIME Sniffing Standard:
# https://mimesniff.spec.whatwg.org/#javascript-mime-type
JAVASCRIPT_MIME_ESSENCES = frozenset(
    {
        "application/ecmascript",
        "application/javascript",
        "application/x-ecmascript",
        "application/x-javascript",
        "text/ecmascript",
        "text/javascript",
        "text/javascript1.0",
        "text/javascript1.1",
        "text/javascript1.2",
        "text/javascript1.3",
        "text/javascript1.4",
        "text/javascript1.5",
        "text/jscript",
        "text/livescript",
        "text/x-ecmascript",
        "text/x-javascript",
    }
)
ASCII_WHITESPACE = "\t\n\f\r "
JAVASCRIPT_URL_SCHEME = re.compile(r"^[\t\n\f\r ]*javascript:", FLAGS)
EXECUTABLE_AUTHORITY_CONTEXT_WORDS = frozenset(
    {"name", "offer", "service", "product", "title"}
)
EXECUTABLE_AUTHORITY_FACT_WORDS = frozenset(
    {
        "price",
        "currency",
        "duration",
        "delivery",
        "platform",
        "payment",
        "method",
        "booking",
        "confirmation",
        "scope",
        "launch",
        "availability",
    }
)
EXECUTABLE_AUTHORITY_STRONG_IDENTIFIERS = frozenset(
    {
        "offername",
        "servicename",
        "productname",
        "sessionprice",
        "serviceprice",
        "productprice",
        "price",
        "pricecurrency",
        "currency",
        "duration",
        "durationminutes",
        "delivery",
        "deliveryplatform",
        "paymentmethod",
        "paymentmethods",
        "bookingsequence",
        "confirmationsequence",
        "programmescope",
        "launchstate",
        "availabilitystate",
    }
)
EXECUTABLE_AUTHORITY_PROPERTY = re.compile(
    r"(?:^|[,{;])\s*(?:get\s+|set\s+)?(?:\[\s*)?['\"]?"
    r"(?:price|currency|duration|delivery|payment|booking|confirmation|scope|launch|availability)"
    r"['\"]?(?:\s*\])?\s*(?::|\()",
    FLAGS,
)
EXECUTABLE_AUTHORITY_PHRASES = tuple(
    re.compile(pattern, FLAGS)
    for pattern in (
        r"\bone concern(?:\s+\w+){0,3}\s+parent session\b",
        r"\b(?:apc\s+)?home support programme\b",
        r"\bparent strategy session\b",
        r"\bone focused parent concern\b",
        r"\brm\s*(?:350|1\s*800)\b",
        r"\bgoogle meet\b",
        r"\bmaybank bank transfer\b",
        r"\bduitnow qr\b",
        r"\bbooking request\b",
        r"\b(?:automatic booking|manual) confirmation\b",
        r"\b(?:public launch|bookings open|enrolment open|available nationwide)\b",
        r"\bpreparation not launched\b",
        r"\bnot authori[sz]ed\b",
        r"\badditional post programme check in\b",
    )
)


def _javascript_without_comments(source: str) -> str:
    """Remove comments lexically without evaluating or parsing JavaScript."""
    output: list[str] = []
    index = 0
    quote: str | None = None
    while index < len(source):
        character = source[index]
        if quote is not None:
            output.append(character)
            if character == "\\" and index + 1 < len(source):
                index += 1
                output.append(source[index])
            elif character == quote:
                quote = None
            index += 1
            continue
        if character in {"'", '"', "`"}:
            quote = character
            output.append(character)
            index += 1
            continue
        if source.startswith("//", index):
            newline = source.find("\n", index + 2)
            if newline == -1:
                break
            output.append("\n")
            index = newline + 1
            continue
        if source.startswith("/*", index):
            closing = source.find("*/", index + 2)
            if closing == -1:
                break
            output.append(" ")
            index = closing + 2
            continue
        output.append(character)
        index += 1
    return "".join(output)


def _javascript_authority_text(source: str) -> str:
    uncommented = _javascript_without_comments(source)
    separated = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", uncommented)
    return normalize(re.sub(r"[^A-Za-z0-9]+", " ", separated)).casefold()


def _executable_javascript_contains_authority(source: str) -> bool:
    """Recognize a bounded authority surface without interpreting JavaScript."""
    uncommented = _javascript_without_comments(source)
    authority_text = _javascript_authority_text(source)
    words = frozenset(authority_text.split())
    compact_identifiers = {
        re.sub(r"[^a-z]", "", value.casefold())
        for value in re.findall(r"[A-Za-z_$][\w$-]*", uncommented)
    }
    return bool(
        any(pattern.search(authority_text) for pattern in EXECUTABLE_AUTHORITY_PHRASES)
        or EXECUTABLE_AUTHORITY_PROPERTY.search(uncommented)
        or compact_identifiers & EXECUTABLE_AUTHORITY_STRONG_IDENTIFIERS
        or (
            words & EXECUTABLE_AUTHORITY_CONTEXT_WORDS
            and words & EXECUTABLE_AUTHORITY_FACT_WORDS
        )
    )


def _script_type_classification(raw_type: str) -> str:
    normalized = raw_type.strip(ASCII_WHITESPACE).casefold()
    if not normalized or normalized == "module":
        return "javascript"
    essence = normalized.split(";", 1)[0].rstrip(ASCII_WHITESPACE)
    if essence == "application/ld+json":
        return "jsonld"
    if essence == "application/json":
        return "application_json"
    if essence in JAVASCRIPT_MIME_ESSENCES:
        return "javascript"
    return "inert"


def _javascript_url_source(value: str) -> str | None:
    match = JAVASCRIPT_URL_SCHEME.match(value)
    return value[match.end():] if match else None


def _is_executable_javascript_invalid_kind(kind: str) -> bool:
    return bool(
        kind == "javascript_authority_invalid"
        or kind.startswith("javascript_event_handler_")
        or kind.startswith("javascript_url_")
    )


class AuthorityHTMLParser(HTMLParser):
    def __init__(self, path: str):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.page_parts: list[str] = []
        self.surfaces: list[Surface] = []
        self.blocks: list[tuple[str, list[str]]] = []
        self.skip_depth = 0
        self.script_type: str | None = None
        self.script_parts: list[str] = []
        self.structure_errors: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._add_executable_attribute_surfaces(tag, attrs)
        values = {name.casefold(): value or "" for name, value in attrs}
        if tag in {"style", "template"}:
            self.skip_depth += 1
        if tag == "script":
            self.script_type = (values.get("type") or "").lower()
            self.script_parts = []
        if tag in BLOCK_TAGS and self.skip_depth == 0 and self.script_type is None:
            self.page_parts.append(" ")
            for _, parts in self.blocks:
                parts.append(" ")
            self.blocks.append((tag, []))
        for attribute, value in values.items():
            if not value or not (
                attribute in RELEVANT_ATTRIBUTES or attribute.startswith("data-")
            ):
                continue
            rendered = normalize(f"{attribute}={value}")
            self.surfaces.append(
                Surface(self.path, "attribute", rendered, ((attribute, normalize(value)),))
            )
            if self.skip_depth == 0 and self.script_type is None:
                for _, parts in self.blocks:
                    parts.append(f" {rendered} ")

    def handle_startendtag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        self._add_executable_attribute_surfaces(tag, attrs)

    def handle_data(self, data: str) -> None:
        if self.script_type is not None:
            self.script_parts.append(data)
            return
        if self.skip_depth:
            return
        text = normalize(data)
        if not text:
            return
        self.page_parts.append(data)
        self.surfaces.append(Surface(self.path, "text", text))
        for _, parts in self.blocks:
            parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self.script_type is not None:
            script = "".join(self.script_parts)
            script_classification = _script_type_classification(self.script_type)
            if script_classification == "jsonld":
                self._add_json(script, "jsonld_record", "jsonld_invalid")
            elif script_classification == "application_json":
                self._add_json(
                    script,
                    "application_json_record",
                    "application_json_invalid",
                )
            elif script_classification == "javascript":
                self._add_executable_javascript(script)
            self.script_type = None
            self.script_parts = []
            return
        if tag in {"style", "template"} and self.skip_depth:
            self.skip_depth -= 1
            return
        if tag in BLOCK_TAGS:
            if not self.blocks or self.blocks[-1][0] != tag:
                self.structure_errors.append(f"unexpected closing {tag}")
                return
            _, parts = self.blocks.pop()
            self.surfaces.append(Surface(self.path, tag, normalize("".join(parts))))
            self.page_parts.append(" ")
            for _, outer_parts in self.blocks:
                outer_parts.append(" ")

    def finish(self) -> None:
        if self.blocks:
            self.structure_errors.append("unclosed governed block")

    def _add_structured_scalar(
        self,
        kind: str,
        context: tuple[tuple[str, str], ...],
        governing_key: str,
        value: object,
        structured_path: tuple[str, ...],
    ) -> None:
        rendered = value if isinstance(value, str) else _structured_scalar_text(value)
        fields = _contextual_fields(((normalize(governing_key), normalize(rendered)),), context)
        self.surfaces.append(
            Surface(
                self.path,
                kind,
                normalize(". ".join(f"{key}={item}" for key, item in fields)),
                fields,
                structured_path,
            )
        )

    def _add_invalid_structured_context(
        self,
        kind: str,
        context: tuple[tuple[str, str], ...],
        structured_path: tuple[str, ...],
        candidate: bool = True,
    ) -> None:
        if not candidate or _context_status(context) != STRUCTURED_CONTEXT_INVALID:
            return
        self.surfaces.append(
            Surface(
                self.path,
                kind,
                normalize(". ".join(f"{key}={value}" for key, value in context)),
                context,
                structured_path,
            )
        )

    def _add_executable_javascript(self, script: str) -> None:
        if _executable_javascript_contains_authority(script):
            self.surfaces.append(
                Surface(self.path, "javascript_authority_invalid", "invalid")
            )

    def _add_executable_attribute_surfaces(
        self, tag: str, attrs: Iterable[tuple[str, str | None]]
    ) -> None:
        element = normalize(tag).casefold() or "element"
        for raw_attribute, raw_value in attrs:
            attribute = normalize(raw_attribute).casefold()
            value = raw_value or ""
            if attribute.startswith("on") and _executable_javascript_contains_authority(value):
                self.surfaces.append(
                    Surface(
                        self.path,
                        f"javascript_event_handler_{element}_{attribute}_invalid",
                        "invalid",
                    )
                )
            javascript_source = _javascript_url_source(value)
            if javascript_source is not None and _executable_javascript_contains_authority(
                javascript_source
            ):
                self.surfaces.append(
                    Surface(
                        self.path,
                        f"javascript_url_{element}_{attribute}_invalid",
                        "invalid",
                    )
                )

    def _add_json(
        self,
        script: str,
        record_kind: str,
        invalid_kind: str,
    ) -> None:
        try:
            data = json.loads(script)
        except (TypeError, ValueError):
            self.surfaces.append(Surface(self.path, invalid_kind, "invalid"))
            return

        def visit(
            value: object,
            inherited_context: tuple[tuple[str, str], ...] = (),
            structured_path: tuple[str, ...] = (),
            governing_key: str | None = None,
        ) -> None:
            if isinstance(value, dict):
                scalar_items = tuple(
                    (normalize(str(key)), normalize(str(item)))
                    for key, item in value.items()
                    if isinstance(item, (str, int, float, bool))
                )
                context_items = tuple(
                    field
                    for key, item in value.items()
                    if _compact_structured_key(str(key)) in STRUCTURED_CONTEXT_KEYS
                    for field in _json_context_fields(item, str(key))
                )
                context = _governed_context_fields(context_items, inherited_context)
                self._add_invalid_structured_context(
                    record_kind,
                    context,
                    structured_path,
                )
                if scalar_items:
                    fields = _contextual_fields(scalar_items, context)
                    self.surfaces.append(
                        Surface(
                            self.path,
                            record_kind,
                            normalize(". ".join(f"{key}={item}" for key, item in fields)),
                            fields,
                            structured_path,
                        )
                    )
                if not value and governing_key is not None:
                    self._add_structured_scalar(
                        record_kind,
                        context,
                        governing_key,
                        STRUCTURED_INVALID_VALUE,
                        structured_path,
                    )
                for key, item in value.items():
                    normalized_key = normalize(str(key))
                    visit(
                        item,
                        context,
                        structured_path + (normalized_key,),
                        _structured_governing_key(normalized_key, governing_key),
                    )
            elif isinstance(value, list):
                if not value and governing_key is not None:
                    self._add_structured_scalar(
                        record_kind,
                        inherited_context,
                        governing_key,
                        STRUCTURED_INVALID_VALUE,
                        structured_path,
                    )
                for index, item in enumerate(value):
                    visit(
                        item,
                        inherited_context,
                        structured_path + (f"[{index}]",),
                        governing_key,
                    )
            elif governing_key is not None:
                self._add_structured_scalar(
                    record_kind,
                    inherited_context,
                    governing_key,
                    _structured_scalar_text(value),
                    structured_path,
                )

        visit(data)

def extract_surfaces(path: str, source: str) -> list[Surface]:
    parser = AuthorityHTMLParser(path)
    try:
        parser.feed(source)
        parser.close()
        parser.finish()
    except Exception:
        return [Surface(path, "html_invalid", "invalid")]
    if parser.structure_errors and path in GOVERNED_PAGES:
        parser.surfaces.append(Surface(path, "html_invalid", "invalid"))
    parser.surfaces.append(Surface(path, "page", normalize("".join(parser.page_parts))))
    return parser.surfaces


def committed_tracked_paths(root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "-z"],
        cwd=root,
        check=True,
        capture_output=True,
    )
    return [item for item in result.stdout.decode().split("\0") if item]


def load_tracked_documents(root: Path) -> dict[str, str]:
    documents: dict[str, str] = {}
    for relative in committed_tracked_paths(root):
        path = root / relative
        if not path.is_file():
            continue
        if relative.endswith((".html", ".py", ".md", ".js", ".mjs", ".cjs")):
            documents[relative] = path.read_text(encoding="utf-8")
    return documents


def _rule_matches(rule: Rule, surface: Surface) -> bool:
    if rule.kinds is not None and surface.kind not in rule.kinds:
        return False
    if rule.context and not re.search(rule.context, surface.text, FLAGS):
        return False
    if not re.search(rule.pattern, surface.text, FLAGS):
        return False
    if rule.negation and re.search(rule.negation, surface.text, FLAGS):
        return False
    return True


def _active_claim_surfaces(surfaces: Iterable[Surface]) -> Iterable[Surface]:
    for surface in surfaces:
        if surface.kind in {
            "html_invalid",
            "jsonld_invalid",
            "application_json_invalid",
            "javascript_authority_invalid",
        }:
            yield surface
            continue
        if surface.kind in {"article", "li", "section", "div", "p", "page", "text"}:
            approved_promise = re.sub(
                r"\bone repeated concern\.\s*one clear next step\.",
                "One repeated concern, one clear next step.",
                surface.text,
                flags=FLAGS,
            )
            for claim in split_clauses(approved_promise):
                yield Surface(surface.path, surface.kind, claim)
        else:
            yield surface


def _ordered_booking_sequence(value: str) -> bool:
    offset = 0
    for _, pattern in SEQUENCE_EVENTS:
        match = pattern.search(value, offset)
        if not match:
            return False
        offset = match.end()
    return True


def _binding_candidates(
    surfaces: Iterable[Surface], binding: Mapping[str, Any]
) -> tuple[Surface, ...]:
    kind = str(binding["kind"])
    signals = tuple(normalize(str(value)) for value in binding["signals"])

    def semantic_match(signal: str, text: str) -> bool:
        escaped = re.escape(signal)
        escaped = escaped.replace(r"\ ", r"\s+").replace(r"\-", r"(?:-|\s)")
        escaped = escaped.replace(",", ",?")
        if re.fullmatch(r"RM\s*[0-9,]+", signal, FLAGS):
            digits = re.sub(r"\D", "", signal)
            escaped = rf"r\s*m\s*{digits[:-3]},?{digits[-3:]}" if len(digits) > 3 else rf"r\s*m\s*{digits}"
        return bool(re.search(rf"\b{escaped}\b", text, FLAGS))

    return tuple(
        surface
        for surface in surfaces
        if surface.kind == kind
        and all(semantic_match(signal, surface.text) for signal in signals)
    )


def _governed_bindings(
    surfaces: Iterable[Surface],
) -> tuple[dict[tuple[str, str], tuple[Surface, ...]], set[Finding]]:
    material = tuple(surfaces)
    bound: dict[tuple[str, str], tuple[Surface, ...]] = {}
    findings: set[Finding] = set()
    for offer_name, offer in AUTHORITY["offers"].items():
        for path, binding in offer["bindings"].items():
            matches = _binding_candidates(
                (surface for surface in material if surface.path == path), binding
            )
            bound[(offer_name, path)] = matches
            if len(matches) != 1:
                state = "missing" if not matches else "duplicate"
                findings.add(Finding(f"binding.{offer_name}.{state}", path, binding["kind"]))
    return bound, findings


def _surface_has_session_context(surface: Surface) -> bool:
    fields = _field_map(surface)
    structured_context = " ".join(
        fields.get(key, "") for key in ("name", "offer", "service", "product", "title")
    )
    return bool(
        re.search(SESSION_POLICY.context, surface.text, FLAGS)
        or re.search(SESSION_POLICY.context, structured_context, FLAGS)
        or re.search(r"\bdata-show\s*=\s*350\b", surface.text, FLAGS)
    )


def _surface_has_home_context(surface: Surface) -> bool:
    fields = _field_map(surface)
    structured_context = " ".join(
        fields.get(key, "") for key in ("name", "offer", "service", "product", "title")
    )
    return bool(HOME_CONTEXT.search(surface.text) or HOME_CONTEXT.search(structured_context))


def _payment_claim_is_invalid(surface: Surface, value: str) -> bool:
    for clause in split_clauses(value):
        if _is_historical(clause):
            continue
        method_matches = list(PAYMENT_METHOD_TOKEN.finditer(clause))
        asserted_method = bool(
            method_matches
            and re.search(
                r"\b(?:accept\w*|pay\w*|paid|settle\w*|checkout|payment|method|offered|available|use\w*)\b"
                r"|\bis\s+supported\b|\bsupports\s+(?:this|the|payment|session)\b",
                clause,
                FLAGS,
            )
        )
        unknown_method_assertion = bool(
            re.search(
                r"\b(?:pay|paid|settle)\b.{0,30}\b(?:by|with|using|through)\b\s+[A-Za-z]"
                r"|\bpayment (?:method|option)s? (?:is|are|include)\b"
                r"|\baccepts?\b.{0,50}\bpayment\b",
                clause,
                FLAGS,
            )
        )
        if not asserted_method and not unknown_method_assertion:
            continue
        active_methods = [match for match in method_matches if not _match_is_negated(clause, match)]
        if not active_methods:
            if method_matches:
                continue
            return True
        for match in active_methods:
            method = normalize(match.group(0)).casefold()
            if UNAPPROVED_PAYMENT_TOKEN.fullmatch(match.group(0)):
                return True
            if method not in {
                "bank transfer",
                "maybank transfer",
                "maybank bank transfer",
                "duitnow qr",
            }:
                return True
    return False


def _delivery_claim_is_invalid(value: str) -> bool:
    for clause in split_clauses(value):
        if _is_historical(clause) or not DELIVERY_ASSERTION.search(clause):
            continue
        alternative_matches = list(UNAPPROVED_DELIVERY_TOKEN.finditer(clause))
        active_alternatives = [
            match for match in alternative_matches if not _match_is_negated(clause, match)
        ]
        if active_alternatives:
            return True
        if alternative_matches:
            continue
        if not re.search(r"\bgoogle meet\b", clause, FLAGS):
            return True
        if re.search(r"\bgoogle meet\b\s*(?:,|/|\bor\b|\band\b)\s*\w+", clause, FLAGS):
            return True
    return False


def _session_value_findings(surface: Surface) -> set[Finding]:
    findings: set[Finding] = set()
    for claim in split_claims(surface.text):
        if HOME_CONTEXT.search(claim) and not re.search(SESSION_POLICY.context, claim, FLAGS):
            continue
        for match in PRICE_VALUE.finditer(claim):
            if re.search(r"\bsave\s*$", claim[max(0, match.start() - 12):match.start()], FLAGS):
                continue
            numeric = _canonical_number(match.group(1))
            if numeric == str(HOME_AUTHORITY["price"]["value"]) and HOME_CONTEXT.search(claim):
                continue
            if numeric != SESSION_POLICY.allowed_price:
                findings.add(Finding("value.session_price", surface.path, surface.kind))
        for match in re.finditer(
            r"\b(?:price|amount|fee|value)\s*=\s*['\"]?([0-9][0-9,.]*)", claim, FLAGS
        ):
            if _canonical_number(match.group(1).split(".", 1)[0]) != SESSION_POLICY.allowed_price:
                findings.add(Finding("value.session_price", surface.path, surface.kind))
        for match in MINUTE_VALUE.finditer(claim):
            if _canonical_number(match.group(1)) != SESSION_POLICY.allowed_duration:
                findings.add(Finding("value.session_duration", surface.path, surface.kind))
        if re.search(
            r"\b(?:current\s+)?session\s+(?:duration|length)\b.{0,50}\b[0-9]+(?:\.[0-9]+)?\s*hours?\b"
            r"|\b(?:lasts?|duration(?:\s+is)?)\b.{0,30}\b[0-9]+(?:\.[0-9]+)?\s*hours?\b",
            claim,
            FLAGS,
        ):
            findings.add(Finding("value.session_duration", surface.path, surface.kind))
        for left, right in re.findall(
            r"\b([0-9]+)\s*(?:[–-]|\bor\b)\s*([0-9]+)\s+minutes?\b", claim, FLAGS
        ):
            if (left, right) != (SESSION_POLICY.allowed_duration, SESSION_POLICY.allowed_duration):
                findings.add(Finding("value.session_duration", surface.path, surface.kind))
    fields = _field_map(surface)
    for key, value in fields.items():
        compact_key = re.sub(r"[^a-z]", "", key)
        if compact_key in STRUCTURED_PRICE_KEYS:
            numeric_value: str | None = None
            if re.fullmatch(r"[0-9]+(?:\.0+)?", value):
                numeric_value = str(int(float(value)))
            else:
                price_match = PRICE_VALUE.fullmatch(value)
                if price_match:
                    numeric_value = _canonical_number(price_match.group(1))
            if numeric_value != SESSION_POLICY.allowed_price:
                findings.add(Finding("value.session_price", surface.path, surface.kind))
        if compact_key in STRUCTURED_CURRENCY_KEYS:
            allowed_currencies = {
                normalize(currency).casefold() for currency in SESSION_AUTHORITY["price"]["currency"]
            }
            if normalize(value).casefold() not in allowed_currencies:
                findings.add(Finding("value.session_currency", surface.path, surface.kind))
        if compact_key in STRUCTURED_DURATION_KEYS:
            minute_match = re.search(r"([0-9]+)\s*minutes?", value, FLAGS)
            if re.fullmatch(r"[0-9]+(?:\.0+)?", value):
                minute_match = re.match(r"([0-9]+)", value)
            iso_match = re.fullmatch(r"pt(?:(\d+)h)?(?:(\d+)m)?", value, FLAGS)
            iso_minutes = None
            if iso_match:
                iso_minutes = int(iso_match.group(1) or 0) * 60 + int(iso_match.group(2) or 0)
            normalized_minutes = None
            if minute_match:
                normalized_minutes = minute_match.group(1)
            elif iso_minutes is not None:
                normalized_minutes = str(iso_minutes)
            if HOUR_VALUE.search(value) or normalized_minutes != SESSION_POLICY.allowed_duration:
                findings.add(Finding("value.session_duration", surface.path, surface.kind))
    return findings


def _home_value_findings(surface: Surface) -> set[Finding]:
    findings: set[Finding] = set()
    allowed_price = str(HOME_AUTHORITY["price"]["value"])
    for claim in split_claims(surface.text):
        if re.search(SESSION_POLICY.context, claim, FLAGS) and not HOME_CONTEXT.search(claim):
            continue
        for match in PRICE_VALUE.finditer(claim):
            numeric = _canonical_number(match.group(1))
            if numeric == SESSION_POLICY.allowed_price and re.search(SESSION_POLICY.context, claim, FLAGS):
                continue
            if numeric != allowed_price:
                findings.add(Finding("value.home_price", surface.path, surface.kind))
        for raw in re.findall(r"\b([0-9]{1,3})-minute sessions\b", claim, FLAGS):
            if raw != str(HOME_AUTHORITY["session_duration_minutes"]):
                findings.add(Finding("value.home_duration", surface.path, surface.kind))
        for left, right in re.findall(r"\b([0-9]+)\s*[–-]\s*([0-9]+)\s+weeks\b", claim, FLAGS):
            if [int(left), int(right)] != HOME_AUTHORITY["window_weeks"]:
                findings.add(Finding("value.home_window", surface.path, surface.kind))
        if _has_active_target(claim, re.compile(r"\badditional\b.{0,50}\b(?:post-programme )?check-in\b", FLAGS)):
            findings.add(Finding("home.additional_checkin", surface.path, surface.kind))
    return findings


def _booking_findings(surface: Surface) -> set[Finding]:
    findings: set[Finding] = set()
    if _is_historical(surface.text):
        return findings
    if REORDERED_SEQUENCE.search(surface.text):
        findings.add(Finding("booking.sequence_reordered", surface.path, surface.kind))
    automatic = re.compile(
        r"\b(?:automatic booking confirmation|automatically confirmed|automatically booked)\b",
        FLAGS,
    )
    if _has_active_target(surface.text, automatic):
        findings.add(Finding("booking.automatic_confirmation", surface.path, surface.kind))
    for key, value in _field_map(surface).items():
        compact_key = re.sub(r"[^a-z]", "", key)
        if compact_key in {"booking", "bookings", "confirmation", "bookingconfirmation"}:
            if re.search(r"\b(?:automatic|immediate|direct)\b", value, FLAGS) and not _target_is_negated(
                value, re.compile(r"\b(?:automatic|immediate|direct)\b", FLAGS)
            ):
                findings.add(Finding("booking.automatic_confirmation", surface.path, surface.kind))
    return findings


def _launch_findings(surfaces: Iterable[Surface]) -> set[Finding]:
    findings: set[Finding] = set()
    for surface in surfaces:
        if _has_active_target(surface.text, PUBLIC_STATE_PATTERN):
            findings.add(Finding("launch.public_availability", surface.path, surface.kind))
        fields = _field_map(surface)
        for key, value in fields.items():
            compact_key = re.sub(r"[^a-z]", "", key)
            if compact_key not in STRUCTURED_LAUNCH_KEYS or _is_historical(value):
                continue
            if re.search(r"\b(?:instock|open|available|public|live|launched|automatic)\b", value, FLAGS):
                if not _target_is_negated(value, re.compile(r"\b(?:open|available|public|live|launched|automatic)\b", FLAGS)):
                    findings.add(Finding("launch.public_availability", surface.path, surface.kind))
    return findings


def _authority_findings(surfaces: Iterable[Surface]) -> set[Finding]:
    material = tuple(surfaces)
    bindings, findings = _governed_bindings(material)
    for surface in material:
        if _is_executable_javascript_invalid_kind(surface.kind):
            findings.add(
                Finding(
                    "authority.executable_javascript_forbidden",
                    surface.path,
                    surface.kind,
                )
            )
            continue
        fields = _field_map(surface)
        status = fields.get(STRUCTURED_CONTEXT_STATUS_KEY)
        governed_value_present = any(
            _compact_structured_key(key) in STRUCTURED_GOVERNED_KEYS
            for key, _ in surface.fields
        )
        if status == STRUCTURED_CONTEXT_INVALID or (
            status == STRUCTURED_CONTEXT_PENDING and governed_value_present
        ):
            findings.add(
                Finding("authority.structured_context_invalid", surface.path, surface.kind)
            )
    session_surfaces = {
        surface
        for matches in (
            value for (offer, _), value in bindings.items() if offer == "one_concern"
        )
        for surface in matches
    }
    home_surfaces = {
        surface
        for matches in (
            value for (offer, _), value in bindings.items() if offer == "home_support"
        )
        for surface in matches
    }
    for surface in material:
        if surface.kind not in OFFER_BLOCK_KINDS | {"attribute"}:
            continue
        if _surface_has_session_context(surface):
            session_surfaces.add(surface)
        if _surface_has_home_context(surface):
            home_surfaces.add(surface)
    for surface in session_surfaces:
        findings.update(_session_value_findings(surface))
        findings.update(_booking_findings(surface))
        if _payment_claim_is_invalid(surface, surface.text):
            findings.add(Finding("payment.unsupported_rm350_method", surface.path, surface.kind))
        if _delivery_claim_is_invalid(surface.text):
            findings.add(Finding("delivery.unapproved_platform", surface.path, surface.kind))
        fields = _field_map(surface)
        for key, value in fields.items():
            compact_key = re.sub(r"[^a-z]", "", key)
            if compact_key in STRUCTURED_PAYMENT_KEYS:
                explicit_payment_field = compact_key not in {"href", "action"}
                if explicit_payment_field or PAYMENT_METHOD_TOKEN.search(value):
                    if _payment_claim_is_invalid(surface, f"payment method is {value}"):
                        findings.add(Finding("payment.unsupported_rm350_method", surface.path, surface.kind))
            if compact_key in STRUCTURED_DELIVERY_KEYS:
                if _delivery_claim_is_invalid(f"delivery platform is {value}"):
                    findings.add(Finding("delivery.unapproved_platform", surface.path, surface.kind))
    for surface in home_surfaces:
        findings.update(_home_value_findings(surface))
        if _has_active_target(surface.text, UNAPPROVED_PAYMENT_TOKEN):
            findings.add(Finding("payment.unsupported_home_method", surface.path, surface.kind))
        for key, value in _field_map(surface).items():
            compact_key = re.sub(r"[^a-z]", "", key)
            if compact_key in STRUCTURED_PAYMENT_KEYS:
                explicit_payment_field = compact_key not in {"href", "action"}
                if explicit_payment_field or PAYMENT_METHOD_TOKEN.search(value):
                    if _has_active_target(value, UNAPPROVED_PAYMENT_TOKEN):
                        findings.add(Finding("payment.unsupported_home_method", surface.path, surface.kind))
    return findings


def validate_documents(documents: Mapping[str, str]) -> list[Finding]:
    findings: set[Finding] = set()
    tracked = set(documents)

    for retired in sorted(RETIRED_MUTATORS & tracked):
        findings.add(Finding("mutator.retired", retired, "python"))

    for path, source in documents.items():
        if path.startswith("tests/") or not path.endswith(".py"):
            continue
        if MUTATION_SIGNAL.search(source) and HTML_TARGET_SIGNAL.search(source):
            findings.add(Finding("mutator.website_writer", path, "python"))

    for path, source in documents.items():
        if path in PROTECTED_APPLICATION_PAGES:
            continue
        if _is_content_os_executable_authority_exempt(path):
            continue
        if path.endswith(EXECUTABLE_JAVASCRIPT_SUFFIXES) and _executable_javascript_contains_authority(source):
            findings.add(
                Finding(
                    "authority.executable_javascript_forbidden",
                    path,
                    "javascript_authority_invalid",
                )
            )

    all_surfaces: list[Surface] = []
    surfaces_by_page: dict[str, list[Surface]] = {}
    for path, source in documents.items():
        if path in PROTECTED_APPLICATION_PAGES:
            continue
        if not path.endswith(".html"):
            continue
        page_surfaces = extract_surfaces(path, source)
        surfaces_by_page[path] = page_surfaces
        all_surfaces.extend(page_surfaces)
        for surface in page_surfaces:
            if surface.kind in {
                "html_invalid",
                "jsonld_invalid",
                "application_json_invalid",
            }:
                findings.add(Finding(f"syntax.{surface.kind}", path, surface.kind))

    for path, requirements in PAGE_REQUIREMENTS.items():
        page_surfaces = surfaces_by_page.get(path)
        if page_surfaces is None:
            findings.add(Finding("required.page_missing", path, "page"))
            continue
        authority = normalize(" ".join(surface.text for surface in page_surfaces))
        for requirement in requirements:
            if not re.search(requirement.pattern, authority, FLAGS):
                findings.add(Finding(f"required.{path}.{requirement.identifier}", path, "page"))
        sequence_surfaces = (
            surface
            for surface in page_surfaces
            if surface.kind in OFFER_BLOCK_KINDS
            and re.search(SESSION_POLICY.context, surface.text, FLAGS)
        )
        if not any(_ordered_booking_sequence(surface.text) for surface in sequence_surfaces):
            findings.add(Finding(f"required.{path}.booking_sequence", path, "page"))

    governance = normalize(documents.get("CLAUDE.md", ""))
    if not re.search(r"\bAPC-AI-OS\b.{0,100}\bsole canonical offer authority\b", governance, FLAGS):
        findings.add(Finding("required.canonical_offer_authority", "CLAUDE.md", "governance"))
    if not re.search(r"\bwebsite_authority\.json\b.{0,100}\bnon-authoritative derived mirror\b", governance, FLAGS):
        findings.add(Finding("required.derived_mirror_boundary", "CLAUDE.md", "governance"))
    required_states = AUTHORITY["launch"]["required_governance_states"]
    if not all(normalize(state).casefold() in governance.casefold() for state in required_states):
        findings.add(Finding("required.launch_lock", "CLAUDE.md", "governance"))

    active_claims = list(_active_claim_surfaces(all_surfaces))
    for surface in active_claims:
        for rule in GLOBAL_RULES:
            if _rule_matches(rule, surface):
                findings.add(Finding(rule.identifier, surface.path, surface.kind))

    governance_surface = Surface("CLAUDE.md", "governance", governance)
    launch_rule = next(rule for rule in GLOBAL_RULES if rule.identifier == "launch.authorized")
    if _rule_matches(launch_rule, governance_surface):
        findings.add(Finding(launch_rule.identifier, governance_surface.path, governance_surface.kind))

    findings.update(_launch_findings(all_surfaces))
    findings.update(_authority_findings(all_surfaces))
    return sorted(findings)


def validate_repository(root: Path = ROOT) -> list[Finding]:
    return validate_documents(load_tracked_documents(root))


def main() -> int:
    try:
        findings = validate_repository()
    except (OSError, subprocess.SubprocessError):
        print("FAIL [validator.read_error] repository", file=sys.stderr)
        return 1
    if findings:
        for finding in findings:
            print(
                f"FAIL [{finding.identifier}] {finding.path} ({finding.kind})",
                file=sys.stderr,
            )
        return 1
    print("PASS: tracked-only per-page APC authority validation")
    print(
        "PASS: governed HTML, JSON records, executable-JavaScript boundary, "
        "payment, and launch checks"
    )
    print("PASS: no tracked Python website mutator")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
