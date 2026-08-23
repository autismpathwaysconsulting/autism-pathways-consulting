#!/usr/bin/env python3
"""Registered adversarial tests for the APC authority validator."""

from pathlib import Path
import subprocess
import tempfile
import unittest

from validate_website_authority import (
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


def insert_in_session_article(source: str, markup: str) -> str:
    marker = '<div class="apc-slot-bar" aria-hidden="true">'
    if marker not in source:
        raise AssertionError("missing One-Concern Parent Session fixture marker")
    return source.replace(marker, f"{markup}\n          {marker}", 1)


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
        source = self.canonical["services.html"].replace(
            "RM350 | 45 minutes | Google Meet",
            "RM350 | 45 minutes | <span>on<strong>line</strong></span>",
            1,
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
                source = self.canonical["services.html"].replace(
                    "RM350 | 45 minutes | Google Meet",
                    f"{split_price} | 45 minutes | Google Meet",
                    1,
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
        services = self.canonical["services.html"].replace(
            "RM350 | 45 minutes | Google Meet",
            "<span>R</span><span>M450</span> | 45 minutes | <span>on<strong>line</strong></span>",
            1,
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
                source = self.canonical["services.html"].replace(
                    "RM350 | 45 minutes | Google Meet",
                    f"RM350 | 45 minutes | {variant}",
                    1,
                )
                self.assert_finding(
                    "delivery.generic_online",
                    self.findings_for({"services.html": source}),
                )
        duration = self.canonical["services.html"].replace(
            "45 minutes | Google Meet",
            "<span>6</span><em>0</em> minutes | Google Meet",
            1,
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
            "CJ verifies payment before confirming the booking",
            "CJ records payment before confirming the booking",
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


if __name__ == "__main__":
    unittest.main()
