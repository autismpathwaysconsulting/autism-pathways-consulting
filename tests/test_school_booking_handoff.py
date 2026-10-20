"""Booking-copy regressions use the repository's Python authority-test convention."""
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]

class SchoolBookingHandoffTests(unittest.TestCase):
    def test_static_page_does_not_confirm_an_appointment(self):
        call = (ROOT / 'booking-confirmed-call.html').read_text()
        self.assertIn('Opening this page alone does not confirm a booking', call)
        self.assertNotIn('<h1>Your First Step Call is confirmed', call)

    def test_school_explains_fit_payment_and_written_confirmation(self):
        school = (ROOT / 'schools.html').read_text()
        self.assertIn('CJ confirms fit and availability first, then sends payment details privately. Malaysia: bank transfer or DuitNow QR. Singapore and other countries: Wise.', school)
        self.assertIn('CJ confirms your training date in writing.', school)
        for price in ['RM2,497 · S$997 · USD 697', 'RM4,497 · S$1,797 · USD 1,297', 'RM1,497 · S$597 · USD 397', 'From RM797 per educator']:
            self.assertIn(price, school)
        self.assertNotIn('About the training scope', school)
