const teacherTalkForm = document.getElementById('teacher-talk-form');
if (teacherTalkForm) {
  const preparedLink = document.getElementById('school-whatsapp-link');
  const preparedState = document.getElementById('sf-success');
  const messagePreview = document.getElementById('school-message-preview');
  const copyButton = document.getElementById('school-copy-message');
  const copyStatus = document.getElementById('school-copy-status');
  const validate = () => {
    for (const [id, message] of [['tt-name', 'Enter your name.'], ['tt-country', 'Enter your country.'], ['tt-email', 'Enter your email address.']]) {
      const field = document.getElementById(id);
      field.setCustomValidity(field.value.trim() ? '' : message);
    }
    const educators = document.getElementById('tt-educators');
    const count = Number(educators.value);
    educators.setCustomValidity(educators.value.trim() && Number.isInteger(count) && count >= 1 ? '' : 'Enter how many educators will join, at least 1.');
  };
  // Changes invalidate the old message so an educator cannot send stale details.
  const invalidatePrepared = () => {
    preparedState.hidden = true;
    preparedLink.removeAttribute('href');
    if (messagePreview) messagePreview.value = '';
    if (copyStatus) copyStatus.textContent = '';
  };
  teacherTalkForm.addEventListener('input', () => { validate(); invalidatePrepared(); });
  teacherTalkForm.addEventListener('change', () => { validate(); invalidatePrepared(); });
  if (copyButton && messagePreview) {
    copyButton.hidden = false;
    copyButton.addEventListener('click', async () => {
      const message = messagePreview.value;
      if (!message || preparedState.hidden) return;
      try {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(message);
        if (copyStatus && messagePreview.value === message && !preparedState.hidden) copyStatus.textContent = 'Message copied. Paste it into WhatsApp or your preferred message app.';
      } catch {
        if (messagePreview.value !== message || preparedState.hidden) return;
        messagePreview.focus();
        messagePreview.select();
        if (copyStatus) copyStatus.textContent = 'Select and copy the message above using your device’s copy command.';
      }
    });
  }
  teacherTalkForm.addEventListener('submit', event => {
    event.preventDefault();
    validate();
    if (!teacherTalkForm.reportValidity()) return;
    const value = id => document.getElementById(id).value.trim();
    const message = [
      "Hi CJ, I'd like to join the next Teacher Talk A intake.",
      `Name: ${value('tt-name')}`,
      `Centre or school: ${value('tt-centre') || 'Not specified'}`,
      `Country: ${value('tt-country')}`,
      `Number of educators: ${value('tt-educators')}`,
      `Email: ${value('tt-email')}`,
    ].join('\n');
    preparedLink.href = `https://wa.me/601172998168?text=${encodeURIComponent(message)}`;
    if (messagePreview) messagePreview.value = message;
    if (copyStatus) copyStatus.textContent = '';
    preparedState.hidden = false;
    preparedLink.focus();
  });
}
