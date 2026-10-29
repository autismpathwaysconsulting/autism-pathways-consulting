"""Public pages match the offer ladder approved on 2026-10-20 (see CLAUDE.md)."""

import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PAYMENT_LINE = (
    "CJ confirms fit and availability first, then sends payment details privately. "
    "Malaysia: bank transfer or DuitNow QR. Singapore and other countries: Wise."
)

DROPPED_OFFERS = re.compile(
    r"One-Concern|RM ?350\b|RM ?1,?800\b|Founding Live Session|Community Programme Ideas|RM ?950\b|"
    r"3-Session Starter|RM ?2,?500\b|Quick Clarity|Full Implementation|Progress Check Call|"
    r"Parent Strategy Session|Focused Parent Support|parent-strategy-session",
    re.I,
)

UNAPPROVED_PAYMENT = re.compile(r"paypal|stripe|crypto", re.I)

PRICES = {
    "parents.html": ["RM37", "RM57", "RM1,797", "S$997", "USD 697"],
    "schools.html": ["RM2,497", "S$997", "USD 697", "RM4,497", "S$1,797", "USD 1,297", "RM1,497", "S$597", "USD 397"],
    "teacher-talk.html": ["RM897", "RM797", "S$297", "USD 197"],
}


def public_pages():
    script = "import('./scripts/build-site.mjs').then(m=>console.log(JSON.stringify(m.PUBLIC_FILES)))"
    files = json.loads(subprocess.run(["node", "-e", script], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
    return [f for f in files if f.endswith(".html") and not f.startswith(("content-os/", "pathways-lab/"))]


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


class CurrentOffers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pages = {name: read(name) for name in public_pages()}

    def test_public_pages_found(self):
        self.assertGreaterEqual(len(self.pages), 25)

    def test_dropped_offers_are_not_reintroduced(self):
        for name, html in self.pages.items():
            with self.subTest(page=name):
                self.assertIsNone(DROPPED_OFFERS.search(html))

    def test_only_approved_payment_methods(self):
        for name, html in self.pages.items():
            with self.subTest(page=name):
                self.assertIsNone(UNAPPROVED_PAYMENT.search(html))

    def test_only_the_free_first_step_call_is_booked_through_cal(self):
        for name, html in self.pages.items():
            for slug in re.findall(r"cal\.com/autismpathwaysconsulting/([a-z0-9-]+)", html):
                with self.subTest(page=name):
                    self.assertEqual(slug, "first-step-call")

    def test_payment_line_sits_beside_booking(self):
        for name in ["parents.html", "schools.html", "teacher-talk.html", "pay/index.html"]:
            with self.subTest(page=name):
                self.assertIn(PAYMENT_LINE, re.sub(r"\s+", " ", self.pages[name]))

    def test_approved_prices(self):
        for name, prices in PRICES.items():
            for price in prices:
                with self.subTest(page=name, price=price):
                    self.assertIn(price, self.pages[name])

    def test_parents_keeps_the_free_first_step_call(self):
        self.assertIn("https://cal.com/autismpathwaysconsulting/first-step-call", self.pages["parents.html"])
        self.assertIn("Free 15-Min First Step Call", self.pages["parents.html"])

    def test_quick_check_is_the_header_call_to_action(self):
        for name, html in self.pages.items():
            if 'class="apc-shell-start"' in html:
                with self.subTest(page=name):
                    self.assertRegex(html, r'<a class="apc-shell-start" href="/big-reactions-quick-check"[^>]*><span class="apc-cta-long">Get the free Quick Check</span><span class="apc-cta-short">Free Quick Check</span></a>')


if __name__ == "__main__":
    unittest.main()
