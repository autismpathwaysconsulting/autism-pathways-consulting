// Native disclosure navigation works without JavaScript. Enhance dismissal only.
const dropdowns = [...document.querySelectorAll('.apc-nav-dropdown')];
function closeDropdown(dropdown, restoreFocus = false) {
  dropdown.open = false;
  if (restoreFocus) dropdown.querySelector('summary')?.focus();
}
for (const dropdown of dropdowns) {
  dropdown.addEventListener('toggle', () => {
    if (dropdown.open) dropdowns.forEach(other => {
      if (other !== dropdown) closeDropdown(other);
    });
  });
  dropdown.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dropdown.open) {
      event.preventDefault();
      closeDropdown(dropdown, true);
    }
  });
  dropdown.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!dropdown.contains(document.activeElement)) closeDropdown(dropdown);
    }, 0);
  });
  dropdown.addEventListener('click', event => {
    if (event.target.closest('a')) closeDropdown(dropdown);
  });
}
document.addEventListener('click', event => {
  dropdowns.forEach(dropdown => {
    if (!dropdown.contains(event.target)) closeDropdown(dropdown);
  });
});
// Keep the shared information architecture consistent on older static pages.
for (const link of document.querySelectorAll('.apc-shell-nav a, .apc-footer-column a')) {
  const target = new URL(link.href, window.location.href);
  const path = target.pathname.replace(/\/$/, '') || '/';
  const label = link.textContent.trim();
  if (target.origin === window.location.origin && path === '/services') {
    if (label === 'Parent sessions & programmes' || label === 'Services') link.textContent = 'Learning & Workshops';
    if (label === 'Parent Home Support Options') {
      link.href = '/parents';
      link.textContent = 'Parent Home Support';
    }
  }
}

// Match both origin and path: APC Calm must not appear current on the home page.
const currentURL = new URL(window.location.href);
for (const link of document.querySelectorAll('.apc-shell-nav a')) {
  const targetURL = new URL(link.href, currentURL);
  const path = url => url.pathname.replace(/\/$/, '') || '/';
  if (targetURL.origin === currentURL.origin && path(targetURL) === path(currentURL)) {
    link.setAttribute('aria-current', 'page');
  } else {
    link.removeAttribute('aria-current');
  }
}
