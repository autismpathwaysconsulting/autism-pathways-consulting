import { authenticate, getStudentAccess, json, sha256Hex } from '../../lib/pathways/auth.js';
import { readStudentState } from '../../lib/pathways/state.js';
import { assertValidPathwaysState } from '../../../pathways/schema.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parseIntegerParam(value, { min, max = Number.MAX_SAFE_INTEGER, fallback = null } = {}) {
  if (value === null || value === '') return fallback;
  if (!/^-?\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

async function readHistoryPage(db, studentId, afterRevision, snapshotRevision, pageSize) {
  const result = await db.prepare(`SELECT revision, schema_version, state_json, state_hash, action,
      request_id, actor_user_id, created_at
    FROM pathways_state_revisions
    WHERE student_id = ? AND revision > ? AND revision <= ?
    ORDER BY revision ASC
    LIMIT ?`)
    .bind(studentId, afterRevision, snapshotRevision, pageSize + 1)
    .all();
  const rows = result?.results || [];
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const history = [];
  for (const row of pageRows) {
    const state = JSON.parse(row.state_json);
    assertValidPathwaysState(state);
    const computedHash = await sha256Hex(JSON.stringify(state));
    if (computedHash !== row.state_hash) throw new Error('Stored Pathways revision hash is invalid.');
    history.push({
      revision: row.revision,
      schemaVersion: row.schema_version,
      action: row.action,
      requestId: row.request_id,
      actorUserId: row.actor_user_id,
      createdAt: row.created_at,
      stateHash: row.state_hash,
      state,
    });
  }
  const nextAfterRevision = history.length ? history.at(-1).revision : afterRevision;
  return { history, hasMore, nextAfterRevision };
}

function exportResponse(body, studentId) {
  const filename = `pathways-${studentId}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId') || '';
  const includeHistory = url.searchParams.get('history') === '1';
  const access = await getStudentAccess(auth, studentId, { write: false, includeArchived: true });
  if (!access.ok) return json({ error: access.error }, access.status);
  if (!auth.user.platformAdmin && !['admin','senco'].includes(access.role)) {
    return json({ error: 'Only an administrator or SENCO can export a complete student record.' }, 403);
  }

  const afterRevision = includeHistory
    ? parseIntegerParam(url.searchParams.get('afterRevision'), { min: -1, fallback: -1 })
    : -1;
  const pageSize = includeHistory
    ? parseIntegerParam(url.searchParams.get('pageSize'), { min: 1, max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE })
    : DEFAULT_PAGE_SIZE;
  const requestedSnapshot = includeHistory && url.searchParams.has('snapshotRevision')
    ? parseIntegerParam(url.searchParams.get('snapshotRevision'), { min: 0 })
    : null;
  if (includeHistory && (afterRevision === null || pageSize === null || (url.searchParams.has('snapshotRevision') && requestedSnapshot === null))) {
    return json({ error: 'History export pagination values are invalid.' }, 400);
  }

  try {
    if (!includeHistory) {
      const [record, consentResult] = await Promise.all([
        readStudentState(auth.db, studentId),
        auth.db.prepare(`SELECT consent_type, status, authority_label, reference_note, granted_at, expires_at,
            created_at, updated_at
          FROM pathways_consents WHERE student_id = ? ORDER BY rowid ASC`)
          .bind(studentId)
          .all(),
      ]);
      if (!record) return json({ error: 'Student state was not found.' }, 404);
      return exportResponse({
        exportVersion: '1.0',
        generatedAt: new Date().toISOString(),
        student: {
          id: access.student.student_id,
          organizationId: access.student.organization_id,
          displayName: access.student.display_name,
          externalRef: access.student.external_ref,
          yearGroup: access.student.year_group,
          status: access.student.status,
          createdAt: access.student.created_at,
          updatedAt: access.student.updated_at,
        },
        consents: consentResult?.results || [],
        current: record,
      }, studentId);
    }

    const before = await readStudentState(auth.db, studentId);
    if (!before) return json({ error: 'Student state was not found.' }, 404);
    const snapshotRevision = requestedSnapshot ?? before.revision;
    if (before.revision !== snapshotRevision) {
      return json({
        error: 'The student record changed during export. Restart the history export from the beginning.',
        exportRetryRequired: true,
      }, 409);
    }
    if (afterRevision >= snapshotRevision && afterRevision !== -1) {
      return json({ error: 'History export cursor is outside the selected snapshot.' }, 400);
    }

    const [consentResult, page] = await Promise.all([
      auth.db.prepare(`SELECT consent_type, status, authority_label, reference_note, granted_at, expires_at,
          created_at, updated_at
        FROM pathways_consents WHERE student_id = ? ORDER BY rowid ASC`)
        .bind(studentId)
        .all(),
      readHistoryPage(auth.db, studentId, afterRevision, snapshotRevision, pageSize),
    ]);

    const after = await readStudentState(auth.db, studentId);
    if (!after || after.revision !== snapshotRevision || after.stateHash !== before.stateHash) {
      return json({
        error: 'The student record changed during export. Restart the history export from the beginning.',
        exportRetryRequired: true,
      }, 409);
    }

    const historyComplete = !page.hasMore;
    return exportResponse({
      exportVersion: '1.1',
      generatedAt: new Date().toISOString(),
      student: {
        id: access.student.student_id,
        organizationId: access.student.organization_id,
        displayName: access.student.display_name,
        externalRef: access.student.external_ref,
        yearGroup: access.student.year_group,
        status: access.student.status,
        createdAt: access.student.created_at,
        updatedAt: access.student.updated_at,
      },
      consents: consentResult?.results || [],
      current: before,
      history: page.history,
      snapshotRevision,
      afterRevision,
      pageSize,
      historyComplete,
      nextAfterRevision: historyComplete ? null : page.nextAfterRevision,
    }, studentId);
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways export failed', errorType: String(error?.name || 'Error'), studentId }));
    return json({ error: 'Student export is temporarily unavailable.' }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  return onRequestGet(context);
}
