import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { PUBLIC_FILES } from '../scripts/build-site.mjs';

const execFileAsync = promisify(execFile);
await import('../pathways-lab/model.js');
const M = globalThis.PathwaysModel;

const fixture = JSON.parse(await readFile(new URL('./fixtures/pathways-week.synthetic.json', import.meta.url), 'utf8'));
const fixedDate = new Date(fixture.baseDate);

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
    await execFileAsync(process.execPath, ['--check', path], {
      cwd: new URL('../', import.meta.url),
    });
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

test('lesson keys include the actual school date so next week cannot overwrite this week', () => {
  const weekOne = new Date('2026-09-14T08:00:00+08:00');
  const weekTwo = new Date('2026-09-21T08:00:00+08:00');
  const first = M.datedLessonKey('Monday', '09:00–09:55', 'EAL', weekOne);
  const second = M.datedLessonKey('Monday', '09:00–09:55', 'EAL', weekTwo);
  assert.equal(first, '2026-09-14|09:00–09:55|EAL');
  assert.equal(second, '2026-09-21|09:00–09:55|EAL');
  assert.notEqual(first, second);
});

test('legacy weekday-only records migrate into the current week without duplication', () => {
  const old = {
    'Monday|09:00–09:55|EAL': { narrative: 'Example' },
    '2026-09-14|10:55–11:50|Science': { narrative: 'Already dated' },
  };
  const result = M.migrateLegacySubjects(old, fixedDate);
  assert.equal(result.migrated, 1);
  assert.equal(result.subjects['2026-09-14|09:00–09:55|EAL'].narrative, 'Example');
  assert.equal(result.subjects['2026-09-14|10:55–11:50|Science'].narrative, 'Already dated');
  assert.equal(result.subjects['Monday|09:00–09:55|EAL'], undefined);
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
  const beforeDue = new Date('2026-09-17T00:30:00+08:00');
  const afterDue = new Date('2026-09-19T00:30:00+08:00');
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
