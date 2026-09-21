const schoolForm = document.getElementById('school-training-form');
if (schoolForm) {
  // Send only fixed action names to the existing aggregate counter. Never pass form values.
  const countAction = event => {
    try {
      if (typeof recordSiteMetric === 'function') recordSiteMetric(event);
    } catch { /* Measurement must never prevent an enquiry. */ }
  };
  const topic = document.getElementById('sf-topic');
  const validateContact = () => {
    for (const [id, message] of [['sf-name', 'Enter your name.'], ['sf-school', 'Enter your school or centre name.']]) {
      const field = document.getElementById(id);
      field.setCustomValidity(field.value.trim() ? '' : message);
    }
    const phone = document.getElementById('sf-phone');
    const text = phone.value.trim();
    const digits = text.replace(/\D/g, '');
    const valid = !text || (/^\+?[0-9\s().-]+$/.test(text) && digits.length >= 7 && digits.length <= 15);
    phone.setCustomValidity(valid ? '' : 'Enter a phone number with 7 to 15 digits. Spaces, +, brackets and hyphens are allowed.');
  };

  const extraDetails = document.getElementById('school-extra-details');
  schoolForm.addEventListener('invalid', event => {
    // Reveal an invalid optional field before the browser moves focus to it.
    if (extraDetails?.contains(event.target)) extraDetails.open = true;
  }, true);
  const preparedLink = document.getElementById('school-whatsapp-link');
  preparedLink.addEventListener('click', () => {
    if (!preparedState.hidden && messagePreview?.value) countAction('school_whatsapp_click');
  });
  const preparedState = document.getElementById('sf-success');
  const messagePreview = document.getElementById('school-message-preview');
  const copyButton = document.getElementById('school-copy-message');
  const copyStatus = document.getElementById('school-copy-status');
  const format = document.getElementById('sf-format');
  const updateChoiceMarkers = () => {
    for (const [prefix, field, key] of [['school-topic', topic, 'topic'], ['school-format', format, 'format']]) {
      for (let i = 0; i < 3; i++) {
        const route = document.getElementById(`${prefix}-${i}`);
        const marker = document.getElementById(`${prefix}-selected-${i}`);
        if (marker) marker.hidden = !field?.value || field.value !== route?.dataset[key];
      }
    }
  };
  const invalidatePreparedEnquiry = () => {
    preparedState.hidden = true;
    preparedLink.removeAttribute('href');
    if (messagePreview) messagePreview.value = '';
    if (copyStatus) copyStatus.textContent = '';
    updateChoiceMarkers();
  };
  // Changes invalidate the old message so a parent or educator cannot send stale details.
  schoolForm.addEventListener('input', () => {
    validateContact();
    invalidatePreparedEnquiry();
  });
  schoolForm.addEventListener('change', () => {
    validateContact();
    invalidatePreparedEnquiry();
  });
  for (const id of ['school-topic-0', 'school-topic-1', 'school-topic-2']) {
    const route = document.getElementById(id);
    if (route && topic) route.addEventListener('click', () => {
      const extra = document.getElementById('school-extra-details');
      if (extra) extra.open = true;
      topic.value = route.dataset.topic;
      invalidatePreparedEnquiry();
      // The native anchor still scrolls to the form; focus supports keyboard users.
      topic.focus({ preventScroll: true });
    });
  }
  for (const id of ['school-format-0', 'school-format-1', 'school-format-2']) {
    const route = document.getElementById(id);
    if (route && format) route.addEventListener('click', () => {
      const extra = document.getElementById('school-extra-details');
      if (extra) extra.open = true;
      format.value = route.dataset.format;
      invalidatePreparedEnquiry();
      format.focus({ preventScroll: true });
    });
  }
  updateChoiceMarkers();
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
  schoolForm.addEventListener('submit', event => {
    event.preventDefault();
    validateContact();
    if (!schoolForm.reportValidity()) return;
    const value = id => document.getElementById(id).value.trim();
    const message = [
      'Hello CJ, I would like to enquire about school or educator training.',
      `Name: ${value('sf-name')}`,
      `School / centre: ${value('sf-school')}`,
      `Role: ${value('sf-role') || 'Not specified'}`,
      ...(value('sf-phone') ? [`Alternative contact number: ${value('sf-phone')}`] : []),
      ...(topic ? [`Training focus: ${topic.value || 'Help me choose'}`] : []),
      ...(format ? [`Preferred format: ${format.value || 'Help me choose'}`] : []),
      ...(document.getElementById('sf-team-size') ? [`Team size: ${value('sf-team-size') || 'To discuss'}`] : []),
      `Training needs: ${value('sf-message') || 'To discuss'}`,
    ].join('\n');
    const link = document.getElementById('school-whatsapp-link');
    link.href = `https://wa.me/601172998168?text=${encodeURIComponent(message)}`;
    if (messagePreview) messagePreview.value = message;
    if (copyStatus) copyStatus.textContent = '';
    document.getElementById('sf-success').hidden = false;
    link.focus();
    countAction('school_enquiry_prepared');
  });
}
