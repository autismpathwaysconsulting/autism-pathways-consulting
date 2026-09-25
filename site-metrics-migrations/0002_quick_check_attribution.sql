CREATE TABLE IF NOT EXISTS quick_check_counts (
  day TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('page_view', 'form_open', 'form_submitted', 'download')),
  source TEXT NOT NULL CHECK (source IN ('instagram', 'facebook', 'google', 'email', 'whatsapp', 'direct', 'other')),
  medium TEXT NOT NULL CHECK (medium IN ('social', 'paid_social', 'organic_social', 'email', 'referral', 'direct', 'other')),
  campaign TEXT NOT NULL CHECK (campaign IN ('big_reactions', 'unspecified')),
  count INTEGER NOT NULL CHECK (count >= 0 AND count <= 1000000),
  PRIMARY KEY (day, event, source, medium, campaign)
) WITHOUT ROWID;
