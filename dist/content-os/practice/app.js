const endpoint = "/api/content-os/practice";
const state = { data: null, activeCaseId: null, activeSessionId: null, saving: false, clientFilter: "ALL", clientSearch: "" };
const element = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;",
})[character]);
const lines = (value) => String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const listText = (value) => Array.isArray(value) ? value.join("\n") : "";
const activeClient = () => state.data?.clients.find((client) => client.caseId === state.activeCaseId) || null;
const activeSession = () => state.data?.sessions.find((session) => session.sessionId === state.activeSessionId) || null;
const defaultRM1800Journey = [
  { code: "PRE_SESSION_1", order: 1, label: "Pre-session 1" },
  { code: "SESSION_1", order: 2, label: "Session 1" },
  { code: "SESSION_2", order: 3, label: "Session 2" },
  { code: "SESSION_3", order: 4, label: "Session 3" },
  { code: "SESSION_4", order: 5, label: "Session 4" },
  { code: "POST_SESSION_4", order: 6, label: "Post-session 4" },
];
const defaultJourneyTemplates = {
  RM350: [
    { code: "PRE_SESSION_1", order: 1, label: "Pre-session" },
    { code: "SESSION_1", order: 2, label: "Session 1" },
    { code: "POST_SESSION_1", order: 3, label: "Post-session" },
  ],
  RM1800: defaultRM1800Journey,
};
const allJourneyStages = () => state.data?.journeyStages || [...defaultRM1800Journey, defaultJourneyTemplates.RM350[2]];
const journeyStagesForClient = (client) => state.data?.journeyTemplates?.[client?.serviceCode] || defaultJourneyTemplates[client?.serviceCode] || [];
const journeyStage = (code, number = null) => allJourneyStages().find((stage) => stage.code === code || (code == null && stage.order === number));
const journeyLabel = (session) => journeyStage(session?.journeyStage, session?.sessionNumber)?.label || "Journey stage";
const stageComplete = (session) => Boolean(session) && (["DELIVERED", "COMPLETE"].includes(session.status) || session.documentStatus === "DELIVERED");
const sessionsForClient = (caseId) => state.data.sessions.filter((session) => session.caseId === caseId).sort((a, b) => a.sessionNumber - b.sessionNumber);
const NEW_STAGES = new Set(["RECORD_REVIEW_REQUIRED", "FIT_REVIEW", "APPROVED_TO_PAY", "PAYMENT_PROOF_RECEIVED", "PAYMENT_VERIFIED"]);
const FINISHED_STAGES = new Set(["COMPLETE", "REFERRED", "CANCELLED"]);
const clientLane = (client) => client.archivedAt || FINISHED_STAGES.has(client.stage) ? "FINISHED" : NEW_STAGES.has(client.stage) ? "NEW" : "ACTIVE";
const utcDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) ? time : null;
};
function operationalSummary(sessions) {
  const todayText = new Date().toISOString().slice(0, 10);
  const today = utcDay(todayText);
  const incomplete = sessions.filter((session) => !stageComplete(session) && session.status !== "CANCELLED");
  const upcoming = incomplete.filter((session) => utcDay(session.scheduledAt) !== null && utcDay(session.scheduledAt) >= today)
    .sort((left, right) => String(left.scheduledAt).localeCompare(String(right.scheduledAt)))[0];
  const overdue = incomplete.filter((session) => utcDay(session.scheduledAt) !== null && utcDay(session.scheduledAt) < today)
    .sort((left, right) => String(right.scheduledAt).localeCompare(String(left.scheduledAt)))[0];
  const completed = sessions.filter((session) => utcDay(session.occurredAt) !== null && utcDay(session.occurredAt) <= today)
    .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)))[0];
  const latestDocument = sessions.slice().sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0];
  const daysSince = completed ? Math.max(0, Math.floor((today - utcDay(completed.occurredAt)) / 86400000)) : null;
  const overdueDays = overdue ? Math.max(1, Math.floor((today - utcDay(overdue.scheduledAt)) / 86400000)) : null;
  return {
    appointment: upcoming?.scheduledAt || "Not scheduled",
    lastSession: daysSince === null ? "Not recorded" : daysSince + " day" + (daysSince === 1 ? "" : "s") + " ago",
    document: latestDocument?.documentStatus?.replaceAll("_", " ") || "No document",
    timing: overdueDays === null ? "On track" : "Overdue by " + overdueDays + " day" + (overdueDays === 1 ? "" : "s") + ". Choose pause, extend or close.",
  };
}

