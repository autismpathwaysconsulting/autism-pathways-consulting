const offerSwitcher = document.querySelector("[data-offer-switcher]");

if (offerSwitcher) {
  const tabs = [...offerSwitcher.querySelectorAll("[data-offer-tab]")];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute("aria-controls")));

  function activateOffer(nextTab, moveFocus = false) {
    tabs.forEach((tab, index) => {
      const isActive = tab === nextTab;
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
      panels[index].hidden = !isActive;
    });
    if (moveFocus) nextTab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateOffer(tab));
    tab.addEventListener("keydown", event => {
      let nextIndex = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      activateOffer(tabs[nextIndex], true);
    });
  });

  activateOffer(tabs.find(tab => tab.getAttribute("aria-selected") === "true") || tabs[0]);
  offerSwitcher.dataset.enhanced = "true";
}

const sectionLinks = [...document.querySelectorAll("[data-section-link]")];
const sections = sectionLinks
  .map(link => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

function markCurrentSection(section) {
  sectionLinks.forEach(link => {
    const isCurrent = link.getAttribute("href") === `#${section.id}`;
    if (isCurrent) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}

if (sectionLinks.length && sections.length && "IntersectionObserver" in window) {
  const visibleSections = new Map();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) visibleSections.set(entry.target, entry.intersectionRatio);
      else visibleSections.delete(entry.target);
    });
    const current = [...visibleSections.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    if (current) markCurrentSection(current);
  }, {
    rootMargin: "-18% 0px -54% 0px",
    threshold: [0, 0.15, 0.3, 0.5],
  });
  sections.forEach(section => observer.observe(section));
}

const revealItems = [...document.querySelectorAll("[data-reveal]")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (revealItems.length && !reducedMotion && "IntersectionObserver" in window) {
  document.documentElement.classList.add("apc-motion-ready");
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, {
    rootMargin: "0px 0px -12% 0px",
    threshold: 0.16,
  });

  revealItems.forEach(item => revealObserver.observe(item));
}
