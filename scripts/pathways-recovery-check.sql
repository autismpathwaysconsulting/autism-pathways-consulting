-- Read-only comparison. No credentials, narratives, email addresses or session tokens.
-- Run against the source snapshot and isolated restored target; retain outputs privately.
PRAGMA integrity_check;
PRAGMA foreign_key_check;
SELECT 'users' AS item, COUNT(*) AS total FROM pathways_users
UNION ALL SELECT 'organizations', COUNT(*) FROM pathways_organizations
UNION ALL SELECT 'students', COUNT(*) FROM pathways_students
UNION ALL SELECT 'states', COUNT(*) FROM pathways_student_state
UNION ALL SELECT 'revisions', COUNT(*) FROM pathways_state_revisions
UNION ALL SELECT 'audit', COUNT(*) FROM pathways_audit_log
UNION ALL SELECT 'consents', COUNT(*) FROM pathways_consents
UNION ALL SELECT 'assignments', COUNT(*) FROM pathways_student_assignments
UNION ALL SELECT 'erasures', COUNT(*) FROM pathways_erasure_log;
SELECT student_id, revision, state_hash FROM pathways_student_state ORDER BY student_id;
SELECT student_id, revision, state_hash FROM pathways_state_revisions ORDER BY student_id, revision;
SELECT COUNT(*) AS missing_or_mismatched_current_revision
FROM pathways_student_state s LEFT JOIN pathways_state_revisions r
ON r.student_id = s.student_id AND r.revision = s.revision
WHERE r.revision_id IS NULL OR r.state_hash != s.state_hash OR r.state_json != s.state_json;
SELECT COUNT(*) AS lingering_erasure_guards FROM pathways_erasure_guard;
