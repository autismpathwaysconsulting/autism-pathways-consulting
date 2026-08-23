#!/usr/bin/env python3
"""Registered adversarial tests for the APC authority validator."""

from html.parser import HTMLParser
from pathlib import Path
import subprocess
import tempfile
import unittest

from validate_website_authority import (
    AUTHORITY,
    ROOT,
    committed_tracked_paths,
    load_tracked_documents,
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

    def test_required_contradictions_fail_separately(self):
        cases = {
            "scope.repeated_concern": ("services.html", "The current RM350 wording covers one repeated concern."),
            "scope.repeated_pattern": ("services.html", "The RM350 session uses repeated-pattern positioning."),
            "delivery.generic_online": ("services.html", "The RM350 One-Concern Parent Session is delivered online."),
            "booking.automatic_confirmation": ("services.html", "The RM350 booking is automatically confirmed on submission."),
            "booking.direct_confirmation": ("services.html", "The RM350 booking receives direct confirmation on submission."),
            "payment.before_permission": ("services.html", "Pay RM350 before the Founder reviews suitability and availability."),
            "payment.unsupported_rm350_method": ("services.html", "The RM350 session can be paid by Stripe."),
            "home.additional_checkin": ("services.html", "Home Support includes an additional post-programme check-in."),
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
            "The RM350 wording covers one repeated concern and one repeated pattern.",
            "The RM350 One-Concern Parent Session is online and automatically confirmed.",
            "Pay RM350 before the Founder reviews suitability and availability.",
            "The RM350 session accepts card, Stripe, and Wise.",
            "The One-Concern Parent Session costs RM450 and lasts 60 minutes.",
            "Home Support includes an additional post-programme check-in.",
        )
        services = self.canonical["services.html"]
        for claim in claims:
            services = append_html(services, claim)
        index = append_html(self.canonical["index.html"], "Public launch is approved and live.")
        identifiers = {item.identifier for item in self.findings_for({"services.html": services, "index.html": index})}
        expected = {
            "scope.repeated_concern",
            "scope.repeated_pattern",
            "delivery.generic_online",
            "booking.automatic_confirmation",
            "payment.before_permission",
            "payment.unsupported_rm350_method",
            "value.session_price",
            "value.session_duration",
            "home.additional_checkin",
            "launch.authorized",
        }
        self.assertTrue(expected.issubset(identifiers), expected - identifiers)

    def test_contradiction_before_and_after_canonical_text(self):
        for before in (True, False):
            with self.subTest(before=before):
                source = append_html(
                    self.canonical["services.html"],
                    "The current RM350 wording covers one repeated concern.",
                    before=before,
                )
                self.assert_finding("scope.repeated_concern", self.findings_for({"services.html": source}))

    def test_case_and_whitespace_variations_fail(self):
        source = append_html(
            self.canonical["services.html"],
            "The RM350 wording covers ONE   REPEATED\nCONCERN and the booking is AUTOMATICALLY   CONFIRMED.",
        )
        findings = self.findings_for({"services.html": source})
        self.assert_finding("scope.repeated_concern", findings)
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
        self.assert_finding("scope.repeated_concern", findings)
        self.assert_finding("value.session_price", findings)

    def test_embedded_javascript_data_contradiction_fails(self):
        script = (
            "<script>const authorityConflict = "
            "{name:'One-Concern Parent Session', delivery:'online'};</script>"
        )
        source = self.canonical["services.html"].replace("</body>", script + "\n</body>", 1)
        self.assert_finding(
            "delivery.generic_online",
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

    def test_secondwave_nested_inline_online_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The RM350 delivery platform is <span>on<strong>line</strong></span>.</p>",
        )
        self.assert_finding("delivery.generic_online", self.findings_for({"services.html": source}))

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
            "delivery.generic_online",
            "payment.unsupported_rm350_method",
            "value.session_price",
            "delivery.unapproved_platform",
            "launch.public_availability",
            "booking.sequence_reordered",
        }
        self.assertTrue(expected.issubset(identifiers), expected - identifiers)

    def test_nested_inline_and_whitespace_token_splits_fail(self):
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
                self.assert_finding(
                    "delivery.generic_online",
                    self.findings_for({"services.html": source}),
                )
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

    def test_home_support_wise_remains_allowed(self):
        source = append_html(
            self.canonical["pay/index.html"],
            "For the RM1,800 Home Support Programme, Wise is available only after CJ confirms fit.",
        )
        self.assertEqual([], self.findings_for({"pay/index.html": source}))

    def test_structural_01_generic_bank_transfer_fails(self):
        source = insert_in_session_article(
            self.canonical["services.html"],
            "<p>The RM350 session accepts bank transfer.</p>",
        )
        self.assert_finding("payment.unsupported_rm350_method", self.findings_for({"services.html": source}))

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
        self.assert_finding("value.session_price", self.findings_for({"services.html": source}))

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
        self.assert_finding("booking.automatic_confirmation", self.findings_for({"services.html": source}))

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
        self.assert_finding("booking.automatic_confirmation", self.findings_for({"services.html": source}))

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
            "<p>RM350 · 45 minutes · Google Meet</p></article>"
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
        self.assertEqual(["Google Meet"], session["delivery_platforms"])
        self.assertEqual(["Maybank bank transfer", "DuitNow QR"], session["payment_methods"])
        self.assertEqual(1800, home["price"]["value"])
        self.assertEqual([6, 8], home["window_weeks"])
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


if __name__ == "__main__":
    unittest.main()
