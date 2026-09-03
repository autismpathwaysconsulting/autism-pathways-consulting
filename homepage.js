const offerSwitcher = document.querySelector("[data-offer-switcher]");

if (offerSwitcher) {
  const tabs = [...offerSwitcher.querySelectorAll("[data-offer-tab]")];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute("aria-controls")));

  function activateOffer(nextTab, moveFocus = false, updateUrl = true) {
    tabs.forEach((tab, index) => {
      const isActive = tab === nextTab;
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
      panels[index].hidden = !isActive;
    });
    const panelId = nextTab.getAttribute("aria-controls");
    if (updateUrl && panelId && window.location.hash !== `#${panelId}`) {
      window.history.pushState(null, "", `#${panelId}`);
    }
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

  const initialTab = tabs.find(tab => `#${tab.getAttribute("aria-controls")}` === window.location.hash)
    || tabs.find(tab => tab.getAttribute("aria-selected") === "true")
    || tabs[0];
  activateOffer(initialTab, false, false);
  window.addEventListener("hashchange", () => {
    const hashTab = tabs.find(tab => `#${tab.getAttribute("aria-controls")}` === window.location.hash);
    if (hashTab) activateOffer(hashTab, false, false);
  });
  offerSwitcher.dataset.enhanced = "true";
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.querySelectorAll("[data-apc-carousel]").forEach(carousel => {
  const tabs = [...carousel.querySelectorAll("[data-carousel-tab]")];
  const slides = tabs.map(tab => document.getElementById(tab.getAttribute("aria-controls"))).filter(Boolean);
  const previous = carousel.querySelector("[data-carousel-prev]");
  const next = carousel.querySelector("[data-carousel-next]");
  const status = carousel.querySelector("[data-carousel-status]");
  const track = carousel.querySelector("[data-carousel-track]");
  let activeIndex = Math.max(0, slides.findIndex(slide => `#${slide.id}` === window.location.hash));

  function activateChoice(nextIndex, moveFocus = false, updateUrl = true) {
    activeIndex = (nextIndex + slides.length) % slides.length;
    tabs.forEach((tab, index) => {
      const isActive = index === activeIndex;
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
      slides[index].hidden = !isActive;
      slides[index].classList.toggle("is-active", isActive);
    });
    if (status) status.textContent = `${activeIndex + 1} / ${slides.length}`;
    if (updateUrl && window.location.hash !== `#${slides[activeIndex].id}`) {
      window.history.pushState(null, "", `#${slides[activeIndex].id}`);
    }
    if (moveFocus) tabs[activeIndex].focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateChoice(index));
    tab.addEventListener("keydown", event => {
      let nextIndex = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = index + 1;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = index - 1;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = slides.length - 1;
      else return;
      event.preventDefault();
      activateChoice(nextIndex, true);
    });
  });

  previous?.addEventListener("click", () => activateChoice(activeIndex - 1, true));
  next?.addEventListener("click", () => activateChoice(activeIndex + 1, true));

  let touchStart = null;
  track?.addEventListener("pointerdown", event => {
    if (event.pointerType === "touch") touchStart = event.clientX;
  });
  track?.addEventListener("pointerup", event => {
    if (touchStart === null || event.pointerType !== "touch") return;
    const distance = event.clientX - touchStart;
    touchStart = null;
    if (Math.abs(distance) < 48) return;
    activateChoice(activeIndex + (distance < 0 ? 1 : -1));
  });

  carousel.classList.add("is-enhanced");
  activateChoice(activeIndex, false, false);
  window.addEventListener("hashchange", () => {
    const hashIndex = slides.findIndex(slide => `#${slide.id}` === window.location.hash);
    if (hashIndex >= 0) activateChoice(hashIndex, false, false);
  });
});

const calInline = document.querySelector("[data-cal-inline]");

