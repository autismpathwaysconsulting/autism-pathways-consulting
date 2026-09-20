import {
  PATHWAYS_DOMAINS,
  PATHWAYS_OBJECTIVE_RESULTS,
  PATHWAYS_WEEKDAYS,
} from './schema.js';

export const DOMAIN_META = Object.freeze({
  COM: ['Communication & Self-Advocacy','#2563eb'],
  PAR: ['Participation & Access','#0f766e'],
  AUT: ['Autonomy & Self-Management','#7c3aed'],
  LRN: ['Learning & Executive Function','#4338ca'],
  REG: ['Regulation & Sensory Access','#b45309'],
  SOC: ['Social Connection & Belonging','#be185d'],
  SUP: ['Support & Environment','#475569'],
  TRN: ['Transition & Future Readiness','#0e7490'],
});

export const OVERVIEW_OPTIONS = Object.freeze([
  ['steady','Overall, good efforts to display focus and participate across lessons today.'],
  ['variable','Participation and focus varied across lessons today.'],
  ['support','Some lessons required additional support, while others were managed with teacher or classroom supports.'],
  ['reengaged','There were moments of reduced engagement, with successful re-engagement after support.'],
]);

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfWeek(baseDate = new Date()) {
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 12, 0, 0, 0);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

export function weekFromKey(value) {
  const [y,m,d] = String(value || '').split('-').map(Number);
  return y && m && d ? startOfWeek(new Date(y, m - 1, d, 12, 0, 0, 0)) : startOfWeek(new Date());
}

export function weekKey(baseDate = new Date()) {
  return localDateKey(startOfWeek(baseDate));
}

export function moveWeek(baseDate, delta) {
  const date = startOfWeek(baseDate);
  date.setDate(date.getDate() + delta * 7);
  return date;
}

export function dateForDay(dayName, baseDate = new Date()) {
  const index = PATHWAYS_WEEKDAYS.indexOf(dayName);
  const monday = startOfWeek(baseDate);
  const date = new Date(monday);
  date.setDate(monday.getDate() + Math.max(0, index));
  return date;
}

export function datedDayKey(dayName, baseDate = new Date()) {
  return localDateKey(dateForDay(dayName, baseDate));
}

export function datedLessonKey(dayName, time, subject, baseDate = new Date()) {
  return `${datedDayKey(dayName, baseDate)}|${time}|${subject}`;
}

export function formatShortDate(date) {
  return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(date);
}

export function formatReportDate(dayName, baseDate = new Date()) {
  const date = dateForDay(dayName, baseDate);
  return `${date.getDate()}/${date.getMonth()+1}/${String(date.getFullYear()).slice(-2)}`;
}

