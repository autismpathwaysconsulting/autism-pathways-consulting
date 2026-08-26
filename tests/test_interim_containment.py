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

    def test_candidate_label_removal_fails(self):
        sources = dict(self.sources)
        sources["index.html"] = re.sub(
            r"candidate services?", "paid option", sources["index.html"], flags=re.IGNORECASE
        )
        self.assertIn(
            "containment.candidate_label_missing:index.html",
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


if __name__ == "__main__":
    unittest.main()
