(() => {
  function installEnhancements() {
    if (typeof renderTasks !== 'function' || typeof parentReport !== 'function') return;

    escapeText = (s = '') => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    renderTasks = function () {
      const root = $('taskList');
      const helper = root.closest('.section')?.querySelector('.section-copy');
      if (helper) helper.textContent = 'Optional. Add one task or several when the lesson had distinct activities. Saved tasks appear automatically in the WhatsApp parent report.';
      $('addTask').textContent = formData.tasks.length ? '+ Add another task' : '+ Add task';
      root.innerHTML = '';
      if (!formData.tasks.length) {
        root.innerHTML = '<div class="muted-box">No task breakdown needed. Add tasks only when they help explain what happened in class.</div>';
        return;
      }
      formData.tasks.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'task';
        const objectiveOptions = ['<option value="">No objective measurement</option>', ...state.objectives.map(o => `<option value="${o.id}" ${t.objectiveId === o.id ? 'selected' : ''}>${o.domain} · ${escapeText(o.target)}</option>`)].join('');
        div.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong>Task ${i + 1}</strong><button type="button" class="btn ghost small remove">Remove</button></div><div class="task-grid"><label class="field"><span>Task</span><input class="task-label" value="${escapeText(t.label || '')}" placeholder="e.g. Questions 1-5"></label><label class="field"><span>Type</span><select class="task-type">${TASK_TYPES.map(x => `<option ${t.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label class="field"><span>Outcome</span><select class="task-outcome">${TASK_OUTCOMES.map(x => `<option ${t.outcome === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div><label class="field"><span>Parent detail (optional)</span><textarea class="task-detail" rows="2" placeholder="e.g. Needed one prompt to start, then completed independently.">${escapeText(t.detail || '')}</textarea></label><div class="task-more"><select class="task-objective">${objectiveOptions}</select><select class="task-result ${t.objectiveId ? '' : 'hidden'}">${OBJECTIVE_RESULTS.map(x => `<option ${t.objectiveResult === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`;
        div.querySelector('.remove').onclick = () => { formData.tasks.splice(i, 1); renderTasks(); };
        div.querySelector('.task-label').oninput = e => t.label = e.target.value;
        div.querySelector('.task-type').onchange = e => t.type = e.target.value;
        div.querySelector('.task-outcome').onchange = e => t.outcome = e.target.value;
        div.querySelector('.task-detail').oninput = e => t.detail = e.target.value;
        const os = div.querySelector('.task-objective');
        const rs = div.querySelector('.task-result');
        os.onchange = e => {
          t.objectiveId = e.target.value;
          t.objectiveResult = t.objectiveId ? (t.objectiveResult || 'Not measured / insufficient opportunity') : '';
          renderTasks();
        };
        rs.onchange = e => t.objectiveResult = e.target.value;
        root.appendChild(div);
      });
    };

    $('addTask').onclick = () => {
      formData.tasks.push({ id: uid('task'), label: '', type: 'Independent work', outcome: 'Completed / accessed', detail: '', objectiveId: '', objectiveResult: '' });
      renderTasks();
    };

    parentReport = function () {
      const ov = state.overview[day] || {};
      const phrase = OVERVIEW.find(x => x[0] === ov.choice)?.[1] || '';
      const lines = [reportDate(), ''];
      if (phrase || ov.note) {
        lines.push('*Behaviour and Focus:*');
        if (phrase) lines.push(phrase);
        if (ov.note) lines.push(ov.note);
        lines.push('');
      }
      currentSubjects().forEach(({ subject, data }) => {
        const tasks = data.tasks || [];
        if (!data.narrative && !tasks.length) return;
        lines.push(`*${subject}:*`);
        if (data.narrative) lines.push(data.narrative);
        if (tasks.length) {
          if (data.narrative) lines.push('Tasks:');
          tasks.forEach((t, i) => {
            const label = (t.label || '').trim();
            const type = (t.type || '').trim();
            const taskName = label ? `${label}${type && type !== 'Other' ? ` (${type})` : ''}` : (type || `Task ${i + 1}`);
            const outcome = (t.outcome || '').trim();
            const detail = (t.detail || '').trim();
            lines.push(`• ${taskName}${outcome ? `: ${outcome}` : ''}${detail ? `. ${detail}` : ''}`);
          });
        }
        lines.push('');
      });
      const pins = state.pins.filter(p => p.parent && p.status !== 'Done' && p.status !== 'Archived');
      if (pins.length) {
        lines.push('*Homework / Upcoming:*');
        pins.forEach(p => lines.push(`• ${p.subject ? `${p.subject}: ` : ''}${p.title}${p.due ? ` (due ${fmtDate(p.due)})` : ''}${p.details ? ` - ${p.details}` : ''}`));
        lines.push('');
      }
      return lines.join('\n').trim() || 'No parent report has been entered for this day yet.';
    };

    renderTasks();
    renderOutput();
  }

  const core = document.createElement('script');
  core.src = '/pathways-lab/app-core.js';
  core.onload = () => {
    installEnhancements();
    if (typeof renderAll === 'function') renderAll();
  };
  document.head.appendChild(core);
})();