function toast(message) {
  element("toast").textContent = message;
  element("toast").hidden = false;
  clearTimeout(toast.handle);
  toast.handle = setTimeout(() => { element("toast").hidden = true; }, 2800);
}

function setStatus(title, detail, status = "") {
  element("practiceStatus").textContent = title;
  element("practiceStatus").className = `sync-status ${status}`.trim();
  element("practiceDetail").textContent = detail;
}

async function api(payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-APC-Content-OS": "1" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The update could not be saved.");
  return result;
}

function clientPayload(form) {
  const data = new FormData(form);
  return {
    displayName: String(data.get("displayName") || ""),
    childAge: String(data.get("childAge") || "").trim() ? Number(data.get("childAge")) : null,
    region: String(data.get("region") || ""),
    concern: String(data.get("concern") || ""),
    stage: String(data.get("stage") || ""),
    serviceCode: String(data.get("serviceCode") || ""),
    nextAction: String(data.get("nextAction") || ""),
    sourceStatus: String(data.get("sourceStatus") || ""),
    knownFacts: lines(data.get("knownFacts")),
    openQuestions: lines(data.get("openQuestions")),
    boundaryFlags: lines(data.get("boundaryFlags")),
  };
}

function renderMetrics() {
  const clients = state.data.clients;
  const newClients = clients.filter((client) => clientLane(client) === "NEW").length;
  const activeClients = clients.filter((client) => clientLane(client) === "ACTIVE").length;
  const finishedClients = clients.filter((client) => clientLane(client) === "FINISHED").length;
  const parentPacks = state.data.sessions.filter((session) => ["CJ_APPROVED", "EXPORTED"].includes(session.documentStatus)).length;
  const queued = state.data.exports.filter((item) => item.destination === "GOOGLE_DRIVE" && item.status === "QUEUED").length;
  element("practiceMetrics").innerHTML = [
    [activeClients, "Active client journeys"], [newClients, "New records to review"], [finishedClients, "Finished records"], [parentPacks + queued, "Parent packs / Drive actions"],
  ].map(([value, label]) => `<article class="metric-card"><strong class="metric-value">${value}</strong><span>${label}</span></article>`).join("");
}

