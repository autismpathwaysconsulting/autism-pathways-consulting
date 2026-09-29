"""The demand test changes priority, without adding signup or payment routes."""
from pathlib import Path
import unittest
R=Path(__file__).resolve().parents[1]
class DemandValidationTests(unittest.TestCase):
 def test_home_primary_route_and_existing_booking_integration(self):
  s=(R/'index.html').read_text();hero=s.split('id="home"')[1].split('</section>')[0]
  self.assertIn('href="/big-reactions-quick-check">Get the free Quick Check',hero)
  self.assertNotIn('Book Free 15-Min',hero)
  self.assertIn('data-cal-inline',s)
  self.assertEqual(s.count('<section '),9)
 def test_parent_route_order_and_existing_offer_details(self):
  s=(R/'parents.html').read_text();ids=[s.index('id="'+i+'"') for i in ['quick-check','workshops','digital-learning','limited-enquiry']]
  self.assertEqual(ids,sorted(ids))
  for text in ['Founding Live Session','Which situation is hardest right now?','No payment is being accepted','id="one-concern"','id="home-support"','id="support-booking"']:self.assertIn(text,s)
  for text in ['<form','parent-strategy-session','/pay/350']:self.assertNotIn(text,s)
 def test_enquiry_is_editable_and_not_a_signup(self):
  s=(R/'course-waitlist.html').read_text()
  for text in ['Founding Live Session','Which situation is hardest right now?','does not reserve a place or subscribe you to marketing emails','Dates, duration, fee and final scope are not confirmed']:self.assertIn(text,s)
  for text in ['<form','<iframe','checkout','sibforms.com']:self.assertNotIn(text,s)

 def test_digital_interest_does_not_route_to_live_session(self):
  from urllib.parse import unquote
  s=(R/'connect/index.html').read_text()
  self.assertNotIn('href="/course-waitlist"',s)
  self.assertIn('self-paced course enquiry',unquote(s))
  self.assertIn('Which situation is hardest right now?',unquote(s))

 def test_start_offers_learning_before_optional_individual_support(self):
  s=(R/'start.html').read_text()
  routes=s.split('class="audit-start-routes"')[1].split('</nav>')[0]
  for route in ['/big-reactions-quick-check','/parents#workshops','/services#educator-training']:self.assertIn('href="'+route+'"',routes)
  self.assertLess(s.index('class="audit-start-routes"'),s.index('class="audit-individual"'))
  self.assertEqual(s.count('<h1>'),1)
  for offer in ['RM350','RM1,800','first-step-call']:self.assertIn(offer,s)

 def test_learning_directory_does_not_confuse_delivery_formats(self):
  s=(R/'services.html').read_text()
  digital=s.split('id="self-paced"')[1].split('</article>')[0]
  live=s.split('id="parent-workshops"')[1].split('</article>')[0]
  self.assertIn('href="/connect"',digital)
  self.assertNotIn('/course-waitlist',digital)
  self.assertIn('href="/parents#workshops"',live)

 def test_indexable_resource_and_private_fulfilment(self):
  import xml.etree.ElementTree as ET
  landing=(R/'big-reactions-quick-check.html').read_text()
  self.assertIn('content="index,follow"',landing)
  self.assertIn('noindex,nofollow',(R/'thank-you-big-reactions.html').read_text())
  urls=[x.text for x in ET.parse(R/'sitemap.xml').iter() if x.tag.endswith('}loc')]
  self.assertIn('https://autismpathwaysconsulting.com/big-reactions-quick-check',urls)
  self.assertNotIn('https://autismpathwaysconsulting.com/thank-you-big-reactions',urls)
