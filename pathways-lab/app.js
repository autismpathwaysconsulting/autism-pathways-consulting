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

    function installCalmLayout() {
      if (!document.getElementById('pathwaysCalmUi')) {
        const style = document.createElement('style');
        style.id = 'pathwaysCalmUi';
        style.textContent = `
          .cog-choice{background:#fff!important;transition:background .14s ease,border-color .14s ease,outline-color .14s ease}
          .cog-choice.selected{background:var(--cue-bg)!important}
          #quickNotes{display:block!important}
          .quick-group{margin-top:13px}
          .quick-group:first-child{margin-top:0}
          .quick-group-head{display:flex;align-items:center;gap:7px;margin:0 0 7px;color:#475467;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.045em}
          .quick-group-head:before{content:"";width:9px;height:9px;border-radius:50%;background:var(--group-color,#667085);flex:0 0 auto}
          .quick-group-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
          .quick-group-routine{--group-color:#0f766e}.quick-group-support{--group-color:#b45309}.quick-group-communication{--group-color:#2563eb}.quick-group-other{--group-color:#667085}
          .more-detail{border:0;border-bottom:1px solid var(--line);background:#fbfcfc}
          .more-detail>summary{list-style:none;cursor:pointer;padding:15px 18px;display:flex;justify-content:space-between;align-items:center;gap:14px;font-weight:800;color:#344054}
          .more-detail>summary::-webkit-details-marker{display:none}
          .more-detail>summary:after{content:"+";display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:#eef1f3;color:#475467;font-size:1rem;line-height:1}
          .more-detail[open]>summary:after{content:"−"}
          .more-detail-summary-copy{display:grid;gap:2px}
          .more-detail-summary-copy small{font-size:.72rem;font-weight:500;color:#667085}
          .more-detail-required{font-size:.68rem;font-weight:800;color:#b45309;background:#fff7ed;border-radius:999px;padding:3px 7px;margin-left:6px}
          .more-detail .section{background:#fff}
          .more-detail .section:last-child{border-bottom:0}
          #quickCueHint{margin-top:10px}
          @media(max-width:620px){.quick-group-grid{grid-template-columns:1fr}.more-detail>summary{padding:14px 16px}}
        `;
        document.head.appendChild(style);
      }

      const taskSection = document.getElementById('taskList')?.closest('.section');
      const taskHeading = taskSection?.querySelector('h3');
      if (taskHeading && taskHeading.textContent !== '3. Tasks in this lesson') taskHeading.textContent = '3. Tasks in this lesson';

      if (!document.getElementById('moreDetail')) {
        const participation = document.getElementById('participationChoices')?.closest('.section');
        const support = document.getElementById('supportSection');
        const autonomy = document.getElementById('autonomySection');
        const domains = document.getElementById('domainChoices')?.closest('.section');
        const event = document.getElementById('eventSection');
        if (participation && support && autonomy && domains && event) {
          const details = document.createElement('details');
          details.id = 'moreDetail';
          details.className = 'more-detail';
          const summary = document.createElement('summary');
          summary.innerHTML = '<span class="more-detail-summary-copy"><span>More detail <span id="moreDetailReason" class="more-detail-required hidden"></span></span><small>Participation, support, communication, domains and important events</small></span>';
          details.appendChild(summary);
          participation.parentNode.insertBefore(details, participation);
          [participation, support, autonomy, domains, event].forEach(section => details.appendChild(section));
          const headings = details.querySelectorAll('.section h3');
          const labels = ['Participation', 'Support used', 'Communication / autonomy', 'Pathways domains', 'Important event'];
          headings.forEach((heading, index) => { if (labels[index] && heading.textContent !== labels[index]) heading.textContent = labels[index]; });
        }
      }
    }

    function fixSemanticColors() {
      const quick = document.getElementById('quickNotes');
      quick?.querySelectorAll('.cog-choice').forEach(button => {
        const title = button.querySelector('.cog-copy strong')?.textContent.trim();
        if (title === 'Used visual / notes') {
          button.classList.remove('cog-blue');
          button.classList.add('cog-teal');
        }
      });
      const overview = document.getElementById('overviewChoices');
      overview?.querySelectorAll('.cog-choice').forEach(button => {
        const title = button.querySelector('.cog-copy strong')?.textContent.trim();
        if (title === 'More support') {
          button.classList.remove('cog-blue');
          button.classList.add('cog-amber');
        }
      });
    }

    function groupQuickNotes() {
      const root = document.getElementById('quickNotes');
      if (!root || root.querySelector('.quick-group')) return;
      const buttons = [...root.querySelectorAll(':scope > button.cog-choice')];
      if (!buttons.length) return;
      const groups = [
        { key: 'routine', label: 'Routine / independent', titles: new Set(['Steady participation', 'Worked independently', 'No aide support', 'Used visual / notes']) },
        { key: 'support', label: 'Support', titles: new Set(['Light start support', 'Extra explanation', 'Re-engaged']) },
        { key: 'communication', label: 'Communication', titles: new Set(['Asked teacher']) }
      ];
      const placed = new Set();
      groups.forEach(group => {
        const members = buttons.filter(button => group.titles.has(button.querySelector('.cog-copy strong')?.textContent.trim()));
        if (!members.length) return;
        const wrapper = document.createElement('section');
        wrapper.className = `quick-group quick-group-${group.key}`;
        const heading = document.createElement('div');
        heading.className = 'quick-group-head';
        heading.textContent = group.label;
        const grid = document.createElement('div');
        grid.className = 'quick-group-grid';
        members.forEach(button => { grid.appendChild(button); placed.add(button); });
        wrapper.append(heading, grid);
        root.appendChild(wrapper);
      });
      const unplaced = buttons.filter(button => !placed.has(button));
      if (unplaced.length) {
        const wrapper = document.createElement('section');
        wrapper.className = 'quick-group quick-group-other';
        const heading = document.createElement('div');
        heading.className = 'quick-group-head';
        heading.textContent = 'Other';
        const grid = document.createElement('div');
        grid.className = 'quick-group-grid';
        unplaced.forEach(button => grid.appendChild(button));
        wrapper.append(heading, grid);
        root.appendChild(wrapper);
      }
    }

    function updateCueCopy() {
      const statusHint = document.getElementById('colorCueHint');
      const statusText = 'Colour guide: Teal = routine / independent · Amber = support · Blue = communication · Red = important event · Grey = unclear. Colours are navigation cues, not ratings.';
      if (statusHint && statusHint.textContent !== statusText) statusHint.textContent = statusText;
      const quickHint = document.getElementById('quickCueHint');
      const quickHtml = '<strong>Faster entry:</strong> choose the short cue. The full parent-ready sentence is still inserted into the report.';
      if (quickHint && quickHint.innerHTML !== quickHtml) quickHint.innerHTML = quickHtml;
    }

    function syncMoreDetail() {
      const details = document.getElementById('moreDetail');
      const reason = document.getElementById('moreDetailReason');
      if (!details || !reason || typeof formData === 'undefined' || !formData) return;
      const status = formData.status;
      const labels = {
        support: 'Support selected',
        voice: 'Communication selected',
        event: 'Important selected'
      };
      const needsDetail = status === 'support' || status === 'voice' || status === 'event';
      if (needsDetail) details.open = true;
      if (status === 'routine' || status === 'noAide') details.open = false;
      const nextReason = labels[status] || '';
      if (reason.textContent !== nextReason) reason.textContent = nextReason;
      reason.classList.toggle('hidden', !needsDetail);
    }

    function refreshCalmUi() {
      installCalmLayout();
      fixSemanticColors();
      groupQuickNotes();
      updateCueCopy();
    }

    installCalmLayout();

    const baseRenderSubjectForm = renderSubjectForm;
    renderSubjectForm = function () {
      baseRenderSubjectForm();
      requestAnimationFrame(() => {
        refreshCalmUi();
        syncMoreDetail();
      });
    };

    const statusRoot = document.getElementById('statusChoices');
    statusRoot?.addEventListener('click', () => requestAnimationFrame(() => {
      refreshCalmUi();
      syncMoreDetail();
    }));

    let calmScheduled = false;
    const calmObserver = new MutationObserver(() => {
      if (calmScheduled) return;
      calmScheduled = true;
      requestAnimationFrame(() => {
        calmScheduled = false;
        refreshCalmUi();
      });
    });
    calmObserver.observe(document.getElementById('subjectDialog'), { subtree: true, childList: true });
    calmObserver.observe(document.getElementById('overviewChoices'), { subtree: true, childList: true });

    renderTasks();
    renderOutput();
    requestAnimationFrame(refreshCalmUi);
  }

  const core = document.createElement('script');
  core.src = '/pathways-lab/app-core.js';
  core.onload = () => {
    installEnhancements();
    if (typeof renderAll === 'function') renderAll();
  };
  document.head.appendChild(core);
})();