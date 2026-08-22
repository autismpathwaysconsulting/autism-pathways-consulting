#!/usr/bin/env python3
"""Regression checks for APC website authority and tracked mutation scripts."""

from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]

RETIRED_MUTATORS = {
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

PROHIBITED_CUSTOMER_OUTPUTS = {
    "Parent Strategy Session",
    "Focused Parent Support",
    "Quick Clarity",
    "Full Implementation",
    "Progress Check Call",
    "free-discovery-call",
    "RM950",
    "RM2,500",
}

MUTATION_SIGNAL = re.compile(
    r"(?:write_text|write_bytes)\s*\(|open\s*\([^\n]*[, ]\s*['\"](?:w|a|x)[+b]?['\"]"
)
HTML_TARGET_SIGNAL = re.compile(
    r"\.html\b|glob\s*\(\s*['\"][^'\"]*\.html|html_files|resources_html",
    re.IGNORECASE,
)


def tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [
        item
        for item in result.stdout.decode().split("\0")
        if item and (ROOT / item).is_file()
    ]


def require_contains(text: str, expected: str, source: str, errors: list[str]) -> None:
    if expected not in text:
        errors.append(f"{source}: missing canonical authority: {expected}")


def main() -> int:
    errors: list[str] = []
    tracked = tracked_files()
    tracked_set = set(tracked)

    still_tracked = sorted(RETIRED_MUTATORS & tracked_set)
    if still_tracked:
        errors.append("retired mutation scripts are tracked: " + ", ".join(still_tracked))

    for relative in tracked:
        if not relative.endswith(".py") or relative == "tests/validate_website_authority.py":
            continue
        source = (ROOT / relative).read_text(encoding="utf-8")
        if MUTATION_SIGNAL.search(source) and HTML_TARGET_SIGNAL.search(source):
            errors.append(f"{relative}: tracked Python can write website HTML")

    customer_paths = [relative for relative in tracked if relative.endswith(".html")]
    customer_text = "\n".join(
        (ROOT / relative).read_text(encoding="utf-8") for relative in customer_paths
    )
    for prohibited in sorted(PROHIBITED_CUSTOMER_OUTPUTS):
        if prohibited in customer_text:
            errors.append(f"customer-facing HTML contains prohibited output: {prohibited}")

    services = (ROOT / "services.html").read_text(encoding="utf-8")
    terms = (ROOT / "terms.html").read_text(encoding="utf-8")
    payment = (ROOT / "pay/index.html").read_text(encoding="utf-8")
    authority = services + "\n" + terms + "\n" + payment

    for expected in (
        "One-Concern Parent Session",
        "RM350",
        "45 minutes",
        "45-minute Google Meet session for one focused parent concern",
        "Founder confirmation required before payment",
        "bank transfer or DuitNow QR",
        "A request or payment is not automatic booking confirmation",
        "RM1,800",
        "Four 60-minute sessions over approximately 6–8 weeks",
        "There is no additional post-programme check-in",
    ):
        require_contains(authority, expected, "canonical pages", errors)

    governance = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    require_contains(
        governance,
        "PREPARATION_NOT_LAUNCHED / NOT_AUTHORISED",
        "CLAUDE.md",
        errors,
    )

    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1

    print("PASS: no tracked Python website mutator can rewrite customer-facing HTML")
    print("PASS: canonical APC offer, booking, payment, and launch authority is intact")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
