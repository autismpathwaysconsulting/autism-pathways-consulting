(() => {
  if (!globalThis.PathwaysModel) throw new Error('PathwaysModel must load before app-fixes.js');
  const M = globalThis.PathwaysModel;

  function installFixes() {
    if (typeof state === 'undefined' || typeof TIMETABLE === 'undefined' || typeof renderAll !== 'function') return false;

    Object.keys(TIMETABLE).forEach(dayName => {
      const collapsed = M.collapseConsecutiveSlots(TIMETABLE[dayName]);
      TIMETABLE[dayName].splice(0, TIMETABLE[dayName].length, ...collapsed);
    });

    const migratedSubjects = M.migrateLegacySubjects(state.subjects || {});
    const migratedOverview = M.migrateLegacyOverview(state.overview || {});
    if (migratedSubjects.migrated || migratedOverview.migrated) {
      state.subjects = migratedSubjects.subjects;
      state.overview = migratedOverview.overview;
      save();
    }

    key = (dayName, time, subject) => M.datedLessonKey(dayName, time, subject, new Date());
    reportDate = () => M.formatReportDate(day, new Date());
    objectiveStats = objectiveId => M.objectiveStats(state.subjects || {}, objectiveId);
    escapeText = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const currentOverviewKey = () => M.datedDayKey(day, new Date());

    renderOverview = function () {
      const recordKey = currentOverviewKey();
      const data = state.overview[recordKey] || {};
      const root = $('overviewChoices');
      root.innerHTML = '';
      OVERVIEW.forEach(([id, label]) => {
        const button = document.createElement('button');
        button.className = `choice ${data.choice === id ? 'selected' : ''}`;
        button.textContent = label;
        button.onclick = () => {
          state.overview[recordKey] = { ...data, choice: id };
          save();
          renderOverview();
          renderOutput();
        };
        root.appendChild(button);
      });
      $('overviewNote').value = data.note || '';
    };

    $('saveOverview').onclick = () => {
      const recordKey = currentOverviewKey();
      const old = state.overview[recordKey] || {};
      state.overview[recordKey] = { ...old, note: $('overviewNote').value.trim() };
      save();
      renderOutput();
    };

    $('saveObjective').onclick = () => {
      const objective = {
        id: uid('obj'),
        domain: $('objDomain').value,
        target: $('objTarget').value.trim(),
        condition: $('objCondition').value.trim(),
        support: $('objSupport').value.trim(),
        criterion: $('objCriterion').value.trim(),
        review: $('objReview').value,
      };
      const validation = M.validateObjectiveDraft(objective);
      if (!validation.valid) {
        alert(`Add the missing objective details: ${validation.missing.join(', ')}.`);
        return;
      }
      state.objectives.push(objective);
      save();
      $('objectiveDialog').close();
      $('objectiveDialog').querySelector('form').reset();
      renderObjectives();
      renderOutput();
    };

    archiveExpiredAnnouncements = function () {
      let changed = false;
      state.pins.forEach(pin => {
        if (M.effectivePinStatus(pin, new Date()) === 'Archived' && pin.status !== 'Archived') {
          pin.status = 'Archived';
          changed = true;
        }
      });
      if (changed) save();
    };

    renderPins = function () {
      archiveExpiredAnnouncements();
      const root = $('pinList');
      root.innerHTML = '';
      const open = state.pins.filter(pin => !['Done','Archived'].includes(M.effectivePinStatus(pin, new Date())));
      if (!open.length) {
        root.innerHTML = '<div class="muted-box">No open homework, upcoming tasks or announcements.</div>';
        return;
      }
      open.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).forEach(pin => {
        const status = M.effectivePinStatus(pin, new Date());
        const overdue = status === 'Overdue';
        const div = document.createElement('div');
        div.className = `pin ${overdue ? 'overdue' : ''}`;
        div.innerHTML = `<strong>${escapeText(pin.title)}</strong><div class="meta"><span class="mini">${escapeText(pin.type)}</span>${pin.subject ? `<span>${escapeText(pin.subject)}</span>` : ''}${pin.due ? `<span>${overdue ? 'Overdue · ' : ''}${fmtDate(pin.due)}</span>` : ''}</div>${pin.details ? `<div class="subtle" style="margin-top:5px;font-size:.8rem">${escapeText(pin.details)}</div>` : ''}`;
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = '<button class="btn secondary small">Done</button>';
        row.querySelector('button').onclick = () => {
          pin.status = 'Done';
          save();
          renderPins();
          renderOutput();
        };
        div.appendChild(row);
        root.appendChild(div);
      });
    };

    renderTasks = function () {
      const root = $('taskList');
      const helper = root.closest('.section')?.querySelector('.section-copy');
      if (helper) helper.textContent = 'Optional. Add tasks only when they clarify the lesson or measure an objective. Tasks stay internal unless you choose to include them in WhatsApp.';
      $('addTask').textContent = formData.tasks.length ? '+ Add another task' : '+ Add task';
      root.innerHTML = '';
      if (!formData.tasks.length) {
        root.innerHTML = '<div class="muted-box">No task breakdown needed. Add tasks only when they create useful detail.</div>';
        return;
      }

      formData.tasks.forEach((task, index) => {
        const div = document.createElement('div');
        div.className = 'task';
        const objectiveOptions = ['<option value="">No objective measurement</option>', ...state.objectives.map(objective => `<option value="${objective.id}" ${task.objectiveId === objective.id ? 'selected' : ''}>${objective.domain} · ${escapeText(objective.target)}</option>`)].join('');
        div.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong>Task ${index + 1}</strong><button type="button" class="btn ghost small remove">Remove</button></div><div class="task-grid"><label class="field"><span>Task</span><input class="task-label" value="${escapeText(task.label || '')}" placeholder="e.g. Questions 1-5"></label><label class="field"><span>Type</span><select class="task-type">${TASK_TYPES.map(value => `<option ${task.type === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label class="field"><span>Outcome</span><select class="task-outcome">${TASK_OUTCOMES.map(value => `<option ${task.outcome === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div><label class="field"><span>Internal detail (optional)</span><textarea class="task-detail" rows="2" placeholder="e.g. Needed one prompt to start, then continued independently.">${escapeText(task.detail || '')}</textarea></label><label class="field"><span style="display:flex;align-items:center;gap:8px;font-weight:650"><input class="task-parent" type="checkbox" style="width:auto" ${task.includeParent === true ? 'checked' : ''}> Include this task in WhatsApp report</span></label><div class="task-more"><select class="task-objective">${objectiveOptions}</select><select class="task-result ${task.objectiveId ? '' : 'hidden'}">${OBJECTIVE_RESULTS.map(value => `<option ${task.objectiveResult === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>`;
        div.querySelector('.remove').onclick = () => { formData.tasks.splice(index, 1); renderTasks(); };
        div.querySelector('.task-label').oninput = event => task.label = event.target.value;
        div.querySelector('.task-type').onchange = event => task.type = event.target.value;
        div.querySelector('.task-outcome').onchange = event => task.outcome = event.target.value;
        div.querySelector('.task-detail').oninput = event => task.detail = event.target.value;
        div.querySelector('.task-parent').onchange = event => task.includeParent = event.target.checked;
        const objectiveSelect = div.querySelector('.task-objective');
        const resultSelect = div.querySelector('.task-result');
        objectiveSelect.onchange = event => {
          task.objectiveId = event.target.value;
          task.objectiveResult = task.objectiveId ? (task.objectiveResult || 'Not measured / insufficient opportunity') : '';
          renderTasks();
        };
        resultSelect.onchange = event => task.objectiveResult = event.target.value;
        root.appendChild(div);
      });
    };

    $('addTask').onclick = () => {
      formData.tasks.push({ id: uid('task'), label: '', type: 'Independent work', outcome: 'Completed / accessed', detail: '', includeParent: false, objectiveId: '', objectiveResult: '' });
      renderTasks();
    };

    $('notReported').onclick = () => {
      const existing = state.subjects[editingKey];
      if (existing?.saved && !confirm('This will replace the saved report for this lesson with “Not reported today.” Continue?')) return;
      state.subjects[editingKey] = { saved: false, skipped: true };
      save();
      $('subjectDialog').close();
      renderAll();
    };

    parentReport = function () {
      const overview = state.overview[currentOverviewKey()] || {};
      const overviewPhrase = OVERVIEW.find(item => item[0] === overview.choice)?.[1] || '';
      return M.buildParentReport({
        dayName: day,
        baseDate: new Date(),
        overviewPhrase,
        overviewNote: overview.note || '',
        subjects: currentSubjects(),
        pins: state.pins,
      });
    };

    iepReport = function () {
      return M.buildIepEvidence({
        dayName: day,
        currentSubjects: currentSubjects(),
        objectives: state.objectives,
        allSubjects: state.subjects,
        domains: DOMAINS,
      });
    };

    renderAll();
    return true;
  }

  if (!installFixes()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (installFixes() || attempts >= 100) clearInterval(timer);
    }, 25);
  }
})();
