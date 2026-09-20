const schoolForm = document.getElementById('school-training-form');
if (schoolForm) {
  const topic = document.getElementById('sf-topic');
  const preparedLink = document.getElementById('school-whatsapp-link');
  const preparedState = document.getElementById('sf-success');
  const invalidatePreparedEnquiry = () => {
    preparedState.hidden = true;
    preparedLink.removeAttribute('href');
  };
  // Changes invalidate the old message so a parent or educator cannot send stale details.
  schoolForm.addEventListener('input', invalidatePreparedEnquiry);
  schoolForm.addEventListener('change', invalidatePreparedEnquiry);
  for (const id of ['school-topic-0', 'school-topic-1', 'school-topic-2']) {
    const route = document.getElementById(id);
    if (route && topic) route.addEventListener('click', () => {
      topic.value = route.dataset.topic;
      invalidatePreparedEnquiry();
      // The native anchor still scrolls to the form; focus supports keyboard users.
      topic.focus({ preventScroll: true });
    });
  }
  schoolForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!schoolForm.reportValidity()) return;
    const value = id => document.getElementById(id).value.trim();
    const message = [
      'Hello CJ, I would like to enquire about school or educator training.',
      `Name: ${value('sf-name')}`,
      `School / centre: ${value('sf-school')}`,
      `Role: ${value('sf-role') || 'Not specified'}`,
      `WhatsApp: ${value('sf-phone')}`,
      ...(topic ? [`Training focus: ${topic.value || 'Help me choose'}`] : []),
      `Training needs: ${value('sf-message') || 'To discuss'}`,
    ].join('\n');
    const link = document.getElementById('school-whatsapp-link');
    link.href = `https://wa.me/601172998168?text=${encodeURIComponent(message)}`;
    document.getElementById('sf-success').hidden = false;
    link.focus();
  });
}
