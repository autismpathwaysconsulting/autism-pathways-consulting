// Instant pattern summary form on the Quick Check thank-you page. Shown only when /api/pattern-summary says it is open.
(() => {
  const box = document.getElementById('pattern-tool');
  if (!box) return;
  const form = document.getElementById('pattern-form');
  const button = document.getElementById('ps-submit');
  const status = document.getElementById('ps-status');
  const result = document.getElementById('ps-result');
  const crisis = document.getElementById('ps-crisis');
  const $ = id => document.getElementById(id);
  let token = '', widget = null, busy = false;

  const loadCheck = sitekey => {
    const render = () => {
      widget = window.turnstile.render('#ps-security', {
        sitekey, action: 'pattern-summary',
        callback: v => { token = v; },
        'expired-callback': () => { token = ''; },
        'error-callback': () => { token = ''; },
      });
    };
    if (window.turnstile?.render) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = render;
    document.head.append(s);
  };

  fetch('/api/pattern-summary', {credentials: 'same-origin'})
    .then(r => (r.ok ? r.json() : null))
    .then(c => { if (c?.enabled && c.sitekey) { box.hidden = false; loadCheck(c.sitekey); } })
    .catch(() => {});

  const showInvite = text => {
    const el = $('ps-invite');
    el.textContent = '';
    const i = text.indexOf('https://');
    if (i < 0) { el.textContent = text; return; }
    el.append(text.slice(0, i).replace(/[:\s]+$/, '') + '. ');
    const a = document.createElement('a');
    a.href = '/go/first-step-call';
    a.textContent = 'Book a free 15-minute call';
    el.append(a);
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    if ($('ps-during').value.trim().length < 5) { status.textContent = 'Please describe what happened during the moment.'; $('ps-during').focus(); return; }
    if (!$('ps-consent').checked) { status.textContent = 'Please tick the box to continue.'; $('ps-consent').focus(); return; }
    if (!token) { status.textContent = 'Please wait a moment for the security check, then try again.'; return; }
    busy = true; button.disabled = true; status.textContent = 'Writing your summary. This can take up to 20 seconds.';
    try {
      const res = await fetch('/api/pattern-summary', {
        method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({before: $('ps-before').value, during: $('ps-during').value, after: $('ps-after').value, age: $('ps-age').value, consent: true, token}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { status.textContent = data.error || 'Something went wrong. Please try again.'; return; }
      status.textContent = '';
      if (data.kind === 'crisis') {
        result.hidden = true;
        crisis.textContent = data.text;
        crisis.hidden = false;
        crisis.focus();
        return;
      }
      crisis.hidden = true;
      $('ps-pattern').textContent = data.pattern;
      $('ps-try').textContent = data.try;
      $('ps-notice').textContent = data.notice;
      showInvite(data.invite || '');
      $('ps-label').textContent = data.label;
      result.hidden = false;
      result.focus();
    } catch {
      status.textContent = 'We could not reach the server. Please check your connection and try again.';
    } finally {
      busy = false; button.disabled = false; token = '';
      try { if (widget !== null) window.turnstile.reset(widget); } catch {}
    }
  });
})();
