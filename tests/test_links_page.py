"""The /links bio page: four cards, no prices, tracked /go/ redirects."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CARDS = {
    "/go/first-step-call": "Book a Free 15-Minute Assessment Call with CJ",
    "/go/guide": "Free Big Reactions Quick Check",
    "/go/toolkit": "Pattern Finder Toolkit",
    "/go/apply": "Autism Parent Pathway Programme",
}
REDIRECTS = {
    "guide": "/big-reactions-quick-check",
    "toolkit": "https://www.etsy.com/listing/4590236884/autism-parent-pattern-finder-toolkit-big",
    "apply": "/parents#home-support",
    "first-step-call": "https://cal.com/autismpathwaysconsulting/first-step-call",
}


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


class LinksPage(unittest.TestCase):
    def test_page_exists_with_no_price_or_em_dash(self):
        html = read("links.html")
        self.assertNotRegex(html, r"\bRM|S\$|USD|\N{EM DASH}")

    def test_cards_in_order_point_to_go_paths(self):
        html = read("links.html")
        cards = re.findall(r'<a class="card" href="([^"]+)">.*?<strong>(.*?)</strong>', html, re.S)
        self.assertEqual(cards, list(CARDS.items()))

    def test_only_real_social_links(self):
        html = read("links.html")
        self.assertNotRegex(html, r"tiktok|youtube")
        self.assertIn("https://www.instagram.com/autismpathwaysconsulting/", html)

    def test_redirects_go_to_the_right_place(self):
        for slug, dest in REDIRECTS.items():
            with self.subTest(slug=slug):
                html = read(f"go/{slug}.html")
                self.assertIn(f'content="2; url={dest}"', html)
                self.assertIn(f"var destination='{dest}'", html)

    def test_headers_and_build_list_cover_new_paths(self):
        headers, build = read("_headers"), read("scripts/build-site.mjs")
        for path in ("/links", "/go/guide", "/go/toolkit", "/go/apply"):
            self.assertRegex(headers, rf"(?m)^{path}\n  Cache-Control.*\n  X-Robots-Tag: noindex")
        for f in ("links.html", "go/guide.html", "go/toolkit.html", "go/apply.html"):
            self.assertIn(f'"{f}"', build)


if __name__ == "__main__":
    unittest.main()
