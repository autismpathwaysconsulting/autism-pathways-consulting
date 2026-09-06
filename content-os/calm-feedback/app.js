const endpoint = "/api/content-os/calm-feedback";
const statuses = ["NEW", "REVIEWED", "ACTION_NEEDED", "IMPLEMENTED", "ARCHIVED"];
const labels = {
  NEW: "New",
  REVIEWED: "Reviewed",
  ACTION_NEEDED: "Action needed",
  IMPLEMENTED: "Implemented",
  ARCHIVED: "Archived",
};
const state = { data: null, filter: "ALL", saving: null };

const element = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;",
})[character]);

function toast(message) {
  element("toast").textContent = message;
  element("toast").hidden = false;
  clearTimeout(toast.handle);
  toast.handle = setTimeout(() => { element("toast").hidden = true; }, 2600);
}

function setStatus(title, detail, status = "") {
  element("inboxStatus").textContent = title;
  element("inboxStatus").className = `sync-status ${status}`.trim();
  element("inboxDetail").textContent = detail;
}

function readable(value) {
  return String(value || "Not supplied").replaceAll("-", " ");
}

function renderMetrics() {
  element("feedbackMetrics").innerHTML = statuses.map((status) => `
    <article class="metric-card"><strong class="metric-value">${Number(state.data.counts?.[status] || 0)}</strong><span>${labels[status]}</span></article>
  `).join("");
}

function feedbackCard(item) {
  const options = statuses.map((status) => `<option value="${status}"${item.status === status ? " selected" : ""}>${labels[status]}</option>`).join("");
  return `
    <article class="card operator-card" data-feedback-card="${escapeHtml(item.id)}">
      <div class="card-heading">
        <div><p class="card-label">${escapeHtml(labels[item.status])}</p><h3>${escapeHtml(readable(item.category))}</h3></div>
        <time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(new Date(item.createdAt).toLocaleString("en-MY"))}</time>
      </div>
      <dl class="operator-facts">
        <div><dt>Helpful?</dt><dd>${escapeHtml(readable(item.helpfulness))}</dd></div>
        <div><dt>App version</dt><dd>${escapeHtml(item.appVersion)}</dd></div>
        <div><dt>Reference</dt><dd><code>${escapeHtml(item.id)}</code></dd></div>
      </dl>
      <div class="feedback-comment"><strong>Optional comment</strong><p>${item.comment ? escapeHtml(item.comment) : "No comment supplied."}</p></div>
      <form class="triage-form" data-feedback-id="${escapeHtml(item.id)}" data-revision="${Number(item.revision || 0)}">
        <label>Status<select name="status">${options}</select></label>
        <label class="grow">Decision or follow-up note<textarea name="decisionNote" rows="2" maxlength="2000">${escapeHtml(item.decisionNote)}</textarea></label>
        <button class="button compact" type="submit"${state.saving === item.id ? " disabled" : ""}>${state.saving === item.id ? "Saving…" : "Save decision"}</button>
      </form>
    </article>`;
}

function render() {
  if (!state.data) return;
  renderMetrics();
  const items = state.filter === "ALL" ? state.data.items : state.data.items.filter((item) => item.status === state.filter);
  element("feedbackList").innerHTML = items.length ? items.map(feedbackCard).join("") : `<div class="card empty-state"><h3>No feedback in this view</h3><p>Choose another status or refresh the inbox.</p></div>`;
}

async function loadFeedback() {
  setStatus("Checking feedback", "Reading the protected Calm database.", "saving");
  try {
    const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Feedback unavailable");
    state.data = result;
    render();
    const newCount = Number(result.counts?.NEW || 0);
    setStatus(newCount ? `${newCount} item${newCount === 1 ? "" : "s"} need review` : "Feedback is up to date", `${result.items.length} responses available in the protected inbox.`);
  } catch (error) {
    setStatus("Feedback unavailable", "The inbox could not reach its protected storage. Refresh before making decisions.", "error");
    element("feedbackList").innerHTML = `<div class="card empty-state"><h3>Could not load feedback</h3><p>No review status was changed.</p></div>`;
  }
}

element("refreshFeedback").addEventListener("click", loadFeedback);
element("feedbackFilter").addEventListener("change", (event) => {
  state.filter = event.target.value;
  render();
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest(".triage-form");
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  const feedbackId = form.dataset.feedbackId;
  state.saving = feedbackId;
  render();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-APC-Content-OS": "1" },
      body: JSON.stringify({
        action: "set_triage",
        feedbackId,
        status: String(formData.get("status") || ""),
        decisionNote: String(formData.get("decisionNote") || ""),
        expectedRevision: Number(form.dataset.revision || 0),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Decision not saved");
    state.data = result;
    toast("Feedback decision saved to history.");
    setStatus("Decision saved", "The inbox and append-only review history are current.");
  } catch (error) {
    toast(error.message || "The decision could not be saved.");
    await loadFeedback();
  } finally {
    state.saving = null;
    render();
  }
});

loadFeedback();
