import { createEmptyPathwaysState } from './schema.js';

export function createSyntheticDemoState() {
  const state = createEmptyPathwaysState();
  state.timetable = {
    Monday: [
      ['08:00–08:55','Learning Support'],
      ['09:00–09:55','EAL'],
      ['10:55–11:50','Science'],
      ['11:55–12:50','Mathematics'],
    ],
    Tuesday: [
      ['09:00–09:55','Physical Education'],
      ['11:55–12:50','Mathematics'],
      ['13:30–15:25','Design Technology'],
    ],
    Wednesday: [
      ['08:00–08:55','Bahasa Malaysia'],
      ['14:30–15:25','Science'],
    ],
    Thursday: [
      ['09:00–09:55','EAL'],
      ['13:30–14:25','Humanities'],
    ],
    Friday: [
      ['10:55–11:50','Drama'],
      ['11:55–12:50','Mathematics'],
    ],
  };
  state.objectives.push({
    id: 'obj-task-initiation',
    domain: 'AUT',
    target: 'Begin a familiar written task',
    condition: 'Following teacher instruction during familiar written work',
    support: 'Agreed first-step visual and no direct aide prompt',
    criterion: 'Within 2 minutes in 4 of 5 measured opportunities across 3 consecutive weeks',
    review: '2026-11-30',
    status: 'active',
    measureType: 'criterion',
    supersedesId: '',
  });
  state.pins.push({
    id: 'pin-demo-homework',
    type: 'Homework',
    subject: 'Mathematics',
    title: 'Complete Questions 6–10',
    details: 'Bring the completed worksheet to the next lesson.',
    due: '',
    parent: true,
    status: 'Open',
  });
  state.pins.push({
    id: 'pin-demo-internal',
    type: 'Reminder',
    subject: 'Science',
    title: 'Check visual examples before next lesson',
    details: 'Internal support note only.',
    due: '',
    parent: false,
    status: 'Open',
  });
  return state;
}