function renderClients() {
  const clients = state.data.clients;
  const counts = { ALL: clients.length, NEW: 0, ACTIVE: 0, FINISHED: 0 };
  clients.forEach((client) => { counts[clientLane(client)] += 1; });
  element("countAll").textContent = counts.ALL;
  element("countNew").textContent = counts.NEW;
  element("countActive").textContent = counts.ACTIVE;
  element("countFinished").textContent = counts.FINISHED;
  document.querySelectorAll("[data-client-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.clientFilter === state.clientFilter)));
  const query = state.clientSearch.trim().toLowerCase();
  const visible = clients.filter((client) => (state.clientFilter === "ALL" || clientLane(client) === state.clientFilter) && (!query || [client.caseId, client.displayName, client.concern, client.nextAction, client.serviceCode].some((value) => String(value || "").toLowerCase().includes(query))));
  const card = (client) => {
    const sessions = sessionsForClient(client.caseId);
    const total = journeyStagesForClient(client).length;
    const complete = sessions.filter(stageComplete).length;
    const next = sessions.find((session) => !stageComplete(session));
    const summary = operationalSummary(sessions);
    return `
    <article class="card operator-card${client.caseId === state.activeCaseId ? " selected-card" : ""}">
      <div class="card-heading"><div><p class="card-label">${escapeHtml(client.caseId)}</p><h3>${escapeHtml(client.displayName)}</h3></div><span class="status-badge">${escapeHtml(client.stage.replaceAll("_", " "))}</span></div>
      <dl class="operator-facts"><div><dt>Service</dt><dd>${escapeHtml(client.serviceCode)}</dd></div><div><dt>Journey</dt><dd>${total ? `${complete} of ${total} complete` : "Select a service"}</dd></div><div><dt>Next stage</dt><dd>${escapeHtml(next ? journeyLabel(next) : total ? "Journey complete" : "Not created")}</dd></div><div><dt>Next appointment</dt><dd>${escapeHtml(summary.appointment)}</dd></div><div><dt>Last session</dt><dd>${escapeHtml(summary.lastSession)}</dd></div><div><dt>Document</dt><dd>${escapeHtml(summary.document)}</dd></div><div><dt>Timing</dt><dd>${escapeHtml(summary.timing)}</dd></div></dl>
      <div class="journey-progress progress-${total ? Math.min(total, complete) : 0}-of-${total || 1}" role="progressbar" aria-label="${escapeHtml(client.displayName)} journey progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${complete}"><span></span></div>
      <p><strong>Next:</strong> ${escapeHtml(client.nextAction)}</p>
      <button class="button secondary compact" type="button" data-open-client="${escapeHtml(client.caseId)}">Continue</button>
    </article>`;
  };
  const lanes = [["NEW", "New"], ["ACTIVE", "Active"], ["FINISHED", "Finished"]];
  element("clientList").innerHTML = clients.length ? lanes.map(([key, label]) => {
    const laneClients = visible.filter((client) => clientLane(client) === key);
    return `<section class="practice-client-lane" aria-labelledby="practice-lane-${key.toLowerCase()}"><div class="practice-lane-heading"><h3 id="practice-lane-${key.toLowerCase()}">${label}</h3><span>${counts[key]}</span></div><div class="operator-list">${laneClients.length ? laneClients.map(card).join("") : `<div class="card empty-state"><p>No ${label.toLowerCase()} records match this view.</p></div>`}</div></section>`;
  }).join("") : `<div class="card empty-state"><h3>No cloud client records</h3><p>The protected D1 workspace is empty. Current family records remain in the localhost-only Practice Console and are not copied into this website.</p></div>`;
}

function clientForm(client) {
  const stageOptions = ["RECORD_REVIEW_REQUIRED", "FIT_REVIEW", "APPROVED_TO_PAY", "PAYMENT_PROOF_RECEIVED", "PAYMENT_VERIFIED", "BOOKED", "PREPARATION", "SESSION_READY", "IN_SESSION", "DOCUMENTATION_DRAFT", "CJ_APPROVED", "DELIVERED", "COMPLETE", "REFERRED", "CANCELLED", "PAUSED"];
  const serviceOptions = client.serviceCode === "CUSTOM" ? ["RM350", "RM1800"] : ["TBD", "RM350", "RM1800"];
  const sourceOptions = ["UNVERIFIED", "PARENT_REPORTED", "CJ_VERIFIED"];
  const options = (items, selected) => items.map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${value.replaceAll("_", " ")}</option>`).join("");
  const legacyService = client.serviceCode === "CUSTOM"
    ? `<option value="" selected disabled>CUSTOM: choose a current service</option>`
    : "";
  return `<form id="clientEditForm" class="card operator-form" data-case-id="${escapeHtml(client.caseId)}" data-revision="${client.revision}">
    <div class="card-heading"><div><p class="card-label">Protected client record</p><h3>${escapeHtml(client.caseId)}</h3></div><span class="status-badge">Revision ${client.revision}</span></div>
    <div class="form-grid">
      <label>Parent or client name<input name="displayName" maxlength="200" required autocomplete="off" value="${escapeHtml(client.displayName)}"></label>
      <label>Child age<input name="childAge" type="number" min="0" max="25" value="${client.childAge ?? ""}"></label>
      <label>Region<input name="region" maxlength="200" required autocomplete="off" value="${escapeHtml(client.region)}"></label>
      <label>Service<select name="serviceCode" required>${legacyService}${options(serviceOptions, client.serviceCode)}</select>${legacyService ? "<span>Legacy classification. Choose RM350 or RM1,800 explicitly before saving.</span>" : ""}</label>
      <label class="span-two">Main concern<textarea name="concern" maxlength="4000" rows="3" required>${escapeHtml(client.concern)}</textarea></label>
      <label>Stage<select name="stage">${options(stageOptions, client.stage)}</select></label>
      <label>Source status<select name="sourceStatus">${options(sourceOptions, client.sourceStatus)}</select></label>
      <label class="span-two">Next action<textarea name="nextAction" maxlength="4000" rows="2" required>${escapeHtml(client.nextAction)}</textarea></label>
      <label>Known facts<textarea name="knownFacts" rows="5">${escapeHtml(listText(client.knownFacts))}</textarea></label>
      <label>Questions to confirm<textarea name="openQuestions" rows="5">${escapeHtml(listText(client.openQuestions))}</textarea></label>
      <label class="span-two">Boundaries or safety notes<textarea name="boundaryFlags" rows="3">${escapeHtml(listText(client.boundaryFlags))}</textarea></label>
      <label class="span-two">Reason for this update<input name="reason" maxlength="500" required value="Current information reviewed by CJ"></label>
    </div>
    <button class="button" type="submit">Save client revision</button>
  </form>`;
}

function renderClientWorkspace() {
  const client = activeClient();
  if (!client) {
    element("clientWorkspace").innerHTML = `<div class="card empty-state"><h3>Select a client</h3><p>The client record and connected sessions will appear here.</p></div>`;
    element("workspaceSummary").textContent = "Choose a client to begin.";
    element("addSession").disabled = true;
    element("addSession").hidden = true;
    return;
  }
  element("workspaceSummary").textContent = `${client.displayName} · ${client.serviceCode} · ${client.nextAction}`;
  const sessions = sessionsForClient(client.caseId);
  const template = journeyStagesForClient(client);
  const byStage = new Map(sessions.map((session) => [session.journeyStage, session]));
  const missing = template.find((stage) => !byStage.has(stage.code));
  element("addSession").hidden = !missing;
  element("addSession").disabled = state.data.writesEnabled !== true || !missing;
  element("addSession").textContent = missing ? `Restore ${missing.label}` : "All stages ready";
  const tracker = template.map((stage) => {
    const session = byStage.get(stage.code) || sessions.find((item) => item.sessionNumber === stage.order);
    const active = session?.sessionId === state.activeSessionId;
    const complete = stageComplete(session);
    const date = session?.occurredAt || session?.scheduledAt;
    const stateClass = complete ? " complete" : active ? " active" : session ? " available" : " missing";
    const stateText = complete ? "Complete" : session ? session.status.replaceAll("_", " ") : "Not created";
    return `<button type="button" class="journey-stage${stateClass}" ${session ? `data-open-session="${session.sessionId}"` : "disabled"} aria-current="${active ? "step" : "false"}">
      <span class="journey-order">${stage.order}</span><strong>${escapeHtml(stage.label)}</strong><small>${escapeHtml(date || "Date not set")}</small><span class="journey-state">${escapeHtml(stateText)}</span>
    </button>`;
  }).join("");
  const journeyPanel = template.length
    ? `<section class="journey-panel" aria-labelledby="journey-title"><div class="journey-heading"><div><p class="card-label">${client.serviceCode === "RM350" ? "Bounded three-stage case" : "Six-stage client journey"}</p><h3 id="journey-title">From preparation to follow-up</h3></div><strong>${sessions.filter(stageComplete).length} / ${template.length} complete</strong></div><div class="journey-tracker stages-${template.length}" aria-label="Client journey stages">${tracker}</div></section>`
    : `<section class="journey-panel"><div><p class="card-label">Journey not created</p><h3>Select RM350 or RM1,800</h3><p class="section-summary">The selected service determines the fixed meeting sequence. Save the client record to create the correct journey.</p></div></section>`;
  element("clientWorkspace").innerHTML = clientForm(client) + journeyPanel;
}

function sessionForm(session) {
  const sessionStatuses = ["PLANNED", "READY", "IN_SESSION", "DOCUMENTATION_DRAFT", "CJ_APPROVED", "DELIVERED", "COMPLETE", "CANCELLED"];
  const documentStatuses = ["DRAFT", "CJ_APPROVED", "SUPERSEDED"];
  const options = (items, selected) => items.map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${value.replaceAll("_", " ")}</option>`).join("");
  const label = journeyLabel(session);
  const total = journeyStagesForClient(activeClient()).length || 1;
  return `<form id="sessionEditForm" class="card operator-form stage-workspace" data-session-id="${session.sessionId}" data-revision="${session.revision}" data-journey-stage="${escapeHtml(session.journeyStage)}">
    <div class="card-heading"><div><p class="card-label">Stage ${session.sessionNumber} of ${total}</p><h3>${escapeHtml(label)}</h3><p class="section-summary">Keep internal thinking separate from the version prepared for parents.</p></div><span class="status-badge">Revision ${session.revision}</span></div>
    <fieldset class="stage-section"><legend>Timing and status</legend><div class="form-grid">
      <label>Stage status<select name="status">${options(sessionStatuses, session.status)}</select></label>
      <label>Document status<select name="documentStatus">${options(documentStatuses, session.documentStatus)}</select></label>
      <label>Planned date<input name="scheduledAt" type="date" value="${escapeHtml((session.scheduledAt || "").slice(0, 10))}"></label>
      <label>Completed / meeting date<input name="occurredAt" type="date" value="${escapeHtml((session.occurredAt || "").slice(0, 10))}"></label>
    </div></fieldset>
    <fieldset class="stage-section internal"><legend>Internal workspace (not shared with parents)</legend><div class="form-grid">
      <label class="span-two">Preparation and agenda<textarea name="preparation" rows="5" maxlength="10000">${escapeHtml(session.preparation)}</textarea></label>
      <label class="span-two">Template answers and source information <span>retained internally; not included in the parent export</span><textarea name="templateAnswers" rows="7" maxlength="30000">${escapeHtml(session.templateAnswers)}</textarea></label>
      <label class="span-two">Facilitator notes <span>private working notes; never included in the parent export</span><textarea name="privateNotes" rows="8" maxlength="30000">${escapeHtml(session.privateNotes)}</textarea></label>
    </div></fieldset>
    <fieldset class="stage-section parent"><legend>Parent follow-through (eligible for approved export)</legend><div class="form-grid">
      <label class="span-two">Discussion summary<textarea name="parentSummary" rows="8" maxlength="20000">${escapeHtml(session.parentSummary)}</textarea></label>
      <label class="span-two">Action plan for parents<textarea name="actionPlan" rows="8" maxlength="20000">${escapeHtml(session.actionPlan)}</textarea></label>
      <label class="span-two">Materials and resources for parents<textarea name="parentMaterials" rows="6" maxlength="10000">${escapeHtml(session.parentMaterials)}</textarea></label>
    </div></fieldset>
    <div class="button-row"><button class="button" type="submit">Save ${escapeHtml(label)} revision</button><button class="button secondary" type="button" data-export="LOCAL">Download approved parent pack</button><button class="button secondary" type="button" data-export="GOOGLE_DRIVE">Prepare Drive archive</button>${session.documentStatus === "EXPORTED" ? `<button class="button secondary" type="button" data-deliver-session="${session.sessionId}">Mark parent pack delivered</button>` : ""}</div>
  </form>`;
}

