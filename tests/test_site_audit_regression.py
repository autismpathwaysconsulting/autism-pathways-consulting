"""Check course, resource and private programme content stays aligned."""
import html
import json
from pathlib import Path
import re
import unittest
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


class SiteAuditRegression(unittest.TestCase):
    def test_quick_check_publication_copy(self):
        landing = read("big-reactions-quick-check.html")
        thanks = read("thank-you-big-reactions.html")
        self.assertIn("Download it and open it in a PDF reader to type, or print it and write by hand.", landing)
        self.assertIn("Page two of the Big Reactions Quick Check for choosing and reviewing one small next step", landing)
        self.assertNotIn("for comparing a second situation", landing)
        self.assertNotIn("Use it on your phone or computer", landing)
        self.assertRegex(landing, r"APC-Big-Reactions-Quick-Check-page-1\.webp\?v=[a-f0-9]{12}")
        self.assertRegex(landing, r"APC-Big-Reactions-Quick-Check-page-2\.webp\?v=[a-f0-9]{12}")
        self.assertIn("To type, download the PDF, open it in a PDF reader, then save a copy.", thanks)
        self.assertIn('href="/course-waitlist#course-contact">Explore the founding live session (optional)', thanks)
        self.assertIn("This is an interest test. Dates, duration, fee and final scope are not confirmed.", thanks)
        self.assertIn("Keep your notes private unless you choose to share them.", thanks)
        self.assertNotIn("Browse more APC parent resources", thanks)
        self.assertIn('<body class="apc-quick-check-page">', thanks)
        self.assertIn('.quick-thanks .button{max-width:100%;text-align:center}', thanks)
        self.assertIn('.quick-thanks .quick-wrap{max-width:680px}', thanks)

    def test_current_course_copy_and_metadata(self):
        for page in ("connect/index.html", "course-waitlist.html", "services.html"):
            with self.subTest(page=page):
                source = read(page)
                self.assertIn("Understanding Escalation at Home", source)
                self.assertRegex(source, r"(?i)in development")
                self.assertNotRegex(source, r"(?i)Hanen-backed|RM\s*(147|197)\b|Communication Course|How to Connect with Your Child|early.bird|special price")
        interest = read("course-waitlist.html")
        self.assertNotRegex(interest, r"(?i)<iframe|sibforms\.com")
        self.assertIn("mailto:cjlim@autismpathwaysconsulting.com?subject=Understanding", interest)
        self.assertIn("does not reserve a place or subscribe you to marketing emails", interest)
        self.assertNotIn("sibforms.com", read("connect/index.html"))

    def test_resource_entries_lead_to_guides(self):
        main = read("resources.html").split("<main", 1)[1].split("</main>", 1)[0]
        self.assertNotIn('href="/services"', main)
        for route in ("/task-initiation", "/communication"):
            self.assertIn(f'href="{route}"', main)

    def test_private_programme_names_and_verification(self):
        source = read("content-os/programmes/resources.html")
        names = json.loads(read("scripts/site-labels.json"))["programmes"]
        for key, name in names.items():
            self.assertIn(f'<span data-programme-name="{key}">{html.escape(name, quote=False)}</span>', source)
        self.assertNotRegex(source, r"remains disabled in this draft|Community Adventure Camp")
        self.assertIn("genuine submission", source)

    def test_cross_page_fragment_destinations(self):
        for page in ("services.html", "start.html", "resources.html", "connect/index.html", "course-waitlist.html"):
            for href in re.findall(r'href="(/[^\"]*#[^\"]+)"', read(page)):
                with self.subTest(page=page, href=href):
                    url = urlsplit(href)
                    path = url.path.lstrip("/")
                    target = next((p for p in (path + ".html", path + "/index.html") if (ROOT / p).exists()), None)
                    self.assertIsNotNone(target)
                    self.assertIn(f'id="{unquote(url.fragment)}"', read(target))


if __name__ == "__main__":
    unittest.main()
