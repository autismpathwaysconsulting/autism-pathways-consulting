CREATE TABLE IF NOT EXISTS programme_interest (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL,
 phone TEXT NOT NULL DEFAULT '',
 programmes TEXT NOT NULL,
 first_choice TEXT NOT NULL,
 ages TEXT NOT NULL,
 location TEXT NOT NULL,
 saturday TEXT NOT NULL,
 accompanying_adult TEXT NOT NULL,
 support_discussion TEXT NOT NULL,
 updates INTEGER NOT NULL CHECK(updates IN (0,1)),
 consent_version TEXT NOT NULL,
 created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','verified','duplicate','closed')),
 next_followup TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS programme_interest_created ON programme_interest(created_at);
