"""Booking-copy regressions use the repository's Python authority-test convention."""
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]

class SchoolBookingHandoffTests(unittest.TestCase):
    def test_static_page_does_not_confirm_an_appointment(self):
        call = (ROOT / 'booking-confirmed-call.html').read_text()
        self.assertIn('Opening this page alone does not confirm a booking', call)
        self.assertNotIn('<h1>Your First Step Call is confirmed', call)

    def test_school_explains_permission_payment_and_manual_confirmation(self):
        school = (ROOT / 'schools.html').read_text()
        self.assertIn('CJ verifies payment and confirms the booking manually', school)
        self.assertIn('written approval, payment instructions and cancellation terms before paying', school)
