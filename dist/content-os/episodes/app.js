import { MASTER_VIDEO_RULES, masterVideoRulePromptLines } from "../video-rules.js";
import { MASTER_TOPIC_BANK, MASTER_TOPIC_BANK_VERSION } from "../topic-bank.js";

const EPISODE_API = "/api/content-os/episode-workflow";
const RESEARCH_API = "/api/content-os/research?limit=12";
const STAGES = Object.freeze(["IDEA", "APPROVED", "SCRIPT_LOCKED", "FILMED", "EDITING", "REVIEW", "READY", "PUBLISHED"]);

let workflow = { episodes: [], reviews: [], publications: [] };
let research = { items: [] };

function element(id) { return document.getElementById(id); }
function clear(target) { while (target.firstChild) target.removeChild(target.firstChild); }
function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}
function setStatus(title, detail, kind = "") {
  element("episodeStatus").textContent = title;
  element("episodeDetail").textContent = detail;
  element("episodeDetail").className = "sync-detail" + (kind ? " " + kind : "");
}
function nextEpisodeId() {
  const used = new Set(workflow.episodes.map(item => item.id));
  let number = Math.max(0, ...workflow.episodes.map(item => Number(/^EP(\d+)$/.exec(item.id)?.[1] || 0))) + 1;
  while (used.has("EP" + String(number).padStart(2, "0"))) number += 1;
  return "EP" + String(number).padStart(2, "0");
}

async function request(payload) {
  const response = await fetch(EPISODE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-APC-Content-OS": "1" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The episode update could not be saved.");
  workflow = body;
  render();
  setStatus("Saved", "The episode workflow is current.", "success");
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
  setStatus("Secure workflow ready", "Episodes, research and linked results are current.", "success");
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
    const button = node("button", "button compact", "Build script prompt");
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
    const button = node("button", "button compact", "Build script prompt");
    button.type = "button";
    button.dataset.masterTopic = topic.id;
    card.appendChild(button);
    list.appendChild(card);
  }
}

function renderEpisodes() {
  const list = element("episodeList");
  clear(list);
  if (!workflow.episodes.length) { list.appendChild(node("div", "empty-state", "Create the first episode from research or enter one manually.")); return; }
  for (const episode of workflow.episodes) {
    const card = node("article", "card");
    const heading = node("div", "card-heading");
    const title = node("div");
    title.appendChild(node("p", "card-label", episode.id));
    title.appendChild(node("h3", "", episode.title));
    heading.appendChild(title);
    const field = node("div", "field");
    field.appendChild(node("label", "", "Stage"));
    const select = node("select");
    select.dataset.episodeStatus = episode.id;
    for (const stage of STAGES) {
      const option = node("option", "", stage);
      option.value = stage;
      option.selected = stage === episode.status;
      select.appendChild(option);
    }
    field.appendChild(select);
    heading.appendChild(field);
    card.appendChild(heading);
    card.appendChild(node("p", "subtle", episode.productionPack ? "Filming pack saved." : "Filming pack not saved yet."));
    list.appendChild(card);
  }
}

