export const PATHWAYS_SCHEMA_VERSION = '1.0';

export const PATHWAYS_DOMAINS = Object.freeze(['COM','PAR','AUT','LRN','REG','SOC','SUP','TRN']);
export const PATHWAYS_OBJECTIVE_RESULTS = Object.freeze([
  'Criterion met',
  'Partly / emerging',
  'Criterion not met',
  'Not measured / insufficient opportunity',
]);
export const PATHWAYS_OBJECTIVE_STATUSES = Object.freeze(['active','achieved','archived','replaced']);
export const PATHWAYS_MEASURE_TYPES = Object.freeze(['criterion','latency','duration','frequency','accuracy']);
export const PATHWAYS_PIN_TYPES = Object.freeze(['Homework','Upcoming task / assessment','Announcement','Materials / bring item','Reminder']);
export const PATHWAYS_PIN_STATUSES = Object.freeze(['Open','Done','Archived']);
export const PATHWAYS_WEEKDAYS = Object.freeze(['Monday','Tuesday','Wednesday','Thursday','Friday']);

const LIMITS = Object.freeze({
  timetablePerDay: 24,
  objectives: 100,
  pins: 500,
  subjects: 2500,
  overviews: 500,
  tasksPerLesson: 30,
  textShort: 240,
  textMedium: 1200,
  narrative: 5000,
  jsonBytes: 2 * 1024 * 1024,
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(?:–\d{2}:\d{2})?$/;
const SUBJECT_KEY_RE = /^(?:\d{4}-\d{2}-\d{2}|legacy\|(?:Monday|Tuesday|Wednesday|Thursday|Friday))\|/;

function fail(message) {
  throw new TypeError(message);
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object.`);
  return value;
}

function string(value, label, max = LIMITS.textShort, { optional = false } = {}) {
  if (optional && (value === '' || value === null || value === undefined)) return '';
  if (typeof value !== 'string') fail(`${label} must be text.`);
  if (value.length > max) fail(`${label} is too long.`);
  return value;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be true or false.`);
  return value;
}

function oneOf(value, allowed, label, { optional = false } = {}) {
  if (optional && (value === '' || value === null || value === undefined)) return '';
  if (!allowed.includes(value)) fail(`${label} has an unsupported value.`);
  return value;
}

function optionalDate(value, label) {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value !== 'string' || !DATE_RE.test(value)) fail(`${label} must use YYYY-MM-DD.`);
  return value;
}

function safeId(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value)) fail(`${label} is invalid.`);
  return value;
}

function arrayOfStrings(value, label, allowed = null, max = 20) {
  if (!Array.isArray(value) || value.length > max) fail(`${label} must be a short list.`);
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || item.length > LIMITS.textShort) fail(`${label} contains invalid text.`);
    if (allowed && !allowed.includes(item)) fail(`${label} contains an unsupported value.`);
    if (seen.has(item)) fail(`${label} contains duplicates.`);
    seen.add(item);
  }
  return value;
}

function validateTask(task, index) {
  plainObject(task, `task ${index + 1}`);
  safeId(task.id, `task ${index + 1} id`);
  string(task.label ?? '', `task ${index + 1} label`, LIMITS.textMedium, { optional: true });
  string(task.type ?? '', `task ${index + 1} type`, LIMITS.textShort, { optional: true });
  string(task.outcome ?? '', `task ${index + 1} outcome`, LIMITS.textShort, { optional: true });
  string(task.detail ?? '', `task ${index + 1} detail`, LIMITS.textMedium, { optional: true });
  if ('includeParent' in task) boolean(task.includeParent, `task ${index + 1} parent visibility`);
  if (task.objectiveId) safeId(task.objectiveId, `task ${index + 1} objective id`);
  oneOf(task.objectiveResult ?? '', PATHWAYS_OBJECTIVE_RESULTS, `task ${index + 1} objective result`, { optional: true });
  if (task.measurementValue !== undefined && task.measurementValue !== null && task.measurementValue !== '') {
    if (typeof task.measurementValue !== 'number' || !Number.isFinite(task.measurementValue)) fail(`task ${index + 1} measurement value is invalid.`);
  }
  string(task.measurementUnit ?? '', `task ${index + 1} measurement unit`, 40, { optional: true });
}

function validateLessonRecord(record, key) {
  plainObject(record, `lesson ${key}`);
  if ('saved' in record && typeof record.saved !== 'boolean') fail(`lesson ${key} saved flag is invalid.`);
  if ('skipped' in record && typeof record.skipped !== 'boolean') fail(`lesson ${key} skipped flag is invalid.`);
  string(record.status ?? '', `lesson ${key} status`, 40, { optional: true });
  string(record.narrative ?? '', `lesson ${key} narrative`, LIMITS.narrative, { optional: true });
  string(record.participation ?? '', `lesson ${key} participation`, LIMITS.textShort, { optional: true });
  string(record.aideLevel ?? '', `lesson ${key} aide level`, 40, { optional: true });
  string(record.supportSource ?? '', `lesson ${key} support source`, LIMITS.textShort, { optional: true });
  string(record.supportPurpose ?? '', `lesson ${key} support purpose`, LIMITS.textShort, { optional: true });
  arrayOfStrings(record.autonomy ?? [], `lesson ${key} autonomy`, null, 20);
  arrayOfStrings(record.domains ?? [], `lesson ${key} domains`, PATHWAYS_DOMAINS, 3);
  string(record.eventObservation ?? '', `lesson ${key} event observation`, LIMITS.textMedium, { optional: true });
  string(record.eventUncertainty ?? '', `lesson ${key} event uncertainty`, LIMITS.textMedium, { optional: true });
  if (!Array.isArray(record.tasks) || record.tasks.length > LIMITS.tasksPerLesson) fail(`lesson ${key} has too many tasks.`);
  record.tasks.forEach(validateTask);
}

