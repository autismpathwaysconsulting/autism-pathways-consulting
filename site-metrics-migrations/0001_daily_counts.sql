CREATE TABLE IF NOT EXISTS daily_counts (
  day TEXT NOT NULL,
  page TEXT NOT NULL CHECK (page IN ('home', 'services', 'start', 'about', 'resources')),
  event TEXT NOT NULL CHECK (event IN ('page_view', 'booking_click', 'calendar_open', 'booking_submitted')),
  count INTEGER NOT NULL CHECK (count >= 0 AND count <= 1000000),
  PRIMARY KEY (day, page, event)
) WITHOUT ROWID;
