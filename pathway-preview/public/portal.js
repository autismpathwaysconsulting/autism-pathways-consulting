(async function () {
  "use strict";
  let data = window.APC_PORTAL_DATA;
  const main = document.getElementById("portal-main");
  const toast = document.getElementById("toast");
  try {
    const response = await fetch("/api/portal", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("portal unavailable");
    const stored = await response.json();
    data = { ...data, profile: { ...data.profile, ...stored.profile }, journals: stored.journals };
  } catch {
    main.innerHTML = '<section class="recovery-card" role="alert"><p class="eyebrow">PREVIEW CONNECTION</p><h1>We could not load your synthetic pathway.</h1><p>Your browser did not replace the page with cached client data. Check the connection, then try again.</p><button class="primary-button" type="button" data-retry>Try again</button></section>';
    document.querySelector("[data-retry]").addEventListener("click", () => window.location.reload());
    return;
  }
  const state = {
    view: "today", filter: "All", query: "", saved: new Set(), checkIn: {},
    booking: data.profile.nextSession, journals: [...data.journals]
  };
  const icons = { report: "▤", form: "✓", log: "◌", history: "↺", journal: "✦" };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const formatJournalDate = (entry) => {
    const date = new Date(`${entry.date}T00:00:00`);
    return `${date.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}${entry.time ? ` · ${entry.time}` : ""}`;
  };
  const localDateValue = () => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  };

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function resourceCard(resource) {
    return `<article class="resource-card">
      <div class="resource-meta"><span>${escapeHtml(resource.type)}</span><small>${resource.time}</small></div>
      <h3>${escapeHtml(resource.title)}</h3><p>${escapeHtml(resource.description)}</p>
      <div class="card-actions"><button type="button" class="text-button">Open</button><button type="button" class="save-button" data-save="${resource.id}" aria-pressed="${state.saved.has(resource.id)}">${state.saved.has(resource.id) ? "Saved" : "Save"}</button></div>
    </article>`;
  }

  function visibleResources() {
    const query = state.query.toLowerCase();
    return data.resources.filter((resource) =>
      (state.filter === "All" || (state.filter === "Assigned to me" ? resource.assigned : resource.type === state.filter)) &&
      `${resource.title} ${resource.description} ${resource.type}`.toLowerCase().includes(query)
    );
  }

  function quickActions() {
    const bookingAssigned = data.profile.bookingEnabled && /^https:\/\/cal\.com\//.test(data.profile.privateBookingUrl || "");
    return `<div class="quick-actions" aria-label="Quick actions">
      <button type="button" data-open-journal><span>＋</span><small>Journal</small></button>
      <button type="button" data-open-booking ${bookingAssigned ? "" : "disabled"}><span>◷</span><small>${bookingAssigned ? "Book" : "Booking locked"}</small></button>
      <button type="button" data-secure-upload><span>↗</span><small>Upload</small></button>
      <button type="button" data-share-kind="report"><span>▤</span><small>Notify CJ</small></button>
    </div>`;
  }

  function todayView() {
    const assigned = data.resources.filter((resource) => resource.assigned).slice(0, 2);
    const newItems = data.stages.flatMap((stage) => stage.items.map((item) => ({ ...item, stage: stage.title }))).filter((item) => item.state === "new" || item.state === "to-do");
    return `<section class="dashboard-head"><div><p class="eyebrow">HELLO, ${escapeHtml(data.profile.firstName).toUpperCase()}</p><h1>${escapeHtml(data.plan.focus)}</h1></div><div class="sync-state"><span aria-hidden="true">✓</span><small>Updated ${escapeHtml(data.profile.lastSynced)}</small></div></section>
      ${quickActions()}
      <div class="dashboard-grid">
        <section class="focus-card"><div class="card-topline"><p class="eyebrow">CURRENT PLAN</p><span>Stage ${data.profile.stage}/${data.stages.length}</span></div><div class="plan-grid"><article><span>1</span><h3>Try</h3><p>${escapeHtml(data.plan.tryNow)}</p></article><article><span>2</span><h3>Notice</h3><p>${escapeHtml(data.plan.notice)}</p></article><article><span>3</span><h3>If it gets hard</h3><p>${escapeHtml(data.plan.fallback)}</p></article></div></section>
        <aside class="attention-card"><p class="eyebrow">READY FOR YOU</p>${newItems.map((item) => `<button type="button" data-view-jump="pathway"><span class="artifact-icon">${icons[item.type.toLowerCase()] || "•"}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.stage)}</small></span><b>${item.state === "new" ? "New" : "To do"}</b></button>`).join("") || "<p>Nothing waiting.</p>"}</aside>
      </div>
      <section class="section-heading"><div><p class="eyebrow">CHOSEN FOR YOU</p><h2>Resources</h2></div><button class="text-button" type="button" data-view-jump="resources">View all →</button></section><div class="resource-grid compact-resources">${assigned.map(resourceCard).join("")}</div>`;
  }

  function artifactCard(item) {
    const type = item.type.toLowerCase();
    return `<button type="button" class="artifact-card"><span class="artifact-icon">${icons[type] || "•"}</span><span><small>${escapeHtml(item.type)} · ${escapeHtml(item.date)}</small><strong>${escapeHtml(item.title)}</strong></span>${item.state === "new" || item.state === "to-do" ? `<b>${item.state === "new" ? "New" : "To do"}</b>` : ""}<i aria-hidden="true">›</i></button>`;
  }

  function pathwayView() {
    return `<section class="page-heading compact-heading"><p class="eyebrow">MY PATHWAY</p><h1>Plans, reports and history - by stage.</h1></section><ol class="pathway-list">${data.stages.map((stage, index) => {
      const isCurrent = stage.status === "current";
      return `<li class="${stage.status}"><details ${isCurrent ? "open" : ""}><summary><span class="stage-number">${stage.status === "complete" ? "✓" : index + 1}</span><span><small>${isCurrent ? "CURRENT STAGE" : `STAGE ${index + 1}`}</small><strong>${escapeHtml(stage.title)}</strong></span><em>${stage.items.length ? `${stage.items.length} items` : "Not started"}</em><i aria-hidden="true">⌄</i></summary><div class="stage-drawer"><p>${escapeHtml(stage.summary)}</p>${stage.items.length ? `<div class="artifact-list">${stage.items.map(artifactCard).join("")}</div>` : ""}</div></details></li>`;
    }).join("")}</ol>`;
  }

  function resourcesView() {
    const types = ["All", "Assigned to me", ...new Set(data.resources.map((item) => item.type))];
    const visible = visibleResources();
    return `<section class="page-heading compact-heading"><p class="eyebrow">RESOURCE LIBRARY</p><h1>Find what helps.</h1></section><div class="resource-tools"><label>Search<input type="search" data-resource-search value="${escapeHtml(state.query)}" placeholder="Visual, transition, regulation…"></label><div class="filter-row" aria-label="Filter resources">${types.map((type) => `<button type="button" data-filter="${escapeHtml(type)}" aria-pressed="${type === state.filter}">${escapeHtml(type)}</button>`).join("")}</div></div><p class="result-count">${visible.length} resource${visible.length === 1 ? "" : "s"}</p><div class="resource-grid">${visible.map(resourceCard).join("") || "<p>No resources match that search.</p>"}</div>`;
  }

  function journalCard(entry) {
    return `<article class="journal-entry"><div class="journal-date"><span>${icons.journal}</span><small>${escapeHtml(formatJournalDate(entry))}</small></div><h3>${escapeHtml(entry.title || "Journal entry")}</h3><p>${escapeHtml(entry.entry)}</p><button type="button" class="text-button" data-share-journal="${entry.id}">Notify CJ via WhatsApp ↗</button></article>`;
  }

  function progressView() {
    const group = (name, label, options) => `<fieldset><legend>${label}</legend><div class="choice-grid">${options.map((option) => `<button type="button" data-checkin="${name}" data-value="${option}" aria-pressed="${state.checkIn[name] === option}">${option}</button>`).join("")}</div></fieldset>`;
    return `<section class="page-heading compact-heading with-action"><div><p class="eyebrow">JOURNAL</p><h1>Notice, then move on.</h1></div><button class="primary-button" type="button" data-open-journal>＋ Add entry</button></section><div class="journal-layout"><section class="checkin-card"><h2>Quick check-in</h2>${group("response", "What changed?", data.checkInOptions.response)}${group("sustainability", "How did it feel to use?", data.checkInOptions.sustainability)}${group("next", "What next?", data.checkInOptions.next)}</section><section class="journal-history"><div class="card-topline"><h2>Entries</h2><span>${state.journals.length}</span></div>${state.journals.map(journalCard).join("") || "<div class=\"empty-state\">No entries yet.</div>"}</section></div>`;
  }

  function sessionView() {
    const bookingAssigned = data.profile.bookingEnabled && /^https:\/\/cal\.com\//.test(data.profile.privateBookingUrl || "");
    const sessionContent = state.booking ? `<section class="session-card booked"><div class="calendar-tile"><strong>${escapeHtml(state.booking.date || "10")}</strong><span>${escapeHtml(state.booking.month || "SEP")}</span></div><div><small>BOOKED</small><h2>${escapeHtml(state.booking.label || state.booking)}</h2><p>Follow-up session · ${escapeHtml(data.profile.pathway)}</p></div></section>` : bookingAssigned ? `<section class="session-card"><div class="calendar-visual"><span>◷</span></div><div><small>PRIVATE FOLLOW-UP LINK</small><h2>Your next session is ready to schedule</h2><p>${escapeHtml(data.profile.pathway)} · assigned by CJ</p></div><a class="primary-button" href="${escapeHtml(data.profile.privateBookingUrl)}" target="_blank" rel="noopener noreferrer">Open private Cal.com link</a></section>` : `<section class="session-card"><div class="calendar-visual"><span>◷</span></div><div><small>FOLLOW-UP NOT YET ASSIGNED</small><h2>CJ will let you know when booking is ready</h2><p>No calendar or paid booking route is available from this account.</p></div></section>`;
    return `<section class="page-heading compact-heading"><p class="eyebrow">SESSIONS</p><h1>Your booking.</h1></section>${sessionContent}<div class="mini-history"><span>✓</span><div><strong>Previous session</strong><small>5 September · Completed</small></div><button type="button" data-view-jump="pathway">View stage</button></div>`;
  }

  function openBooking() {
    const url = data.profile.privateBookingUrl || "";
    if (!data.profile.bookingEnabled || !/^https:\/\/cal\.com\//.test(url)) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function whatsappUrl(message) {
    const number = String(data.profile.whatsappNumber || "").replace(/\D/g, "");
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  }

  function openWhatsApp(message) {
    window.open(whatsappUrl(message), "_blank", "noopener,noreferrer");
  }

  const views = { today: todayView, pathway: pathwayView, resources: resourcesView, progress: progressView, session: sessionView };
  function render() {
    main.innerHTML = views[state.view]();
    document.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-current", String(button.dataset.view === state.view ? "page" : "false")));
  }

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    const nextView = target.dataset.view || target.dataset.viewJump;
    if (nextView) { state.view = nextView; render(); main.focus(); }
    if (target.dataset.filter) { state.filter = target.dataset.filter; render(); }
    if (target.dataset.save) { state.saved.has(target.dataset.save) ? state.saved.delete(target.dataset.save) : state.saved.add(target.dataset.save); render(); }
    if (target.dataset.checkin) { state.checkIn[target.dataset.checkin] = target.dataset.value; render(); }
    if (target.hasAttribute("data-open-booking")) openBooking();
    if (target.hasAttribute("data-open-journal")) {
      const dateInput = document.querySelector('#journal-form input[name="date"]');
      dateInput.value = localDateValue();
      document.getElementById("journal-dialog").showModal();
    }
    if (target.hasAttribute("data-secure-upload")) document.getElementById("upload-dialog").showModal();
    if (target.dataset.shareKind === "report") openWhatsApp("I have a report to discuss for my APC pathway. Please review it with me through the approved channel.");
    if (target.dataset.shareJournal) {
      const entry = state.journals.find((item) => item.id === target.dataset.shareJournal);
      if (entry) openWhatsApp("I added a journal update in my private APC portal for review.");
    }
    if (target.hasAttribute("data-privacy")) document.getElementById("privacy-dialog").showModal();
    if (target.hasAttribute("data-close-dialog")) target.closest("dialog").close();
    if (target.hasAttribute("data-logout")) {
      target.disabled = true;
      try { await fetch("/api/session/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } finally { window.location.assign("/login"); }
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-resource-search]")) {
      state.query = event.target.value;
      const cards = visibleResources();
      document.querySelector(".result-count").textContent = `${cards.length} resource${cards.length === 1 ? "" : "s"}`;
      document.querySelector(".resource-grid").innerHTML = cards.map(resourceCard).join("") || "<p>No resources match that search.</p>";
    }
  });
  document.getElementById("journal-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const submit = event.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    let entry;
    try {
      const response = await fetch("/api/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.get("date"), time: form.get("time"), title: form.get("title"), entry: form.get("entry") }),
      });
      if (!response.ok) throw new Error("save failed");
      entry = await response.json();
    } catch {
      submit.disabled = false;
      showToast("The entry was not saved. Please try again.");
      return;
    }
    state.journals.unshift(entry);
    event.target.reset();
    document.getElementById("journal-dialog").close();
    state.view = "progress";
    render();
    showToast("Journal entry added.");
  });
  render();
})();
