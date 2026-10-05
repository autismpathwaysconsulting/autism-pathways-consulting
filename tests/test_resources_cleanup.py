"""Guard the Resources cleanup and the narrowly scoped Teacher Talk visual fixes."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.destinations=set()
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='a' and attrs.get('href'):
            self.destinations.add(attrs['href'])

class ResourcesCleanup(unittest.TestCase):
    def test_all_existing_destinations_remain(self):
        source=(ROOT/'resources.html').read_text()
        links=Links();links.feed(source)
        original=set(json.loads((ROOT/'tests/fixtures/resources-destinations.json').read_text()))
        self.assertEqual(links.destinations,original)
        for href in links.destinations:
            if not href.startswith('/') or href=='/': continue
            route=href.split('#')[0].lstrip('/')
            target=next((p for p in [ROOT/(route+'.html'),ROOT/route/'index.html'] if p.is_file()),None)
            self.assertIsNotNone(target,href)
            if '#' in href:self.assertIn('id="'+href.split('#')[1]+'"',target.read_text())

    def test_directory_hierarchy_and_primary_actions(self):
        source=(ROOT/'resources.html').read_text().split('<main',1)[1].split('</main>',1)[0]
        self.assertEqual(source.count('<h1>'),1)
        self.assertEqual(source.count('<details>'),5)
        self.assertEqual(source.count('class="resource-button"'),2)
        self.assertEqual(source.count('<article>'),3)
        self.assertNotIn('apc-card-photo',source)
        self.assertNotIn('guide-mornings-480.webp',source)
        self.assertNotRegex(source,r'href="[^"]*(?:/pay|parent-strategy-session)')
        self.assertIn('A diagnosis is not required',source)
        self.assertIn('The call is a fit check, not consultation, advice, assessment, diagnosis, or therapy.',source)
        self.assertIn('APC works with you, not instead of the therapists your child is already seeing.',source)

    def test_service_offer_remains_interest_only(self):
        source=(ROOT/'services.html').read_text()
        teacher=source.split('id="educator-training"',1)[1].split('</section>',1)[0]
        for text in ['Proposed fee: RM990 per participant.','in English.','7.5 hours across three 2.5-hour sessions. Dates to be announced.','Interest stage only. No payment is being accepted.','This does not qualify participants as Hanen-certified providers.']:
            self.assertIn(text,teacher)
        self.assertIn('https://www.hanen.org/programs/teacher-talk',teacher)
        self.assertNotRegex(teacher,r'href="[^"]*(?:/pay|checkout)')
        self.assertNotRegex(source,r'<span aria-hidden="true">[→↗]</span>')
        self.assertIn('class="service-action-icon"',teacher)

    def test_built_pages_and_legal_disclosures(self):
        for page in ['resources.html','services.html']:
            source=(ROOT/page).read_text()
            self.assertEqual(source,(ROOT/'dist'/page).read_text())
            self.assertNotIn('\u2014',source)
            self.assertIn('CJ Special and Inclusive Consultancy (003030209-T) · Reg. 201903282307',source)
            for route in ['/privacy','/terms','/cancellation-policy','/disclaimer']:
                self.assertIn('href="'+route+'"',source)
        for file in ['APC-Big-Reactions-Quick-Check.pdf','The_Complete_Malaysian_Parent_Guide_by_CJ_Lim_APC.pdf']:
            self.assertEqual((ROOT/file).read_bytes(),(ROOT/'dist'/file).read_bytes())

if __name__=='__main__':unittest.main()
