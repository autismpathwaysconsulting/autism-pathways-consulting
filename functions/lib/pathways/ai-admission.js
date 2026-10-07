// Shared atomic rate limit and content-free disclosure audit for both AI routes.
export async function admitAiRequest(auth, access, studentId, model) {
  const now = new Date();
  // Admission and audit happen atomically. Concurrent calls cannot bypass the quota.
  const admitted = await auth.db.prepare(`INSERT INTO pathways_audit_log
    (organization_id,student_id,actor_user_id,action,entity_type,metadata_json,created_at)
    SELECT organization_id,student_id,?,'ai-disclosure-attempt','ai-assist',?,?
    FROM pathways_students WHERE student_id=? AND organization_id=? AND status='active'
    AND (SELECT COUNT(*) FROM pathways_audit_log WHERE actor_user_id=? AND action IN ('ai-disclosure-attempt','ai-rewrite-attempt') AND created_at>=?)<5
    AND (SELECT COUNT(*) FROM pathways_audit_log WHERE actor_user_id=? AND action IN ('ai-disclosure-attempt','ai-rewrite-attempt') AND created_at>=?)<50`)
    .bind(auth.user.id,JSON.stringify({model}),now.toISOString(),studentId,access.student.organization_id,
      auth.user.id,new Date(now-60000).toISOString(),auth.user.id,new Date(now-86400000).toISOString()).run();
  return Boolean(admitted.meta?.changes);
}
