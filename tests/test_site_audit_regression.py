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
    def test_home_and_about_experience_claims(self):
        home = read("index.html")
        about = read("about.html")
        self.assertEqual(home.count("Supporting autistic children and families since 2016"), 1)
        self.assertIn("More than 30 families supported", home)
        self.assertIn("Delivers Hanen's Teacher Talk for educators", home)
        self.assertIn("I have worked alongside autistic children and families since 2016, beginning as an intern.", about)
        self.assertIn("Since 2016, beginning as an intern", about)
        self.assertIn("Today I work with parents, centres and schools in Malaysia, Singapore and internationally.", about)
        for page in (home, about):
            self.assertNotRegex(page, r"(?i)over\s+(?:10|ten)\s+years|10\+\s+years")
        self.assertIn("Meet CJ Lim, autism educator and founder of APC.", about)
        self.assertIn("part-time lecturer with CAE Malaysia", about)
        self.assertNotRegex(about, r"SPARK|Hanen-informed parent guidance")

    def test_blog_closing_prioritises_pattern_session(self):
        closing = read("blog.html").split('id="apply-an-idea"', 1)[1].split("</section>", 1)[0]
        self.assertIn("Pattern Session, a live online group with CJ: coming soon. Dates go to Quick Check email subscribers first. Continue with free parent resources, or if you need help choosing individual support, the free First Step Call remains available.", closing)
        self.assertNotIn("Explore the Pattern Session", closing)
        self.assertIn('<a class="audience-primary" href="/go/first-step-call">Book a free First Step Call</a>', closing)
        self.assertEqual(closing.count('class="audience-primary"'), 1)
        self.assertIn("The call is a fit check, not a consultation or assessment.", closing)
        self.assertIn('id="pattern-session"', read("parents.html"))

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
        self.assertNotIn("See the Pattern Session (optional)", thanks)
        self.assertIn("Pattern Session: coming soon. Dates go to Quick Check email subscribers first.", thanks)
        self.assertNotRegex(thanks, r"(?i)interest test|founding live session")
        self.assertIn("Keep your notes private unless you choose to share them.", thanks)
        self.assertNotIn("Browse more APC parent resources", thanks)
        self.assertIn('<body class="apc-v2 apc-tier-b apc-quick-check-page">', thanks)
        self.assertIn('.quick-thanks .button{max-width:100%;text-align:center}', thanks)
        self.assertIn('.quick-thanks .quick-wrap{max-width:680px}', thanks)

    def test_retired_course_pages_redirect(self):
        for page, target in (("connect/index.html", "/parents"), ("course-waitlist.html", "/parents#pattern-session"), ("services.html", "/parents")):
            with self.subTest(page=page):
                source = read(page)
                self.assertIn(f'<meta http-equiv="refresh" content="0; url={target}">', source)
                self.assertIn('<meta name="robots" content="noindex">', source)
                self.assertNotRegex(source, r"(?i)in development|proposed|interest test|<form|<iframe|sibforms\.com")
        self.assertIn('location.hash === "#educator-training" ? "/teacher-talk"', read("services.html"))

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
        for page in ("index.html", "parents.html", "schools.html", "teacher-talk.html", "resources.html", "connect/index.html", "course-waitlist.html"):
            for href in re.findall(r'href="(/[^\"]*#[^\"]+)"', read(page)):
                with self.subTest(page=page, href=href):
                    url = urlsplit(href)
                    path = url.path.lstrip("/") or "index"
                    target = next((p for p in (path + ".html", path + "/index.html") if (ROOT / p).exists()), None)
                    self.assertIsNotNone(target)
                    self.assertIn(f'id="{unquote(url.fragment)}"', read(target))


if __name__ == "__main__":
    unittest.main()
