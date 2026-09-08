INSERT INTO clients
  (client_id, preferred_name, service_name, stage_number, portal_status, created_at, updated_at)
VALUES
  ('DEMO-CLIENT-001', 'Sam', 'Home Support Programme', 2, 'active', '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z');

INSERT INTO accounts (account_id, client_id, account_status, created_at)
VALUES ('ACCOUNT-DEMO-0001', 'DEMO-CLIENT-001', 'active', '2026-09-07T00:00:00.000Z');

INSERT INTO access_grants (grant_id, client_id, account_id, status, scopes_json, issued_at)
VALUES (
  'GRANT-DEMO-0001',
  'DEMO-CLIENT-001',
  'ACCOUNT-DEMO-0001',
  'active',
  '["view-published-pathway","view-resources","submit-journal","request-booking","export-own-records"]',
  '2026-09-07T00:00:00.000Z'
);

INSERT INTO journals
  (journal_id, client_id, account_id, entry_date, entry_time, title, entry_text, created_at)
VALUES (
  'JOURNAL-DEMO-0001',
  'DEMO-CLIENT-001',
  'ACCOUNT-DEMO-0001',
  '2026-09-06',
  NULL,
  'After school',
  'The visual helped us move to snack with fewer reminders.',
  '2026-09-06T10:00:00.000Z'
);

INSERT INTO audit_events
  (audit_id, occurred_at, actor_type, actor_id, client_id, event_type, object_type, object_id, metadata_json)
VALUES (
  'AUDIT-DEMO-SEED-0001',
  '2026-09-07T00:00:00.000Z',
  'system',
  'PATHWAY-PREVIEW-MIGRATION',
  'DEMO-CLIENT-001',
  'synthetic_fixture.created',
  'client',
  'DEMO-CLIENT-001',
  '{"synthetic":true}'
);