function renderSessionWorkspace() {
  const session = activeSession();
  element("sessionWorkspace").innerHTML = session ? sessionForm(session) : "";
}

function renderExports() {
  const exports = state.data.exports;
  element("exportList").innerHTML = exports.length ? exports.map((item) => `
    <article class="card operator-card"><div class="card-heading"><div><p class="card-label">${escapeHtml(item.destination.replaceAll("_", " "))}</p><h3>${escapeHtml(item.filename)}</h3></div><span class="status-badge">${escapeHtml(item.status)}</span></div><p><code>${escapeHtml(item.contentSha256.slice(0, 16))}</code> · ${item.byteSize} bytes</p>${item.destination === "GOOGLE_DRIVE" && item.status === "QUEUED" ? `<form class="drive-confirm-form" data-export-id="${item.exportId}"><label>Google Drive file ID<input name="providerFileId" required maxlength="240"></label><button class="button compact" type="submit">Confirm Drive save</button></form>` : item.providerFileId ? `<p>Drive file: <code>${escapeHtml(item.providerFileId)}</code></p>` : ""}</article>`).join("") : `<div class="card empty-state"><h3>No approved exports yet</h3><p>Approve a session summary and action plan before creating its versioned Markdown pack.</p></div>`;
}

function renderActivity() {
  const activity = state.data.activity || [];
  element("activityList").innerHTML = activity.length ? activity.map((item) => `
    <article class="card operator-card">
      <div class="card-heading"><div><p class="card-label">${escapeHtml(item.recordType)} · ${escapeHtml(item.journeyStage ? journeyStage(item.journeyStage)?.label || item.journeyStage : item.caseId)}</p><h3>${escapeHtml(item.eventType.replaceAll("_", " "))}</h3></div><span class="status-badge">Revision ${item.revision}</span></div>
      <p>${escapeHtml(item.reason)} · ${escapeHtml(item.actor)} · <time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(item.createdAt)}</time></p>
    </article>`).join("") : `<div class="card empty-state"><h3>No revisions yet</h3><p>Saved client and session changes will appear here.</p></div>`;
}

