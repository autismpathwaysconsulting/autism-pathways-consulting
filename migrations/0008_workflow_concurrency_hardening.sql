CREATE UNIQUE INDEX IF NOT EXISTS idx_calm_feedback_triage_events_revision
ON calm_feedback_triage_events (feedback_id, revision);

CREATE TRIGGER IF NOT EXISTS trg_calm_feedback_triage_event_payload_matches_current
BEFORE INSERT ON calm_feedback_triage_events
WHEN NOT EXISTS (
  SELECT 1
  FROM calm_feedback_triage
  WHERE feedback_id = NEW.feedback_id
    AND revision = NEW.revision
    AND status = NEW.status
    AND decision_note = NEW.decision_note
    AND updated_at = NEW.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'calm feedback triage revision conflict');
END;