if (calInline) {
  ((root, source, namespace) => {
    const enqueue = (api, args) => api.q.push(args);
    const documentRef = root.document;
    root.Cal = root.Cal || function (...args) {
      const api = root.Cal;
      if (!api.loaded) {
        api.ns = {};
        api.q = api.q || [];
        const script = documentRef.createElement("script");
        script.src = source;
        documentRef.head.appendChild(script);
        api.loaded = true;
      }
      if (args[0] === namespace) {
        const scoped = function (...scopedArgs) { enqueue(scoped, scopedArgs); };
        const namespaceName = args[1];
        scoped.q = scoped.q || [];
        if (typeof namespaceName === "string") {
          api.ns[namespaceName] = api.ns[namespaceName] || scoped;
          enqueue(api.ns[namespaceName], args);
          enqueue(api, ["initNamespace", namespaceName]);
        } else {
          enqueue(api, args);
        }
        return;
      }
      enqueue(api, args);
    };
  })(window, "https://app.cal.com/embed/embed.js", "init");

  window.Cal("init", "first-step-call", { origin: "https://cal.com" });
  window.Cal.ns["first-step-call"]("inline", {
    elementOrSelector: calInline,
    config: { layout: "month_view" },
    calLink: "autismpathwaysconsulting/first-step-call",
  });
  window.Cal.ns["first-step-call"]("ui", {
    hideEventTypeDetails: false,
    layout: "month_view",
  });
}

function sectionLabel(target, index) {
  const targetHeading = target.matches?.("h1, h2, h3") ? target.textContent : "";
  const source = target.dataset.sectionLabel
    || targetHeading
    || target.querySelector?.(".eyebrow")?.textContent
    || target.querySelector?.("h1, h2, h3")?.textContent
    || target.getAttribute("aria-label")
    || (target.tagName === "FOOTER" ? "More from APC" : `Section ${index + 1}`);
  const clean = source.replace(/\s+/g, " ").trim();
  return clean.length > 38 ? `${clean.slice(0, 35).trim()}...` : clean;
}

if (document.body.classList.contains("apc-v2") && !document.body.classList.contains("apc-home-page")) {
  const main = document.querySelector("main");
  const footer = document.querySelector("body > footer");
  const targets = main ? [...new Set([
    ...main.querySelectorAll(":scope > header, :scope > section, :scope > article, :scope > .reassurance"),
    ...main.querySelectorAll(":scope > .container > .service-section, :scope > .container > .unsure"),
    ...main.querySelectorAll(":scope > h2, :scope > .week, :scope > .cta-banner"),
    ...(footer ? [footer] : []),
  ])].filter(target => target.getBoundingClientRect().height > 44) : [];

  if (targets.length > 1) {
    const rail = document.createElement("nav");
    rail.className = "section-rail section-rail-sitewide";
    rail.setAttribute("aria-label", "Page sections");
    targets.slice(0, 10).forEach((target, index) => {
      if (!target.id) target.id = `page-section-${index + 1}`;
      const link = document.createElement("a");
      link.href = `#${target.id}`;
      link.dataset.sectionLink = "";
      link.dataset.label = sectionLabel(target, index);
      link.setAttribute("aria-label", link.dataset.label);
      if (index === 0) link.setAttribute("aria-current", "location");
      rail.append(link);
    });
    document.body.append(rail);
  }
}

if (document.body.classList.contains("apc-v2")) {
  const progress = document.createElement("div");
  progress.className = "apc-scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.append(progress);
  let progressFrame = 0;
  const updateProgress = () => {
    progressFrame = 0;
    const available = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = available > 0 ? Math.min(1, Math.max(0, window.scrollY / available)) : 1;
    progress.style.setProperty("--apc-page-progress", ratio);
  };
  const requestProgress = () => {
    if (!progressFrame) progressFrame = requestAnimationFrame(updateProgress);
  };
  updateProgress();
  window.addEventListener("scroll", requestProgress, { passive: true });
  window.addEventListener("resize", requestProgress);
}

if (!reducedMotion) {
  document.querySelectorAll(".apc-v2:not(.apc-home-page) main > :where(header, section, article), .apc-v2:not(.apc-home-page) main > .container > :where(.service-section, .unsure)")
    .forEach(item => item.setAttribute("data-reveal", ""));
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