function render() {
  if (!state.data) return;
  const enabled = state.data.writesEnabled === true;
  element("showNewClient").disabled = !enabled;
  if (!enabled) {
    element("practiceWriteNotice").innerHTML = "<strong>Safe deployment mode:</strong> The cloud workflow is installed, but live client writes remain disabled while OPS-HOLD-003 is open. Current family records stay in the protected local and Drive stores.";
  }
  renderMetrics();
  renderClients();
  renderClientWorkspace();
  renderSessionWorkspace();
  renderExports();
  renderActivity();
}

async function loadPractice() {
  setStatus("Checking cloud records", "Reading the authenticated D1 source of truth.", "saving");
  try {
    const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Practice Console unavailable");
    state.data = result;
    if (state.activeCaseId && !activeClient()) state.activeCaseId = null;
    if (state.activeSessionId && !activeSession()) state.activeSessionId = null;
    render();
    if (result.writesEnabled) setStatus("Cloud record connected", `${result.clients.length} client record${result.clients.length === 1 ? "" : "s"} available from this authenticated account.`);
    else setStatus("Cloud workflow installed safely", "Live client writes are disabled until the privacy approval hold is resolved.");
  } catch (error) {
    setStatus("Practice Console unavailable", "The protected database could not be reached. No local fallback is being presented as current.", "error");
  }
}

