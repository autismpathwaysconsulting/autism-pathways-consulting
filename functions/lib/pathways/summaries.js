import { sha256Hex } from './auth.js';
import { projectConsentStatus } from '../../api/pathways/consents.js';

export async function summarySourceHash(state) {
  const { reviewedSummaries, ...source } = state;
  return sha256Hex(JSON.stringify(source));
}
export async function familySharingAuthorized(db, studentId) {
  const row = await db.prepare(`SELECT c.status, c.granted_at, c.expires_at, o.timezone
    FROM pathways_consents c JOIN pathways_students s ON s.student_id = c.student_id
    JOIN pathways_organizations o ON o.organization_id = s.organization_id
    WHERE c.student_id = ? AND c.consent_type = 'family-sharing' ORDER BY c.rowid DESC LIMIT 1`)
    .bind(studentId).first();
  return Boolean(row && ['granted','not-required'].includes(projectConsentStatus(row, new Date(), row.timezone).status));
}
export async function reviewedSummary(state, date, audience) {
  const summary = state.reviewedSummaries?.[date]?.[audience];
  if (!summary || summary.sourceHash !== await summarySourceHash(state)) return null;
  return summary;
}
