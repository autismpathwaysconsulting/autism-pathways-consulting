import { MASTER_VIDEO_RULES, masterVideoRulePromptLines } from "../video-rules.js";
import { MASTER_TOPIC_BANK, MASTER_TOPIC_BANK_VERSION } from "../topic-bank.js";

const EPISODE_API = "/api/content-os/episode-workflow";
const RESEARCH_API = "/api/content-os/research?limit=12";
const STAGES = Object.freeze(["IDEA", "APPROVED", "SCRIPT_LOCKED", "FILMED", "EDITING", "REVIEW", "READY", "PUBLISHED"]);
const PACKAGE_SCHEMA = "apc.episode_pack.v2";

let workflow = { episodes: [], reviews: [], publications: [], artifacts: [], events: [], nextEpisodeId: "EP01" };
let research = { items: [] };

function element(id) { return document.getElementById(id); }
function clear(target) { target.replaceChildren(); }
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
function masterIdentity() {
  return { version: MASTER_VIDEO_RULES.version, sha256: MASTER_VIDEO_RULES.sha256, sourcePath: MASTER_VIDEO_RULES.sourcePath };
}
function packageContract(episodeId) {
  return [
    "",
    "MANDATORY FINAL RED-TEAM",
    "Before presenting the final version, run /redteam on factual accuracy, evidence scope, autism-community framing, parent shame, burden framing, overclaiming, production alignment and likely backlash. Correct all fixable issues before the final output.",
    "A PASS means the corrected final pack is safe enough to film. If the risks cannot be corrected, return REVISE.",
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
    if (packArtifact.redteam_status !== "PASS") return "Next: revise the package until the red-team result is PASS.";
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
function renderEpisodes() {
  const list = element("episodeList");
  clear(list);
  if (!workflow.episodes.length) { list.appendChild(node("div", "empty-state", "Create the first tracked episode from an idea.")); return; }
  for (const episode of workflow.episodes) {
    const packArtifact = latestArtifact(episode.id, "PRODUCTION_PACK");
    const publications = workflow.publications.filter(item => item.episodeId === episode.id);
    const card = node("article", "card episode-workflow-card");
    card.id = episode.id;
    const heading = node("div", "card-heading");
    const title = node("div");
    title.appendChild(node("p", "card-label", episode.id));
    title.appendChild(node("h3", "", episode.title));
    heading.appendChild(title);
    heading.appendChild(node("span", "status-badge " + (episode.status === "READY" || episode.status === "PUBLISHED" ? "success" : "neutral"), episode.status));
    card.appendChild(heading);
    if (packArtifact) {
      const gate = node("p", "subtle", `Pack v${packArtifact.version} · Red-team ${packArtifact.redteam_status} · Hook ${packArtifact.hook_gate_status || "not set"} · ${packArtifact.final_decision || "no decision"}`);
      card.appendChild(gate);
    } else card.appendChild(node("p", "subtle", "Prompt saved. No returned production package imported yet."));
    card.appendChild(node("p", "next-action", nextAction(episode, packArtifact, publications)));
    const actions = node("div", "button-row");
    const open = node("button", "button secondary compact", "Open workspace");
    open.type = "button"; open.dataset.openEpisode = episode.id; actions.appendChild(open);
    if (packArtifact && packArtifact.redteam_status === "PASS" && packArtifact.hook_gate_status === "PASS" && packArtifact.final_decision === "FILM" && episode.status === "APPROVED") {
      const lock = node("button", "button compact", "Lock for filming");
      lock.type = "button"; lock.dataset.lockEpisode = episode.id; actions.appendChild(lock);
    }
    const field = node("label", "field compact-field");
    field.appendChild(node("span", "visually-hidden", "Update stage for " + episode.id));
    const select = node("select");
    select.dataset.episodeStatus = episode.id;
    for (const stage of STAGES) {
      const option = node("option", "", stage);
      option.value = stage; option.selected = stage === episode.status; select.appendChild(option);
    }
    field.appendChild(select); actions.appendChild(field); card.appendChild(actions);
    const timeline = node("details", "timeline");
    timeline.appendChild(node("summary", "", "Timeline"));
    const eventList = node("ol", "timeline-list");
    const events = workflow.events.filter(item => item.episode_id === episode.id).slice().reverse();
    if (!events.length) eventList.appendChild(node("li", "subtle", "Legacy episode record. New actions will appear here."));
    for (const item of events) eventList.appendChild(node("li", "", item.event_type.replaceAll("_", " ") + " · " + humanDate(item.created_at)));
    for (const publication of publications) eventList.appendChild(node("li", "", "PUBLISHED ON " + publication.platform.toUpperCase() + " · " + humanDate(publication.publishedAt) + " · " + publication.snapshotCount + " checkpoints"));
    timeline.appendChild(eventList); card.appendChild(timeline);
    list.appendChild(card);
  }
}
function renderEpisodeOptions() {
  for (const selectId of ["packEpisode", "importEpisode", "reviewEpisode"]) {
    const select = element(selectId);
    const selected = select.value;
    clear(select);
    if (!workflow.episodes.length) { const option = node("option", "", "Create an episode first"); option.value = ""; select.appendChild(option); continue; }
    for (const episode of workflow.episodes) {
      const option = node("option", "", episode.id + ": " + episode.title);
      option.value = episode.id; option.selected = episode.id === selected; select.appendChild(option);
    }
  }
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
  element("episodeCount").textContent = String(workflow.episodes.length);
  element("filmingCount").textContent = String(workflow.episodes.filter(item => item.status === "SCRIPT_LOCKED").length);
  element("readyCount").textContent = String(workflow.episodes.filter(item => item.status === "READY").length);
  element("publishedCount").textContent = String(workflow.episodes.filter(item => item.status === "PUBLISHED").length);
  renderMasterIdeas(); renderResearch(); renderEpisodes(); renderEpisodeOptions(); renderResults();
  element("masterRulesStatus").textContent = "Master rules " + MASTER_VIDEO_RULES.version + " and tracked package gate active";
  element("masterRulesDetail").textContent = "Synced from APC-AI-OS at SHA-256 " + MASTER_VIDEO_RULES.sha256.slice(0, 12) + ". Every new prompt is saved before it is shown. A red-team PASS and Hook Gate PASS are required before filming.";
  element("episodeId").value = nextEpisodeId();
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
  const sourceContext = episode.productionPack?.sourceContext || manualContext(episode.title);
  const format = element("packFormat").value;
  const notes = element("packNotes").value.trim();
  const prompt = promptRecord(episode, format, notes, sourceContext);
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
element("episodeList").addEventListener("click", async event => {
  const lock = event.target.closest("button[data-lock-episode]");
  const open = event.target.closest("button[data-open-episode]");
  try {
    if (lock) await lockScript(lock.dataset.lockEpisode);
    if (open) {
      const episodeId = open.dataset.openEpisode;
      element("packEpisode").value = episodeId;
      element("importEpisode").value = episodeId;
      const prompt = latestArtifact(episodeId, "PROMPT")?.payload?.text || "No tracked prompt is available for this legacy episode.";
      element("promptOutput").textContent = prompt;
      element("pack").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) { setStatus("Could not update episode", error.message, "error"); }
});
element("episodeList").addEventListener("change", async event => {
  const episodeId = event.target.dataset.episodeStatus;
  if (!episodeId) return;
  try { await apiRequest({ action: "update_episode_status", episodeId, status: event.target.value }); setStatus("Stage updated", episodeId + " is now " + event.target.value + ".", "success"); }
  catch (error) { setStatus("Could not update stage", error.message, "error"); await load(); }
});
element("packEpisode").addEventListener("change", () => {
  const episodeId = element("packEpisode").value;
  element("importEpisode").value = episodeId;
  element("promptOutput").textContent = latestArtifact(episodeId, "PROMPT")?.payload?.text || "No tracked prompt is available for this legacy episode.";
});
element("rebuildPrompt").addEventListener("click", () => { savePromptRevision().catch(error => setStatus("Could not save prompt", error.message, "error")); });
element("copyPrompt").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(element("promptOutput").textContent); setStatus("Prompt copied", "Paste it into Codex. The prompt requires /redteam and returns import-ready JSON.", "success"); }
  catch { setStatus("Copy unavailable", "Select the prompt and copy it manually.", "error"); }
});
element("importPackage").addEventListener("click", () => { importPackage().catch(error => setStatus("Could not import package", error.message, "error")); });
element("saveReview").addEventListener("click", () => { saveReview().catch(error => setStatus("Could not save review", error.message, "error")); });

load().catch(error => setStatus("Episode Studio unavailable", error.message, "error"));
