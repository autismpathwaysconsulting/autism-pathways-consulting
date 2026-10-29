"""The repositioned journeys keep free routes first, without adding signup or payment routes."""
from pathlib import Path
import unittest
R=Path(__file__).resolve().parents[1]
PAY='CJ confirms fit and availability first, then sends payment details privately. Malaysia: bank transfer or DuitNow QR. Singapore and other countries: Wise.'
class DemandValidationTests(unittest.TestCase):
 def test_home_primary_route_and_ways_to_work(self):
  s=(R/'index.html').read_text();hero=s.split('id="home"')[1].split('</section>')[0]
  self.assertIn('href="/big-reactions-quick-check">Get the free Quick Check',hero)
  self.assertIn('href="/schools">For centres and schools',hero)
  self.assertNotIn('Book Free 15-Min',hero)
  self.assertNotIn('hero-approach',hero)
  self.assertNotIn('data-cal-inline',s)
  self.assertEqual(s.count('<section '),10)
  ways=s.split('id="support-options"')[1].split('</section>')[0]
  for text in ['Free Quick Check','Pattern Session','RM57','Home Support Programme','RM1,797','Staff training','From RM1,497']:self.assertIn(text,ways)
  for text in ['RM350','RM1,800','One-Concern','founding live session']:self.assertNotIn(text,s)
 def test_parent_route_order_and_offer_details(self):
  s=(R/'parents.html').read_text();ids=[s.index('id="'+i+'"') for i in ['quick-check','home-support','pattern-finder','pattern-session','first-step-call']]
  self.assertEqual(ids,sorted(ids))
  for text in ['RM37 on Etsy','RM57 · Live online group','Coming soon. Dates go to Quick Check email subscribers first.','RM1,797 · S$997 · USD 697','Four 60-minute online sessions over about 10 weeks','Book a free First Step Call',PAY]:self.assertIn(text,s)
  for text in ['<form','parent-strategy-session','/pay/350','One-Concern','RM350','Founding Live Session','/connect']:self.assertNotIn(text,s)
 def test_retired_routes_redirect_without_forms(self):
  for page,target in [('start.html','/'),('programmes.html','/'),('services.html','/parents'),('course-waitlist.html','/parents#pattern-session'),('connect/index.html','/parents')]:
   s=(R/page).read_text()
   self.assertIn('http-equiv="refresh" content="0; url='+target+'"',s)
   for text in ['<form','<iframe','checkout','sibforms.com']:self.assertNotIn(text,s)
  redirects=(R/'_redirects').read_text()
  for rule in ['/programmes /           301','/start      /           301','/services   /parents    301']:self.assertIn(rule,redirects)
  self.assertLess(redirects.index('/services'),redirects.index('/*'))
 def test_indexable_resource_and_private_fulfilment(self):
  import xml.etree.ElementTree as ET
  landing=(R/'big-reactions-quick-check.html').read_text()
  self.assertIn('content="index,follow"',landing)
  self.assertIn('noindex,nofollow',(R/'thank-you-big-reactions.html').read_text())
  urls=[x.text for x in ET.parse(R/'sitemap.xml').iter() if x.tag.endswith('}loc')]
  self.assertIn('https://autismpathwaysconsulting.com/big-reactions-quick-check',urls)
  self.assertIn('https://autismpathwaysconsulting.com/teacher-talk',urls)
  for retired in ['services','start','programmes','course-waitlist','connect','thank-you-big-reactions']:
   self.assertNotIn('https://autismpathwaysconsulting.com/'+retired,urls)
