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
