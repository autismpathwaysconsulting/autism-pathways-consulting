#!/usr/bin/env python3
"""Registered adversarial tests for the APC authority validator."""

from html.parser import HTMLParser
import copy
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

from validate_website_authority import (
    AUTHORITY,
    JAVASCRIPT_MIME_ESSENCES,
    ROOT,
    committed_tracked_paths,
    extract_surfaces,
    load_tracked_documents,
    validate_authority_manifest,
    validate_documents,
)


def append_html(source: str, claim: str, before: bool = False) -> str:
    marker = "<main" if before else "</body>"
    insertion = f"<p>{claim}</p>\n"
    if marker not in source:
        raise AssertionError(f"missing fixture marker: {marker}")
    if before:
        return source.replace(marker, insertion + marker, 1)
    return source.replace(marker, insertion + marker, 1)


def append_script(source: str, payload: str, script_type: str = "") -> str:
    type_attribute = f' type="{script_type}"' if script_type else ""
    script = f"<script{type_attribute}>{payload}</script>"
    if "</body>" not in source:
        raise AssertionError("missing fixture marker: </body>")
    return source.replace("</body>", script + "</body>", 1)


SESSION_ARTICLE_NAME = "one-concern parent session"
HEADING_TAGS = frozenset({"h1", "h2", "h3", "h4", "h5", "h6"})


def normalize_semantic_text(text: str) -> str:
    return " ".join(text.split()).casefold()


class SessionArticleLocator(HTMLParser):
    def __init__(self, source: str) -> None:
        super().__init__(convert_charrefs=True)
        self.line_starts = [0]
        for line in source.splitlines(keepends=True):
            self.line_starts.append(self.line_starts[-1] + len(line))
        self.articles: list[dict[str, object]] = []
        self.heading: dict[str, object] | None = None
        self.matches: list[int] = []
        self.structure_errors: list[str] = []

    def absolute_offset(self) -> int:
        line, column = self.getpos()
        return self.line_starts[line - 1] + column

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.casefold()
        if tag == "article":
            attributes = {name.casefold(): value or "" for name, value in attrs}
            accessible_name = " ".join(
                attributes.get(name, "") for name in ("aria-label", "title")
            )
            self.articles.append(
                {"matches": SESSION_ARTICLE_NAME == normalize_semantic_text(accessible_name)}
            )
        elif tag in HEADING_TAGS and self.articles:
            if self.heading is not None:
                self.structure_errors.append("nested heading in article")
                return
            self.heading = {"tag": tag, "article": self.articles[-1], "parts": []}

    def handle_startendtag(self, tag: str, attrs) -> None:
        if tag.casefold() == "article":
            self.structure_errors.append("self-closing article")

    def handle_data(self, data: str) -> None:
        if self.heading is not None:
            self.heading["parts"].append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag in HEADING_TAGS and self.articles:
            if self.heading is None or self.heading["tag"] != tag:
                self.structure_errors.append("unbalanced heading in article")
                return
            heading = self.heading
            self.heading = None
            if SESSION_ARTICLE_NAME == normalize_semantic_text("".join(heading["parts"])):
                heading["article"]["matches"] = True
        elif tag == "article":
            if not self.articles:
                self.structure_errors.append("closing article without opening article")
                return
            article = self.articles[-1]
            if self.heading is not None and self.heading["article"] is article:
                self.structure_errors.append("article closed before its heading")
                self.heading = None
            self.articles.pop()
            if article["matches"]:
                self.matches.append(self.absolute_offset())

    def finish(self) -> None:
        if self.heading is not None:
            self.structure_errors.append("unclosed heading in article")
        if self.articles:
            self.structure_errors.append("unclosed article")


def insert_in_session_article(source: str, markup: str) -> str:
    locator = SessionArticleLocator(source)
    locator.feed(source)
    locator.close()
    locator.finish()
    if locator.structure_errors:
        detail = ", ".join(locator.structure_errors)
        raise AssertionError(
            f"cannot safely resolve One-Concern Parent Session article structure: {detail}"
        )
    if len(locator.matches) != 1:
        raise AssertionError(
            "expected exactly one semantic One-Concern Parent Session article; "
            f"found {len(locator.matches)}"
        )
    offset = locator.matches[0]
    return source[:offset] + markup + source[offset:]


class AuthorityValidatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.canonical = load_tracked_documents(ROOT)

    def findings_for(self, changes=None, additions=None):
        documents = dict(self.canonical)
        for path, source in (changes or {}).items():
            documents[path] = source
        documents.update(additions or {})
        return validate_documents(documents)

    def assert_finding(self, identifier: str, findings) -> None:
        self.assertIn(identifier, {finding.identifier for finding in findings})

    def findings_from_script(self, payload: str, script_type: str = ""):
        source = append_script(self.canonical["services.html"], payload, script_type)
        return self.findings_for({"services.html": source})

    def findings_from_markup(self, markup: str):
        source = self.canonical["services.html"].replace(
            "</body>", markup + "</body>", 1
        )
        return self.findings_for({"services.html": source})

    def test_semantic_fixture_insertion_ignores_decorative_markup(self):
        source = (
            '<article class="redesigned-card" data-visual="changed">\n'
            "  <div>Decorative content without a slot bar</div>\n"
            "  <h3>\n    <span>One-Concern</span>\n    Parent Session\n  </h3>\n"
            "  <p>Existing article content.</p>\n"
            "</article>"
        )
        markup = "<p>Injected authority fixture.</p>"
        closing_offset = source.index("</article>")

        result = insert_in_session_article(source, markup)

        self.assertNotIn("apc-slot-bar", source)
        self.assertEqual(source[:closing_offset], result[:closing_offset])
        self.assertEqual(markup, result[closing_offset : closing_offset + len(markup)])
        self.assertEqual(source[closing_offset:], result[closing_offset + len(markup) :])

    def test_semantic_fixture_insertion_fails_for_zero_or_multiple_matches(self):
        cases = {
            0: "<article><h2>Another service</h2></article>",
            2: (
                "<article><h2>One-Concern Parent Session</h2></article>"
                "<article aria-label='One-Concern Parent Session'></article>"
            ),
        }
        for count, source in cases.items():
            with self.subTest(count=count):
                with self.assertRaisesRegex(AssertionError, f"found {count}"):
                    insert_in_session_article(source, "<p>fixture</p>")

    def test_semantic_fixture_insertion_fails_for_unresolved_structure(self):
        source = "<article><h2>One-Concern Parent Session</h2>"
        with self.assertRaisesRegex(AssertionError, "cannot safely resolve"):
            insert_in_session_article(source, "<p>fixture</p>")

    def test_unchanged_canonical_pages_pass(self):
        self.assertEqual([], self.findings_for())

    def test_protected_content_os_is_outside_the_public_authority_surface(self):
        source = append_script(
            self.canonical["content-os/index.html"],
            'const offerName="One-Concern Parent Session";',
        )
        self.assertEqual([], self.findings_for({"content-os/index.html": source}))

    def test_required_contradictions_fail_separately(self):
        cases = {
            "scope.repeated_pattern": ("services.html", "The RM350 session uses repeated-pattern positioning."),
            "booking.automatic_confirmation": ("services.html", "The RM350 booking is automatically confirmed on submission."),
            "booking.direct_confirmation": ("services.html", "The RM350 booking receives direct confirmation on submission."),
            "payment.before_permission": ("services.html", "Pay RM350 before the Founder reviews suitability and availability."),
            "payment.unsupported_rm350_method": ("services.html", "The RM350 session can be paid by Stripe."),
            "value.session_price": ("services.html", "The One-Concern Parent Session costs RM450."),
            "value.session_duration": ("services.html", "The RM350 One-Concern Parent Session lasts 60 minutes."),
            "launch.authorized": ("index.html", "APC is authorised for public launch now."),
        }
        for expected, (path, claim) in cases.items():
            with self.subTest(expected=expected):
                source = append_html(self.canonical[path], claim)
                self.assert_finding(expected, self.findings_for({path: source}))

    def test_all_required_contradictions_fail_together(self):
        claims = (
            "The RM350 session uses repeated-pattern positioning.",
            "The RM350 One-Concern Parent Session is automatically confirmed.",
            "Pay RM350 before the Founder reviews suitability and availability.",
            "The RM350 session accepts card, Stripe, and Wise.",
            "The One-Concern Parent Session costs RM450 and lasts 60 minutes.",
        )
        services = self.canonical["services.html"]
        for claim in claims:
            services = append_html(services, claim)
        index = append_html(self.canonical["index.html"], "Public launch is approved and live.")
        identifiers = {item.identifier for item in self.findings_for({"services.html": services, "index.html": index})}
        expected = {
            "scope.repeated_pattern",
            "booking.automatic_confirmation",
            "payment.before_permission",
            "payment.unsupported_rm350_method",
            "value.session_price",
            "value.session_duration",
            "launch.authorized",
        }
        self.assertTrue(expected.issubset(identifiers), expected - identifiers)

    def test_canonical_scope_before_and_after_canonical_text(self):
        for before in (True, False):
            with self.subTest(before=before):
                source = append_html(
                    self.canonical["services.html"],
                    "The current RM350 wording covers one repeated concern.",
                    before=before,
                )
                self.assertEqual([], self.findings_for({"services.html": source}))

    def test_case_and_whitespace_variations_fail(self):
        source = append_html(
            self.canonical["services.html"],
            "The RM350 wording covers ONE   REPEATED\nCONCERN and the booking is AUTOMATICALLY   CONFIRMED.",
        )
        findings = self.findings_for({"services.html": source})
        self.assert_finding("booking.automatic_confirmation", findings)

    def test_html_and_jsonld_contradictions_fail(self):
        jsonld = (
            '<script type="application/ld+json">'
            '{"@type":"Service","name":"One-Concern Parent Session",'
            '"description":"one repeated concern","price":"RM450"}'
            "</script>"
        )
        source = self.canonical["services.html"].replace("</body>", jsonld + "\n</body>", 1)
        findings = self.findings_for({"services.html": source})
        self.assert_finding("value.session_price", findings)

    def test_embedded_javascript_data_contradiction_fails(self):
        script = (
            "<script>const authorityConflict = "
            "{name:'One-Concern Parent Session', delivery:'online'};</script>"
        )
        source = self.canonical["services.html"].replace("</body>", script + "\n</body>", 1)
        self.assert_finding(
            "authority.executable_javascript_forbidden",
            self.findings_for({"services.html": source}),
        )

    def test_price_and_duration_conflicts_fail(self):
        source = append_html(
            self.canonical["services.html"],
            "The RM350 One-Concern Parent Session also costs RM450 and lasts 75 minutes.",
        )
        findings = self.findings_for({"services.html": source})
        self.assert_finding("value.session_price", findings)
        self.assert_finding("value.session_duration", findings)

    def test_each_unsupported_payment_method_fails(self):
        for method in ("card", "Stripe", "Wise"):
            with self.subTest(method=method):
                source = append_html(
                    self.canonical["services.html"],
                    f"The RM350 One-Concern Parent Session accepts {method} payment.",
                )
                self.assert_finding(
                    "payment.unsupported_rm350_method",
                    self.findings_for({"services.html": source}),
                )

    def test_launch_state_conflict_fails(self):
        source = append_html(self.canonical["index.html"], "Public launch is AUTHORISED.")
        self.assert_finding("launch.authorized", self.findings_for({"index.html": source}))

    def test_required_authority_is_page_scoped(self):
        source = self.canonical["services.html"].replace("RM350", "session fee")
        findings = self.findings_for({"services.html": source})
        self.assert_finding("required.services.html.session_price", findings)

    def test_parent_strategy_session_output_fails(self):
        source = append_html(self.canonical["services.html"], "Parent Strategy Session")
        self.assert_finding("retired.parent_strategy_session", self.findings_for({"services.html": source}))

    def test_active_free_discovery_route_fails(self):
        source = self.canonical["services.html"].replace(
            "</body>",
            '<a href="https://cal.com/autismpathwaysconsulting/free-discovery-call">Book</a></body>',
            1,
        )
        self.assert_finding("retired.free_discovery_call", self.findings_for({"services.html": source}))

    def test_explicit_prohibitions_do_not_fail(self):
        source = self.canonical["services.html"]
        for claim in (
            "The RM350 session cannot be paid by Wise.",
            "There is no additional post-programme check-in.",
            "The booking is not automatically confirmed.",
            "The RM350 session is not delivered online.",
            "APC does not use one repeated concern or repeated-pattern positioning.",
            "Parent Strategy Session is retired and not offered.",
            "The free-discovery-call route is retired and must not be used.",
            "RM950 is not offered.",
        ):
            source = append_html(source, claim)
        identifiers = {item.identifier for item in self.findings_for({"services.html": source})}
        self.assertNotIn("payment.unsupported_rm350_method", identifiers)
        self.assertNotIn("home.additional_checkin", identifiers)
        self.assertNotIn("booking.automatic_confirmation", identifiers)

    def test_unrelated_online_course_wording_is_allowed(self):
        source = append_html(
            self.canonical["course-waitlist.html"],
            "An unrelated parent learning course may be delivered online.",
        )
        self.assertEqual([], self.findings_for({"course-waitlist.html": source}))

    def test_search_only_migration_patterns_are_allowed(self):
        additions = {
            "tools/search_only.py": (
                'OLD_LABEL = "Parent Strategy Session"\n'
                'OLD_ROUTE = "free-discovery-call"\n'
                "# Search-only inputs; this file cannot write website files.\n"
            )
        }
        self.assertEqual([], self.findings_for(additions=additions))

    def test_historical_descriptions_are_not_customer_output(self):
        source = append_html(
            self.canonical["services.html"],
            "This was previously called Parent Strategy Session, a retired historical label.",
        )
        additions = {"docs/history.md": "Historically called Parent Strategy Session."}
        self.assertEqual([], self.findings_for({"services.html": source}, additions))

    def test_validator_fixtures_are_not_customer_output(self):
        additions = {
            "tests/fixture_patterns.py": (
                'needle = "Parent Strategy Session in index.html"\n'
                'Path("fixture.html").write_text(needle)\n'
            )
        }
        self.assertEqual([], self.findings_for(additions=additions))

    def test_new_tracked_website_writer_fails(self):
        additions = {
            "tools/danger.py": 'Path("index.html").write_text("overwrite")\n'
        }
        self.assert_finding("mutator.website_writer", self.findings_for(additions=additions))

    def test_retired_mutators_remain_deleted(self):
        additions = {"apc_final_cta_cleanup.py": "# restored"}
        self.assert_finding("mutator.retired", self.findings_for(additions=additions))

    def test_committed_tracked_paths_exclude_untracked_files(self):
        with tempfile.TemporaryDirectory(prefix="apc-tracked-only-") as temp:
            root = Path(temp)
            subprocess.run(["git", "init", "--quiet"], cwd=root, check=True)
            (root / "tracked.txt").write_text("tracked", encoding="utf-8")
            (root / "untracked.html").write_text("Parent Strategy Session", encoding="utf-8")
            subprocess.run(["git", "add", "tracked.txt"], cwd=root, check=True)
            self.assertEqual(["tracked.txt"], committed_tracked_paths(root))

    def test_secondwave_nested_inline_online_passes(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The RM350 delivery platform is <span>on<strong>line</strong></span>.</p>",
        )
        self.assertEqual([], self.findings_for({"services.html": source}))

    def test_secondwave_paypal_for_rm350_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The session accepts PayPal.</p>",
        )
        self.assert_finding(
            "payment.unsupported_rm350_method",
            self.findings_for({"services.html": source}),
        )

    def test_secondwave_context_light_price_fails(self):
        source = append_html(self.canonical["services.html"], "Current session price: RM450.")
        self.assert_finding("value.session_price", self.findings_for({"services.html": source}))

    def test_context_light_duration_fails(self):
        source = append_html(self.canonical["services.html"], "Current session duration: 60 minutes.")
        self.assert_finding("value.session_duration", self.findings_for({"services.html": source}))

    def test_secondwave_zoom_delivery_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The delivery platform is Zoom.</p>",
        )
        self.assert_finding(
            "delivery.unapproved_platform",
            self.findings_for({"services.html": source}),
        )

    def test_secondwave_public_availability_fails(self):
        source = append_html(self.canonical["index.html"], "The pilot is now publicly available.")
        self.assert_finding("launch.public_availability", self.findings_for({"index.html": source}))

    def test_secondwave_split_node_price_fails(self):
        for split_price in (
            "<span>R</span><span>M450</span>",
            "<span>RM4</span><strong>50</strong>",
            "<span>R </span><em>M4\n</em><span>50</span>",
        ):
            with self.subTest(split_price=split_price):
                source = insert_in_session_article(
                    self.canonical["services.html"],
                    f"<p>Current session price: {split_price}.</p>",
                )
                self.assert_finding("value.session_price", self.findings_for({"services.html": source}))

    def test_secondwave_pay_first_then_approval_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>Pay first, then request approval.</p>",
        )
        self.assert_finding(
            "booking.sequence_reordered",
            self.findings_for({"services.html": source}),
        )

    def test_all_secondwave_cases_fail_together(self):
        services = insert_in_session_article(
            self.canonical["services.html"],
            "<p>Current session price: <span>R</span><span>M450</span>. "
            "The RM350 delivery platform is <span>on<strong>line</strong></span>.</p>",
        )
        for claim in (
            "The session accepts PayPal.",
            "The delivery platform is Zoom.",
            "Pay first, then request approval.",
        ):
            services = insert_in_session_article(services, f"<p>{claim}</p>")
        services = append_html(services, "Current session price: RM450.")
        index = append_html(self.canonical["index.html"], "The pilot is now publicly available.")
        identifiers = {
            finding.identifier
            for finding in self.findings_for({"services.html": services, "index.html": index})
        }
        expected = {
            "payment.unsupported_rm350_method",
            "value.session_price",
            "delivery.unapproved_platform",
            "launch.public_availability",
            "booking.sequence_reordered",
        }
        self.assertTrue(expected.issubset(identifiers), expected - identifiers)

    def test_nested_inline_and_whitespace_online_token_splits_pass(self):
        variants = (
            "<span>on<em>line</em></span>",
            "<span>on\n<strong>line</strong></span>",
        )
        for variant in variants:
            with self.subTest(variant=variant):
                source = insert_in_session_article(
                    self.canonical["services.html"],
                    f"<p>The RM350 delivery platform is {variant}.</p>",
                )
                self.assertEqual([], self.findings_for({"services.html": source}))
        duration = insert_in_session_article(
            self.canonical["services.html"],
            "<p>Current session duration: <span>6</span><em>0</em> minutes.</p>",
        )
        self.assert_finding("value.session_duration", self.findings_for({"services.html": duration}))

    def test_alternative_payment_method_allowlist(self):
        for method in ("PayPal", "cash", "credit card", "cryptocurrency", "Maybank transfer or PayPal"):
            with self.subTest(method=method):
                source = insert_in_session_article(
                    self.canonical["services.html"],
                    f"<p>The session accepts {method} payment.</p>",
                )
                self.assert_finding(
                    "payment.unsupported_rm350_method",
                    self.findings_for({"services.html": source}),
                )
        for claim in (
            "PayPal is offered for RM350.",
            "The RM350 session offers cash as payment.",
        ):
            with self.subTest(claim=claim):
                source = insert_in_session_article(
                    self.canonical["services.html"],
                    f"<p>{claim}</p>",
                )
                self.assert_finding(
                    "payment.unsupported_rm350_method",
                    self.findings_for({"services.html": source}),
                )

    def test_alternative_delivery_platform_allowlist(self):
        for platform in ("Zoom", "Microsoft Teams", "Webex", "Google Meet or Zoom"):
            with self.subTest(platform=platform):
                source = insert_in_session_article(
                    self.canonical["services.html"],
                    f"<p>The delivery platform is {platform}.</p>",
                )
                self.assert_finding(
                    "delivery.unapproved_platform",
                    self.findings_for({"services.html": source}),
                )

    def test_public_availability_equivalents_fail(self):
        for claim in (
            "APC is open to the public.",
            "The service is available to the public.",
        ):
            with self.subTest(claim=claim):
                source = append_html(self.canonical["index.html"], claim)
                self.assert_finding(
                    "launch.public_availability",
                    self.findings_for({"index.html": source}),
                )

    def test_confirmation_first_sequence_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>Confirm the booking first, before payment proof verification.</p>",
        )
        self.assert_finding(
            "booking.sequence_reordered",
            self.findings_for({"services.html": source}),
        )

    def test_required_booking_flow_order_is_page_scoped(self):
        source = self.canonical["services.html"].replace(
            "The Founder verifies payment before confirming the booking",
            "The Founder records payment before confirming the booking",
        )
        self.assert_finding(
            "required.services.html.booking_sequence",
            self.findings_for({"services.html": source}),
        )

    def test_current_payment_and_delivery_allowlists_pass(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The session is delivered via Google Meet. Pay by Maybank transfer or DuitNow QR only.</p>",
        )
        self.assertEqual([], self.findings_for({"services.html": source}))

    def test_home_support_wise_is_allowed_for_international_clients(self):
        source = append_html(
            self.canonical["pay/index.html"],
            "For international clients using the RM1,800 Home Support Programme, Wise bank transfer is available only after CJ confirms fit and gives written permission to pay.",
        )
        self.assertEqual([], self.findings_for({"pay/index.html": source}))

    def test_structural_01_approved_bank_transfer_passes(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The RM350 session accepts bank transfer.</p>",
        )
        self.assertEqual([], self.findings_for({"services.html": source}))

    def test_structural_02_paypal_supported_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>PayPal is supported for this session.</p>",
        )
        self.assert_finding("payment.unsupported_rm350_method", self.findings_for({"services.html": source}))

    def test_structural_03_settle_rm350_through_paypal_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>Settle the RM350 fee through PayPal.</p>",
        )
        self.assert_finding("payment.unsupported_rm350_method", self.findings_for({"services.html": source}))

    def test_structural_04_paypal_checkout_link_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            '<a href="https://paypal.example/checkout">Pay RM350 now</a>',
        )
        self.assert_finding("payment.unsupported_rm350_method", self.findings_for({"services.html": source}))

    def test_structural_05_payment_unrelated_negation_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The session is not free, and PayPal is accepted for payment.</p>",
        )
        self.assert_finding("payment.unsupported_rm350_method", self.findings_for({"services.html": source}))

    def test_structural_06_google_meet_or_facetime_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The RM350 session is delivered via Google Meet or FaceTime.</p>",
        )
        self.assert_finding("delivery.unapproved_platform", self.findings_for({"services.html": source}))

    def test_structural_07_whatsapp_video_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The RM350 session is delivered via WhatsApp video.</p>",
        )
        self.assert_finding("delivery.unapproved_platform", self.findings_for({"services.html": source}))

    def test_structural_08_google_meet_or_in_person_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The RM350 session is delivered via Google Meet or in-person.</p>",
        )
        self.assert_finding("delivery.unapproved_platform", self.findings_for({"services.html": source}))

    def test_structural_09_google_meet_or_hybrid_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The RM350 session is delivered via Google Meet or hybrid.</p>",
        )
        self.assert_finding("delivery.unapproved_platform", self.findings_for({"services.html": source}))

    def test_structural_10_generic_video_call_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The RM350 session is delivered by video call.</p>",
        )
        self.assert_finding("delivery.unapproved_platform", self.findings_for({"services.html": source}))

    def test_structural_11_myr_450_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>Current session price: MYR 450.</p>",
        )
        self.assert_finding("value.session_price", self.findings_for({"services.html": source}))

    def test_structural_12_numeric_jsonld_price_fails(self):
        script = (
            '<script type="application/ld+json">'
            '{"@type":"Offer","name":"One-Concern Parent Session",'
            '"price":450,"priceCurrency":"MYR"}</script>'
        )
        source = self.canonical["services.html"].replace("</body>", script + "\n</body>", 1)
        self.assert_finding("value.session_price", self.findings_for({"services.html": source}))

    def test_structural_13_numeric_javascript_price_fails(self):
        script = '<script>const offer={name:"One-Concern Parent Session",price:450};</script>'
        source = self.canonical["services.html"].replace("</body>", script + "\n</body>", 1)
        self.assert_finding(
            "authority.executable_javascript_forbidden",
            self.findings_for({"services.html": source}),
        )

    def test_structural_14_one_hour_duration_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>Current session duration: 1 hour.</p>",
        )
        self.assert_finding("value.session_duration", self.findings_for({"services.html": source}))

    def test_structural_15_enrolment_open_fails(self):
        source = append_html(self.canonical["index.html"], "Enrolment is now open.")
        self.assert_finding("launch.public_availability", self.findings_for({"index.html": source}))

    def test_structural_16_available_nationwide_fails(self):
        source = append_html(
            self.canonical["index.html"], "The programme is now available nationwide."
        )
        self.assert_finding("launch.public_availability", self.findings_for({"index.html": source}))

    def test_structural_17_bookings_open_nationwide_fails(self):
        source = append_html(self.canonical["index.html"], "Bookings are open nationwide.")
        self.assert_finding("launch.public_availability", self.findings_for({"index.html": source}))

    def test_structural_18_meta_description_availability_fails(self):
        source = self.canonical["index.html"].replace(
            '<meta name="description" content="',
            '<meta name="description" content="The programme is now available nationwide. ',
            1,
        )
        self.assert_finding("launch.public_availability", self.findings_for({"index.html": source}))

    def test_structural_19_launch_unrelated_negation_fails(self):
        source = append_html(
            self.canonical["index.html"], "APC is not closed and is now publicly available."
        )
        self.assert_finding("launch.public_availability", self.findings_for({"index.html": source}))

    def test_structural_20_review_after_payment_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>We review your request after receiving payment.</p>",
        )
        self.assert_finding("booking.sequence_reordered", self.findings_for({"services.html": source}))

    def test_structural_21_approval_after_payment_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>Approval is requested after payment.</p>",
        )
        self.assert_finding("booking.sequence_reordered", self.findings_for({"services.html": source}))

    def test_structural_22_confirmation_before_proof_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>Your booking is confirmed immediately; payment proof is checked afterwards.</p>",
        )
        self.assert_finding("booking.sequence_reordered", self.findings_for({"services.html": source}))

    def test_structural_23_automatic_unrelated_negation_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The booking is not delayed and is automatically confirmed.</p>",
        )
        self.assert_finding(
            "booking.automatic_confirmation",
            self.findings_for({"services.html": source}),
        )

    def test_structural_all_23_cases_fail_together(self):
        services = self.canonical["services.html"]
        for markup in (
            "<p>The RM350 session accepts bank transfer.</p>",
            "<p>PayPal is supported for this session.</p>",
            "<p>Settle the RM350 fee through PayPal.</p>",
            '<a href="https://paypal.example/checkout">Pay RM350 now</a>',
            "<p>The session is not free, and PayPal is accepted for payment.</p>",
            "<p>The RM350 session is delivered via Google Meet or FaceTime.</p>",
            "<p>The RM350 session is delivered via WhatsApp video.</p>",
            "<p>The RM350 session is delivered via Google Meet or in-person.</p>",
            "<p>The RM350 session is delivered via Google Meet or hybrid.</p>",
            "<p>The RM350 session is delivered by video call.</p>",
            "<p>Current session price: MYR 450.</p>",
            "<p>Current session duration: 1 hour.</p>",
            "<p>We review your request after receiving payment.</p>",
            "<p>Approval is requested after payment.</p>",
            "<p>Your booking is confirmed immediately; payment proof is checked afterwards.</p>",
            "<p>The booking is not delayed and is automatically confirmed.</p>",
        ):
            services = insert_in_session_article(services, markup)
        services = services.replace(
            "</body>",
            '<script type="application/ld+json">'
            '{"@type":"Offer","name":"One-Concern Parent Session","price":450,"priceCurrency":"MYR"}'
            '</script><script>const offer={name:"One-Concern Parent Session",price:450};</script></body>',
            1,
        )
        index = self.canonical["index.html"].replace(
            '<meta name="description" content="',
            '<meta name="description" content="The programme is now available nationwide. ',
            1,
        )
        for claim in (
            "Enrolment is now open.",
            "The programme is now available nationwide.",
            "Bookings are open nationwide.",
            "APC is not closed and is now publicly available.",
        ):
            index = append_html(index, claim)
        identifiers = {
            finding.identifier
            for finding in self.findings_for({"services.html": services, "index.html": index})
        }
        expected = {
            "payment.unsupported_rm350_method",
            "delivery.unapproved_platform",
            "value.session_price",
            "value.session_duration",
            "launch.public_availability",
            "booking.sequence_reordered",
            "booking.automatic_confirmation",
        }
        self.assertTrue(expected.issubset(identifiers), expected - identifiers)

    def test_structural_unknown_payment_method_fails_closed(self):
        source = insert_in_session_article(
            self.canonical["services.html"], "<p>Pay RM350 through BlueBank.</p>"
        )
        self.assert_finding("payment.unsupported_rm350_method", self.findings_for({"services.html": source}))

    def test_structural_unknown_delivery_platform_fails_closed(self):
        source = insert_in_session_article(
            self.canonical["services.html"], "<p>The delivery platform is BlueJeans.</p>"
        )
        self.assert_finding("delivery.unapproved_platform", self.findings_for({"services.html": source}))

    def test_structural_currency_and_iso_duration_fields_fail(self):
        script = (
            '<script type="application/ld+json">'
            '{"@type":"Offer","name":"One-Concern Parent Session",'
            '"price":350,"priceCurrency":"USD","duration":"PT1H"}</script>'
        )
        source = self.canonical["services.html"].replace("</body>", script + "</body>", 1)
        findings = self.findings_for({"services.html": source})
        self.assert_finding("value.session_currency", findings)
        self.assert_finding("value.session_duration", findings)

    def test_structural_relevant_data_attribute_price_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"], '<span data-price="450">Special fee</span>'
        )
        self.assert_finding("value.session_price", self.findings_for({"services.html": source}))

    def test_structural_relevant_aria_delivery_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            '<span aria-label="The RM350 session is delivered via FaceTime">Details</span>',
        )
        self.assert_finding("delivery.unapproved_platform", self.findings_for({"services.html": source}))

    def test_structural_javascript_confirmation_field_fails(self):
        script = (
            '<script>const offer={name:"One-Concern Parent Session",'
            'confirmation:"automatic"};</script>'
        )
        source = self.canonical["services.html"].replace("</body>", script + "</body>", 1)
        self.assert_finding(
            "authority.executable_javascript_forbidden",
            self.findings_for({"services.html": source}),
        )

    def test_structural_jsonld_availability_field_fails(self):
        script = (
            '<script type="application/ld+json">'
            '{"@type":"Offer","name":"One-Concern Parent Session",'
            '"availability":"InStock"}</script>'
        )
        source = self.canonical["services.html"].replace("</body>", script + "</body>", 1)
        self.assert_finding("launch.public_availability", self.findings_for({"services.html": source}))

    def test_structural_targeted_negations_pass(self):
        services = self.canonical["services.html"]
        for markup in (
            "<p>PayPal is not accepted.</p>",
            "<p>The booking is not automatically confirmed.</p>",
        ):
            services = insert_in_session_article(services, markup)
        index = append_html(self.canonical["index.html"], "APC is not publicly available.")
        self.assertEqual([], self.findings_for({"services.html": services, "index.html": index}))

    def test_structural_missing_governed_block_fails_closed(self):
        source = self.canonical["services.html"].replace(
            "One-Concern Parent Session", "Unnamed parent session"
        )
        self.assert_finding("binding.one_concern.missing", self.findings_for({"services.html": source}))

    def test_structural_duplicate_governed_block_fails_closed(self):
        duplicate = (
            "<article><h2>One-Concern Parent Session</h2>"
            "<p>RM350 · 45 minutes · Online</p></article>"
        )
        source = append_html(self.canonical["services.html"], duplicate)
        self.assert_finding("binding.one_concern.duplicate", self.findings_for({"services.html": source}))

    def test_structural_binding_ignores_semantic_punctuation_and_whitespace(self):
        source = self.canonical["services.html"].replace(
            "One-Concern Parent Session", "One Concern Parent Session"
        ).replace("RM350", "RM 350")
        identifiers = {finding.identifier for finding in self.findings_for({"services.html": source})}
        self.assertNotIn("binding.one_concern.missing", identifiers)
        self.assertNotIn("binding.one_concern.duplicate", identifiers)

    def test_structural_malformed_governed_page_fails_closed(self):
        source = self.canonical["services.html"].replace("</article>", "", 1)
        self.assert_finding("syntax.html_invalid", self.findings_for({"services.html": source}))

    def test_structural_required_preparation_states_fail_closed(self):
        source = self.canonical["CLAUDE.md"].replace("NOT_AUTHORISED", "STATE_REMOVED")
        self.assert_finding("required.launch_lock", self.findings_for({"CLAUDE.md": source}))

    def test_structural_terms_and_payment_are_independently_governed(self):
        terms = self.canonical["terms.html"].replace("RM350", "MYR 450", 1)
        payment = insert_in_session_article(
            self.canonical["pay/index.html"], "<p>Current session duration: 1 hour.</p>"
        )
        self.assert_finding("value.session_price", self.findings_for({"terms.html": terms}))
        self.assert_finding("value.session_duration", self.findings_for({"pay/index.html": payment}))

    def test_structural_multilingual_narrative_is_allowed(self):
        source = append_html(
            self.canonical["about.html"],
            "Sokongan ibu bapa membantu keluarga memahami corak dan memilih langkah seterusnya.",
        )
        self.assertEqual([], self.findings_for({"about.html": source}))

    def test_structural_authority_manifest_is_locked_and_declarative(self):
        session = AUTHORITY["offers"]["one_concern"]
        home = AUTHORITY["offers"]["home_support"]
        self.assertEqual(350, session["price"]["value"])
        self.assertEqual(45, session["duration_minutes"])
        self.assertEqual("One repeated concern. One clear next step.", session["promise"])
        self.assertEqual(5, len(session["deliverables"]))
        self.assertEqual(["Online"], session["delivery_platforms"])
        self.assertEqual(["Bank transfer", "DuitNow QR", "Wise bank transfer"], session["payment_methods"])
        self.assertEqual(1800, home["price"]["value"])
        self.assertEqual([6, 8], home["window_weeks"])
        self.assertEqual(7, len(home["deliverables"]))
        self.assertFalse(home["additional_post_programme_checkin"])
        self.assertFalse(AUTHORITY["first_step_call"]["compulsory_before_rm350"])
        self.assertEqual("NON_AUTHORITATIVE_DERIVED_MIRROR", AUTHORITY["authority_role"])
        self.assertEqual("autismpathwaysconsulting/APC-AI-OS", AUTHORITY["provenance"]["source_repository"])
        self.assertRegex(AUTHORITY["provenance"]["source_candidate_commit"], r"^[0-9a-f]{40}$")
        self.assertEqual(
            {"services.html", "terms.html", "pay/index.html"},
            set(session["bindings"]),
        )

    def test_structural_action_and_value_attributes_fail(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            '<form action="https://paypal.example/checkout">'
            '<input value="MYR 450"><button>Pay RM350 now</button></form>',
        )
        findings = self.findings_for({"services.html": source})
        self.assert_finding("payment.unsupported_rm350_method", findings)
        self.assert_finding("value.session_price", findings)

    def test_structural_payment_and_delivery_fields_fail(self):
        script = (
            '<script type="application/ld+json">'
            '{"@type":"Offer","name":"One-Concern Parent Session",'
            '"paymentMethod":"PayPal","deliveryPlatform":"FaceTime"}</script>'
        )
        source = self.canonical["services.html"].replace("</body>", script + "</body>", 1)
        findings = self.findings_for({"services.html": source})
        self.assert_finding("payment.unsupported_rm350_method", findings)
        self.assert_finding("delivery.unapproved_platform", findings)

    def test_structural_ranges_and_alternatives_fail(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The session costs RM350 or MYR 450 and lasts 45 or 60 minutes.</p>",
        )
        findings = self.findings_for({"services.html": source})
        self.assert_finding("value.session_price", findings)
        self.assert_finding("value.session_duration", findings)

    def test_nested_jsonld_conflicting_price_fails(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","offers":{"price":450}}',
            "application/ld+json",
        )
        self.assert_finding("value.session_price", self.findings_for({"services.html": source}))

    def test_nested_jsonld_conflicting_currency_fails(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","offers":{"priceCurrency":"USD"}}',
            "application/ld+json",
        )
        self.assert_finding("value.session_currency", self.findings_for({"services.html": source}))

    def test_nested_jsonld_conflicting_duration_fails(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","terms":{"duration":"PT1H"}}',
            "application/ld+json",
        )
        self.assert_finding("value.session_duration", self.findings_for({"services.html": source}))

    def test_nested_jsonld_conflicting_delivery_fails(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","terms":{"deliveryPlatform":"Zoom"}}',
            "application/ld+json",
        )
        self.assert_finding("delivery.unapproved_platform", self.findings_for({"services.html": source}))

    def test_nested_jsonld_conflicting_payment_method_fails(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","terms":{"paymentMethod":"PayPal"}}',
            "application/ld+json",
        )
        self.assert_finding(
            "payment.unsupported_rm350_method", self.findings_for({"services.html": source})
        )

    def test_nested_javascript_conflicting_price_fails(self):
        source = append_script(
            self.canonical["services.html"],
            'const offer={name:"One-Concern Parent Session",terms:{price:450}};',
        )
        self.assert_finding(
            "authority.executable_javascript_forbidden",
            self.findings_for({"services.html": source}),
        )

    def test_nested_javascript_conflicting_currency_fails(self):
        source = append_script(
            self.canonical["services.html"],
            'const offer={name:"One-Concern Parent Session",terms:{priceCurrency:"USD"}};',
        )
        self.assert_finding(
            "authority.executable_javascript_forbidden",
            self.findings_for({"services.html": source}),
        )

    def test_nested_javascript_conflicting_duration_fails(self):
        source = append_script(
            self.canonical["services.html"],
            'const offer={name:"One-Concern Parent Session",terms:{durationMinutes:60}};',
        )
        self.assert_finding(
            "authority.executable_javascript_forbidden",
            self.findings_for({"services.html": source}),
        )

    def test_nested_javascript_conflicting_delivery_fails(self):
        source = append_script(
            self.canonical["services.html"],
            'const offer={name:"One-Concern Parent Session",terms:{deliveryPlatform:"Zoom"}};',
        )
        self.assert_finding(
            "authority.executable_javascript_forbidden",
            self.findings_for({"services.html": source}),
        )

    def test_nested_javascript_conflicting_payment_method_fails(self):
        source = append_script(
            self.canonical["services.html"],
            'const offer={name:"One-Concern Parent Session",terms:{paymentMethod:"PayPal"}};',
        )
        self.assert_finding(
            "authority.executable_javascript_forbidden",
            self.findings_for({"services.html": source}),
        )

    def test_nested_structured_multiple_object_levels_fail(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","catalog":{"terms":{"offers":{"price":450}}}}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"One-Concern Parent Session","catalog":{"terms":'
            '{"offers":{"price":450}}}}',
            "application/json",
        )
        self.assert_finding("value.session_price", self.findings_for({"services.html": source}))

    def test_nested_structured_arrays_retain_context(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","catalog":[{"offers":[{"price":450}]}]}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"One-Concern Parent Session","catalog":'
            '[{"offers":[{"price":450}]}]}',
            "application/json",
        )
        self.assert_finding("value.session_price", self.findings_for({"services.html": source}))

    def test_nested_structured_sibling_children_share_context(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","pricing":{"price":450},'
            '"meeting":{"deliveryPlatform":"Zoom"},"payment":{"paymentMethod":"PayPal"}}',
            "application/ld+json",
        )
        findings = self.findings_for({"services.html": source})
        self.assert_finding("value.session_price", findings)
        self.assert_finding("delivery.unapproved_platform", findings)
        self.assert_finding("payment.unsupported_rm350_method", findings)

    def test_canonical_nested_structured_values_pass(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","offers":{"price":350,'
            '"priceCurrency":"MYR","durationMinutes":45,"deliveryPlatform":"Google Meet",'
            '"paymentMethod":"Maybank bank transfer"}}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"One-Concern Parent Session","terms":{"price":350,'
            '"priceCurrency":"MYR","durationMinutes":45,'
            '"deliveryPlatform":"Google Meet","paymentMethod":"DuitNow QR"}}',
            "application/json",
        )
        self.assertEqual([], self.findings_for({"services.html": source}))

    def test_unrelated_nested_structured_data_passes(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"Unrelated webinar","offers":{"price":450,"priceCurrency":"USD",'
            '"durationMinutes":60,"deliveryPlatform":"Zoom","paymentMethod":"PayPal"}}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"Unrelated webinar","terms":{"price":450,"priceCurrency":"USD",'
            '"durationMinutes":60,"deliveryPlatform":"Zoom","paymentMethod":"PayPal"}}',
            "application/json",
        )
        self.assertEqual([], self.findings_for({"services.html": source}))

    def test_nested_home_support_wise_is_allowed(self):
        source = append_script(
            self.canonical["pay/index.html"],
            '{"name":"One-Concern Parent Session","related":{"name":"APC Home Support Programme",'
            '"overseas":{"paymentMethod":"Wise","authorization":"already authorized only"}}}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"One-Concern Parent Session","related":'
            '{"name":"APC Home Support Programme","overseas":'
            '{"paymentMethod":"Wise","authorization":"already authorized only"}}}',
            "application/json",
        )
        self.assertEqual([], self.findings_for({"pay/index.html": source}))

    def test_scalar_array_jsonld_conflicting_price_fails(self):
        findings = self.findings_from_script(
            '{"name":"One-Concern Parent Session","terms":{"price":[450]}}',
            "application/ld+json",
        )
        self.assert_finding("value.session_price", findings)

    def test_scalar_array_jsonld_conflicting_currency_fails(self):
        findings = self.findings_from_script(
            '{"name":"One-Concern Parent Session","terms":{"priceCurrency":["USD"]}}',
            "application/ld+json",
        )
        self.assert_finding("value.session_currency", findings)

    def test_scalar_array_jsonld_conflicting_duration_fails(self):
        findings = self.findings_from_script(
            '{"name":"One-Concern Parent Session","terms":{"durationMinutes":[60]}}',
            "application/ld+json",
        )
        self.assert_finding("value.session_duration", findings)

    def test_scalar_array_jsonld_conflicting_delivery_fails(self):
        findings = self.findings_from_script(
            '{"name":"One-Concern Parent Session","terms":{"deliveryPlatform":["Zoom"]}}',
            "application/ld+json",
        )
        self.assert_finding("delivery.unapproved_platform", findings)

    def test_scalar_array_jsonld_conflicting_payment_fails(self):
        findings = self.findings_from_script(
            '{"name":"One-Concern Parent Session","terms":{"paymentMethods":["PayPal"]}}',
            "application/ld+json",
        )
        self.assert_finding("payment.unsupported_rm350_method", findings)

    def test_scalar_array_javascript_conflicting_price_fails(self):
        findings = self.findings_from_script(
            'const offer={name:"One-Concern Parent Session",terms:{price:[450]}};'
        )
        self.assert_finding("authority.executable_javascript_forbidden", findings)

    def test_scalar_array_javascript_conflicting_currency_fails(self):
        findings = self.findings_from_script(
            'const offer={name:"One-Concern Parent Session",terms:{priceCurrency:["USD"]}};'
        )
        self.assert_finding("authority.executable_javascript_forbidden", findings)

    def test_scalar_array_javascript_conflicting_duration_fails(self):
        findings = self.findings_from_script(
            'const offer={name:"One-Concern Parent Session",terms:{durationMinutes:[60]}};'
        )
        self.assert_finding("authority.executable_javascript_forbidden", findings)

    def test_scalar_array_javascript_conflicting_delivery_fails(self):
        findings = self.findings_from_script(
            'const offer={name:"One-Concern Parent Session",terms:{deliveryPlatform:["Zoom"]}};'
        )
        self.assert_finding("authority.executable_javascript_forbidden", findings)

    def test_scalar_array_javascript_conflicting_payment_fails(self):
        findings = self.findings_from_script(
            'const offer={name:"One-Concern Parent Session",terms:{paymentMethods:["PayPal"]}};'
        )
        self.assert_finding("authority.executable_javascript_forbidden", findings)

    def test_scalar_array_canonical_singleton_and_multi_values_pass(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","terms":{"price":[350],'
            '"priceCurrency":["MYR"],"durationMinutes":[45],'
            '"deliveryPlatform":["Google Meet"],'
            '"paymentMethods":["Maybank bank transfer","DuitNow QR"]}}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"One-Concern Parent Session","terms":{"price":[350],'
            '"priceCurrency":["MYR"],"durationMinutes":[45],'
            '"deliveryPlatform":["Google Meet"],'
            '"paymentMethods":["Maybank bank transfer","DuitNow QR"]}}',
            "application/json",
        )
        self.assertEqual([], self.findings_for({"services.html": source}))

    def test_scalar_array_mixed_authorised_and_conflicting_values_fail(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","terms":{"price":[350,450],'
            '"paymentMethods":["Maybank bank transfer","PayPal"]}}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"One-Concern Parent Session","terms":{"price":[350,450],'
            '"paymentMethods":["DuitNow QR","PayPal"]}}',
            "application/json",
        )
        findings = self.findings_for({"services.html": source})
        self.assert_finding("value.session_price", findings)
        self.assert_finding("payment.unsupported_rm350_method", findings)

    def test_scalar_array_nested_arrays_retain_context_and_path(self):
        jsonld = (
            '<script type="application/ld+json">'
            '{"name":"One-Concern Parent Session","terms":{"price":[[450]]}}'
            "</script>"
        )
        application_json = (
            '<script type="application/json">'
            '{"name":"One-Concern Parent Session","terms":{"price":[[450]]}}'
            "</script>"
        )
        source = f"<html><body>{jsonld}{application_json}</body></html>"
        surfaces = extract_surfaces("fixture.html", source)
        matches = [
            surface
            for surface in surfaces
            if dict(surface.fields).get("price") == "450"
        ]
        self.assertEqual(
            {"jsonld_record", "application_json_record"},
            {surface.kind for surface in matches},
        )
        self.assertTrue(
            all(surface.structured_path == ("terms", "price", "[0]", "[0]") for surface in matches)
        )
        findings = self.findings_from_script(
            '{"name":"One-Concern Parent Session","terms":{"price":[[450]]}}',
            "application/ld+json",
        )
        self.assert_finding("value.session_price", findings)
        self.assert_finding(
            "value.session_price",
            self.findings_from_script(
                '{"name":"One-Concern Parent Session","terms":{"price":[[450]]}}',
                "application/json",
            ),
        )

    def test_scalar_array_multiple_object_levels_fail(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","catalog":{"details":{"terms":'
            '{"deliveryPlatform":["Zoom"]}}}}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"One-Concern Parent Session","catalog":{"details":{"terms":'
            '{"deliveryPlatform":["Zoom"]}}}}',
            "application/json",
        )
        self.assert_finding(
            "delivery.unapproved_platform",
            self.findings_for({"services.html": source}),
        )

    def test_scalar_array_mixed_scalars_and_child_records_fail(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","terms":{"price":[350,{"value":450}]}}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"One-Concern Parent Session","terms":'
            '{"price":[350,{"value":450}]}}',
            "application/json",
        )
        self.assert_finding("value.session_price", self.findings_for({"services.html": source}))

    def test_scalar_array_empty_values_fail_closed(self):
        expected = {
            "value.session_price",
            "value.session_currency",
            "value.session_duration",
            "delivery.unapproved_platform",
            "payment.unsupported_rm350_method",
        }
        for script_type, payload in (
            (
                "application/ld+json",
                '{"name":"One-Concern Parent Session","terms":{"price":[],"priceCurrency":[],'
                '"durationMinutes":[],"deliveryPlatform":[],"paymentMethods":[]}}',
            ),
            (
                "application/json",
                '{"name":"One-Concern Parent Session","terms":{"price":[],'
                '"priceCurrency":[],"durationMinutes":[],"deliveryPlatform":[],'
                '"paymentMethods":[]}}',
            ),
        ):
            with self.subTest(script_type=script_type or "javascript"):
                identifiers = {
                    finding.identifier
                    for finding in self.findings_from_script(payload, script_type)
                }
                self.assertTrue(expected.issubset(identifiers), expected - identifiers)

    def test_scalar_array_null_boolean_object_and_unsupported_values_fail_closed(self):
        json_findings = self.findings_from_script(
            '{"name":"One-Concern Parent Session","terms":{"price":null,'
            '"durationMinutes":true,"paymentMethods":{}}}',
            "application/ld+json",
        )
        self.assert_finding("value.session_price", json_findings)
        self.assert_finding("value.session_duration", json_findings)
        self.assert_finding("payment.unsupported_rm350_method", json_findings)
        javascript_findings = self.findings_from_script(
            'const offer={name:"One-Concern Parent Session",terms:{price:null,'
            'durationMinutes:true,paymentMethods:{},deliveryPlatform:getPlatform()}};'
        )
        self.assert_finding(
            "authority.executable_javascript_forbidden",
            javascript_findings,
        )

    def test_scalar_array_unrelated_structured_arrays_pass(self):
        source = append_script(
            self.canonical["services.html"],
            '{"name":"Unrelated webinar","terms":{"price":[450],"priceCurrency":["USD"],'
            '"durationMinutes":[60],"deliveryPlatform":["Zoom"],'
            '"paymentMethods":["PayPal"]}}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"Unrelated webinar","terms":{"price":[450],'
            '"priceCurrency":["USD"],"durationMinutes":[60],'
            '"deliveryPlatform":["Zoom"],"paymentMethods":["PayPal"]}}',
            "application/json",
        )
        self.assertEqual([], self.findings_for({"services.html": source}))

    def test_scalar_array_home_support_wise_is_allowed(self):
        source = append_script(
            self.canonical["pay/index.html"],
            '{"name":"APC Home Support Programme","overseas":'
            '{"paymentMethods":["Wise"],"authorization":"already authorized only"}}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"APC Home Support Programme","overseas":'
            '{"paymentMethods":["Wise"],"authorization":"already authorized only"}}',
            "application/json",
        )
        self.assertEqual([], self.findings_for({"pay/index.html": source}))

    def test_scalar_array_all_five_conflicts_fail_together(self):
        expected = {
            "value.session_price",
            "value.session_currency",
            "value.session_duration",
            "delivery.unapproved_platform",
            "payment.unsupported_rm350_method",
        }
        source = append_script(
            self.canonical["services.html"],
            '{"name":"One-Concern Parent Session","terms":{"price":[450],'
            '"priceCurrency":["USD"],"durationMinutes":[60],'
            '"deliveryPlatform":["Zoom"],"paymentMethods":["PayPal"]}}',
            "application/ld+json",
        )
        source = append_script(
            source,
            '{"name":"One-Concern Parent Session","terms":{"price":[450],'
            '"priceCurrency":["USD"],"durationMinutes":[60],'
            '"deliveryPlatform":["Zoom"],"paymentMethods":["PayPal"]}}',
            "application/json",
        )
        identifiers = {
            finding.identifier for finding in self.findings_for({"services.html": source})
        }
        self.assertTrue(expected.issubset(identifiers), expected - identifiers)

    def test_context_array_full_governed_conflict_matrix(self):
        context_keys = ("name", "offer", "service", "product", "title")
        conflicts = (
            ("price", 450, "value.session_price"),
            ("priceCurrency", "USD", "value.session_currency"),
            ("durationMinutes", 60, "value.session_duration"),
            ("deliveryPlatform", "Zoom", "delivery.unapproved_platform"),
            ("paymentMethods", "PayPal", "payment.unsupported_rm350_method"),
        )
        formats = (
            ("jsonld", "application/ld+json"),
            ("application_json", "application/json"),
        )
        for context_key in context_keys:
            for field, value, expected in conflicts:
                for format_name, script_type in formats:
                    record = {
                        context_key: ["One-Concern Parent Session"],
                        "terms": {field: value},
                    }
                    serialized = json.dumps(record)
                    payload = serialized if script_type else f"const record={serialized};"
                    with self.subTest(
                        context_key=context_key,
                        field=field,
                        format=format_name,
                    ):
                        self.assert_finding(
                            expected,
                            self.findings_from_script(payload, script_type),
                        )

    def test_context_array_canonical_singletons_pass_for_every_key_and_format(self):
        canonical_terms = {
            "price": 350,
            "priceCurrency": "MYR",
            "durationMinutes": 45,
            "deliveryPlatform": "Google Meet",
            "paymentMethods": "DuitNow QR",
        }
        for context_key in ("name", "offer", "service", "product", "title"):
            for script_type in ("application/ld+json", "application/json"):
                record = {
                    context_key: ["One-Concern Parent Session"],
                    "terms": canonical_terms,
                }
                serialized = json.dumps(record)
                payload = serialized if script_type else f"const record={serialized};"
                with self.subTest(context_key=context_key, script_type=script_type or "javascript"):
                    self.assertEqual([], self.findings_from_script(payload, script_type))

    def test_context_array_nested_and_equivalent_canonical_values_pass(self):
        context_values = (
            [["One-Concern Parent Session"]],
            ["One-Concern Parent Session", "One-Concern Parent Session"],
        )
        for value in context_values:
            for script_type in ("application/ld+json", "application/json"):
                record = {"name": value, "terms": {"price": 350}}
                serialized = json.dumps(record)
                payload = serialized if script_type else f"const record={serialized};"
                with self.subTest(value=value, script_type=script_type or "javascript"):
                    self.assertEqual([], self.findings_from_script(payload, script_type))

    def test_context_array_ambiguous_values_fail_closed(self):
        ambiguous_values = (
            ["One-Concern Parent Session", "Unrelated webinar"],
            ["One-Concern Parent Session", "APC Home Support Programme"],
        )
        for value in ambiguous_values:
            for script_type in ("application/ld+json", "application/json"):
                record = {"name": value, "terms": {"price": 450}}
                serialized = json.dumps(record)
                payload = serialized if script_type else f"const record={serialized};"
                with self.subTest(value=value, script_type=script_type or "javascript"):
                    self.assert_finding(
                        "authority.structured_context_invalid",
                        self.findings_from_script(payload, script_type),
                    )

    def test_context_array_malformed_types_fail_closed(self):
        malformed_values = ([], None, True, 7, {})
        for value in malformed_values:
            for script_type in ("application/ld+json", "application/json"):
                record = {"name": value, "terms": {"price": 450}}
                serialized = json.dumps(record)
                payload = serialized if script_type else f"const record={serialized};"
                with self.subTest(value=value, script_type=script_type or "javascript"):
                    self.assert_finding(
                        "authority.structured_context_invalid",
                        self.findings_from_script(payload, script_type),
                    )

    def test_context_array_governed_child_objects_retain_context(self):
        record = {
            "offer": [
                {
                    "name": "One-Concern Parent Session",
                    "terms": {"price": 450},
                }
            ]
        }
        serialized = json.dumps(record)
        for script_type in ("application/ld+json", "application/json"):
            payload = serialized if script_type else f"const record={serialized};"
            with self.subTest(script_type=script_type or "javascript"):
                self.assert_finding(
                    "value.session_price",
                    self.findings_from_script(payload, script_type),
                )

    def test_context_array_unclassified_child_objects_fail_closed(self):
        record = {"offer": [{"terms": {"price": 450}}]}
        serialized = json.dumps(record)
        for script_type in ("application/ld+json", "application/json"):
            payload = serialized if script_type else f"const record={serialized};"
            with self.subTest(script_type=script_type or "javascript"):
                self.assert_finding(
                    "authority.structured_context_invalid",
                    self.findings_from_script(payload, script_type),
                )

    def test_context_array_mixed_scalar_and_object_content_retains_context(self):
        record = {
            "offer": [
                "One-Concern Parent Session",
                {"terms": {"deliveryPlatform": "Zoom"}},
            ]
        }
        serialized = json.dumps(record)
        for script_type in ("application/ld+json", "application/json"):
            payload = serialized if script_type else f"const record={serialized};"
            with self.subTest(script_type=script_type or "javascript"):
                self.assert_finding(
                    "delivery.unapproved_platform",
                    self.findings_from_script(payload, script_type),
                )

    def test_context_array_malformed_child_preserves_valid_ancestor(self):
        record = {
            "name": "One-Concern Parent Session",
            "related": {"title": [], "price": 450},
        }
        serialized = json.dumps(record)
        for script_type in ("application/ld+json", "application/json"):
            payload = serialized if script_type else f"const record={serialized};"
            findings = self.findings_from_script(payload, script_type)
            with self.subTest(script_type=script_type or "javascript"):
                self.assert_finding("authority.structured_context_invalid", findings)
                self.assert_finding("value.session_price", findings)

    def test_context_array_unrelated_records_pass_for_every_key_and_format(self):
        unrelated_terms = {
            "price": 450,
            "priceCurrency": "USD",
            "durationMinutes": 60,
            "deliveryPlatform": "Zoom",
            "paymentMethods": "PayPal",
        }
        for context_key in ("name", "offer", "service", "product", "title"):
            for script_type in ("application/ld+json", "application/json"):
                record = {context_key: ["Unrelated webinar"], "terms": unrelated_terms}
                serialized = json.dumps(record)
                payload = serialized if script_type else f"const record={serialized};"
                with self.subTest(context_key=context_key, script_type=script_type or "javascript"):
                    self.assertEqual([], self.findings_from_script(payload, script_type))

    def test_context_array_all_five_descendant_conflicts_fail_together(self):
        expected = {
            "value.session_price",
            "value.session_currency",
            "value.session_duration",
            "delivery.unapproved_platform",
            "payment.unsupported_rm350_method",
        }
        record = {
            "name": ["One-Concern Parent Session"],
            "offers": {
                "price": 450,
                "priceCurrency": "USD",
                "durationMinutes": 60,
                "deliveryPlatform": "Zoom",
                "paymentMethods": "PayPal",
            },
        }
        serialized = json.dumps(record)
        for script_type in ("application/ld+json", "application/json"):
            payload = serialized if script_type else f"const record={serialized};"
            identifiers = {
                finding.identifier
                for finding in self.findings_from_script(payload, script_type)
            }
            with self.subTest(script_type=script_type or "javascript"):
                self.assertTrue(expected.issubset(identifiers), expected - identifiers)

    def test_javascript_context_expression_matrix(self):
        expressions = (
            ("undefined", "undefined"),
            ("identifier", "offerName"),
            ("function_call", "getOfferName()"),
            ("symbol", 'Symbol("One-Concern Parent Session")'),
            ("static_template", "`One-Concern Parent Session`"),
            ("interpolated_template", "`${offerName}`"),
            ("member_access", "catalog.offerName"),
            ("computed_expression", '"One-Concern " + "Parent Session"'),
        )
        for context_key in ("name", "offer", "service", "product", "title"):
            for category, expression in expressions:
                with self.subTest(context_key=context_key, category=category):
                    findings = self.findings_from_script(
                        f"const record={{{context_key}:{expression},terms:{{price:450}}}};"
                    )
                    self.assert_finding(
                        "authority.executable_javascript_forbidden",
                        findings,
                    )

    def test_javascript_undefined_context_descendant_conflict_matrix(self):
        conflicts = (
            ("price", "450"),
            ("priceCurrency", '"USD"'),
            ("durationMinutes", "60"),
            ("deliveryPlatform", '"Zoom"'),
            ("paymentMethods", '"PayPal"'),
        )
        for context_key in ("name", "offer", "service", "product", "title"):
            for field, value in conflicts:
                with self.subTest(context_key=context_key, field=field):
                    findings = self.findings_from_script(
                        f"const record={{{context_key}:undefined,terms:{{{field}:{value}}}}};"
                    )
                    self.assert_finding(
                        "authority.executable_javascript_forbidden",
                        findings,
                    )

    def test_javascript_governed_value_expression_matrix(self):
        expressions = (
            ("price", "getPrice()"),
            ("priceCurrency", "currency.code"),
            ("durationMinutes", "duration + 15"),
            ("deliveryPlatform", "getPlatform()"),
            ("paymentMethods", "Symbol()"),
        )
        for field, expression in expressions:
            with self.subTest(field=field):
                findings = self.findings_from_script(
                    f'const record={{name:"One-Concern Parent Session",{field}:{expression}}};'
                )
                self.assert_finding(
                    "authority.executable_javascript_forbidden",
                    findings,
                )

    def test_javascript_unsupported_expression_structures_fail_closed(self):
        cases = (
            (
                "context_array",
                'const record={name:[undefined],terms:{price:450}};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "nested_governed_value",
                'const record={name:"One-Concern Parent Session",child:{price:getPrice()}};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "beside_canonical_sibling",
                'const record={name:"One-Concern Parent Session",title:undefined,price:350};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "unsupported_child",
                'const record={name:"One-Concern Parent Session",child:{title:undefined,price:450}};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "canonical_child",
                'const record={name:undefined,child:{name:"One-Concern Parent Session",price:450}};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "multiple_unsupported",
                'const record={name:undefined,price:getPrice(),paymentMethods:methods.current};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "governed_array",
                'const record={name:"One-Concern Parent Session",price:[350,getPrice()]};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "spread",
                'const record={name:"One-Concern Parent Session",price:350,...extra};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "getter",
                'const record={name:"One-Concern Parent Session",get price(){return 450}};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "shorthand",
                'const record={name:"One-Concern Parent Session",price};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "computed_property",
                'const record={name:"One-Concern Parent Session",[price]:450};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "computed_context_property",
                'const record={["name"]:"One-Concern Parent Session",price:450};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "spread_context",
                'const record={...{name:"One-Concern Parent Session"},price:450};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "array_spread",
                'const record={name:"One-Concern Parent Session",price:[...values]};',
                {"authority.executable_javascript_forbidden"},
            ),
            (
                "template_operator",
                "const record={name:`One-Concern Parent ` + `Session`,price:450};",
                {"authority.executable_javascript_forbidden"},
            ),
        )
        for category, payload, expected in cases:
            with self.subTest(category=category):
                identifiers = {
                    finding.identifier for finding in self.findings_from_script(payload)
                }
                self.assertTrue(expected.issubset(identifiers), expected - identifiers)

    def test_javascript_malformed_and_unconsumed_values_fail_closed(self):
        cases = (
            'const record={name:"One-Concern Parent Session",price:};',
            'const record={name:"One-Concern Parent Session",price:450 trailing};',
            'const record={name:"One-Concern Parent Session",price:450;',
            'const record={name:`One-Concern Parent Session,price:450};',
        )
        for payload in cases:
            with self.subTest(payload=payload):
                self.assert_finding(
                    "authority.executable_javascript_forbidden",
                    self.findings_from_script(payload),
                )

    def test_javascript_static_template_literals_are_rejected(self):
        findings = self.findings_from_script(
            "const record={name:`One-Concern Parent Session`,price:350,"
            "priceCurrency:`MYR`,durationMinutes:45,"
            "deliveryPlatform:`Google Meet`,paymentMethods:`DuitNow QR`};"
        )
        self.assert_finding("authority.executable_javascript_forbidden", findings)

    def test_javascript_static_template_literals_are_supported(self):
        # Retain the historical registered identity. Supported now means the
        # bounded recognizer detects this syntax and rejects its authority claim.
        findings = self.findings_from_script(
            "const label=`One-Concern Parent Session`;"
        )
        self.assert_finding("authority.executable_javascript_forbidden", findings)

    def test_javascript_ordinary_application_code_is_not_governed(self):
        source = append_script(
            self.canonical["services.html"],
            "function renderCard(item){const model={name:item.name,title:item.title,"
            "render(){return true}};return model;}"
            "const selection=new URLSearchParams(location.search).get('s');"
            "document.body.dataset.mode=selection;",
        )
        self.assertEqual([], self.findings_for({"services.html": source}))

    def test_javascript_unsupported_siblings_do_not_hide_supported_conflicts(self):
        identifiers = {
            finding.identifier
            for finding in self.findings_from_script(
                'const record={name:"One-Concern Parent Session",price:getPrice(),'
                'priceCurrency:"USD",durationMinutes:60,deliveryPlatform:"Zoom",'
                'paymentMethods:"PayPal"};'
            )
        }
        expected = {
            "authority.executable_javascript_forbidden",
        }
        self.assertTrue(expected.issubset(identifiers), expected - identifiers)

    def test_executable_javascript_business_authority_surface_matrix(self):
        cases = (
            'const label="One-Concern Parent Session";',
            "const offerName=getLabel();",
            "const sessionPrice=getPrice();",
            "const record={price:350};",
            "const record={priceCurrency:getCurrency()};",
            "const record={durationMinutes:getDuration()};",
            "const record={deliveryPlatform:getPlatform()};",
            "const record={paymentMethods:getMethods()};",
            'const message="Submit a booking request";',
            'const scope="one focused parent concern";',
            'const state="bookings open";',
        )
        for payload in cases:
            with self.subTest(payload=payload):
                findings = self.findings_from_script(payload)
                self.assert_finding(
                    "authority.executable_javascript_forbidden",
                    findings,
                )
                self.assertNotIn(payload, repr(findings))

    def test_tracked_executable_javascript_files_use_the_same_boundary(self):
        for suffix in (".js", ".mjs", ".cjs"):
            with self.subTest(suffix=suffix):
                findings = self.findings_for(
                    additions={
                        "assets/authority" + suffix:
                            'export const offerName="One-Concern Parent Session";'
                    }
                )
                self.assert_finding("authority.executable_javascript_forbidden", findings)
                unrelated = self.findings_for(
                    additions={
                        "assets/ui" + suffix:
                            "export function toggleMenu(){return true;}"
                    }
                )
                self.assertEqual([], unrelated)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            asset = root / "authority.cjs"
            asset.write_text(
                'export const offerName="One-Concern Parent Session";',
                encoding="utf-8",
            )
            subprocess.run(["git", "add", "authority.cjs"], cwd=root, check=True)
            self.assertIn("authority.cjs", load_tracked_documents(root))

    def test_private_content_os_executable_module_is_exempt(self):
        findings = self.findings_for(
            additions={
                "functions/api/content-os/private-authority.js":
                    'export const offerName="One-Concern Parent Session";'
            }
        )
        self.assertEqual([], findings)

    def test_non_public_build_module_is_exempt_but_lookalikes_are_not(self):
        build_source = self.canonical["scripts/build-site.mjs"]
        self.assertEqual([], self.findings_for())
        findings = self.findings_for(
            additions={
                "scripts/build-site-copy.mjs":
                    'export const offerName="One-Concern Parent Session";'
            }
        )
        self.assert_finding("authority.executable_javascript_forbidden", findings)

    def test_adjacent_public_javascript_authority_claim_still_fails(self):
        findings = self.findings_for(
            additions={
                "functions/api/content-os-public.js":
                    'export const offerName="One-Concern Parent Session";'
            }
        )
        self.assert_finding("authority.executable_javascript_forbidden", findings)

    def test_all_standard_javascript_mime_types_are_rejected(self):
        expected = {
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
        self.assertEqual(expected, JAVASCRIPT_MIME_ESSENCES)
        payload = 'const record={name:"One-Concern Parent Session",price:350};'
        for script_type in sorted(expected):
            with self.subTest(script_type=script_type):
                self.assert_finding(
                    "authority.executable_javascript_forbidden",
                    self.findings_from_script(payload, script_type),
                )

    def test_javascript_mime_parameters_case_whitespace_and_module_are_rejected(self):
        payload = 'const record={name:"One-Concern Parent Session",price:350};'
        for script_type in (
            "text/javascript; charset=utf-8",
            " application/javascript ; charset=UTF-8 ",
            " TeXt/JaVaScRiPt ",
            "   ",
            "module",
            " MoDuLe ",
        ):
            with self.subTest(script_type=script_type):
                self.assert_finding(
                    "authority.executable_javascript_forbidden",
                    self.findings_from_script(payload, script_type),
                )

    def test_computed_and_spread_authority_reject_for_new_mime_types(self):
        cases = (
            (
                "application/ecmascript",
                'const x={["name"]:"One-Concern Parent Session",price:450};',
            ),
            (
                "text/x-javascript",
                'const x={...{name:"One-Concern Parent Session"},price:450};',
            ),
        )
        for script_type, payload in cases:
            with self.subTest(script_type=script_type):
                self.assert_finding(
                    "authority.executable_javascript_forbidden",
                    self.findings_from_script(payload, script_type),
                )

    def test_event_handler_attribute_matrix_is_rejected(self):
        payload = 'window.record={name:"One-Concern Parent Session",price:350}'
        cases = (
            ("button", "onclick"),
            ("svg", "onload"),
            ("img", "onerror"),
            ("form", "onsubmit"),
            ("select", "onchange"),
            ("input", "onfocus"),
            ("button", "oNcLiCk"),
        )
        for element, attribute in cases:
            with self.subTest(element=element, attribute=attribute):
                findings = self.findings_from_markup(
                    f"<{element} {attribute}='{payload}'></{element}>"
                )
                self.assert_finding("authority.executable_javascript_forbidden", findings)
                self.assertNotIn(payload, repr(findings))

    def test_javascript_url_attribute_matrix_is_rejected(self):
        payload = 'window.record={name:"One-Concern Parent Session",price:350}'
        cases = (
            ("a", "href", "javascript:"),
            ("form", "action", " JAVASCRIPT:"),
            ("button", "formaction", "\nJaVaScRiPt:"),
            ("iframe", "src", "\tjavascript:"),
            ("div", "data-run", "javascript:"),
        )
        for element, attribute, scheme in cases:
            with self.subTest(element=element, attribute=attribute):
                findings = self.findings_from_markup(
                    f"<{element} {attribute}='{scheme}{payload}'></{element}>"
                )
                self.assert_finding("authority.executable_javascript_forbidden", findings)
                self.assertNotIn(payload, repr(findings))

    def test_executable_surface_negative_controls_remain_accepted(self):
        scripts = (
            '<script type="module">export function toggleMenu(){return true;}</script>',
            '<script type="text/x-javascript">function openPanel(){return true;}</script>',
            '<button onclick="return toggleMenu(this)">Menu</button>',
            '<a href="javascript:void document.body.classList.toggle(\'menu-open\')">Menu</a>',
            '<script type="importmap">{"imports":{"widget":"/widget.js"}}</script>',
            '<script type="speculationrules">{"prefetch":[]}</script>',
            '<script type="application/x-apc-widget">{"view":"compact"}</script>',
            '<script type="application/ld+json">'
            '{"name":"One-Concern Parent Session","price":350,'
            '"priceCurrency":"MYR","durationMinutes":45,'
            '"deliveryPlatform":"Google Meet","paymentMethods":"DuitNow QR"}'
            '</script>',
            '<script type="application/json">'
            '{"name":"One-Concern Parent Session","price":350,'
            '"priceCurrency":"MYR","durationMinutes":45,'
            '"deliveryPlatform":"Google Meet","paymentMethods":"DuitNow QR"}'
            '</script>',
        )
        source = self.canonical["services.html"].replace(
            "</body>", "".join(scripts) + "</body>", 1
        )
        self.assertEqual([], self.findings_for({"services.html": source}))

    def test_application_json_is_authorised_and_malformed_data_fails_closed(self):
        canonical = self.findings_from_script(
            '{"name":"One-Concern Parent Session","price":350,'
            '"priceCurrency":"MYR","durationMinutes":45,'
            '"deliveryPlatform":"Google Meet","paymentMethods":"DuitNow QR"}',
            "application/json",
        )
        self.assertEqual([], canonical)
        conflicting = self.findings_from_script(
            '{"name":"One-Concern Parent Session","price":450}',
            "application/json",
        )
        self.assert_finding("value.session_price", conflicting)
        malformed = self.findings_from_script(
            '{"name":"One-Concern Parent Session","price":}',
            "application/json",
        )
        self.assert_finding("syntax.application_json_invalid", malformed)

    def test_validator_contains_no_javascript_execution_primitive(self):
        validator = (ROOT / "tests/validate_website_authority.py").read_text(
            encoding="utf-8"
        )
        for primitive in ("eval(", "Function(", "vm.run", "vm.Script", "execjs"):
            with self.subTest(primitive=primitive):
                self.assertNotIn(primitive, validator)

    def test_manifest_provenance_regressions_fail(self):
        cases = {
            "altered mirror hash": lambda value: value["provenance"].__setitem__(
                "governed_projection_sha256", "sha256:" + "0" * 64
            ),
            "stale authority version": lambda value: value["provenance"].__setitem__(
                "source_authority_version", "1.1"
            ),
            "missing canonical source identity": lambda value: value["provenance"].pop(
                "source_repository"
            ),
        }
        for label, mutate in cases.items():
            with self.subTest(label=label):
                value = copy.deepcopy(AUTHORITY)
                mutate(value)
                with self.assertRaises(ValueError):
                    validate_authority_manifest(value)

    def test_public_wise_route_is_private_and_international(self):
        for relative in ("index.html", "services.html", "start.html", "terms.html", "pay/index.html"):
            with self.subTest(path=relative):
                source = (ROOT / relative).read_text(encoding="utf-8")
                self.assertRegex(source, r"(?i)international.{0,160}wise")
                self.assertRegex(source, r"(?i)(?:sent|details).{0,100}privately")

    def test_terms_uses_interim_first_step_call_wording(self):
        terms = (ROOT / "terms.html").read_text(encoding="utf-8")
        self.assertIn("a fit-and-routing conversation", terms)
        self.assertNotIn("free consultation slots", terms)
        self.assertNotIn("limit repeated use of free First Step Call slots", terms)
        self.assertNotRegex(terms, r"(?i)no-?show.{0,80}(?:restrict|penalt|forfeit)")

    def test_booking_confirmation_heading_hierarchy(self):
        source = (ROOT / "booking-confirmed-call.html").read_text(encoding="utf-8")
        headings = [int(level) for level in re.findall(r"<h([1-6])\b", source, re.I)]
        self.assertTrue(headings)
        self.assertEqual(1, headings[0])
        for previous, current in zip(headings, headings[1:]):
            self.assertLessEqual(current - previous, 1)

    def test_booking_confirmation_nav_and_footer_targets_meet_24px_rule(self):
        source = (ROOT / "booking-confirmed-call.html").read_text(encoding="utf-8")
        self.assertRegex(source, r"\.nav-links a\{[^}]*min-height:24px")
        self.assertRegex(source, r"\.apc-footer-column a \{[^}]*min-height: 24px !important;")


if __name__ == "__main__":
    unittest.main()
