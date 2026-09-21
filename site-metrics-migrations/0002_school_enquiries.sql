-- Expand action names while preserving existing daily totals. D1 applies migrations transactionally.
CREATE TABLE daily_counts_expanded (
  day TEXT NOT NULL,
  page TEXT NOT NULL CHECK (page IN ('home', 'services', 'start', 'about', 'resources')),
  event TEXT NOT NULL CHECK (event IN ('page_view', 'booking_click', 'calendar_open', 'booking_submitted', 'school_enquiry_prepared', 'school_whatsapp_click')),
  count INTEGER NOT NULL CHECK (count >= 0 AND count <= 1000000),
  PRIMARY KEY (day, page, event)
) WITHOUT ROWID;
INSERT INTO daily_counts_expanded SELECT day, page, event, count FROM daily_counts;
DROP TABLE daily_counts;
ALTER TABLE daily_counts_expanded RENAME TO daily_counts;