function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

element("showNewClient").addEventListener("click", () => { element("newClientPanel").hidden = false; element("newClientPanel").scrollIntoView(); });
element("cancelNewClient").addEventListener("click", () => { element("newClientPanel").hidden = true; });
element("refreshPractice").addEventListener("click", loadPractice);
element("clientSearch").addEventListener("input", (event) => { state.clientSearch = event.target.value; renderClients(); });
document.querySelectorAll("[data-client-filter]").forEach((button) => button.addEventListener("click", () => { state.clientFilter = button.dataset.clientFilter; renderClients(); }));
element("addSession").addEventListener("click", async () => {
  if (!state.activeCaseId) return;
  try {
    const result = await api({ action: "create_session", caseId: state.activeCaseId, scheduledAt: null });
    state.data = result;
    state.activeSessionId = result.actionResult.sessionId;
    render();
    toast("Missing journey stage restored.");
  } catch (error) { toast(error.message); }
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.openClient) {
    state.activeCaseId = target.dataset.openClient;
    const sessions = sessionsForClient(state.activeCaseId);
    state.activeSessionId = sessions.find((session) => !stageComplete(session))?.sessionId || sessions.at(-1)?.sessionId || null;
    render();
    element("workspace").scrollIntoView();
  }
  if (target.dataset.openSession) {
    state.activeSessionId = target.dataset.openSession;
    render();
  }
  if (target.dataset.export) {
    const session = activeSession();
    if (!session) return;
    try {
      const result = await api({ action: "prepare_export", sessionId: session.sessionId, destination: target.dataset.export });
      state.data = result;
      download(result.download.filename, result.download.content);
      if (target.dataset.export === "GOOGLE_DRIVE") {
        window.open("https://drive.google.com/drive/my-drive", "_blank", "noopener");
        toast("Markdown downloaded. Upload it to the approved private Drive folder, then record its file ID.");
      } else toast("Approved Markdown downloaded and recorded.");
      render();
    } catch (error) { toast(error.message); }
  }
  if (target.dataset.deliverSession) {
    const session = activeSession();
    if (!session || session.sessionId !== target.dataset.deliverSession) return;
    try {
      state.data = await api({ action: "mark_delivered", sessionId: session.sessionId, expectedRevision: session.revision });
      render();
      toast("Parent pack marked as delivered.");
    } catch (error) { toast(error.message); }
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!["newClientForm", "clientEditForm", "sessionEditForm"].includes(form.id) && !form.matches(".drive-confirm-form")) return;
  event.preventDefault();
  try {
    if (form.id === "newClientForm") {
      const formData = new FormData(form);
      const result = await api({ action: "create_client", client: clientPayload(form), reason: String(formData.get("reason") || "") });
      state.data = result;
      state.activeCaseId = result.actionResult.caseId;
      state.activeSessionId = result.actionResult.sessionId;
      form.reset();
      element("newClientPanel").hidden = true;
      toast("Protected client workspace created.");
    } else if (form.id === "clientEditForm") {
      const formData = new FormData(form);
      state.data = await api({ action: "update_client", caseId: form.dataset.caseId, expectedRevision: Number(form.dataset.revision), client: clientPayload(form), reason: String(formData.get("reason") || "") });
      if (state.data.actionResult?.sessionId) state.activeSessionId = state.data.actionResult.sessionId;
      toast("Client revision saved.");
    } else if (form.id === "sessionEditForm") {
      const formData = new FormData(form);
      const date = (name) => String(formData.get(name) || "").trim() || null;
      state.data = await api({ action: "save_session", sessionId: form.dataset.sessionId, expectedRevision: Number(form.dataset.revision), session: {
        journeyStage: form.dataset.journeyStage, status: String(formData.get("status") || ""), scheduledAt: date("scheduledAt"), occurredAt: date("occurredAt"), preparation: String(formData.get("preparation") || ""), templateAnswers: String(formData.get("templateAnswers") || ""), privateNotes: String(formData.get("privateNotes") || ""), parentSummary: String(formData.get("parentSummary") || ""), actionPlan: String(formData.get("actionPlan") || ""), parentMaterials: String(formData.get("parentMaterials") || ""), documentStatus: String(formData.get("documentStatus") || ""),
      } });
      toast("Session revision saved.");
    } else if (form.matches(".drive-confirm-form")) {
      const formData = new FormData(form);
      state.data = await api({ action: "confirm_drive_export", exportId: form.dataset.exportId, providerFileId: String(formData.get("providerFileId") || "") });
      toast("Drive archive recorded.");
    }
    render();
    setStatus("Cloud record saved", "The latest revision and its history are available from this authenticated account.");
  } catch (error) {
    toast(error.message);
    await loadPractice();
  }
});

loadPractice();
