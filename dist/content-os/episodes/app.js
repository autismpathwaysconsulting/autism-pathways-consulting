import { MASTER_VIDEO_RULES, masterVideoRulePromptLines } from "../video-rules.js";
import { MASTER_TOPIC_BANK, MASTER_TOPIC_BANK_VERSION } from "../topic-bank.js";

const EPISODE_API = "/api/content-os/episode-workflow";
const RESEARCH_API = "/api/content-os/research?limit=12";
const PACKAGE_SCHEMA = "apc.episode_pack.v2";
const STEP_BY_STATUS = Object.freeze({ IDEA: 1, APPROVED: 2, SCRIPT_LOCKED: 4, FILMED: 4, EDITING: 4, REVIEW: 5, READY: 6, PUBLISHED: 7 });

let workflow = { episodes: [], reviews: [], publications: [], artifacts: [], events: [], nextEpisodeId: "EP01" };
let research = { items: [] };
let selectedFilmingEpisodeId = null;

function element(id) { return document.getElementById(id); }
function clear(target) { target.replaceChildren(); }
function arrangeWorkflowSections() {
  const main = element("main-content");
  if (!main) return;
  ["overview", "ideas", "pack", "import", "filming-pack", "results", "episodes"].forEach(id => {
    const section = element(id);
    if (section) main.appendChild(section);
  });
}
function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}
function setStatus(title, detail, kind = "") {
  element("episodeStatus").textContent = title;
  element("episodeStatus").className = "sync-status" + (kind ? " " + kind : "");
  element("episodeDetail").textContent = detail;
  element("episodeDetail").className = "sync-detail" + (kind ? " " + kind : "");
}
function uniqueKey(prefix, episodeId) {
  return prefix + ":" + episodeId + ":" + crypto.randomUUID();
}
function nextEpisodeId() { return workflow.nextEpisodeId || "EP01"; }
function humanDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Time not recorded" : parsed.toLocaleString();
}
function latestArtifact(episodeId, type) {
  return workflow.artifacts.filter(item => item.episode_id === episodeId && item.artifact_type === type)
    .sort((left, right) => Number(right.version) - Number(left.version))[0] || null;
}
function activeEpisodes() { return workflow.episodes.filter(item => !item.archived_at); }
function archivedEpisodes() { return workflow.episodes.filter(item => Boolean(item.archived_at)); }
function episodeById(episodeId) { return workflow.episodes.find(item => item.id === episodeId) || null; }
function latestPrompt(episodeId) { return latestArtifact(episodeId, "PROMPT")?.payload || null; }
function latestPack(episodeId) { return latestArtifact(episodeId, "PRODUCTION_PACK")?.payload || null; }
function sourceContext(episodeId) { return latestPrompt(episodeId)?.sourceContext || episodeById(episodeId)?.productionPack?.sourceContext || null; }
function existingEpisodeForSource(source) {
  const topicId = source?.topic?.id || source?.researchItem?.itemId || null;
  if (!topicId) return null;
  const promptArtifact = workflow.artifacts.find(item => item.artifact_type === "PROMPT" &&
    (item.payload?.sourceContext?.topic?.id === topicId || item.payload?.sourceContext?.researchItem?.itemId === topicId));
  return promptArtifact ? episodeById(promptArtifact.episode_id) : null;
}
function masterIdentity() {
  return { version: MASTER_VIDEO_RULES.version, sha256: MASTER_VIDEO_RULES.sha256, sourcePath: MASTER_VIDEO_RULES.sourcePath };
}
function packageContract(episodeId) {
  return [
    "",
    "MANDATORY FINAL RED-TEAM",
    "Before presenting the final version, run /redteam on factual accuracy, evidence scope, autism-community framing, parent shame, burden framing, overclaiming, production alignment and likely backlash. Correct all fixable issues before the final output.",
    "A PASS requires a corrected score of at least 8.5/10 and means the corrected final pack is safe enough to film. If the score is below 8.5 or the risks cannot be corrected, return REVISE.",
    "",
    "TRACKED PACKAGE RETURN",
    "After the readable episode pack, finish with exactly one fenced JSON block that follows this contract. This block will be pasted into Episode Studio:",
    JSON.stringify({
      schemaVersion: PACKAGE_SCHEMA,
      episodeId,
      masterRules: { version: MASTER_VIDEO_RULES.version, sha256: MASTER_VIDEO_RULES.sha256 },
      redteam: { result: "PASS", score: 9.5, risks: [], fixes: [] },
      hookGate: { result: "PASS", yesCount: 5, checks: [true, true, true, true, true] },
      finalDecision: "FILM",
      spokenScript: "Final words exactly as CJ should say them.",
      filmingBoard: [{ start: "0:00", end: "0:07", spokenWords: "Exact words", direction: "Exact filming direction" }],
      overlays: [{ start: "0:00", end: "0:04", type: "on-screen text", text: "EXACT TEXT", safeZone: "top 65%" }],
      hyperframesPrompt: "Complete HyperFrames prompt.",
      visualAssets: { cards: [], sourcePills: [] },
      editNotes: ["One concrete edit note."],
      sourceNotes: ["One source and scope note."],
      platformCopy: { instagram: "Caption", tiktok: "Caption", youtubeShorts: "Caption" },
      claimCautions: ["One claim boundary, or an empty array if none remain."]
    }, null, 2),
    "Use the exact episode ID and master identity shown. Keep every top-level key. Do not add extra top-level keys. Do not create an SRT file."
  ];
}
function productionPrompt(episode, format, notes, evidenceContext) {
  return [
    `Create a complete, filming-ready APC episode pack for ${episode.id}: ${episode.title}.`,
    "",
    "Format: " + format,
    "Constraints: " + (notes || "Keep the language warm, practical and within APC scope."),
    "Evidence context:",
    JSON.stringify(evidenceContext, null, 2),
    "",
    ...masterVideoRulePromptLines(),
    "",
    "PRE-FILM HOOK AUDIT",
    "- Parent moment:",
    "- Primary emotion:",
    "- Contradiction / tension:",
    "- Why viewer stays:",
    "- Practical payoff:",
    "- Save/share reason:",
    "",
    "HOOK GATE: PASS / REWORK / FAIL",
    "PASS only when Recognition, Emotional Pull, and Tension / Gap are all satisfied and at least 4 of the 5 checks are satisfied.",
    "REWORK when 3 or more checks are satisfied but the PASS requirements are not met.",
    "FAIL when 0-2 checks are satisfied. Do not recommend filming yet.",
    "If the result is REWORK or FAIL, rewrite the opening and rerun the audit before returning a filming recommendation.",
    "",
    "Return the completed audit first, followed by the locked spoken script, timed scene-by-scene filming board, exact on-screen captions, HyperFrames prompt, visual assets, edit notes, source notes, platform copy, claim cautions, and a final FILM or REVISE decision.",
    "Keep the spoken script and every scene perfectly aligned so rerecording is not needed later.",
    ...packageContract(episode.id),
  ].join("\n");
}
function masterContext(topic) {
  return { sourceType: "master-topic-bank", masterRulesVersion: MASTER_VIDEO_RULES.version, topicBankVersion: MASTER_TOPIC_BANK_VERSION, topic };
}
function researchContext(item) { return { sourceType: "governed-research-feed", researchItem: item }; }
function manualContext(title) {
  return { sourceType: "manual", title, instruction: "Verify the required statistic or specific number before writing the hook. Do not invent it." };
}

