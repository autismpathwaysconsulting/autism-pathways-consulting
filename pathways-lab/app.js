(() => {
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve(src);
      script.onerror = () => reject(new Error(`Pathways Lab failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  function installCalmEnhancements() {
    if (typeof renderSubjectForm !== 'function') return;

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
          headings.forEach((heading, index) => {
            if (labels[index] && heading.textContent !== labels[index]) heading.textContent = labels[index];
          });
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
        { key: 'communication', label: 'Communication', titles: new Set(['Asked teacher']) },
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
        members.forEach(button => {
          grid.appendChild(button);
          placed.add(button);
        });
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
      const labels = {
        support: 'Support selected',
        voice: 'Communication selected',
        event: 'Important selected',
      };
      const needsDetail = ['support', 'voice', 'event'].includes(formData.status);
      if (needsDetail) details.open = true;
      if (formData.status === 'routine' || formData.status === 'noAide') details.open = false;
      const nextReason = labels[formData.status] || '';
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
    const subjectDialog = document.getElementById('subjectDialog');
    const overviewChoices = document.getElementById('overviewChoices');
    if (subjectDialog) calmObserver.observe(subjectDialog, { subtree: true, childList: true });
    if (overviewChoices) calmObserver.observe(overviewChoices, { subtree: true, childList: true });

    requestAnimationFrame(refreshCalmUi);
  }

  async function bootstrap() {
    await loadScript('/pathways-lab/app-core.js');
    await loadScript('/pathways-lab/model.js');
    if (!globalThis.PathwaysModel) throw new Error('Pathways Lab model did not initialize');
    await loadScript('/pathways-lab/app-fixes.js');
    installCalmEnhancements();
    if (typeof renderAll === 'function') renderAll();
  }

  bootstrap().catch(error => {
    console.error('Pathways Lab bootstrap failed', error);
  });
})();