export function formatDueDate(value) {
  if (!value) return '';
  const [year,month,day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return String(value);
  return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
}

export function collapseConsecutiveSlots(entries = []) {
  const output = [];
  for (const entry of entries) {
    const [time,subject] = entry;
    const previous = output.at(-1);
    if (previous && previous[1] === subject && String(previous[0]).includes('–') && String(time).includes('–')) {
      previous[0] = `${String(previous[0]).split('–')[0]}–${String(time).split('–').at(-1)}`;
    } else output.push([time,subject]);
  }
  return output;
}

export function effectivePinStatus(pin, baseDate = new Date()) {
  if (pin?.status === 'Done' || pin?.status === 'Archived') return pin.status;
  if (!pin?.due) return 'Open';
  const today = localDateKey(baseDate);
  if (pin.type === 'Announcement' && pin.due < today) return 'Archived';
  if (pin.type !== 'Announcement' && pin.due < today) return 'Overdue';
  return 'Open';
}

export function objectiveStats(subjects = {}, objectiveId) {
  let measured=0,met=0,partial=0,notMet=0,notMeasured=0;
  for (const [key,record] of Object.entries(subjects)) {
    if (key.startsWith('legacy|')) continue;
    for (const task of record?.tasks || []) {
      if (task.objectiveId !== objectiveId) continue;
      if (!task.objectiveResult || task.objectiveResult === 'Not measured / insufficient opportunity') { if (task.objectiveResult) notMeasured++; continue; }
      measured++;
      if (task.objectiveResult === 'Criterion met') met++;
      else if (task.objectiveResult === 'Partly / emerging') partial++;
      else if (task.objectiveResult === 'Criterion not met') notMet++;
    }
  }
  return { measured,met,partial,notMet,notMeasured };
}

export function currentSubjects(state, dayName, baseDate) {
  return collapseConsecutiveSlots(state.timetable?.[dayName] || []).map(([time,subject]) => ({
    time,
    subject,
    key: datedLessonKey(dayName,time,subject,baseDate),
    data: state.subjects?.[datedLessonKey(dayName,time,subject,baseDate)] || null,
  }));
}

export function buildParentReport({ state, dayName, baseDate }) {
  const dateKey = datedDayKey(dayName, baseDate);
  const overview = state.overview?.[dateKey] || {};
  const phrase = OVERVIEW_OPTIONS.find(([id]) => id === overview.choice)?.[1] || '';
  const lines = [formatReportDate(dayName,baseDate),''];
  if (phrase || overview.note) {
    lines.push('*Behaviour and Focus:*');
    if (phrase) lines.push(phrase);
    if (overview.note) lines.push(overview.note);
    lines.push('');
  }
  for (const {subject,data} of currentSubjects(state,dayName,baseDate)) {
    if (!data?.saved) continue;
    const tasks = (data.tasks || []).filter(task => task.includeParent === true);
    if (!data.narrative && !tasks.length) continue;
    lines.push(`*${subject}:*`);
    if (data.narrative) lines.push(data.narrative);
    if (tasks.length) {
      if (data.narrative) lines.push('Tasks:');
      tasks.forEach((task,index) => {
        const label=(task.label||'').trim();
        const type=(task.type||'').trim();
        const name=label?`${label}${type&&type!=='Other'?` (${type})`:''}`:(type||`Task ${index+1}`);
        const outcome=(task.outcome||'').trim();
        const detail=(task.detail||'').trim();
        lines.push(`• ${name}${outcome?`: ${outcome}`:''}${detail?`. ${detail}`:''}`);
      });
    }
    lines.push('');
  }
  const parentPins = (state.pins || []).filter(pin => pin.parent && !pin.preparation && !['Done','Archived'].includes(effectivePinStatus(pin,baseDate)));
  if (parentPins.length) {
    lines.push('*Homework / Upcoming:*');
    for (const pin of parentPins) lines.push(`• ${pin.subject?`${pin.subject}: `:''}${pin.title}${pin.due?` (due ${formatDueDate(pin.due)})`:''}${pin.details?` - ${pin.details}`:''}`);
    lines.push('');
  }
  return lines.join('\n').trim() || 'No parent report has been entered for this day yet.';
}

export function buildTeacherReport({ state, dayName, baseDate }) {
  const lines=[`${formatShortDate(dateForDay(dayName,baseDate))} · ${dayName} support view`, ''];
  for (const {subject,data} of currentSubjects(state,dayName,baseDate)) {
    if (!data?.saved) continue;
    lines.push(subject);
    lines.push(`Participation: ${data.participation||'Not observed / unclear'}`);
    lines.push(`Aide involvement: ${data.aideLevel||'None / not recorded'}`);
    lines.push(`Primary support: ${data.supportSource||'Not recorded'}`);
    if (data.supportPurpose && data.aideLevel !== 'None') lines.push(`Support purpose: ${data.supportPurpose}`);
    if (data.autonomy?.length) lines.push(`Communication / autonomy: ${data.autonomy.join(', ')}`);
    if (data.narrative) lines.push(`Narrative: ${data.narrative}`);
    lines.push('');
  }
  return lines.join('\n').trim() || 'No subject data saved for this day.';
}

export function buildIepReport({ state, dayName, baseDate }) {
  const counts={};
  for (const {data} of currentSubjects(state,dayName,baseDate)) {
    if (!data?.saved) continue;
    for (const code of data.domains || []) if (PATHWAYS_DOMAINS.includes(code)) counts[code]=(counts[code]||0)+1;
  }
  const lines=[`${formatShortDate(dateForDay(dayName,baseDate))} · IEP / SEN evidence view`,'','Today’s domain evidence'];
  if (!Object.keys(counts).length) lines.push('No domain tags confirmed for this day.');
  for (const [code,count] of Object.entries(counts).sort((a,b)=>b[1]-a[1])) lines.push(`${code} · ${DOMAIN_META[code]?.[0]||code}: ${count} subject entr${count===1?'y':'ies'}`);
  const activeObjectives=(state.objectives||[]).filter(objective=>objective.status==='active');
  if (activeObjectives.length) {
    lines.push('','Cumulative dated objective evidence');
    for (const objective of activeObjectives) {
      const stats=objectiveStats(state.subjects||{},objective.id);
      lines.push(`${objective.domain} · ${objective.target}: ${stats.met}/${stats.measured} measured opportunities met criterion${stats.partial?`, ${stats.partial} partly/emerging`:''}${stats.notMet?`, ${stats.notMet} not met`:''}${stats.notMeasured?`; ${stats.notMeasured} not measured excluded`:''}.`);
    }
  }
  lines.push('','Evidence note: undated legacy observations and “Not measured / insufficient opportunity” are excluded from cumulative measured counts. Domain colours classify topic only, not performance. A single day does not establish a stable pattern.');
  return lines.join('\n');
}

export function outputFor(view,args) {
  if (view==='teacher') return buildTeacherReport(args);
  if (view==='iep') return buildIepReport(args);
  return buildParentReport(args);
}

export function objectiveResultOptions(){return [...PATHWAYS_OBJECTIVE_RESULTS]}
