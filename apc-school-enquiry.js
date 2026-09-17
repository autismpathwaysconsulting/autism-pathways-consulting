const schoolForm = document.getElementById('school-training-form');
if (schoolForm) {
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
      `Training needs: ${value('sf-message') || 'To discuss'}`,
    ].join('\n');
    const link = document.getElementById('school-whatsapp-link');
    link.href = `https://wa.me/601172998168?text=${encodeURIComponent(message)}`;
    document.getElementById('sf-success').hidden = false;
    link.focus();
  });
}
