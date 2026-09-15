const required = ['PATHWAYS_BASE_URL','PATHWAYS_FOUNDER_EMAIL','PATHWAYS_FOUNDER_PASSWORD'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const base = new URL(process.env.PATHWAYS_BASE_URL);
if (base.protocol !== 'https:' || !base.hostname.endsWith('.pages.dev')) {
  throw new Error('PATHWAYS_BASE_URL must be a Cloudflare Pages preview hostname. Production/custom domains are refused.');
}
base.pathname = '/';
base.search = '';
base.hash = '';

const founderEmail = process.env.PATHWAYS_FOUNDER_EMAIL;
let activePassword = process.env.PATHWAYS_FOUNDER_PASSWORD;
const rotatedPassword = process.env.PATHWAYS_ROTATED_PASSWORD || '';
let cookie = '';
let csrfToken = '';

function endpoint(path) {
  return new URL(path, base).toString();
}

function acceptSessionCookie(response) {
  const header = response.headers.get('set-cookie') || '';
  const match = /(?:^|,\s*)(__Host-pathways_session=[^;]*)/i.exec(header);
  if (!match) return;
  if (/Max-Age=0/i.test(header)) cookie = '';
  else cookie = match[1];
}

async function request(path, { method = 'GET', body, bootstrapSecret, allow = [200] } = {}) {
  const headers = { Accept: 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') {
    headers.Origin = base.origin;
    headers['X-Pathways-Request'] = '1';
    if (csrfToken) headers['X-Pathways-CSRF'] = csrfToken;
  }
  if (bootstrapSecret) {
    headers.Authorization = `Basic ${Buffer.from(`apc:${bootstrapSecret}`).toString('base64')}`;
  }
  const response = await fetch(endpoint(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  acceptSessionCookie(response);
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json().catch(() => ({})) : {};
  if (!allow.includes(response.status)) {
    const error = new Error(data.error || `Request failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return { response, data };
}

async function login(password = activePassword, expected = [200]) {
  const result = await request('/api/pathways/login', {
    method: 'POST',
    body: { email: founderEmail, password },
    allow: expected,
  });
  if (result.response.status === 200) {
    csrfToken = result.data.csrfToken || '';
    if (!cookie || !csrfToken) throw new Error('Login did not establish a session and CSRF token.');
  }
  return result;
}

async function maybeBootstrap() {
  const secret = process.env.PATHWAYS_BOOTSTRAP_SECRET;
  if (!secret) return;
  const result = await request('/api/pathways/bootstrap', {
    method: 'POST',
    bootstrapSecret: secret,
    body: {
      email: founderEmail,
      password: activePassword,
      displayName: process.env.PATHWAYS_FOUNDER_NAME || 'APC Preview Founder',
      organizationName: process.env.PATHWAYS_ORGANIZATION_NAME || 'APC Synthetic Preview',
      organizationSlug: process.env.PATHWAYS_ORGANIZATION_SLUG || 'apc-synthetic-preview',
      timezone: process.env.PATHWAYS_TIMEZONE || 'Asia/Kuala_Lumpur',
      seedDemo: true,
    },
    allow: [201, 409],
  });
  if (result.response.status === 409 && result.data.error !== 'Pathways has already been bootstrapped.') {
    throw new Error('Bootstrap returned an unexpected conflict.');
  }
}

async function findSyntheticStudent(organizations) {
  for (const org of organizations) {
    const result = await request(`/api/pathways/students?organizationId=${encodeURIComponent(org.organization_id)}`);
    const found = (result.data.students || []).find(student => student.is_synthetic_demo === 1);
    if (found) return found;
  }
  throw new Error('Immutable synthetic Student A workspace was not found.');
}

function smokePin() {
  return {
    id: `smoke-${Date.now()}`,
    type: 'Reminder',
    subject: 'Synthetic QA',
    title: 'Temporary preview smoke check',
    details: 'Synthetic-only reversible validation marker.',
    due: '',
    parent: false,
    status: 'Open',
  };
}

async function exportCompleteHistory(studentId, expectedRevision) {
  const history = [];
  let afterRevision = -1;
  let snapshotRevision = null;
  let first = null;
  for (let pages = 0; pages < 10000; pages += 1) {
    const params = new URLSearchParams({
      studentId,
      history: '1',
      afterRevision: String(afterRevision),
      pageSize: '50',
    });
    if (snapshotRevision !== null) params.set('snapshotRevision', String(snapshotRevision));
    const { data } = await request(`/api/pathways/export?${params.toString()}`);
    if (!first) {
      first = data;
      snapshotRevision = data.snapshotRevision;
      if (snapshotRevision !== expectedRevision || data.current?.revision !== expectedRevision) {
        throw new Error('History export snapshot does not match the current saved revision.');
      }
    } else if (data.snapshotRevision !== snapshotRevision) {
      throw new Error('History export changed snapshots between pages.');
    }
    history.push(...(data.history || []));
    if (data.historyComplete) return { first, history, snapshotRevision };
    if (!Number.isSafeInteger(data.nextAfterRevision) || data.nextAfterRevision <= afterRevision) {
      throw new Error('History export pagination failed to advance.');
    }
    afterRevision = data.nextAfterRevision;
  }
  throw new Error('History export exceeded the smoke runner page limit.');
}

async function main() {
  await maybeBootstrap();
  await login();

  const me = (await request('/api/pathways/me')).data;
  if (!me.user?.id) throw new Error('Authenticated principal was not returned.');
  const orgs = (await request('/api/pathways/organizations')).data.organizations || [];
  if (!orgs.length) throw new Error('No Pathways organisation is available.');
  const student = await findSyntheticStudent(orgs);

  const stateResult = (await request(`/api/pathways/state?studentId=${encodeURIComponent(student.student_id)}&history=1&limit=20`)).data;
  const original = structuredClone(stateResult.record?.state);
  const originalRevision = stateResult.record?.revision;
  if (!original || !Number.isSafeInteger(originalRevision)) throw new Error('Synthetic student state was not readable.');

  const edited = structuredClone(original);
  edited.pins = [...edited.pins, smokePin()];
  let editedRevision = null;
  let restored = false;

  try {
    const save = (await request('/api/pathways/state', {
      method: 'PUT',
      body: {
        studentId: student.student_id,
        state: edited,
        expectedRevision: originalRevision,
        action: 'edit',
        requestId: `smoke-edit:${crypto.randomUUID()}`,
      },
    })).data;
    editedRevision = save.record?.revision;
    if (editedRevision !== originalRevision + 1) throw new Error('Synthetic smoke edit did not advance the revision exactly once.');

    const historyCheck = (await request(`/api/pathways/state?studentId=${encodeURIComponent(student.student_id)}&history=1&limit=20`)).data;
    if (!(historyCheck.revisions || []).some(item => item.revision === editedRevision)) {
      throw new Error('Saved synthetic revision was not visible in history.');
    }

    const exported = await exportCompleteHistory(student.student_id, editedRevision);
    if (!exported.first.historyComplete && !exported.history.length) throw new Error('History export did not return revision data.');
    if (!exported.history.some(item => item.revision === editedRevision)) throw new Error('Complete history export omitted the smoke revision.');

    const restore = (await request('/api/pathways/state', {
      method: 'PUT',
      body: {
        studentId: student.student_id,
        state: original,
        expectedRevision: editedRevision,
        action: 'edit',
        requestId: `smoke-restore:${crypto.randomUUID()}`,
      },
    })).data;
    if (restore.record?.revision !== editedRevision + 1) throw new Error('Synthetic state restore did not advance the revision.');
    restored = true;

    const lifecycle = (await request(`/api/pathways/students?organizationId=${encodeURIComponent(student.organization_id)}&includeInactive=1`)).data;
    const lifecycleStudent = (lifecycle.students || []).find(item => item.student_id === student.student_id && item.is_synthetic_demo === 1);
    if (!lifecycleStudent) throw new Error('Synthetic Student A was not visible in the privileged lifecycle list.');

    if (rotatedPassword) {
      await request('/api/pathways/password', {
        method: 'POST',
        body: { currentPassword: activePassword, newPassword: rotatedPassword },
      });
      csrfToken = '';
      cookie = '';
      const oldLogin = await login(activePassword, [401]);
      if (oldLogin.response.status !== 401) throw new Error('Old password remained valid after rotation.');
      activePassword = rotatedPassword;
      await login(activePassword);
    }

    await request('/api/pathways/logout', { method: 'POST' });
    csrfToken = '';
    const afterLogout = await request('/api/pathways/me', { allow: [401] });
    if (afterLogout.response.status !== 401) throw new Error('Session remained valid after logout.');

    console.log(JSON.stringify({
      status: 'PASS',
      target: 'synthetic-preview-only',
      student: 'Student A',
      originalRevision,
      smokeRevision: editedRevision,
      restoredRevision: editedRevision + 1,
      exportedRevisions: exported.history.length,
      passwordRotationTested: Boolean(rotatedPassword),
    }));
  } finally {
    if (!restored && editedRevision !== null && cookie) {
      try {
        await request('/api/pathways/state', {
          method: 'PUT',
          body: {
            studentId: student.student_id,
            state: original,
            expectedRevision: editedRevision,
            action: 'edit',
            requestId: `smoke-finally-restore:${crypto.randomUUID()}`,
          },
        });
      } catch {
        console.error('Synthetic smoke state could not be automatically restored. Review Student A before further testing.');
      }
    }
  }
}

await main();
