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
        r"\bonline\b",
        context=r"\b(?:one-concern parent session|rm\s*350)\b",
        negation=r"\b(?:not|never|does not|is not|cannot)\b.{0,50}\bonline\b",
        kinds=frozenset({"article", "li", "text", "jsonld_record", "javascript_record"}),
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
        kinds=frozenset({"article", "li", "text", "jsonld_record", "javascript_record"}),
    ),
    Rule(
        "payment.unsupported_rm350_method",
        r"\b(?:card|stripe|wise)\b",
        context=r"\b(?:one-concern parent session|rm\s*350)\b",
        negation=r"(?:\b(?:card|stripe|wise)\b.{0,45}\b(?:not|never|only for home support)\b|\b(?:not|never|no|do not|cannot)\b.{0,45}\b(?:card|stripe|wise)\b)",
        kinds=frozenset({"article", "li", "text", "jsonld_record", "javascript_record"}),
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
)

MUTATION_SIGNAL = re.compile(
    r"(?:write_text|write_bytes)\s*\(|open\s*\([^\n]*[, ]\s*['\"](?:w|a|x)[+b]?['\"]",
    FLAGS,
)
HTML_TARGET_SIGNAL = re.compile(
    r"\.html\b|glob\s*\(\s*['\"][^'\"]*\.html|html_files|resources_html",
    FLAGS,
)
BLOCK_TAGS = frozenset({"article", "li", "section"})


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", unescape(value))
    return re.sub(r"\s+", " ", value).strip()


def split_claims(value: str) -> list[str]:
    return [
        normalize(part)
        for part in re.split(r"(?<=[.!?;])\s+|\bbut\b|\bhowever\b", normalize(value), flags=re.IGNORECASE)
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
        self.page_parts.append(text)
        self.surfaces.append(Surface(self.path, "text", text))
        for _, parts in self.blocks:
            parts.append(text)

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
                    self.surfaces.append(Surface(self.path, tag, normalize(" ".join(parts))))
                    del self.blocks[index]
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
    parser.surfaces.append(Surface(path, "page", normalize(" ".join(parser.page_parts))))
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
        if surface.kind in {"article", "li", "section", "page", "text"}:
            for claim in split_claims(surface.text):
                yield Surface(surface.path, surface.kind, claim)
        else:
            yield surface


def _value_findings(surfaces: Iterable[Surface]) -> set[Finding]:
    findings: set[Finding] = set()
    for surface in surfaces:
        if surface.kind not in {"article", "li", "text", "jsonld_record", "javascript_record"}:
            continue
        has_session_name = bool(re.search(r"\bone-concern parent session\b", surface.text, FLAGS))
        has_home_name = bool(re.search(r"\b(?:apc )?home support programme\b", surface.text, FLAGS))
        has_money = bool(re.search(r"\brm\s*[0-9]", surface.text, FLAGS))
        session = bool(re.search(r"\brm\s*350\b", surface.text, FLAGS)) or (
            has_session_name
            and (has_money or bool(re.search(r"\bgoogle meet\b", surface.text, FLAGS)))
        )
        home = bool(re.search(r"\brm\s*1,?800\b", surface.text, FLAGS)) or (
            has_home_name
            and (
                has_money
                or bool(re.search(r"\b[0-9]+-minute sessions\b", surface.text, FLAGS))
                or bool(re.search(r"\b[0-9]+\s*[–-]\s*[0-9]+\s+weeks\b", surface.text, FLAGS))
            )
        )
        if session and home:
            continue
        if session:
            for match in re.finditer(r"\brm\s*([0-9][0-9,]*)\b", surface.text, FLAGS):
                raw = match.group(1)
                if re.search(r"\bsave\s*$", surface.text[max(0, match.start() - 12):match.start()], FLAGS):
                    continue
                if raw.replace(",", "") != "350":
                    findings.add(Finding("value.session_price", surface.path, surface.kind))
            for raw in re.findall(r"\b([0-9]{1,3})(?:-|\s)minute(?:s)?\b", surface.text, FLAGS):
                if raw != "45":
                    findings.add(Finding("value.session_duration", surface.path, surface.kind))
        if home:
            for match in re.finditer(r"\brm\s*([0-9][0-9,]*)\b", surface.text, FLAGS):
                raw = match.group(1)
                if re.search(r"\bsave\s*$", surface.text[max(0, match.start() - 12):match.start()], FLAGS):
                    continue
                if raw.replace(",", "") != "1800":
                    findings.add(Finding("value.home_price", surface.path, surface.kind))
            for raw in re.findall(r"\b([0-9]{1,3})-minute sessions\b", surface.text, FLAGS):
                if raw != "60":
                    findings.add(Finding("value.home_duration", surface.path, surface.kind))
            for left, right in re.findall(r"\b([0-9]+)\s*[–-]\s*([0-9]+)\s+weeks\b", surface.text, FLAGS):
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

    findings.update(_value_findings(all_surfaces))
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
