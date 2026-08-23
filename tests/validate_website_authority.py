#!/usr/bin/env python3
"""Fail-closed validation for APC website and launch authority."""

from __future__ import annotations

from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, Mapping
import json
import re
import subprocess
import sys
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
FLAGS = re.IGNORECASE | re.DOTALL


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
    allowed_payment_methods: tuple[str, ...]


@dataclass(frozen=True)
class Surface:
    path: str
    kind: str
    text: str


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
        negation=r"\b(?:not|never|does not|do not|is not)\b.{0,60}\bone\s+repeated\s+concern\b",
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
        kinds=frozenset({"article", "li", "div", "p", "text", "jsonld_record", "javascript_record"}),
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
        kinds=frozenset({"article", "li", "div", "p", "text", "jsonld_record", "javascript_record"}),
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
    {"article", "li", "section", "div", "p", "h1", "h2", "h3", "h4", "h5", "h6"}
)
OFFER_BLOCK_KINDS = frozenset({"article", "li", "p", "jsonld_record", "javascript_record"})
SESSION_POLICY = OfferPolicy(
    identifier="session",
    context=(
        r"\b(?:one-concern parent session|rm\s*350|"
        r"(?:current\s+)?session\s+(?:price|duration|delivery platform|payment method))\b"
    ),
    allowed_price="350",
    allowed_duration="45",
    allowed_delivery=(r"\bgoogle meet\b",),
    allowed_payment_methods=(
        "bank transfer",
        "maybank transfer",
        "maybank bank transfer",
        "duitnow qr",
    ),
)
HOME_CONTEXT = re.compile(
    r"\b(?:apc home support programme|home support programme|structured home support|home support|rm\s*1,?800)\b",
    FLAGS,
)
PAYMENT_ASSERTION = re.compile(
    r"\b(?:accepts?|paid by|pay by|pay with|pay using|use.{0,30}(?:payment|bank transfer|duitnow)|"
    r"payment (?:method|option)s? (?:is|are|include)|payment should be made by|"
    r"(?:accepted|offered|available) (?:for|as).{0,25}(?:payment|rm\s*350)|"
    r"offers?.{0,30}(?:as )?payment|available.{0,25}payment)\b",
    FLAGS,
)
DELIVERY_ASSERTION = re.compile(
    r"\b(?:delivery platform|delivered(?:\s+(?:via|on|through|using))?|held\s+(?:via|on)|"
    r"conducted\s+(?:via|on)|takes place\s+(?:via|on)|session\s+(?:is\s+)?(?:via|on))\b",
    FLAGS,
)
NEGATION = re.compile(
    r"\b(?:not|never|no|does not|do not|is not|isn't|cannot|can't|must not)\b",
    FLAGS,
)
REORDERED_SEQUENCE = re.compile(
    r"(?:\b(?:pay|payment)\s+first\b|"
    r"\b(?:pay|payment)\b.{0,80}\bthen\b.{0,80}\b(?:request|approval|permission|review)\b|"
    r"\b(?:confirm|confirmation)\w*\s+first\b|"
    r"\bconfirm(?:s|ed|ing)?\s+(?:the\s+)?booking\b.{0,80}\bbefore\b.{0,80}\b(?:payment proof|verification|request|review)\b)",
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

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
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
        for attribute in ("href", "src", "action"):
            value = values.get(attribute)
            if value:
                self.surfaces.append(Surface(self.path, "attribute", normalize(value)))

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
            if self.script_type == "application/ld+json":
                self._add_jsonld(script)
            elif self.script_type in {"", "application/javascript", "text/javascript", "module"}:
                self._add_javascript(script)
            self.script_type = None
            self.script_parts = []
            return
        if tag in {"style", "template"} and self.skip_depth:
            self.skip_depth -= 1
            return
        if tag in BLOCK_TAGS:
            for index in range(len(self.blocks) - 1, -1, -1):
                block_tag, parts = self.blocks[index]
                if block_tag == tag:
                    self.surfaces.append(Surface(self.path, tag, normalize("".join(parts))))
                    del self.blocks[index]
                    self.page_parts.append(" ")
                    for _, outer_parts in self.blocks:
                        outer_parts.append(" ")
                    break

    def _add_jsonld(self, script: str) -> None:
        try:
            data = json.loads(script)
        except (TypeError, ValueError):
            self.surfaces.append(Surface(self.path, "jsonld_invalid", "invalid"))
            return

        def visit(value: object) -> None:
            if isinstance(value, dict):
                scalar_values = [str(item) for item in value.values() if isinstance(item, (str, int, float))]
                if scalar_values:
                    self.surfaces.append(
                        Surface(self.path, "jsonld_record", normalize(". ".join(scalar_values)))
                    )
                for item in value.values():
                    visit(item)
            elif isinstance(value, list):
                for item in value:
                    visit(item)

        visit(data)

    def _add_javascript(self, script: str) -> None:
        for match in re.finditer(r"(['\"])(.*?)(?<!\\)\1", script, FLAGS):
            value = normalize(match.group(2))
            if value:
                self.surfaces.append(Surface(self.path, "javascript_string", value))
        for match in re.finditer(r"\{([^{}]{1,3000})\}", script, FLAGS):
            values = [item.group(2) for item in re.finditer(r"(['\"])(.*?)(?<!\\)\1", match.group(1), FLAGS)]
            if values:
                self.surfaces.append(
                    Surface(self.path, "javascript_record", normalize(". ".join(values)))
                )


def extract_surfaces(path: str, source: str) -> list[Surface]:
    parser = AuthorityHTMLParser(path)
    try:
        parser.feed(source)
        parser.close()
    except Exception:
        return [Surface(path, "html_invalid", "invalid")]
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
        if relative.endswith((".html", ".py", ".md")):
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
        if surface.kind in {"html_invalid", "jsonld_invalid"}:
            yield surface
            continue
        if surface.kind in {"article", "li", "section", "div", "p", "page", "text"}:
            for claim in split_claims(surface.text):
                yield Surface(surface.path, surface.kind, claim)
        else:
            yield surface


def _is_inactive_claim(value: str) -> bool:
    return bool(
        NEGATION.search(value)
        or re.search(
            r"\b(?:historically|formerly|previously|retired|superseded)\b",
            value,
            FLAGS,
        )
    )


def _payment_methods(value: str) -> list[str] | None:
    patterns = (
        r"\baccepts?\s+(.+?)(?:\s+payments?\b|[.;]|$)",
        r"\b(?:pay|paid)\s+(?:only\s+)?by\s+(.+?)(?:,?\s+(?:then|before|after|and\s+(?:submit|send))\b|[.;]|$)",
        r"\bpayment should be made by\s+(.+?)(?:,?\s+(?:then|before|after|and\s+(?:submit|send|payment proof))\b|[.;]|$)",
        r"\buse\s+(.+?)(?:,?\s+(?:then|before|after|and\s+(?:submit|send))\b|[.;]|$)",
        r"\bpayment (?:method|option)s? (?:is|are|include)\s+(.+?)(?:[.;]|$)",
        r"\b(.+?)\s+(?:is|are)\s+(?:accepted|offered|available)\s+(?:for|as)\s+(?:rm\s*350|payment)\b",
        r"\boffers?\s+(.+?)\s+as\s+payment\b",
    )
    segment = None
    for pattern in patterns:
        match = re.search(pattern, value, FLAGS)
        if match:
            segment = normalize(match.group(1))
            break
    if segment is None:
        return None
    segment = re.sub(r"\b(?:payment|payments|only)\b", "", segment, flags=FLAGS)
    return [
        normalize(method).lower()
        for method in re.split(r"\s*(?:,|\band\b|\bor\b)\s*", segment, flags=FLAGS)
        if normalize(method)
    ]


def _allowed_payment_methods(methods: list[str]) -> bool:
    allowed = set(SESSION_POLICY.allowed_payment_methods)
    return bool(methods) and all(method in allowed for method in methods)


def _ordered_booking_sequence(value: str) -> bool:
    offset = 0
    for _, pattern in SEQUENCE_EVENTS:
        match = pattern.search(value, offset)
        if not match:
            return False
        offset = match.end()
    return True


def _authority_findings(surfaces: Iterable[Surface]) -> set[Finding]:
    findings: set[Finding] = set()
    for surface in surfaces:
        if surface.kind not in OFFER_BLOCK_KINDS:
            continue
        session = bool(re.search(SESSION_POLICY.context, surface.text, FLAGS))
        has_home_name = bool(re.search(r"\b(?:apc )?home support programme\b", surface.text, FLAGS))
        has_money = bool(re.search(r"\brm\s*[0-9]", surface.text, FLAGS))
        home = bool(re.search(r"\brm\s*1,?800\b", surface.text, FLAGS)) or (
            has_home_name
            and (
                has_money
                or bool(re.search(r"\b[0-9]+-minute sessions\b", surface.text, FLAGS))
                or bool(re.search(r"\b[0-9]+\s*[–-]\s*[0-9]+\s+weeks\b", surface.text, FLAGS))
            )
        )
        claims = split_claims(surface.text)
        inherit_session = session and not HOME_CONTEXT.search(surface.text)
        inherit_home = home and not re.search(SESSION_POLICY.context, surface.text, FLAGS)
        if session and REORDERED_SEQUENCE.search(surface.text) and not _is_inactive_claim(surface.text):
            findings.add(Finding("booking.sequence_reordered", surface.path, surface.kind))
        for claim in claims:
            claim_is_session = bool(re.search(SESSION_POLICY.context, claim, FLAGS)) or (
                inherit_session and not HOME_CONTEXT.search(claim)
            )
            claim_is_home = bool(HOME_CONTEXT.search(claim)) or (
                inherit_home and not re.search(SESSION_POLICY.context, claim, FLAGS)
            )
            if claim_is_session:
                if REORDERED_SEQUENCE.search(claim) and not _is_inactive_claim(claim):
                    findings.add(Finding("booking.sequence_reordered", surface.path, surface.kind))
                for match in re.finditer(r"\br\s*m\s*([0-9](?:[0-9,]|\s(?=[0-9]))*)\b", claim, FLAGS):
                    raw = match.group(1)
                    if re.search(r"\bsave\s*$", claim[max(0, match.start() - 12):match.start()], FLAGS):
                        continue
                    if re.sub(r"[\s,]", "", raw) != SESSION_POLICY.allowed_price:
                        findings.add(Finding("value.session_price", surface.path, surface.kind))
                for raw in re.findall(r"\b([0-9](?:\s*[0-9]){0,2})(?:-|\s)minute(?:s)?\b", claim, FLAGS):
                    if re.sub(r"\s", "", raw) != SESSION_POLICY.allowed_duration:
                        findings.add(Finding("value.session_duration", surface.path, surface.kind))
                if not _is_inactive_claim(claim):
                    if PAYMENT_ASSERTION.search(claim):
                        methods = _payment_methods(claim)
                        if methods is not None and not _allowed_payment_methods(methods):
                            findings.add(Finding("payment.unsupported_rm350_method", surface.path, surface.kind))
                    if DELIVERY_ASSERTION.search(claim):
                        has_allowed_delivery = any(
                            re.search(pattern, claim, FLAGS)
                            for pattern in SESSION_POLICY.allowed_delivery
                        )
                        has_alternative = bool(
                            re.search(
                                r"\b(?:zoom|microsoft teams|teams|webex|skype|jitsi|phone|telephone|online)\b",
                                claim,
                                FLAGS,
                            )
                        )
                        if not has_allowed_delivery or has_alternative:
                            findings.add(Finding("delivery.unapproved_platform", surface.path, surface.kind))
            if claim_is_home:
                for match in re.finditer(r"\br\s*m\s*([0-9](?:[0-9,]|\s(?=[0-9]))*)\b", claim, FLAGS):
                    raw = match.group(1)
                    if re.search(r"\bsave\s*$", claim[max(0, match.start() - 12):match.start()], FLAGS):
                        continue
                    if re.sub(r"[\s,]", "", raw) != "1800":
                        findings.add(Finding("value.home_price", surface.path, surface.kind))
                for raw in re.findall(r"\b([0-9]{1,3})-minute sessions\b", claim, FLAGS):
                    if raw != "60":
                        findings.add(Finding("value.home_duration", surface.path, surface.kind))
                for left, right in re.findall(r"\b([0-9]+)\s*[–-]\s*([0-9]+)\s+weeks\b", claim, FLAGS):
                    if (left, right) != ("6", "8"):
                        findings.add(Finding("value.home_window", surface.path, surface.kind))
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

    all_surfaces: list[Surface] = []
    surfaces_by_page: dict[str, list[Surface]] = {}
    for path, source in documents.items():
        if not path.endswith(".html"):
            continue
        page_surfaces = extract_surfaces(path, source)
        surfaces_by_page[path] = page_surfaces
        all_surfaces.extend(page_surfaces)
        for surface in page_surfaces:
            if surface.kind in {"html_invalid", "jsonld_invalid"}:
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
    if not re.search(r"\bpreparation_not_launched\s*/\s*not_authorised\b", governance, FLAGS):
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
    print("PASS: active HTML, JavaScript data, JSON-LD, payment, and launch checks")
    print("PASS: no tracked Python website mutator")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