async function apiRequest(payload) {
  const response = await fetch(EPISODE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-APC-Content-OS": "1" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The episode update could not be saved.");
  workflow = body;
  render();
  return body;
}
async function load() {
  const [episodeResponse, researchResponse] = await Promise.all([
    fetch(EPISODE_API, { headers: { Accept: "application/json" } }),
    fetch(RESEARCH_API, { headers: { Accept: "application/json" } }),
  ]);
  if (!episodeResponse.ok) throw new Error("Episode workflow is unavailable.");
  workflow = await episodeResponse.json();
  research = researchResponse.ok ? await researchResponse.json() : { items: [] };
  render();
  const requested = new URL(location.href).searchParams.get("episode");
  const initial = activeEpisodes().find(item => item.id === requested) || activeEpisodes().find(item => latestPack(item.id)) || activeEpisodes()[0];
  if (initial) {
    element("packEpisode").value = initial.id;
    element("importEpisode").value = initial.id;
    element("reviewEpisode").value = initial.id;
    element("promptOutput").textContent = latestPrompt(initial.id)?.text || "No tracked prompt is available for this legacy episode.";
    if (latestPack(initial.id)) renderFilmingPack(initial.id);
  }
  setStatus("Tracked workflow ready", "Prompts, packs, gates, reviews and results are current.", "success");
}

