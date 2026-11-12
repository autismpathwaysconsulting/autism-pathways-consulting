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
        # No prices on the site; schools ask for a quote (CJ, 11 Nov 2026)
        self.assertNotIn('class="school-price"', school)
        self.assertNotIn('About the training scope', school)
