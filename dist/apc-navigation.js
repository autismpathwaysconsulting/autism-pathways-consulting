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
// Phone menu: the button only appears once this script runs, so the nav stays visible without it.
const header = typeof document.querySelector === 'function' ? document.querySelector('.apc-site-header') : null;
const navToggle = header?.querySelector('.apc-nav-toggle');
const primaryNav = header?.querySelector('#apc-primary-nav');
if (header && navToggle && primaryNav) {
  header.classList.add('apc-nav-js');
  const setMenu = open => {
    primaryNav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  };
  const menuOpen = () => navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.addEventListener('click', () => setMenu(!menuOpen()));
  primaryNav.addEventListener('click', event => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && menuOpen()) {
      setMenu(false);
      navToggle.focus();
    }
  });
  document.addEventListener('click', event => {
    if (menuOpen() && !primaryNav.contains(event.target) && !navToggle.contains(event.target)) setMenu(false);
  });
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
