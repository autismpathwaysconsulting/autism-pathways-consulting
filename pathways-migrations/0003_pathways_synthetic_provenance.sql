-- Immutable provenance for the system-created synthetic Pathways demo workspace.
-- User-editable school references must never grant authority exemptions.

ALTER TABLE pathways_students
  ADD COLUMN is_synthetic_demo INTEGER NOT NULL DEFAULT 0
  CHECK (is_synthetic_demo IN (0,1));

CREATE TRIGGER IF NOT EXISTS pathways_students_demo_provenance_no_update
BEFORE UPDATE OF is_synthetic_demo ON pathways_students
WHEN NEW.is_synthetic_demo != OLD.is_synthetic_demo
BEGIN
  SELECT RAISE(ABORT, 'Pathways synthetic-demo provenance is immutable');
END;