function renderEpisodeOptions() {
  const select = element("packEpisode");
  const selected = select.value;
  clear(select);
  if (!workflow.episodes.length) {
    const option = node("option", "", "Create an episode first");
    option.value = "";
    select.appendChild(option);
    return;
  }
  for (const episode of workflow.episodes) {
    const option = node("option", "", episode.id + ": " + episode.title);
    option.value = episode.id;
    option.selected = episode.id === selected;
    select.appendChild(option);
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
  renderMasterIdeas();
  renderResearch();
  renderEpisodes();
  renderEpisodeOptions();
  renderResults();
  element("masterRulesStatus").textContent = "Master rules " + MASTER_VIDEO_RULES.version + " and teen idea bank active";
  element("masterRulesDetail").textContent =
    "Synced from APC-AI-OS at SHA-256 " + MASTER_VIDEO_RULES.sha256.slice(0, 12) +
    ". Idea bank " + MASTER_TOPIC_BANK_VERSION + " carries its evidence into the filming prompt. Old HTML boards and previous rule copies are excluded.";
  if (!element("episodeId").value) element("episodeId").value = nextEpisodeId();
}

function productionPrompt() {
  const episode = workflow.episodes.find(item => item.id === element("packEpisode").value);
  if (!episode) return "Create an episode first.";
  const notes = element("packNotes").value.trim() || "Keep the language warm, practical and within APC scope.";
  const masterTopic = MASTER_TOPIC_BANK.find(topic => topic.name === episode.title) || null;
  const researchItem = (research.items || []).find(item => item.itemId === episode.source_research_item_id) || null;
  const evidenceContext = masterTopic ? {
    sourceType: "master-topic-bank",
    masterRulesVersion: MASTER_VIDEO_RULES.version,
    topicBankVersion: MASTER_TOPIC_BANK_VERSION,
    topic: masterTopic,
  } : researchItem ? {
    sourceType: "governed-research-feed",
    researchItem: researchItem,
  } : {
    sourceType: "manual",
    instruction: "Verify the required statistic or specific number before writing the hook. Do not invent it.",
  };
  return [
    `Create a complete, filming-ready APC episode pack for ${episode.id}: ${episode.title}.`,
    "",
    "Format: " + element("packFormat").value,
    "Constraints: " + notes,
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
    "Keep the spoken script and every scene perfectly aligned so rerecording is not needed later. Do not create an SRT file.",
  ].join("\n");
}

async function createEpisodeAndBuildPrompt(episode) {
  await request({ action: "create_episode", episode: episode });
  element("packEpisode").value = episode.id;
  element("promptOutput").textContent = productionPrompt();
  element("pack").scrollIntoView({ behavior: "smooth", block: "start" });
  element("copyPrompt").focus({ preventScroll: true });
  setStatus("Script prompt ready", episode.id + " is selected. Copy the prompt into Codex to generate the complete filming pack.", "success");
}

element("episodeForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const episode = { id: element("episodeId").value.trim().toUpperCase(), title: element("episodeTitle").value.trim(), researchItemId: null };
    await createEpisodeAndBuildPrompt(episode);
    element("episodeTitle").value = "";
    element("episodeId").value = nextEpisodeId();
  } catch (error) { setStatus("Could not create episode", error.message, "error"); }
});

element("researchIdeas").addEventListener("click", async event => {
  const button = event.target.closest("button[data-research-item]");
  if (!button) return;
  try { await createEpisodeAndBuildPrompt({ id: nextEpisodeId(), title: button.dataset.title, researchItemId: button.dataset.researchItem }); }
  catch (error) { setStatus("Could not create episode", error.message, "error"); }
});

element("masterIdeas").addEventListener("click", async event => {
  const button = event.target.closest("button[data-master-topic]");
  if (!button) return;
  const topic = MASTER_TOPIC_BANK.find(item => item.id === button.dataset.masterTopic);
  if (!topic) return;
  try { await createEpisodeAndBuildPrompt({ id: nextEpisodeId(), title: topic.name, researchItemId: null }); }
  catch (error) { setStatus("Could not create episode", error.message, "error"); }
});

element("episodeList").addEventListener("change", async event => {
  const episodeId = event.target.dataset.episodeStatus;
  if (!episodeId) return;
  try { await request({ action: "update_episode_status", episodeId, status: event.target.value }); }
  catch (error) { setStatus("Could not update stage", error.message, "error"); await load(); }
});

element("generatePrompt").addEventListener("click", () => { element("promptOutput").textContent = productionPrompt(); });
element("copyPrompt").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(element("promptOutput").textContent); setStatus("Prompt copied", "Paste it into Codex to create the filming-ready pack.", "success"); }
  catch { setStatus("Copy unavailable", "Select the prompt and copy it manually.", "error"); }
});
element("savePack").addEventListener("click", async () => {
  const episodeId = element("packEpisode").value;
  if (!episodeId) { setStatus("Create an episode first", "A filming pack must belong to an episode.", "error"); return; }
  try { await request({ action: "save_production_pack", episodeId, pack: { format: element("packFormat").value, notes: element("packNotes").value.trim(), prompt: element("promptOutput").textContent, savedAt: new Date().toISOString() } }); }
  catch (error) { setStatus("Could not save filming pack", error.message, "error"); }
});

load().catch(error => setStatus("Episode Studio unavailable", error.message, "error"));
