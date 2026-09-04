from copy import deepcopy
from pathlib import Path
import json
import re
import unittest

from validate_interim_containment import (
    AUTHORITY_PATH,
    MANIFEST_PATH,
    ROOT,
    load_public_sources,
    normalise_request_path,
    validate_manifest,
    validate_repository,
    validate_surfaces,
)


class InterimContainmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sources, cls.paths = load_public_sources(ROOT)
        cls.manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        cls.authority = json.loads(AUTHORITY_PATH.read_text(encoding="utf-8"))

    def findings_with_html(self, path: str, addition: str) -> list[str]:
        sources = dict(self.sources)
        sources[path] = sources[path].replace("</body>", addition + "</body>", 1)
        return validate_surfaces(sources, set(self.paths))

    def test_repository_passes_interim_containment(self):
        self.assertEqual([], validate_repository(ROOT))

    def test_wise_public_wording_fails(self):
        self.assertIn(
            "containment.wise_public_wording",
            self.findings_with_html("services.html", "<p>Wise payment is supported.</p>"),
        )

    def test_international_availability_fails(self):
        self.assertIn(
            "containment.international_availability",
            self.findings_with_html("services.html", "<p>International services are available.</p>"),
        )

    def test_direct_payment_route_fails(self):
        self.assertIn(
            "containment.direct_payment_route",
            self.findings_with_html("services.html", '<a href="/pay/350">Pay</a>'),
        )

    def test_immediate_payment_permission_fails(self):
        self.assertIn(
            "containment.immediate_payment_permission",
            self.findings_with_html("services.html", "<p>Pay now.</p>"),
        )

    def test_public_payment_asset_fails(self):
        paths = set(self.paths) | {"QR_Payment.JPG"}
        self.assertIn(
            "containment.public_payment_asset:QR_Payment.JPG",
            validate_surfaces(self.sources, paths),
        )

    def test_public_account_details_fail(self):
        findings = self.findings_with_html(
            "pay/index.html", "<p>Account number</p>"
        )
        self.assertIn("containment.public_payment_detail:account number", findings)

    def test_review_notice_removal_fails(self):
        sources = dict(self.sources)
        sources["index.html"] = re.sub(
            r"Paid support is subject to", "Paid support", sources["index.html"], flags=re.IGNORECASE
        )
        self.assertIn(
            "containment.review_notice_missing:index.html",
            validate_surfaces(sources, set(self.paths)),
        )

    def test_booking_sequence_reordering_fails(self):
        sources = dict(self.sources)
        sources["pay/index.html"] = sources["pay/index.html"].replace(
            "Submit a request.", "The Founder confirms the booking. Submit a request.", 1
        )
        self.assertIn(
            "containment.booking_sequence_page",
            validate_surfaces(sources, set(self.paths)),
        )

    def test_stale_authority_hash_fails(self):
        manifest = deepcopy(self.manifest)
        manifest["provenance"]["canonical_source_sha256"] = "sha256:" + "0" * 64
        self.assertIn(
            "containment.stale_or_untraceable_provenance",
            validate_manifest(manifest, self.authority),
        )

    def test_authority_promotion_fails(self):
        manifest = deepcopy(self.manifest)
        manifest["authority_permissions"]["publication_authorised"] = True
        self.assertIn(
            "containment.authority_promotion",
            validate_manifest(manifest, self.authority),
        )

    def test_false_hold_closure_fails(self):
        manifest = deepcopy(self.manifest)
        manifest["holds"]["OPS-HOLD-001"] = "CLOSED"
        self.assertIn(
            "containment.false_hold_closure",
            validate_manifest(manifest, self.authority),
        )

    def test_automatic_confirmation_control_fails(self):
        manifest = deepcopy(self.manifest)
        manifest["public_controls"]["automatic_booking_confirmation"] = True
        self.assertIn(
            "containment.public_controls_weakened",
            validate_manifest(manifest, self.authority),
        )

    def test_paid_calcom_route_fails(self):
        findings = self.findings_with_html(
            "services.html",
            '<a href="https://cal.com/autismpathwaysconsulting/parent-strategy-session">Book</a>',
        )
        self.assertIn("containment.paid_cal_link", findings)
        self.assertIn("containment.unapproved_cal_url:services.html", findings)

    def test_any_unapproved_calcom_event_fails(self):
        findings = self.findings_with_html(
            "services.html", '<a href="https://cal.com/autismpathwaysconsulting/other">Book</a>'
        )
        self.assertIn("containment.unapproved_cal_url:services.html", findings)

    def test_legacy_confirmation_language_fails(self):
        findings = self.findings_with_html(
            "booking-confirmed-session.html", "<p>Your session is booked.</p>"
        )
        self.assertIn(
            "containment.legacy_confirmation_unsafe:session is booked", findings
        )

    def test_legacy_redirect_removal_fails(self):
        sources = dict(self.sources)
        sources["_redirects"] = sources["_redirects"].replace(
            "/booking-confirmed-session/ /booking-confirmed-session.html 302\n", ""
        )
        self.assertIn(
            "containment.legacy_route_redirect_missing",
            validate_surfaces(sources, set(self.paths)),
        )

    def test_booking_status_url_variants_fail_closed(self):
        safe = "/booking-confirmed-session"
        self.assertEqual(safe, normalise_request_path(safe + "?source=old#status"))
        self.assertEqual(safe, normalise_request_path("/booking%2Dconfirmed%2Dsession"))
        self.assertEqual(safe + "/", normalise_request_path(safe + "/?source=old"))
        self.assertNotEqual(safe, normalise_request_path("/Booking-Confirmed-Session"))

    def test_payment_url_variants_do_not_bypass_safe_route(self):
        self.assertEqual("/pay/350", normalise_request_path("/pay/350?old=true#pay"))
        self.assertEqual("/pay/350/", normalise_request_path("/pay/350/"))
        self.assertEqual("/pay/350", normalise_request_path("/pay/%33%35%30"))
        self.assertNotEqual("/pay/350", normalise_request_path("/PAY/350"))

    def test_fixed_cancellation_rule_fails(self):
        findings = self.findings_with_html(
            "terms.html", "<p>Less than 24 hours notice means no refund.</p>"
        )
        self.assertIn("containment.final_policy_rule:fixed_notice_period", findings)
        self.assertIn("containment.final_policy_rule:fixed_no_refund", findings)

    def test_public_receipt_request_fails(self):
        self.assertIn(
            "containment.public_receipt_request",
            self.findings_with_html("services.html", "<p>Send your receipt.</p>"),
        )

    def test_new_public_form_fails(self):
        self.assertIn(
            "containment.form_inventory_changed",
            self.findings_with_html("pay/index.html", "<form></form>"),
        )

    def test_file_upload_control_fails(self):
        findings = self.findings_with_html(
            "pay/index.html", '<form><input type="file"></form>'
        )
        self.assertIn("containment.public_file_input:pay/index.html", findings)

    def test_new_storage_or_network_integration_fails(self):
        self.assertIn(
            "containment.new_integration_surface:pay/index.html",
            self.findings_with_html(
                "pay/index.html", "<script>localStorage.setItem('paid','yes')</script>"
            ),
        )

    def test_protected_content_os_is_not_treated_as_a_public_surface(self):
        findings = self.findings_with_html(
            "content-os/index.html",
            '<h1>Private tool</h1><form><input type="file"></form>'
            '<script>fetch("/api/content-os/state")</script>',
        )
        self.assertNotIn("containment.form_inventory_changed", findings)
        self.assertNotIn("containment.new_integration_surface:content-os/index.html", findings)
        self.assertNotIn("containment.public_file_input:content-os/index.html", findings)

    def test_nested_protected_content_os_is_not_treated_as_a_public_surface(self):
        path = "content-os/episodes/index.html"
        findings = self.findings_with_html(
            path,
            '<h1>Private episode tool</h1><form><input type="file"></form>'
            '<script>fetch("/api/content-os/episode-workflow")</script>',
        )
        self.assertNotIn("containment.form_inventory_changed", findings)
        self.assertNotIn(f"containment.new_integration_surface:{path}", findings)
        self.assertNotIn(f"containment.public_file_input:{path}", findings)

    def test_content_os_lookalike_form_remains_public_fail_closed(self):
        sources = dict(self.sources)
        lookalike_path = "content-os-preview/index.html"
        sources[lookalike_path] = "<html><body><h1>Lookalike</h1><form></form></body></html>"
        findings = validate_surfaces(sources, set(self.paths) | {lookalike_path})
        self.assertIn("containment.form_inventory_changed", findings)

    def test_content_os_exception_is_bound_to_protected_routes(self):
        routes = json.loads((ROOT / "_routes.json").read_text(encoding="utf-8"))
        self.assertIn("/content-os/*", routes["include"])
        self.assertIn("/api/content-os/*", routes["include"])
        self.assertEqual([], routes["exclude"])
        middleware = (ROOT / "functions" / "_middleware.js").read_text(encoding="utf-8")
        self.assertIn("APC_CONTENT_OS_AUTH", middleware)
        self.assertIn("WWW-Authenticate", middleware)

    def test_broken_internal_link_fails(self):
        self.assertIn(
            "containment.broken_internal_link:index.html:/missing-containment-page",
            self.findings_with_html(
                "index.html", '<a href="/missing-containment-page">Missing</a>'
            ),
        )

    def test_missing_local_asset_fails(self):
        self.assertIn(
            "containment.missing_asset:index.html:/missing-containment.png",
            self.findings_with_html(
                "index.html", '<img src="/missing-containment.png" alt="Test">'
            ),
        )

    def test_missing_image_alt_fails(self):
        self.assertIn(
            "containment.image_alt_missing:index.html",
            self.findings_with_html("index.html", '<img src="/og-image.png">'),
        )

    def test_heading_skip_fails(self):
        self.assertIn(
            "containment.heading_skip:index.html:h1-h3",
            self.findings_with_html("index.html", "<h1>Extra</h1><h3>Skipped</h3>"),
        )

    def test_extra_h1_fails(self):
        self.assertIn(
            "containment.h1_count:index.html",
            self.findings_with_html("index.html", "<h1>Extra</h1>"),
        )

    def test_first_step_scope_expansion_fails(self):
        self.assertIn(
            "containment.first_step_scope_expansion",
            self.findings_with_html(
                "index.html", "<p>The call gives personalised direction.</p>"
            ),
        )

    def test_policy_hold_wording_removal_fails(self):
        sources = dict(self.sources)
        sources["terms.html"] = sources["terms.html"].replace("OPS-HOLD-002", "")
        self.assertIn(
            "containment.interim_policy_missing:terms.html:ops-hold-002",
            validate_surfaces(sources, set(self.paths)),
        )

    def test_privacy_target_guard_removal_fails(self):
        sources = dict(self.sources)
        sources["privacy.html"] = sources["privacy.html"].replace(
            "min-height: 24px", "min-height: 16px"
        )
        self.assertIn(
            "containment.privacy_target_guard_missing",
            validate_surfaces(sources, set(self.paths)),
        )


if __name__ == "__main__":
    unittest.main()
