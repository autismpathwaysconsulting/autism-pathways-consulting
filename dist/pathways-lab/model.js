(() => {
  const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

  function localDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function startOfWeek(baseDate = new Date()) {
    const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 12, 0, 0, 0);
    const mondayOffset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - mondayOffset);
    return date;
  }

  function dateForDay(dayName, baseDate = new Date()) {
    const index = DAY_ORDER.indexOf(dayName);
    const monday = startOfWeek(baseDate);
    if (index < 0) return monday;
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  }

  function datedLessonKey(dayName, time, subject, baseDate = new Date()) {
    return `${localDateKey(dateForDay(dayName, baseDate))}|${time}|${subject}`;
  }

  function formatReportDate(dayName, baseDate = new Date()) {
    const date = dateForDay(dayName, baseDate);
    return `${date.getDate()}/${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`;
  }

  function formatDueDate(value) {
    if (!value) return '';
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;
    return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
  }

  function collapseConsecutiveSlots(entries = []) {
    const output = [];
    entries.forEach(entry => {
      const [time, subject] = entry;
      const previous = output.at(-1);
      if (previous && previous[1] === subject) {
        const start = previous[0].split('–')[0];
        const end = time.split('–').at(-1);
        previous[0] = `${start}–${end}`;
      } else {
        output.push([time, subject]);
      }
    });
    return output;
  }

  function migrateLegacySubjects(subjects = {}) {
    const next = { ...subjects };
    let migrated = 0;
    for (const [oldKey, value] of Object.entries(subjects)) {
      const match = /^(Monday|Tuesday|Wednesday|Thursday|Friday)\|([^|]+)\|(.+)$/.exec(oldKey);
      if (!match) continue;
      const [, dayName, time, subject] = match;
      const legacyKey = `legacy|${dayName}|${time}|${subject}`;
      if (!(legacyKey in next)) next[legacyKey] = value;
      delete next[oldKey];
      migrated += 1;
    }
    return { subjects: next, migrated };
  }

  function effectivePinStatus(pin, baseDate = new Date()) {
    if (pin?.status === 'Done' || pin?.status === 'Archived') return pin.status;
    if (!pin?.due) return 'Open';
    const today = localDateKey(baseDate);
    if (pin.type === 'Announcement' && pin.due < today) return 'Archived';
    if (pin.type !== 'Announcement' && pin.due < today) return 'Overdue';
    return 'Open';
  }

  function objectiveStats(subjects = {}, objectiveId) {
    let measured = 0;
    let met = 0;
    let partial = 0;
    let notMet = 0;
    Object.entries(subjects).forEach(([recordKey, subject]) => {
      if (recordKey.startsWith('legacy|')) return;
      (subject?.tasks || []).forEach(task => {
        if (task.objectiveId !== objectiveId) return;
        if (!task.objectiveResult || task.objectiveResult === 'Not measured / insufficient opportunity') return;
        measured += 1;
        if (task.objectiveResult === 'Criterion met') met += 1;
        else if (task.objectiveResult === 'Partly / emerging') partial += 1;
        else if (task.objectiveResult === 'Criterion not met') notMet += 1;
      });
    });
    return { measured, met, partial, notMet };
  }

  function parentVisibleTasks(tasks = []) {
    return tasks.filter(task => task?.includeParent === true);
  }

  function buildParentReport({
    dayName,
    baseDate = new Date(),
    overviewPhrase = '',
    overviewNote = '',
    subjects = [],
    pins = [],
  }) {
    const lines = [formatReportDate(dayName, baseDate), ''];
    if (overviewPhrase || overviewNote) {
      lines.push('*Behaviour and Focus:*');
      if (overviewPhrase) lines.push(overviewPhrase);
      if (overviewNote) lines.push(overviewNote);
      lines.push('');
    }

    subjects.forEach(({ subject, data }) => {
      const tasks = parentVisibleTasks(data?.tasks || []);
      if (!data?.narrative && !tasks.length) return;
      lines.push(`*${subject}:*`);
      if (data?.narrative) lines.push(data.narrative);
      if (tasks.length) {
        if (data?.narrative) lines.push('Tasks:');
        tasks.forEach((task, index) => {
          const label = (task.label || '').trim();
          const type = (task.type || '').trim();
          const taskName = label ? `${label}${type && type !== 'Other' ? ` (${type})` : ''}` : (type || `Task ${index + 1}`);
          const outcome = (task.outcome || '').trim();
          const detail = (task.detail || '').trim();
          lines.push(`• ${taskName}${outcome ? `: ${outcome}` : ''}${detail ? `. ${detail}` : ''}`);
        });
      }
      lines.push('');
    });

    const parentPins = pins.filter(pin => pin?.parent && !['Done','Archived'].includes(effectivePinStatus(pin, baseDate)));
    if (parentPins.length) {
      lines.push('*Homework / Upcoming:*');
      parentPins.forEach(pin => {
        const due = pin.due ? ` (due ${formatDueDate(pin.due)})` : '';
        const details = pin.details ? ` - ${pin.details}` : '';
        lines.push(`• ${pin.subject ? `${pin.subject}: ` : ''}${pin.title}${due}${details}`);
      });
      lines.push('');
    }

    return lines.join('\n').trim() || 'No parent report has been entered for this day yet.';
  }

  globalThis.PathwaysModel = Object.freeze({
    DAY_ORDER,
    localDateKey,
    startOfWeek,
    dateForDay,
    datedLessonKey,
    formatReportDate,
    formatDueDate,
    collapseConsecutiveSlots,
    migrateLegacySubjects,
    effectivePinStatus,
    objectiveStats,
    parentVisibleTasks,
    buildParentReport,
  });
})();