function renderResearch() {
  const list = element("researchIdeas");
  clear(list);
  const topics = (research.items || []).filter(item => item.type === "topic" && item.decision !== "archived");
  if (!topics.length) { list.appendChild(node("div", "empty-state", "No research candidates are available yet.")); return; }
  for (const item of topics) {
    const card = node("article", "card");
    card.appendChild(node("span", "status-badge " + (item.decision === "used" ? "success" : "neutral"), item.decision === "used" ? "Used" : "New"));
    card.appendChild(node("h3", "", item.title));
    const summary = item.data?.parent_problem || item.data?.summary || item.data?.practical_action || "";
    if (summary) card.appendChild(node("p", "subtle", summary));
    const button = node("button", "button compact", "Create episode + build prompt");
    button.type = "button";
    button.dataset.researchItem = item.itemId;
    button.dataset.title = item.title;
    card.appendChild(button);
    list.appendChild(card);
  }
}
function renderMasterIdeas() {
  const list = element("masterIdeas");
  clear(list);
  for (const topic of MASTER_TOPIC_BANK) {
    const card = node("article", "card");
    card.appendChild(node("span", "status-badge success", "Master " + MASTER_TOPIC_BANK_VERSION));
    card.appendChild(node("h3", "", topic.name));
    card.appendChild(node("blockquote", "topic-hook", topic.hook));
    card.appendChild(node("p", "subtle", "Parent moment: " + topic.parentMoment));
    card.appendChild(node("p", "subtle", "Payoff: " + topic.practicalPayoff));
    const source = node("a", "topic-source", "Evidence: " + topic.source.title + " (" + topic.source.year + ")");
    source.href = topic.source.url;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    card.appendChild(source);
    const button = node("button", "button compact", "Create episode + build prompt");
    button.type = "button";
    button.dataset.masterTopic = topic.id;
    card.appendChild(button);
    list.appendChild(card);
  }
}
function nextAction(episode, packArtifact, publications) {
  if (!packArtifact) return "Next: copy the saved prompt into Codex, then import the final JSON package.";
  if (episode.status === "APPROVED") {
    if (packArtifact.redteam_status !== "PASS" || Number(packArtifact.payload?.redteam?.score || 0) < 8.5) return "Next: revise the package until the red-team result is PASS at 8.5/10 or higher.";
    if (packArtifact.hook_gate_status !== "PASS" || packArtifact.final_decision !== "FILM") return "Next: rework the hook before filming.";
    return "Next: lock the approved script for filming.";
  }
  if (episode.status === "SCRIPT_LOCKED") return "Next: film the locked script, then mark FILMED.";
  if (episode.status === "FILMED") return "Next: edit the video, then mark EDITING.";
  if (episode.status === "EDITING") return "Next: run a full review, then delta reviews for revisions.";
  if (episode.status === "REVIEW") return "Next: resolve blockers and complete the final READY review.";
  if (episode.status === "READY") return "Next: publish and enter this episode ID when connecting the post.";
  if (episode.status === "PUBLISHED" && !publications.length) return "Next: add the platform post in Content OS with this episode ID.";
  if (episode.status === "PUBLISHED") return "Learning loop active: 24h, 7d and 28d analytics stay attached to this episode.";
  return "Next: develop the episode prompt.";
}
function packPasses(packArtifact) {
  return Boolean(packArtifact && packArtifact.redteam_status === "PASS" && Number(packArtifact.payload?.redteam?.score || 0) >= 8.5 && packArtifact.hook_gate_status === "PASS" && packArtifact.final_decision === "FILM");
}
function previousStatus(status) {
  return { APPROVED: "IDEA", SCRIPT_LOCKED: "APPROVED", FILMED: "SCRIPT_LOCKED", EDITING: "FILMED", REVIEW: "EDITING", READY: "REVIEW", PUBLISHED: "READY" }[status] || null;
}
function appendEpisodeActions(actions, episode, packArtifact) {
  const open = node("button", "button secondary compact", packArtifact ? "Open filming page" : "Open prompt");
  open.type = "button";
  open.dataset.openEpisode = episode.id;
  actions.appendChild(open);

  if (packArtifact) {
    const editPack = node("button", "button secondary compact", "Edit script/package");
    editPack.type = "button";
    editPack.dataset.editPack = episode.id;
    actions.appendChild(editPack);
  }
  if (episode.status === "APPROVED" && packPasses(packArtifact)) {
    const lock = node("button", "button compact", "Lock script for filming");
    lock.type = "button";
    lock.dataset.lockEpisode = episode.id;
    actions.appendChild(lock);
  }
  const nextStages = { SCRIPT_LOCKED: ["FILMED", "Mark filming complete"], FILMED: ["EDITING", "Start editing"], EDITING: ["REVIEW", "Send to review"] };
  const next = nextStages[episode.status];
  if (next) {
    const advance = node("button", "button compact", next[1]);
    advance.type = "button";
    advance.dataset.advanceEpisode = episode.id;
    advance.dataset.advanceStatus = next[0];
    actions.appendChild(advance);
  }
  if (episode.status === "REVIEW") {
    const review = node("a", "button compact", "Import video review");
    review.href = "#results";
    review.dataset.reviewEpisodeLink = episode.id;
    actions.appendChild(review);
  }
  if (["READY", "PUBLISHED"].includes(episode.status)) {
    const publish = node("a", "button compact", episode.status === "READY" ? "Publish + start analytics" : "View analytics");
    publish.href = "/content-os/?episode=" + encodeURIComponent(episode.id) + "#results";
    actions.appendChild(publish);
  }
}
function appendEpisodeTimeline(card, episode) {
  const timeline = node("details", "timeline");
  timeline.appendChild(node("summary", "", "History and management"));
  const management = node("div", "episode-management");
  const titleField = node("label", "field");
  titleField.appendChild(node("span", "", "Episode title"));
  const titleInput = node("input");
  titleInput.value = episode.title;
  titleInput.maxLength = 200;
  titleInput.dataset.episodeTitle = episode.id;
  titleField.appendChild(titleInput);
  management.appendChild(titleField);
  const controls = node("div", "button-row");
  const save = node("button", "button secondary compact", "Save title");
  save.type = "button";
  save.dataset.saveEpisodeTitle = episode.id;
  controls.appendChild(save);
  const prior = previousStatus(episode.status);
  if (prior && !episode.archived_at) {
    const back = node("button", "button secondary compact", "Move back to " + prior.replaceAll("_", " ").toLowerCase());
    back.type = "button";
    back.dataset.advanceEpisode = episode.id;
    back.dataset.advanceStatus = prior;
    controls.appendChild(back);
  }
  const archive = node("button", "button danger compact", episode.archived_at ? "Restore episode" : "Archive episode");
  archive.type = "button";
  archive.dataset.archiveEpisode = episode.id;
  archive.dataset.archived = episode.archived_at ? "false" : "true";
  controls.appendChild(archive);
  management.appendChild(controls);
  timeline.appendChild(management);
  const eventList = node("ol", "timeline-list");
  const events = workflow.events.filter(item => item.episode_id === episode.id).slice().reverse();
  if (!events.length) eventList.appendChild(node("li", "subtle", "Legacy episode record. New actions will appear here."));
  for (const item of events) {
    const eventLabel = item.metadata?.action || item.event_type.replaceAll("_", " ");
    eventList.appendChild(node("li", "", eventLabel.toUpperCase().replaceAll("_", " ") + " · " + humanDate(item.created_at)));
  }
  const publications = workflow.publications.filter(item => item.episodeId === episode.id);
  for (const publication of publications) eventList.appendChild(node("li", "", "PUBLISHED ON " + publication.platform.toUpperCase() + " · " + humanDate(publication.publishedAt) + " · " + publication.snapshotCount + " checkpoints"));
  timeline.appendChild(eventList);
  card.appendChild(timeline);
}
function episodeCard(episode) {
  const packArtifact = latestArtifact(episode.id, "PRODUCTION_PACK");
  const publications = workflow.publications.filter(item => item.episodeId === episode.id);
  const card = node("article", "card episode-workflow-card");
  card.id = episode.archived_at ? "archived-" + episode.id : episode.id;
  const heading = node("div", "card-heading");
  const title = node("div");
  title.appendChild(node("p", "card-label", episode.id + " · Step " + STEP_BY_STATUS[episode.status] + " of 7"));
  title.appendChild(node("h3", "", episode.title));
  heading.appendChild(title);
  heading.appendChild(node("span", "status-badge " + (episode.status === "READY" || episode.status === "PUBLISHED" ? "success" : "neutral"), episode.archived_at ? "ARCHIVED" : episode.status));
  card.appendChild(heading);
  if (packArtifact) card.appendChild(node("p", "subtle", `Filming pack v${packArtifact.version} saved · HTML view ready · Red-team ${packArtifact.redteam_status} · Hook ${packArtifact.hook_gate_status || "not set"} · ${packArtifact.final_decision || "no decision"}`));
  else card.appendChild(node("p", "subtle", "Prompt saved. No returned production package imported yet."));
  if (!episode.archived_at) {
    card.appendChild(node("p", "next-action", nextAction(episode, packArtifact, publications)));
    const actions = node("div", "button-row");
    appendEpisodeActions(actions, episode, packArtifact);
    card.appendChild(actions);
  }
  appendEpisodeTimeline(card, episode);
  return card;
}
function renderEpisodes() {
  const list = element("episodeList");
  clear(list);
  const active = activeEpisodes();
  if (!active.length) list.appendChild(node("div", "empty-state", "Create the first tracked episode from an idea."));
  for (const episode of active) list.appendChild(episodeCard(episode));
  const archivedPanel = element("archivedEpisodesPanel");
  const archivedList = element("archivedEpisodeList");
  const archived = archivedEpisodes();
  archivedPanel.hidden = !archived.length;
  clear(archivedList);
  for (const episode of archived) archivedList.appendChild(episodeCard(episode));
}
function renderEpisodeOptions() {
  for (const selectId of ["packEpisode", "importEpisode", "reviewEpisode"]) {
    const select = element(selectId);
    const selected = select.value;
    clear(select);
    const available = activeEpisodes();
    if (!available.length) { const option = node("option", "", "Create an episode first"); option.value = ""; select.appendChild(option); continue; }
    for (const episode of available) {
      const option = node("option", "", episode.id + ": " + episode.title);
      option.value = episode.id; option.selected = episode.id === selected; select.appendChild(option);
    }
  }
}
function renderWorkflowSteps() {
  const target = element("workflowSteps");
  clear(target);
  const active = activeEpisodes();
  const steps = [
    { number: 1, title: "Choose idea", detail: MASTER_TOPIC_BANK.length + " master ideas available", href: "#ideas" },
    { number: 2, title: "Build prompt", detail: active.filter(item => ["IDEA", "APPROVED"].includes(item.status)).length + " episode(s) developing", href: "#pack" },
    { number: 3, title: "Import script", detail: active.filter(item => item.status === "APPROVED" && latestArtifact(item.id, "PRODUCTION_PACK")).length + " pack(s) imported", href: "#import" },
    { number: 4, title: "Film + edit", detail: active.filter(item => ["SCRIPT_LOCKED", "FILMED", "EDITING"].includes(item.status)).length + " active", href: "#filming-pack" },
    { number: 5, title: "Final review", detail: active.filter(item => item.status === "REVIEW").length + " awaiting readiness", href: "#results" },
    { number: 6, title: "Publish", detail: active.filter(item => item.status === "READY").length + " ready", href: "/content-os/?from=episodes#results" },
    { number: 7, title: "Learn", detail: active.filter(item => item.status === "PUBLISHED").length + " published", href: "/content-os/?from=episodes#results" },
  ];
  for (const step of steps) {
    const link = node("a", "workflow-step");
    link.href = step.href;
    link.appendChild(node("span", "workflow-step-number", String(step.number)));
    const copy = node("span", "workflow-step-copy");
    copy.appendChild(node("strong", "", step.title));
    copy.appendChild(node("small", "", step.detail));
    link.appendChild(copy);
    target.appendChild(link);
  }
}
function appendPackSection(target, title, value) {
  const section = node("section", "filming-pack-section");
  section.appendChild(node("h3", "", title));
  if (typeof value === "string") section.appendChild(node("pre", "pack-text", value || "Not supplied."));
  else if (Array.isArray(value)) {
    if (!value.length) section.appendChild(node("p", "subtle", "None recorded."));
    for (const item of value) section.appendChild(node("pre", "pack-item", typeof item === "string" ? item : JSON.stringify(item, null, 2)));
  } else if (value && typeof value === "object") {
    for (const [label, item] of Object.entries(value)) {
      const block = node("div", "pack-object-item");
      block.appendChild(node("strong", "", label.replaceAll(/([a-z])([A-Z])/g, "$1 $2")));
      block.appendChild(node("pre", "pack-item", typeof item === "string" ? item : JSON.stringify(item, null, 2)));
      section.appendChild(block);
    }
  } else section.appendChild(node("p", "subtle", "Not supplied."));
  target.appendChild(section);
}
function renderFilmingPack(episodeId, scroll = false) {
  const viewer = element("filmingPackViewer");
  clear(viewer);
  const episode = episodeById(episodeId);
  const artifact = latestArtifact(episodeId, "PRODUCTION_PACK");
  const pack = artifact?.payload;
  selectedFilmingEpisodeId = pack ? episodeId : null;
  element("downloadFilmingHtml").disabled = !pack;
  if (!episode || !pack) {
    viewer.appendChild(node("div", "empty-state", "This episode does not have an imported production package yet."));
    if (scroll) element("pack").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const heading = node("div", "card-heading");
  const title = node("div");
  title.appendChild(node("p", "card-label", episode.id + " · HTML filming pack v" + artifact.version));
  title.appendChild(node("h2", "", episode.title));
  heading.appendChild(title);
  heading.appendChild(node("span", "status-badge success", "Saved in Content OS"));
  viewer.appendChild(heading);
  viewer.appendChild(node("p", "pack-gate-summary", "Red-team " + pack.redteam.result + " " + pack.redteam.score + "/10 · Hook " + pack.hookGate.result + " · Decision " + pack.finalDecision));
  appendPackSection(viewer, "Locked spoken script", pack.spokenScript);
  appendPackSection(viewer, "Timed filming board", pack.filmingBoard);
  appendPackSection(viewer, "On-screen overlays and captions", pack.overlays);
  appendPackSection(viewer, "Visual assets", pack.visualAssets);
  appendPackSection(viewer, "HyperFrames prompt", pack.hyperframesPrompt);
  appendPackSection(viewer, "Edit notes", pack.editNotes);
  appendPackSection(viewer, "Source notes", pack.sourceNotes);
  appendPackSection(viewer, "Platform copy", pack.platformCopy);
  appendPackSection(viewer, "Claim cautions", pack.claimCautions);
  if (scroll) element("filming-pack").scrollIntoView({ behavior: "smooth", block: "start" });
}
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function standalonePackHtml(episode, artifact) {
  const pack = artifact.payload;
  const section = (title, value) => `<section><h2>${escapeHtml(title)}</h2><pre>${escapeHtml(typeof value === "string" ? value : JSON.stringify(value, null, 2))}</pre></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(episode.id + " " + episode.title)}</title><style>body{max-width:900px;margin:40px auto;padding:0 24px;background:#f8f5ef;color:#253532;font:16px/1.55 system-ui,sans-serif}h1,h2{color:#073734}header,section{padding:24px;margin:18px 0;border:1px solid #5b6b68;border-radius:16px;background:#fff9f1}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.meta{color:#5b6b68}@media print{body{margin:0;max-width:none}header,section{break-inside:avoid}}</style></head><body><header><p class="meta">${escapeHtml(episode.id)} · Filming pack v${artifact.version}</p><h1>${escapeHtml(episode.title)}</h1><p>Red-team ${escapeHtml(pack.redteam.result)} ${escapeHtml(pack.redteam.score)}/10 · Hook ${escapeHtml(pack.hookGate.result)} · ${escapeHtml(pack.finalDecision)}</p></header>${section("Locked spoken script", pack.spokenScript)}${section("Timed filming board", pack.filmingBoard)}${section("On-screen overlays and captions", pack.overlays)}${section("Visual assets", pack.visualAssets)}${section("HyperFrames prompt", pack.hyperframesPrompt)}${section("Edit notes", pack.editNotes)}${section("Source notes", pack.sourceNotes)}${section("Platform copy", pack.platformCopy)}${section("Claim cautions", pack.claimCautions)}</body></html>`;
}
function downloadFilmingHtml() {
  const episode = episodeById(selectedFilmingEpisodeId);
  const artifact = latestArtifact(selectedFilmingEpisodeId, "PRODUCTION_PACK");
  if (!episode || !artifact) return;
  const blob = new Blob([standalonePackHtml(episode, artifact)], { type: "text/html;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = episode.id + "_filming_pack_v" + artifact.version + ".html";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
function renderResults() {
  const reviews = element("reviewList");
  clear(reviews);
  if (!workflow.reviews.length) reviews.appendChild(node("div", "empty-state", "No video reviews recorded yet."));
  for (const review of workflow.reviews.slice(0, 20)) {
    const card = node("article", "card");
    card.appendChild(node("p", "card-label", review.episode_id + " · " + review.mode));
    card.appendChild(node("h3", "", review.result));
    card.appendChild(node("p", "subtle", review.version_label + " · SHA-256 " + review.video_sha256.slice(0, 12) + "..."));
    reviews.appendChild(card);
  }
  const publications = element("publicationList");
  clear(publications);
  const linked = workflow.publications.filter(item => item.episodeId);
  if (!linked.length) publications.appendChild(node("div", "empty-state", "No publications with an episode ID are recorded yet."));
  for (const publication of linked.slice(0, 20)) {
    const card = node("article", "card");
    card.appendChild(node("p", "card-label", publication.episodeId + " · " + publication.platform));
    card.appendChild(node("h3", "", publication.title || publication.topic || publication.postRef));
    card.appendChild(node("p", "subtle", String(publication.snapshotCount) + " analytics checkpoint(s) recorded."));
    publications.appendChild(card);
  }
}
function render() {
  const active = activeEpisodes();
  element("episodeCount").textContent = String(active.length);
  element("filmingCount").textContent = String(active.filter(item => item.status === "SCRIPT_LOCKED").length);
  element("readyCount").textContent = String(active.filter(item => item.status === "READY").length);
  element("publishedCount").textContent = String(active.filter(item => item.status === "PUBLISHED").length);
  renderMasterIdeas(); renderResearch(); renderEpisodes(); renderEpisodeOptions(); renderWorkflowSteps(); renderResults();
  if (selectedFilmingEpisodeId && episodeById(selectedFilmingEpisodeId) && !episodeById(selectedFilmingEpisodeId).archived_at) renderFilmingPack(selectedFilmingEpisodeId);
  element("masterRulesStatus").textContent = "Master rules " + MASTER_VIDEO_RULES.version + " and tracked package gate active";
  element("masterRulesDetail").textContent = "Synced from APC-AI-OS at SHA-256 " + MASTER_VIDEO_RULES.sha256.slice(0, 12) + ". Every new prompt is saved before it is shown. A red-team PASS at 8.5/10 or higher and Hook Gate PASS are required before filming.";
  element("episodeId").value = nextEpisodeId();
  const readyEpisode = active.find(item => item.status === "READY");
  element("publicationLink").href = readyEpisode ? "/content-os/?episode=" + encodeURIComponent(readyEpisode.id) + "#results" : "/content-os/?from=episodes#results";
}

function promptRecord(episode, format, notes, sourceContext) {
  return {
    schemaVersion: "apc.episode_prompt.v1",
    format,
    notes,
    text: productionPrompt(episode, format, notes, sourceContext),
    sourceContext,
    masterRules: masterIdentity(),
  };
}
async function createEpisodeAndBuildPrompt(episode, sourceContext) {
  const existing = existingEpisodeForSource(sourceContext);
  if (existing && !existing.archived_at) {
    element("packEpisode").value = existing.id;
    element("importEpisode").value = existing.id;
    element("reviewEpisode").value = existing.id;
    element("promptOutput").textContent = latestPrompt(existing.id)?.text || "The existing prompt could not be loaded.";
    element("pack").scrollIntoView({ behavior: "smooth", block: "start" });
    const sourceName = sourceContext?.topic?.name || sourceContext?.researchItem?.title || existing.title;
    setStatus("Existing episode opened", sourceName + " is already tracked as " + existing.id + ". Rebuild it as a revision instead of creating a duplicate.", "success");
    return;
  }
  setStatus("Saving tracked episode", "The prompt will appear after D1 confirms the episode record.", "saving");
  const format = element("packFormat").value;
  const notes = element("packNotes").value.trim();
  const prompt = promptRecord(episode, format, notes, sourceContext);
  await apiRequest({ action: "create_tracked_prompt", episode, prompt, idempotencyKey: uniqueKey("prompt", episode.id) });
  element("packEpisode").value = episode.id;
  element("promptOutput").textContent = prompt.text;
  element("importEpisode").value = episode.id;
  element("pack").scrollIntoView({ behavior: "smooth", block: "start" });
  element("copyPrompt").focus({ preventScroll: true });
  setStatus("Prompt saved and ready", episode.id + " now has a cloud record and immutable prompt version 1.", "success");
}
async function savePromptRevision() {
  const episode = workflow.episodes.find(item => item.id === element("packEpisode").value);
  if (!episode) throw new Error("Create an episode first.");
  const savedSourceContext = sourceContext(episode.id) || manualContext(episode.title);
  const format = element("packFormat").value;
  const notes = element("packNotes").value.trim();
  const prompt = promptRecord(episode, format, notes, savedSourceContext);
  setStatus("Saving prompt revision", "The new prompt replaces the active draft but keeps earlier versions.", "saving");
  await apiRequest({ action: "save_prompt_revision", episodeId: episode.id, prompt, idempotencyKey: uniqueKey("prompt-revision", episode.id) });
  element("promptOutput").textContent = prompt.text;
  setStatus("Prompt revision saved", episode.id + " has a new immutable prompt version.", "success");
}
function parseImportedJson(raw) {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  return JSON.parse((fenced ? fenced[1] : trimmed).trim());
}
async function importPackage() {
  const episodeId = element("importEpisode").value;
  if (!episodeId) throw new Error("Choose an episode first.");
  const raw = element("packageJson").value;
  if (!raw.trim()) throw new Error("Paste the final JSON package from Codex.");
  const pack = parseImportedJson(raw);
  setStatus("Importing package", "Checking identity, master rules, red-team and hook gate.", "saving");
  await apiRequest({ action: "import_production_pack", episodeId, pack, idempotencyKey: uniqueKey("pack", episodeId) });
  renderFilmingPack(episodeId, true);
  setStatus("Package imported", episodeId + " is tracked. Lock for filming is available only after all gates pass.", "success");
}
async function lockScript(episodeId) {
  setStatus("Locking script", "Verifying the latest imported package.", "saving");
  await apiRequest({ action: "lock_script", episodeId, idempotencyKey: uniqueKey("lock", episodeId) });
  setStatus("Ready to film", episodeId + " is locked to the red-teamed script and filming board.", "success");
}
async function saveReview() {
  const episodeId = element("reviewEpisode").value;
  if (!episodeId) throw new Error("Choose an episode first.");
  const raw = element("reviewManifest").value;
  if (!raw.trim()) throw new Error("Paste the review manifest returned by the video audit.");
  const manifest = parseImportedJson(raw);
  setStatus("Saving video review", "Checking the review mode and exact video SHA-256.", "saving");
  await apiRequest({ action: "save_review", episodeId, manifest });
  setStatus("Video review saved", episodeId + " now points to this exact video export.", "success");
}
async function updateEpisodeTitle(episodeId, container) {
  const input = container.querySelector(`[data-episode-title="${episodeId}"]`);
  const title = input?.value.trim() || "";
  if (!title) throw new Error("Add an episode title.");
  await apiRequest({ action: "update_episode_details", episodeId, title, idempotencyKey: uniqueKey("episode-edit", episodeId) });
  setStatus("Episode updated", episodeId + " now uses the revised title. Its prior artifacts remain unchanged.", "success");
}
async function setEpisodeArchived(episodeId, archived) {
  if (archived && !confirm("Archive " + episodeId + "? It will leave the active workflow but its prompts, packs, reviews and analytics will remain recoverable.")) return;
  await apiRequest({ action: "set_episode_archived", episodeId, archived, idempotencyKey: uniqueKey(archived ? "archive" : "restore", episodeId) });
  if (selectedFilmingEpisodeId === episodeId && archived) renderFilmingPack(null);
  setStatus(archived ? "Episode archived" : "Episode restored", episodeId + (archived ? " was removed from the active workflow without deleting its history." : " is active again."), "success");
}
async function updateEpisodeStage(episodeId, status) {
  await apiRequest({ action: "update_episode_status", episodeId, status });
  setStatus("Workflow advanced", episodeId + " is now " + status.replaceAll("_", " ") + ".", "success");
}
async function handleEpisodeClick(event) {
  const button = event.target.closest("button, a");
  if (!button) return;
  const lock = button.dataset.lockEpisode;
  const open = button.dataset.openEpisode;
  const editPack = button.dataset.editPack;
  const saveTitle = button.dataset.saveEpisodeTitle;
  const archive = button.dataset.archiveEpisode;
  const advance = button.dataset.advanceEpisode;
  const reviewLink = button.dataset.reviewEpisodeLink;
  try {
    if (lock) await lockScript(lock);
    if (open) {
      element("packEpisode").value = open;
      element("importEpisode").value = open;
      element("reviewEpisode").value = open;
      const pack = latestPack(open);
      if (pack) renderFilmingPack(open, true);
      else {
        element("promptOutput").textContent = latestPrompt(open)?.text || "No tracked prompt is available for this legacy episode.";
        element("pack").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    if (editPack) {
      element("importEpisode").value = editPack;
      element("packageJson").value = JSON.stringify(latestPack(editPack), null, 2);
      element("import").scrollIntoView({ behavior: "smooth", block: "start" });
      element("packageJson").focus({ preventScroll: true });
    }
    if (saveTitle) await updateEpisodeTitle(saveTitle, button.closest("article"));
    if (archive) await setEpisodeArchived(archive, button.dataset.archived === "true");
    if (advance) await updateEpisodeStage(advance, button.dataset.advanceStatus);
    if (reviewLink) element("reviewEpisode").value = reviewLink;
  } catch (error) { setStatus("Could not update episode", error.message, "error"); }
}

arrangeWorkflowSections();

element("episodeForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const episode = { id: element("episodeId").value.trim().toUpperCase(), title: element("episodeTitle").value.trim(), researchItemId: null };
    await createEpisodeAndBuildPrompt(episode, manualContext(episode.title));
    element("episodeTitle").value = "";
  } catch (error) { setStatus("Could not create episode", error.message, "error"); }
});
element("researchIdeas").addEventListener("click", async event => {
  const button = event.target.closest("button[data-research-item]");
  if (!button) return;
  const item = (research.items || []).find(candidate => candidate.itemId === button.dataset.researchItem);
  try { await createEpisodeAndBuildPrompt({ id: nextEpisodeId(), title: button.dataset.title, researchItemId: button.dataset.researchItem }, researchContext(item)); }
  catch (error) { setStatus("Could not create episode", error.message, "error"); }
});
element("masterIdeas").addEventListener("click", async event => {
  const button = event.target.closest("button[data-master-topic]");
  if (!button) return;
  const topic = MASTER_TOPIC_BANK.find(item => item.id === button.dataset.masterTopic);
  if (!topic) return;
  try { await createEpisodeAndBuildPrompt({ id: nextEpisodeId(), title: topic.name, researchItemId: null }, masterContext(topic)); }
  catch (error) { setStatus("Could not create episode", error.message, "error"); }
});
element("episodeList").addEventListener("click", handleEpisodeClick);
element("archivedEpisodeList").addEventListener("click", handleEpisodeClick);
element("packEpisode").addEventListener("change", () => {
  const episodeId = element("packEpisode").value;
  element("importEpisode").value = episodeId;
  element("promptOutput").textContent = latestPrompt(episodeId)?.text || "No tracked prompt is available for this legacy episode.";
});
element("rebuildPrompt").addEventListener("click", () => { savePromptRevision().catch(error => setStatus("Could not save prompt", error.message, "error")); });
element("copyPrompt").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(element("promptOutput").textContent); setStatus("Prompt copied", "Paste it into Codex. The prompt requires /redteam and returns import-ready JSON.", "success"); }
  catch { setStatus("Copy unavailable", "Select the prompt and copy it manually.", "error"); }
});
element("importPackage").addEventListener("click", () => { importPackage().catch(error => setStatus("Could not import package", error.message, "error")); });
element("saveReview").addEventListener("click", () => { saveReview().catch(error => setStatus("Could not save review", error.message, "error")); });
element("packageFile").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 120000) throw new Error("Package JSON exceeds the 120 KB limit.");
    element("packageJson").value = await file.text();
    setStatus("Package file loaded", "Validate and import it when the selected episode ID is correct.", "success");
  } catch (error) { setStatus("Could not load package", error.message, "error"); }
  finally { event.target.value = ""; }
});
element("downloadFilmingHtml").addEventListener("click", downloadFilmingHtml);

load().catch(error => setStatus("Episode Studio unavailable", error.message, "error"));