function validateObjective(objective, index) {
  plainObject(objective, `objective ${index + 1}`);
  safeId(objective.id, `objective ${index + 1} id`);
  oneOf(objective.domain, PATHWAYS_DOMAINS, `objective ${index + 1} domain`);
  string(objective.target, `objective ${index + 1} target`, LIMITS.textMedium);
  string(objective.condition ?? '', `objective ${index + 1} condition`, LIMITS.textMedium);
  string(objective.support ?? '', `objective ${index + 1} allowed support`, LIMITS.textMedium, { optional: true });
  string(objective.criterion, `objective ${index + 1} criterion`, LIMITS.textMedium);
  optionalDate(objective.review, `objective ${index + 1} review date`);
  oneOf(objective.status ?? 'active', PATHWAYS_OBJECTIVE_STATUSES, `objective ${index + 1} status`);
  oneOf(objective.measureType ?? 'criterion', PATHWAYS_MEASURE_TYPES, `objective ${index + 1} measure type`);
  if (objective.supersedesId) safeId(objective.supersedesId, `objective ${index + 1} supersedes id`);
  if (!objective.target.trim() || !objective.condition.trim() || !objective.criterion.trim() || !objective.review) {
    fail(`objective ${index + 1} must include target, condition, criterion and review date.`);
  }
}

function validatePin(pin, index) {
  plainObject(pin, `pin ${index + 1}`);
  safeId(pin.id, `pin ${index + 1} id`);
  oneOf(pin.type, PATHWAYS_PIN_TYPES, `pin ${index + 1} type`);
  string(pin.subject ?? '', `pin ${index + 1} subject`, LIMITS.textShort, { optional: true });
  string(pin.title, `pin ${index + 1} title`, LIMITS.textMedium);
  string(pin.details ?? '', `pin ${index + 1} details`, LIMITS.textMedium, { optional: true });
  optionalDate(pin.due ?? '', `pin ${index + 1} due date`);
  if (typeof pin.parent !== 'boolean') fail(`pin ${index + 1} parent visibility is invalid.`);
  oneOf(pin.status ?? 'Open', PATHWAYS_PIN_STATUSES, `pin ${index + 1} status`);
}

function validateTimetable(timetable) {
  plainObject(timetable, 'timetable');
  for (const day of PATHWAYS_WEEKDAYS) {
    const entries = timetable[day] ?? [];
    if (!Array.isArray(entries) || entries.length > LIMITS.timetablePerDay) fail(`${day} timetable is invalid.`);
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) fail(`${day} timetable entry is invalid.`);
      string(entry[0], `${day} timetable time`, 40);
      if (!entry[0].includes('–') && !TIME_RE.test(entry[0])) {
        // Existing pilot uses ranges such as 08:00–08:55; allow future local labels but bound their length.
      }
      string(entry[1], `${day} timetable subject`, LIMITS.textShort);
    }
  }
}

export function createEmptyPathwaysState() {
  return {
    version: PATHWAYS_SCHEMA_VERSION,
    timetable: Object.fromEntries(PATHWAYS_WEEKDAYS.map(day => [day, []])),
    subjects: {},
    overview: {},
    pins: [],
    objectives: [],
    settings: {
      timezone: 'Asia/Kuala_Lumpur',
    },
  };
}

export function assertValidPathwaysState(state) {
  plainObject(state, 'Pathways state');
  if (state.version !== PATHWAYS_SCHEMA_VERSION) fail(`Pathways state version must be ${PATHWAYS_SCHEMA_VERSION}.`);
  validateTimetable(state.timetable);

  plainObject(state.subjects, 'subjects');
  const subjectEntries = Object.entries(state.subjects);
  if (subjectEntries.length > LIMITS.subjects) fail('Too many lesson records are stored in one student state.');
  for (const [key, record] of subjectEntries) {
    if (typeof key !== 'string' || key.length > 400 || !SUBJECT_KEY_RE.test(key)) fail(`lesson key ${key} is invalid.`);
    validateLessonRecord(record, key);
  }

  plainObject(state.overview, 'overview');
  const overviewEntries = Object.entries(state.overview);
  if (overviewEntries.length > LIMITS.overviews) fail('Too many daily overviews are stored in one student state.');
  for (const [key, value] of overviewEntries) {
    if (!(DATE_RE.test(key) || /^legacy\|(Monday|Tuesday|Wednesday|Thursday|Friday)$/.test(key))) fail(`overview key ${key} is invalid.`);
    plainObject(value, `overview ${key}`);
    string(value.choice ?? '', `overview ${key} choice`, 40, { optional: true });
    string(value.note ?? '', `overview ${key} note`, LIMITS.textMedium, { optional: true });
  }

  if (!Array.isArray(state.pins) || state.pins.length > LIMITS.pins) fail('pins are invalid or exceed the supported limit.');
  state.pins.forEach(validatePin);

  if (!Array.isArray(state.objectives) || state.objectives.length > LIMITS.objectives) fail('objectives are invalid or exceed the supported limit.');
  state.objectives.forEach(validateObjective);

  plainObject(state.settings ?? {}, 'settings');
  string(state.settings?.timezone ?? 'Asia/Kuala_Lumpur', 'timezone', 80);

  const bytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
  if (bytes > LIMITS.jsonBytes) fail('Pathways student state exceeds the supported size limit.');
  return true;
}

export function canonicalPathwaysState(state) {
  assertValidPathwaysState(state);
  return JSON.parse(JSON.stringify(state));
}
