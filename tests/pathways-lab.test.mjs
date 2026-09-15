import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PUBLIC_FILES } from '../scripts/build-site.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
await import('../pathways-lab/model.js');
const M = globalThis.PathwaysModel;

const fixture = JSON.parse(await readFile(new URL('./fixtures/pathways-week.synthetic.json', import.meta.url), 'utf8'));

function localDateFromIsoDateTime(value, hour = 8, minute = 0) {
  const [datePart] = String(value).split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

const fixedDate = localDateFromIsoDateTime(fixture.baseDate);

function datedSubjectsFromFixture() {
  const subjects = {};
  for (const [dayName, entries] of Object.entries(fixture.subjects)) {
    entries.forEach((entry, index) => {
      subjects[`${M.localDateKey(M.dateForDay(dayName, fixedDate))}|fixture-${index}|${entry.subject}`] = entry;
    });
  }
  return subjects;
}

test('Pathways public assets are allowlisted for Pages builds', () => {
  for (const path of [
    'pathways-lab/index.html',
    'pathways-lab/app.js',
    'pathways-lab/app-core.js',
    'pathways-lab/model.js',
    'pathways-lab/app-fixes.js',
  ]) {
    assert.ok(PUBLIC_FILES.includes(path), `${path} must be included in the public build allowlist`);
  }
});

test('Pathways browser JavaScript passes Node syntax checks', async () => {
  for (const path of [
    'pathways-lab/app-core.js',
    'pathways-lab/app.js',
    'pathways-lab/model.js',
    'pathways-lab/app-fixes.js',
  ]) {
    await execFileAsync(process.execPath, ['--check', path], { cwd: projectRoot });
  }
});

test('Pathways route remains a clearly bounded local-only pilot', async () => {
  const html = await readFile(new URL('../pathways-lab/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../pathways-lab/app.js', import.meta.url), 'utf8');
  const core = await readFile(new URL('../pathways-lab/app-core.js', import.meta.url), 'utf8');

  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.match(html, /Pilot only:/);
  assert.match(html, /stores data only in this browser/i);
  assert.match(html, /id="copyReport"/);
  assert.match(html, /id="openWhatsApp"/);
  assert.doesNotMatch(html, /type="tel"/i);
  assert.match(app, /\/pathways-lab\/app-core\.js/);
  assert.match(app, /\/pathways-lab\/model\.js/);
  assert.match(app, /\/pathways-lab\/app-fixes\.js/);
  assert.doesNotMatch(core, /\bfetch\s*\(/);
  assert.doesNotMatch(core, /XMLHttpRequest|WebSocket/);
});

test('lesson and daily overview keys include the actual school date', () => {
  const weekOne = new Date(2026, 8, 14, 8, 0, 0, 0);
  const weekTwo = new Date(2026, 8, 21, 8, 0, 0, 0);
  const firstLesson = M.datedLessonKey('Monday', '09:00–09:55', 'EAL', weekOne);
  const secondLesson = M.datedLessonKey('Monday', '09:00–09:55', 'EAL', weekTwo);
  const firstOverview = M.datedDayKey('Monday', weekOne);
  const secondOverview = M.datedDayKey('Monday', weekTwo);

  assert.equal(firstLesson, '2026-09-14|09:00–09:55|EAL');
  assert.equal(secondLesson, '2026-09-21|09:00–09:55|EAL');
  assert.equal(firstOverview, '2026-09-14');
  assert.equal(secondOverview, '2026-09-21');
  assert.notEqual(firstLesson, secondLesson);
  assert.notEqual(firstOverview, secondOverview);
});

test('weekday-only legacy records remain explicitly undated instead of gaining a false date', () => {
  const old = {
    'Monday|09:00–09:55|EAL': {
      narrative: 'Example',
      tasks: [{ objectiveId: 'obj-task-initiation', objectiveResult: 'Criterion met' }],
    },
    '2026-09-14|10:55–11:50|Science': {
      narrative: 'Already dated',
      tasks: [{ objectiveId: 'obj-task-initiation', objectiveResult: 'Criterion not met' }],
    },
  };
  const result = M.migrateLegacySubjects(old);
  assert.equal(result.migrated, 1);
  assert.equal(result.subjects['legacy|Monday|09:00–09:55|EAL'].narrative, 'Example');
  assert.equal(result.subjects['2026-09-14|10:55–11:50|Science'].narrative, 'Already dated');
  assert.equal(result.subjects['Monday|09:00–09:55|EAL'], undefined);

  assert.deepEqual(M.objectiveStats(result.subjects, 'obj-task-initiation'), {
    measured: 1,
    met: 0,
    partial: 0,
    notMet: 1,
  });
});

test('weekday-only legacy daily overviews remain explicitly undated', () => {
  const result = M.migrateLegacyOverview({
    Monday: { choice: 'steady', note: 'Old pilot overview' },
    '2026-09-14': { choice: 'support', note: 'Dated overview' },
  });
  assert.equal(result.migrated, 1);
  assert.equal(result.overview['legacy|Monday'].note, 'Old pilot overview');
  assert.equal(result.overview['2026-09-14'].note, 'Dated overview');
  assert.equal(result.overview.Monday, undefined);
});

test('consecutive double periods collapse into one reporting block', () => {
  assert.deepEqual(
    M.collapseConsecutiveSlots([
      ['13:30–14:25', 'Design Technology'],
      ['14:30–15:25', 'Design Technology'],
    ]),
    [['13:30–15:25', 'Design Technology']],
  );
});

test('deadline logic uses local calendar dates and does not silently remove overdue homework', () => {
  const beforeDue = new Date(2026, 8, 17, 0, 30, 0, 0);
  const afterDue = new Date(2026, 8, 19, 0, 30, 0, 0);
  const homework = fixture.pins.find(pin => pin.id === 'pin-homework');
  const announcement = fixture.pins.find(pin => pin.id === 'pin-announcement');

  assert.equal(M.localDateKey(beforeDue), '2026-09-17');
  assert.equal(M.effectivePinStatus(homework, beforeDue), 'Open');
  assert.equal(M.effectivePinStatus(homework, afterDue), 'Overdue');
  assert.equal(M.effectivePinStatus(announcement, afterDue), 'Archived');
});

test('objective measurement excludes insufficient opportunities from the denominator', () => {
  const stats = M.objectiveStats(datedSubjectsFromFixture(), 'obj-task-initiation');
  assert.deepEqual(stats, {
    measured: 5,
    met: 3,
    partial: 1,
    notMet: 1,
  });
});

test('objective drafts must be observable, contextual, measurable and reviewable', () => {
  assert.deepEqual(
    M.validateObjectiveDraft({ target: 'Be more independent' }),
    {
      valid: false,
      missing: ['context / condition', 'measurable criterion', 'review date'],
    },
  );

  assert.deepEqual(
    M.validateObjectiveDraft({
      target: 'Begin a familiar written task',
      condition: 'Following teacher instruction during familiar written work',
      criterion: 'within 2 minutes in 4 of 5 observed opportunities',
      review: '2026-11-30',
    }),
    { valid: true, missing: [] },
  );
});

test('IEP evidence labels daily domains separately from cumulative dated objective evidence', () => {
  const allSubjects = datedSubjectsFromFixture();
  allSubjects['legacy|Monday|09:00–09:55|EAL'] = {
    tasks: [{ objectiveId: 'obj-task-initiation', objectiveResult: 'Criterion met' }],
  };

  const output = M.buildIepEvidence({
    dayName: 'Monday',
    currentSubjects: fixture.subjects.Monday.map(entry => ({ subject: entry.subject, data: { ...entry, domains: entry.subject === 'EAL' ? ['AUT', 'LRN'] : ['LRN'] } })),
    objectives: [{ ...fixture.objectives[0], review: '2026-11-30' }],
    allSubjects,
    domains: [
      ['AUT', 'Autonomy & Self-Management'],
      ['LRN', 'Learning & Executive Function'],
    ],
  });

  assert.match(output, /Today's domain evidence/);
  assert.match(output, /Cumulative dated objective evidence/);
  assert.match(output, /3\/5 measured opportunities met criterion/);
  assert.match(output, /Undated legacy records and not-measured opportunities are excluded/);
  assert.match(output, /Candidate objectives require student\/team review before use in a formal IEP/);
});

test('WhatsApp output keeps internal task data out unless explicitly shared', () => {
  const monday = fixture.subjects.Monday;
  const report = M.buildParentReport({
    dayName: 'Monday',
    baseDate: fixedDate,
    overviewPhrase: fixture.overview.Monday.phrase,
    overviewNote: fixture.overview.Monday.note,
    subjects: monday.map(entry => ({ subject: entry.subject, data: entry })),
    pins: fixture.pins,
  });

  assert.match(report, /^14\/9\/26/m);
  assert.match(report, /\*Behaviour and Focus:\*/);
  assert.match(report, /\*EAL:\*/);
  assert.match(report, /Questions 1-5/);
  assert.doesNotMatch(report, /Word-search warm-up/);
  assert.doesNotMatch(report, /Write own example/);
  assert.match(report, /\*Homework \/ Upcoming:\*/);
  assert.match(report, /Mathematics: Complete Questions 6-10/);
  assert.doesNotMatch(report, /Check visual examples before next lesson/);
});

test('navigation colors avoid red grading cues for routine support and access states', async () => {
  const app = await readFile(new URL('../pathways-lab/app.js', import.meta.url), 'utf8');
  assert.match(app, /Indigo = important event/);
  assert.match(app, /Amber = support \/ access change/);
  assert.doesNotMatch(app, /Red = important event/);
  assert.match(app, /title === 'Important'[\s\S]*classList\.remove\('cog-coral'\)[\s\S]*classList\.add\('cog-indigo'\)/);
  assert.match(app, /title === 'Unable now'[\s\S]*classList\.remove\('cog-coral'\)[\s\S]*classList\.add\('cog-amber'\)/);
});

test('saved lesson records require confirmation before Not reported can replace them', async () => {
  const fixes = await readFile(new URL('../pathways-lab/app-fixes.js', import.meta.url), 'utf8');
  assert.match(fixes, /existing\?\.saved && !confirm\(/);
  assert.match(fixes, /replace the saved report for this lesson/);
});

test('synthetic fixture covers a full school week and balanced support contexts', () => {
  assert.deepEqual(Object.keys(fixture.subjects), ['Monday','Tuesday','Wednesday','Thursday','Friday']);
  const allSubjects = Object.values(fixture.subjects).flat();
  assert.ok(allSubjects.some(subject => subject.tasks.length === 0), 'fixture needs ordinary lessons without task overhead');
  assert.ok(allSubjects.some(subject => subject.tasks.length > 1), 'fixture needs multi-task lessons');
  const allTasks = allSubjects.flatMap(subject => subject.tasks);
  assert.ok(allTasks.some(task => task.objectiveResult === 'Criterion met'));
  assert.ok(allTasks.some(task => task.objectiveResult === 'Criterion not met'));
  assert.ok(allTasks.some(task => task.objectiveResult === 'Not measured / insufficient opportunity'));
  assert.ok(allTasks.some(task => task.includeParent === true));
  assert.ok(allTasks.some(task => task.includeParent === false));
});
