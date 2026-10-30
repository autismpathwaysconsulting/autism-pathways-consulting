"""The /links bio page (approved by CJ on 30 Oct 2026) and its tracked /go/ redirects."""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REDIRECTS = {
    "guide": "/big-reactions-quick-check",
    "toolkit": "https://www.etsy.com/listing/4590236884/autism-parent-pattern-finder-toolkit-big",
    "apply": "/parents#home-support",
}


class LinksPage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "links.html").read_text(encoding="utf-8")

    def test_four_buttons_in_order(self):
        hrefs = re.findall(r'<a class="card" href="([^"]+)"', self.html)
        self.assertEqual(hrefs, ["/go/first-step-call", "/go/guide", "/go/toolkit", "/go/apply"])

    def test_no_prices_on_the_page(self):
        self.assertIsNone(re.search(r"RM ?\d|S\$ ?\d|USD ?\d", self.html))

    def test_scope_and_company_lines(self):
        self.assertIn("APC works with you, not instead of the therapists your child is already seeing.", self.html)
        self.assertIn("003030209-T", self.html)

    def test_no_em_dashes(self):
        for path in ["links.html", *[f"go/{k}.html" for k in REDIRECTS]]:
            with self.subTest(path=path):
                self.assertNotIn("\u2014", (ROOT / path).read_text(encoding="utf-8"))

    def test_redirects_point_to_the_right_place(self):
        headers = (ROOT / "_headers").read_text(encoding="utf-8")
        for name, destination in REDIRECTS.items():
            with self.subTest(redirect=name):
                page = (ROOT / "go" / f"{name}.html").read_text(encoding="utf-8")
                self.assertIn(f"var destination='{destination}'", page)
                self.assertIn(f'url={destination}"', page)
                self.assertIn('content="noindex,nofollow"', page)
                self.assertIn(f"/go/{name}\n  Cache-Control", headers)


if __name__ == "__main__":
    unittest.main()
