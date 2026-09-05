import {
  CALENDAR_STATUSES,
  LEGACY_STARTER_CALENDAR,
  MAX_CALENDAR_ENTRIES,
  STATE_SCHEMA_VERSION,
  assertValidContentOsState,
  defaultContentOsState,
  migrateContentOsState,
  validateContentOsState,
} from "./schema.js";
import {
  ANALYTICS_METRICS,
  ANALYTICS_PROTOCOL_VERSION,
  ANALYTICS_SCHEMA_VERSION,
  assertValidAnalyticsSnapshot,
  assertValidPublication,
  isCanonicalUtcTimestamp,
  median,
  safeRate,
  validateAnalyticsSubmission,
} from "./analytics.js";

const DATA = {
  families:[
    "Understand the Behaviour","Make Communication Easier","Build Independence",
    "Make School & Learning Work","Growing Up Autistic","Everyday Life","Life After School","Authority / Evidence"
  ],
  stages:[
    "Early development","Preschool","Starting school","Growing independence",
    "Puberty / early adolescence","Teen years","Preparing to leave school","Young adulthood","Long-term adulthood"
  ],
  bookSections:[
    "Why is this happening?","Why can’t we understand each other?","They know how. Why can’t they do it?",
    "How much should I help?","School is becoming hard","Ordinary things that aren’t so ordinary",
    "Their body is changing","Friends, boundaries and relationships","My child isn’t little anymore",
    "What happens after school?","Everyone tells me something different","What about the future?"
  ],
  topics:[
    {name:"Behaviour, meltdowns & overwhelm",hook:"I stayed calm. I warned them. I gave extra time. They STILL melted down.",family:"Understand the Behaviour",stage:"Starting school",use:"Flagship",keywords:"meltdown behaviour overwhelm regulation escalation"},
    {name:"Communication breakdowns",hook:"They can talk for 20 minutes about Roblox. Then “How was school?” gets “I don’t know.”",family:"Make Communication Easier",stage:"Starting school",use:"Flagship",keywords:"communication language questions i don't know instructions"},
    {name:"Task initiation / executive functioning",hook:"The homework takes 20 minutes. Starting it takes 90.",family:"Make School & Learning Work",stage:"Growing independence",use:"Workshop",keywords:"homework executive function starting task initiation"},
    {name:"Independence / prompting",hook:"I know they can dress themselves. But if I wait, we’ll be late. So I do it for them. Again.",family:"Build Independence",stage:"Starting school",use:"Flagship",keywords:"independence dressing prompting hygiene daily living"},
    {name:"School-home gap",hook:"Teacher: “They were fine today.” Me after the worst evening all week: “Fine?”",family:"Make School & Learning Work",stage:"Starting school",use:"Workshop",keywords:"school home masking stress crash"},
    {name:"Routines / transitions",hook:"The iPad turns off. Suddenly the whole evening falls apart.",family:"Everyday Life",stage:"Starting school",use:"Workshop",keywords:"transition routine ipad screen stopping"},
    {name:"Sensory contradictions",hook:"They blast YouTube. Then the hand dryer makes them cover their ears.",family:"Everyday Life",stage:"Starting school",use:"Reach",keywords:"sensory sound hand dryer noise"},
    {name:"Selective eating",hook:"They eat chicken nuggets. Just not THAT brand of chicken nuggets.",family:"Everyday Life",stage:"Preschool",use:"Workshop",keywords:"feeding eating food picky selective"},
    {name:"Sleep",hook:"They’re exhausted all morning. Then 10pm comes and suddenly they’re wide awake.",family:"Everyday Life",stage:"Starting school",use:"Workshop",keywords:"sleep bedtime tired waking"},
    {name:"Body awareness",hook:"They say they’re not hungry. Ten minutes later they’re STARVING and everything is wrong.",family:"Everyday Life",stage:"Growing independence",use:"Workshop",keywords:"interoception hunger toilet fatigue body"},
    {name:"Toileting",hook:"They know how to use the toilet. Why do they hold it the entire school day?",family:"Everyday Life",stage:"Preschool",use:"Collaboration",keywords:"toilet toileting diaper constipation"},
    {name:"Puberty / privacy",hook:"My child keeps touching themselves in the living room. Saying STOP isn’t enough.",family:"Growing Up Autistic",stage:"Puberty / early adolescence",use:"Flagship",keywords:"puberty privacy masturbation touching"},
    {name:"Consent / boundaries",hook:"We keep saying “That’s private.” But what exactly does PRIVATE mean?",family:"Growing Up Autistic",stage:"Puberty / early adolescence",use:"Flagship",keywords:"consent boundaries private body sexuality"},
    {name:"Friendship",hook:"They have classmates. Does that mean they actually have friends?",family:"Growing Up Autistic",stage:"Growing independence",use:"Workshop",keywords:"friend friendship social peer"},
    {name:"Emotional development",hook:"I corrected one tiny thing. Suddenly it’s: “I’m stupid. I can’t do anything.”",family:"Understand the Behaviour",stage:"Growing independence",use:"Workshop",keywords:"emotion correction confidence perfectionism"},
    {name:"Medication literacy",hook:"My child started medication. Everyone asks, “Is it working?” What exactly am I supposed to watch?",family:"Authority / Evidence",stage:"Starting school",use:"Collaboration",keywords:"medication medicine clinician appetite sleep"},
    {name:"Diet myths",hook:"Should I remove gluten because my child is autistic?",family:"Authority / Evidence",stage:"Starting school",use:"Authority",keywords:"diet gluten sugar supplements dairy evidence"},
    {name:"Early development",hook:"Everyone keeps saying, “They’ll talk when they’re ready.” When should you actually ask for help?",family:"Make Communication Easier",stage:"Early development",use:"Workshop",keywords:"development speech milestones toddler"},
    {name:"Motor / coordination",hook:"They know exactly what to write. Their hand can’t keep up.",family:"Make School & Learning Work",stage:"Starting school",use:"Collaboration",keywords:"motor handwriting coordination OT"},
    {name:"Adolescence",hook:"At what age should I stop reminding them about everything?",family:"Build Independence",stage:"Teen years",use:"Flagship",keywords:"teen adolescence reminders independence"},
    {name:"Leaving school",hook:"School gave them a timetable for years. Then adulthood says: organise your own life.",family:"Life After School",stage:"Preparing to leave school",use:"Flagship",keywords:"adult transition school work university"},
    {name:"Future planning",hook:"The question parents hate thinking about: Who helps my child when I can’t?",family:"Life After School",stage:"Long-term adulthood",use:"Collaboration",keywords:"future ageing parents siblings housing"},
    {name:"Autism myths",hook:"They talk, so communication isn’t a problem.",family:"Authority / Evidence",stage:"Starting school",use:"Reach",keywords:"myths eye contact empathy attention"}
  ]
};

const STORAGE = Object.freeze({
  state: "apcContentOSv23",
  legacyState: ["apcContentOSv21", "apcContentOSv2"],
  sync: "apcContentOSv23CloudMeta",
  legacySync: "apcContentOSv22CloudMeta",
  recovery: "apcContentOSv23Recovery",
  analytics: "apcContentOSv23Analytics",
  analyticsQueue: "apcContentOSv23AnalyticsQueue",
  research: "apcContentOSv23Research",
});

const ENDPOINTS = Object.freeze({
  state: "/api/content-os/state",
  analytics: "/api/content-os/analytics",
  connections: "/api/content-os/connections",
  publications: "/api/content-os/publications",
  ingestionStatus: "/api/content-os/ingestion-status",
  research: "/api/content-os/research",
  history: "/api/content-os/history",
});

const BACKUP_FORMAT = "apc.content-os.backup.v2.3";
const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
const MAX_ANALYTICS_RECORDS = 10000;
const MAX_LOCAL_ANALYTICS_CACHE = 100;
const MAX_ANALYTICS_QUEUE = 100;
const ANALYTICS_PAGE_LIMIT = 100;
const DEFAULT_RESULT_LIMIT = 12;
const RESEARCH_FEED_SCHEMA = "apc.research_feed.v1";
const RESEARCH_PAGE_LIMIT = 52;
const MAX_RESEARCH_RUNS = 520;
const MAX_RESEARCH_ITEMS = 5000;
const MAX_HISTORY_RECORDS = 10000;
const DEFAULT_HISTORY_LIMIT = 20;
const DB_NAME = "APCContentOS";
const DB_VERSION = 2;
const PROTOCOL_LABEL = "APC Content OS v2.3";
const PRIMARY_CHECKPOINT = "24h";
const METRIC_REASON_FIELDS = Object.freeze({
  views: "rMissingViews",
  reach: "rMissingReach",
  averageWatchTimeSeconds: "rMissingAverageWatch",
  totalWatchTimeSeconds: "rMissingTotalWatch",
  likes: "rMissingLikes",
  commentsCount: "rMissingComments",
  saves: "rMissingSaves",
  shares: "rMissingShares",
});

let startupWarning = "";
let localStateIsUntouchedStarter = false;
let state = loadLocalState();
let syncMeta = loadSyncMeta();
let analyticsRecords = loadAnalyticsCache();
let analyticsQueue = loadAnalyticsQueue();
let connectorState = { configuredProviders: {}, connections: [], ingestionEnabled: false, enabledProviders: [] };
let researchCache = loadResearchCache();
let pendingCloudRecord = null;
let historyRecords = [];
let visibleHistoryLimit = DEFAULT_HISTORY_LIMIT;
let recoveryCopy = null;
let selectedResearchContext = null;
let researchHistoryBounded = false;
let visibleResultLimit = DEFAULT_RESULT_LIMIT;
let selectedCalendarMonth = new Date().toISOString().slice(0, 7);
let editingCalendarDate = null;
let saveTimer = null;
let syncInFlight = false;
let cloudMode = "checking";
let databasePromise = null;

function element(id) {
  return document.getElementById(id);
}

function text(value) {
  return value === null || value === undefined ? "" : String(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every(function (key, index) {
    return key === expected[index];
  });
}

function makeNode(tagName, className, content) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = text(content);
  return node;
}

function clearNode(node) {
  if (node) node.replaceChildren();
}

function makeButton(label, action, className, dataset) {
  const button = makeNode("button", className || "button secondary compact", label);
  button.type = "button";
  button.dataset.action = action;
  if (dataset) {
    Object.entries(dataset).forEach(function (entry) {
      button.dataset[entry[0]] = text(entry[1]);
    });
  }
  return button;
}

function appendPill(parent, label, extraClass) {
  parent.appendChild(makeNode("span", "pill" + (extraClass ? " " + extraClass : ""), label));
}

function safeExternalUrl(value) {
  try {
    const parsed = new URL(text(value));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function humanDate(value) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
}

function normaliseMultilineText(value) {
  return text(value).replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}

function scrollToNode(node, block) {
  if (!node) return;
  const reduceMotion = globalThis.matchMedia && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: block || "start" });
}

function initialiseSectionNavigation() {
  const nav = document.querySelector(".nav-scroll");
  if (!nav) return;
  const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
  const sections = links.map(function (link) {
    return document.getElementById(link.getAttribute("href").slice(1));
  }).filter(Boolean);

  function showCurrentSection(sectionId) {
    links.forEach(function (link) {
      if (link.getAttribute("href") === "#" + sectionId) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    const current = links.find(function (link) {
      return link.getAttribute("href") === "#" + sectionId;
    });
    if (current) {
      const targetLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
      nav.scrollTo({ left: Math.max(0, targetLeft), behavior: "auto" });
    }
  }

  links.forEach(function (link) {
    link.addEventListener("click", function () {
      showCurrentSection(link.getAttribute("href").slice(1));
    });
  });

  if ("IntersectionObserver" in globalThis) {
    const observer = new IntersectionObserver(function (entries) {
      const visible = entries.filter(function (entry) { return entry.isIntersecting; })
        .sort(function (left, right) { return right.intersectionRatio - left.intersectionRatio; });
      if (visible[0]) showCurrentSection(visible[0].target.id);
    }, { rootMargin: "-15% 0px -70% 0px", threshold: [0, 0.01, 0.25] });
    sections.forEach(function (section) { observer.observe(section); });
  }

  const initialId = location.hash && document.getElementById(location.hash.slice(1))
    ? location.hash.slice(1)
    : sections[0]?.id;
  if (initialId) showCurrentSection(initialId);
}

function starterPlanningState() {
  const candidate = defaultContentOsState();
  candidate.calendar = Object.fromEntries(Object.entries(LEGACY_STARTER_CALENDAR).map(function (pair) {
    const date = pair[0];
    const entry = pair[1];
    return [date, {
      status: "idea",
      topic: entry.topic,
      area: entry.area,
      family: entry.family,
      stage: entry.stage,
    }];
  }));
  assertValidContentOsState(candidate);
  return candidate;
}

function toUtcIso(localValue) {
  if (!localValue) return null;
  const parsed = new Date(localValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toLocalInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function newUuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, function (byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function nextNumericId(items) {
  const now = Date.now();
  const ids = new Set(items.map(function (item) { return item.id; }));
  let candidate = now;
  while (ids.has(candidate)) candidate += 1;
  return candidate;
}

function loadLocalState() {
  let currentRaw = null;
  try {
    currentRaw = localStorage.getItem(STORAGE.state);
  } catch {
    startupWarning = "Local browser storage could not be read. A safe empty state was used.";
    return defaultContentOsState();
  }
  if (currentRaw) {
    try {
      const migrated = migrateContentOsState(JSON.parse(currentRaw));
      assertValidContentOsState(migrated);
      return migrated;
    } catch {
      startupWarning = "A local state copy could not be validated. A safe copy was used instead.";
      return defaultContentOsState();
    }
  }
  for (const key of STORAGE.legacyState) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const migrated = migrateContentOsState(JSON.parse(raw));
      assertValidContentOsState(migrated);
      return migrated;
    } catch {
      startupWarning = "A legacy local copy could not be validated. A safe copy was used instead.";
    }
  }
  localStateIsUntouchedStarter = true;
  return starterPlanningState();
}

function loadSyncMeta() {
  const fallback = {
    revision: 0,
    cloudUpdatedAt: null,
    dirty: false,
    cloudInitialized: false,
    lastError: null,
    pendingAction: null,
    pendingRequestId: null,
  };
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE.sync) || localStorage.getItem(STORAGE.legacySync) || "null");
  } catch {
    return fallback;
  }
  if (!isPlainObject(raw)) return fallback;
  return {
    revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
    cloudUpdatedAt: isCanonicalUtcTimestamp(raw.cloudUpdatedAt) ? raw.cloudUpdatedAt : null,
    dirty: raw.dirty === true,
    cloudInitialized: raw.cloudInitialized === true,
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    pendingAction: ["edit", "import", "reset", "migration", "restore"].includes(raw.pendingAction) ? raw.pendingAction : null,
    pendingRequestId: typeof raw.pendingRequestId === "string" ? raw.pendingRequestId : null,
  };
}

function persistSyncMeta() {
  try {
    localStorage.setItem(STORAGE.sync, JSON.stringify(syncMeta));
  } catch {
    return;
  }
}

function validAnalyticsRecord(record) {
  if (!isPlainObject(record)) return false;
  try {
    assertValidPublication(record.publication);
    assertValidAnalyticsSnapshot(record.snapshot);
  } catch {
    return false;
  }
  return Number.isSafeInteger(record.revision) && record.revision >= 1 &&
    isCanonicalUtcTimestamp(record.createdAt) && typeof record.archived === "boolean";
}

function loadAnalyticsCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.analytics) || "[]");
    if (!Array.isArray(parsed) || parsed.length > MAX_LOCAL_ANALYTICS_CACHE || !parsed.every(validAnalyticsRecord)) {
      startupWarning = "The local analytics cache failed validation and was not loaded.";
      return [];
    }
    return parsed.map(structuredClone);
  } catch {
    return [];
  }
}

async function persistAnalyticsCache() {
  if (analyticsRecords.length > MAX_ANALYTICS_RECORDS || !analyticsRecords.every(validAnalyticsRecord)) {
    throw new Error("Analytics exceed the safe local cache limit or failed validation.");
  }
  try {
    localStorage.setItem(
      STORAGE.analytics,
      JSON.stringify(analyticsRecords.slice(0, MAX_LOCAL_ANALYTICS_CACHE))
    );
  } catch {
    startupWarning = "Recent analytics could not be written to browser storage.";
  }
  try {
    await idbPut("cache", "analytics", analyticsRecords);
  } catch {
    setAnalyticsStatus("The complete analytics cache could not be saved to the durable browser store.", "error");
  }
}

function validQueuedAnalytics(entry) {
  if (!isPlainObject(entry) || !exactKeys(entry, ["payload", "expectedRevision", "queuedAt"])) return false;
  if (!Number.isSafeInteger(entry.expectedRevision) || entry.expectedRevision < 0) return false;
  if (!isCanonicalUtcTimestamp(entry.queuedAt)) return false;
  return validateAnalyticsSubmission(entry.payload).valid;
}

function loadAnalyticsQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.analyticsQueue) || "[]");
    if (!Array.isArray(parsed) || parsed.length > MAX_ANALYTICS_QUEUE || !parsed.every(validQueuedAnalytics)) {
      startupWarning = "The offline analytics queue failed validation and was not loaded.";
      return [];
    }
    return parsed.map(structuredClone);
  } catch {
    return [];
  }
}

async function persistAnalyticsQueue(candidateQueue) {
  const queue = candidateQueue || analyticsQueue;
  if (!Array.isArray(queue) || queue.length > MAX_ANALYTICS_QUEUE || !queue.every(validQueuedAnalytics)) {
    throw new Error("The offline analytics queue failed validation or reached its 100-item limit.");
  }
  let localSaved = false;
  let indexedDbSaved = false;
  try {
    localStorage.setItem(STORAGE.analyticsQueue, JSON.stringify(queue));
    localSaved = true;
  } catch {
    localSaved = false;
  }
  try {
    await idbPut("cache", "analyticsQueue", queue);
    indexedDbSaved = true;
  } catch {
    indexedDbSaved = false;
  }
  if (!localSaved && !indexedDbSaved) {
    throw new Error("The offline snapshot could not be saved durably. The form was kept so you can retry or copy it.");
  }
  return { localSaved: localSaved, indexedDbSaved: indexedDbSaved };
}

async function mergeRecoveredAnalyticsQueue(recoveredEntries) {
  if (!Array.isArray(recoveredEntries) || recoveredEntries.length > MAX_ANALYTICS_QUEUE ||
      !recoveredEntries.every(validQueuedAnalytics)) {
    throw new Error("Recovered analytics queue failed validation or exceeds 100 items.");
  }
  const candidates = analyticsQueue.concat(recoveredEntries);
  const cloudSnapshotIds = new Set(analyticsRecords.map(function (record) {
    return record.snapshot.snapshotId;
  }));
  const uniqueByRequest = new Map();
  candidates.forEach(function (entry) {
    if (cloudSnapshotIds.has(entry.payload.snapshot.snapshotId)) return;
    const identity = entry.payload.idempotencyKey + "|" + entry.payload.snapshot.snapshotId;
    const current = uniqueByRequest.get(identity);
    if (!current || Date.parse(entry.queuedAt) > Date.parse(current.queuedAt)) {
      uniqueByRequest.set(identity, structuredClone(entry));
    }
  });

  const latestByCheckpoint = new Map();
  uniqueByRequest.forEach(function (entry) {
    const checkpointKey = entry.payload.snapshot.publicationId + "|" + entry.payload.snapshot.checkpoint;
    const current = latestByCheckpoint.get(checkpointKey);
    const newerRevision = !current || entry.expectedRevision > current.expectedRevision;
    const newerQueueTime = current &&
      entry.expectedRevision === current.expectedRevision &&
      Date.parse(entry.queuedAt) > Date.parse(current.queuedAt);
    if (newerRevision || newerQueueTime) latestByCheckpoint.set(checkpointKey, entry);
  });

  const mergedQueue = Array.from(latestByCheckpoint.values()).sort(function (left, right) {
    return Date.parse(left.queuedAt) - Date.parse(right.queuedAt);
  });
  if (mergedQueue.length > MAX_ANALYTICS_QUEUE) {
    throw new Error("The merged offline analytics queue exceeds 100 items. Sync or export it before importing more.");
  }
  await persistAnalyticsQueue(mergedQueue);
  analyticsQueue = mergedQueue;
  return {
    restored: analyticsQueue.length,
    discardedDuplicates: candidates.length - analyticsQueue.length,
  };
}

function validResearchCache(value) {
  return exactKeys(value, ["schemaVersion", "generatedAt", "runs", "items", "nextCursor"]) &&
    value.schemaVersion === RESEARCH_FEED_SCHEMA &&
    isCanonicalUtcTimestamp(value.generatedAt) &&
    Array.isArray(value.runs) && Array.isArray(value.items) &&
    value.runs.length <= MAX_RESEARCH_RUNS && value.items.length <= MAX_RESEARCH_ITEMS &&
    value.runs.every(function (run) {
      return isPlainObject(run) && typeof run.runId === "string" &&
        isCanonicalUtcTimestamp(run.generatedAt) && Array.isArray(run.sources);
    }) &&
    value.items.every(function (item) {
      return isPlainObject(item) && typeof item.itemId === "string" && typeof item.runId === "string" &&
        ["topic", "finding"].includes(item.type) && ["new", "used", "archived"].includes(item.decision) &&
        isPlainObject(item.data);
    }) &&
    (value.nextCursor === null || (
      typeof value.nextCursor === "string" && value.nextCursor.length > 0 && value.nextCursor.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value.nextCursor)
    ));
}

function validResearchPage(value) {
  return validResearchCache(value) && value.runs.length <= RESEARCH_PAGE_LIMIT;
}

function emptyResearchCache() {
  return {
    schemaVersion: RESEARCH_FEED_SCHEMA,
    generatedAt: new Date(0).toISOString(),
    runs: [],
    items: [],
    nextCursor: null,
  };
}

function loadResearchCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.research) || "null");
    return validResearchCache(parsed) ? structuredClone(parsed) : emptyResearchCache();
  } catch {
    return emptyResearchCache();
  }
}

function persistResearchCache() {
  try {
    localStorage.setItem(STORAGE.research, JSON.stringify(researchCache));
  } catch {
    startupWarning = startupWarning || "Research cache could not be written to local storage.";
  }
  idbPut("cache", "research", researchCache).catch(function () {});
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise(function (resolve, reject) {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function () {
      const database = request.result;
      if (!database.objectStoreNames.contains("state")) database.createObjectStore("state");
      if (!database.objectStoreNames.contains("cache")) database.createObjectStore("cache");
    };
    request.onerror = function () { reject(request.error || new Error("IndexedDB could not open.")); };
    request.onsuccess = function () { resolve(request.result); };
  });
  return databasePromise;
}

async function idbPut(storeName, key, value) {
  const database = await openDatabase();
  await new Promise(function (resolve, reject) {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(structuredClone(value), key);
    transaction.oncomplete = function () { resolve(); };
    transaction.onerror = function () { reject(transaction.error || new Error("IndexedDB write failed.")); };
  });
}

async function idbGet(storeName, key) {
  const database = await openDatabase();
  return new Promise(function (resolve, reject) {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error || new Error("IndexedDB read failed.")); };
  });
}

function hasMeaningfulState(value) {
  return Boolean(
    Object.keys(value.calendar).length ||
    value.results.length ||
    value.book.length ||
    Object.keys(value.products).length
  );
}

function validRecoveryCopy(value) {
  if (!exactKeys(value, ["savedAt", "reason", "state", "sync"]) ||
      !isCanonicalUtcTimestamp(value.savedAt) ||
      typeof value.reason !== "string" || value.reason.length > 120 ||
      !exactKeys(value.sync, [
        "revision", "cloudUpdatedAt", "dirty", "cloudInitialized", "lastError",
        "pendingAction", "pendingRequestId",
      ])) return false;
  try {
    assertValidContentOsState(value.state);
  } catch {
    return false;
  }
  return Number.isSafeInteger(value.sync.revision) && value.sync.revision >= 0 &&
    (value.sync.cloudUpdatedAt === null || isCanonicalUtcTimestamp(value.sync.cloudUpdatedAt)) &&
    typeof value.sync.dirty === "boolean" && typeof value.sync.cloudInitialized === "boolean" &&
    (value.sync.lastError === null || typeof value.sync.lastError === "string") &&
    (value.sync.pendingAction === null || ["edit", "import", "reset", "migration", "restore"].includes(value.sync.pendingAction)) &&
    (value.sync.pendingRequestId === null || typeof value.sync.pendingRequestId === "string");
}

function renderRecoveryCopy() {
  const status = element("recoveryCopyStatus");
  const exportButton = element("exportRecoveryCopy");
  const restoreButton = element("restoreRecoveryCopy");
  if (!status || !exportButton || !restoreButton) return;
  if (!recoveryCopy) {
    status.textContent = "No validated local recovery copy is available.";
    exportButton.disabled = true;
    restoreButton.disabled = true;
    return;
  }
  status.textContent = "Saved " + humanDate(recoveryCopy.savedAt) + " | " + recoveryCopy.reason +
    " | source cloud revision " + recoveryCopy.sync.revision + ".";
  exportButton.disabled = false;
  restoreButton.disabled = false;
}

async function loadLatestRecoveryCopy() {
  const candidates = [];
  try {
    const raw = localStorage.getItem(STORAGE.recovery);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (validRecoveryCopy(parsed)) candidates.push(parsed);
      else startupWarning = "A local recovery copy failed validation and was ignored.";
    }
  } catch {
    startupWarning = "Local recovery storage could not be read.";
  }
  try {
    const indexed = await idbGet("cache", "recovery");
    if (indexed) {
      if (validRecoveryCopy(indexed)) candidates.push(indexed);
      else startupWarning = "An IndexedDB recovery copy failed validation and was ignored.";
    }
  } catch {
    startupWarning = startupWarning || "The secondary recovery store could not be read.";
  }
  recoveryCopy = candidates.sort(function (left, right) {
    return Date.parse(right.savedAt) - Date.parse(left.savedAt);
  })[0] || null;
  renderRecoveryCopy();
}

async function saveRecoveryCopy(reason, stateValue) {
  const recovery = {
    savedAt: new Date().toISOString(),
    reason: text(reason).slice(0, 120),
    state: structuredClone(stateValue || state),
    sync: structuredClone(syncMeta),
  };
  if (!validRecoveryCopy(recovery)) throw new Error("The recovery copy failed validation before storage.");
  let localSaved = false;
  let indexedDbSaved = false;
  try {
    localStorage.setItem(STORAGE.recovery, JSON.stringify(recovery));
    localSaved = true;
  } catch {
    localSaved = false;
  }
  try {
    await idbPut("cache", "recovery", recovery);
    indexedDbSaved = true;
  } catch {
    indexedDbSaved = false;
  }
  if (!localSaved && !indexedDbSaved) {
    throw new Error("A durable recovery copy could not be saved. The protected action was stopped.");
  }
  recoveryCopy = structuredClone(recovery);
  renderRecoveryCopy();
  return recovery;
}

async function persistState(markDirty, action) {
  assertValidContentOsState(state);
  const priorMeta = structuredClone(syncMeta);
  if (markDirty) {
    syncMeta.dirty = true;
    syncMeta.lastError = null;
    syncMeta.pendingAction = action || "edit";
    syncMeta.pendingRequestId = "state:" + newUuid();
    persistSyncMeta();
  }
  let localSaved = false;
  let indexedDbSaved = false;
  try {
    localStorage.setItem(STORAGE.state, JSON.stringify(state));
    localSaved = true;
  } catch {
    localSaved = false;
  }
  try {
    await idbPut("state", "main", state);
    indexedDbSaved = true;
  } catch {
    indexedDbSaved = false;
  }
  if (!localSaved && !indexedDbSaved) {
    syncMeta = priorMeta;
    persistSyncMeta();
    throw new Error("This change could not be saved to either browser store and was rolled back.");
  }
  if (markDirty) scheduleCloudSave();
  return { localSaved: localSaved, indexedDbSaved: indexedDbSaved };
}

async function updateState(mutator, action) {
  const previousState = structuredClone(state);
  const previousMeta = structuredClone(syncMeta);
  const previousStarterStatus = localStateIsUntouchedStarter;
  const candidate = structuredClone(state);
  mutator(candidate);
  candidate.updatedAt = new Date().toISOString();
  assertValidContentOsState(candidate);
  state = candidate;
  try {
    await persistState(true, action || "edit");
    localStateIsUntouchedStarter = false;
    renderAll();
  } catch (error) {
    state = previousState;
    syncMeta = previousMeta;
    localStateIsUntouchedStarter = previousStarterStatus;
    persistSyncMeta();
    renderAll();
    throw error;
  }
}


function setSyncStatus(label, kind, detail, showActions) {
  const status = element("syncStatus");
  const information = element("syncDetail");
  const actions = element("syncActions");
  if (!status || !information || !actions) return;
  status.textContent = label;
  status.className = "sync-status" + (kind ? " " + kind : "");
  information.textContent = detail;
  actions.hidden = !showActions;
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function apiFetch(path, options) {
  const settings = options ? { ...options } : {};
  settings.cache = "no-store";
  settings.headers = new Headers(settings.headers || {});
  if (settings.method && settings.method !== "GET") {
    settings.headers.set("X-APC-Content-OS", "1");
  }
  const response = await fetch(path, settings);
  const body = await responseJson(response);
  if (response.status === 401) {
    throw new Error("Authentication is required for APC Content OS.");
  }
  return { response: response, body: body };
}

function isDatabaseUnavailable(response, body) {
  if (response.status !== 503) return false;
  const message = text(body && body.error).toLowerCase();
  return message.includes("database") || message.includes("not configured") || message.includes("canonical");
}

function connectorMatchesPlatform(provider, platform) {
  return provider === "meta" ? ["Instagram", "Facebook"].includes(platform) :
    provider === "tiktok" ? platform === "TikTok" : platform === "YouTube";
}

function renderConnectorState() {
  const status = element("connectorStatus");
  const list = element("connectionList");
  const select = element("connectorConnection");
  if (!status || !list || !select) return;
  const configured = isPlainObject(connectorState.configuredProviders) ? connectorState.configuredProviders : {};
  document.querySelectorAll("[data-connector-provider]").forEach(function (button) {
    const provider = button.dataset.connectorProvider;
    button.disabled = configured[provider] !== true;
    button.title = button.disabled ? "OAuth credentials still need to be configured." : "";
  });
  const active = Array.isArray(connectorState.connections) ? connectorState.connections.filter(function (connection) {
    return isPlainObject(connection) && connection.status === "active";
  }) : [];
  status.textContent = connectorState.ingestionEnabled ? "Automatic collection on" : "Setup mode";
  status.className = "status-badge" + (connectorState.ingestionEnabled ? " success" : "");
  clearNode(list);
  if (!active.length) list.appendChild(makeNode("p", "subtle", "No platform account is connected yet."));
  active.forEach(function (connection) {
    const row = makeNode("div", "connection-row");
    row.appendChild(makeNode("span", "", connection.accountName + " · " + connection.provider));
    row.appendChild(makeButton("Disconnect", "disconnect-connector", "button secondary compact", {
      connectionId: connection.connectionId,
      provider: connection.provider,
    }));
    list.appendChild(row);
  });
  const platform = element("rPlatform") ? element("rPlatform").value : "Instagram";
  const previous = select.value;
  select.replaceChildren(new Option("Choose a connected account", ""));
  active.filter(function (connection) { return connectorMatchesPlatform(connection.provider, platform); })
    .forEach(function (connection) { select.appendChild(new Option(connection.accountName + " · " + connection.provider, connection.connectionId)); });
  if (Array.from(select.options).some(function (option) { return option.value === previous; })) select.value = previous;
}

async function readConnectorState() {
  const status = element("connectorFormStatus");
  try {
    const results = await Promise.all([
      apiFetch(ENDPOINTS.connections, { method: "GET" }),
      apiFetch(ENDPOINTS.ingestionStatus, { method: "GET" }),
    ]);
    if (!results[0].response.ok || !isPlainObject(results[0].body)) throw new Error(text(results[0].body && results[0].body.error) || "Connector status is unavailable.");
    connectorState = results[0].body;
    renderConnectorState();
    const jobs = Array.isArray(results[1].body && results[1].body.jobs) ? results[1].body.jobs : [];
    const pending = jobs.filter(function (row) { return row.status === "pending" || row.status === "retry"; })
      .reduce(function (sum, row) { return sum + Number(row.count || 0); }, 0);
    element("ingestionStatus").textContent = pending ? pending + " scheduled checkpoint(s) are waiting." : "No scheduled checkpoint is waiting.";
    const callbackResult = new URLSearchParams(location.search).get("connection");
    if (callbackResult && status) status.textContent = callbackResult.includes("connected") ? "Account connected." : "Connection was not completed.";
  } catch (error) {
    if (status) status.textContent = text(error && error.message);
    renderConnectorState();
  }
}

async function disconnectConnector(connectionId, provider) {
  if (!confirm("Disconnect this analytics account and stop its unfinished checkpoints?")) return;
  const result = await apiFetch(ENDPOINTS.connections + "/" + encodeURIComponent(provider) + "/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: connectionId }),
  });
  if (!result.response.ok) throw new Error(text(result.body && result.body.error) || "The account could not be disconnected.");
  await readConnectorState();
}

function normaliseCloudRecord(record) {
  if (!isPlainObject(record)) throw new Error("Cloud state response is invalid.");
  if (!Number.isSafeInteger(record.revision) || record.revision < 0) {
    throw new Error("Cloud revision is invalid.");
  }
  const restoredFromRevision = record.restoredFromRevision === undefined ? null : record.restoredFromRevision;
  if (restoredFromRevision !== null &&
      (!Number.isSafeInteger(restoredFromRevision) || restoredFromRevision < 0 || restoredFromRevision >= record.revision)) {
    throw new Error("Cloud restore provenance is invalid.");
  }
  const lastAction = typeof record.lastAction === "string" ? record.lastAction : null;
  if ((lastAction === "restore") !== (restoredFromRevision !== null)) {
    throw new Error("Cloud restore provenance does not match its action.");
  }
  if (record.updatedAt !== null && !isCanonicalUtcTimestamp(record.updatedAt)) {
    throw new Error("Cloud update timestamp is invalid.");
  }
  let validatedState = null;
  if (record.state !== null) {
    validatedState = migrateContentOsState(record.state);
    assertValidContentOsState(validatedState);
  }
  return {
    schemaVersion: typeof record.schemaVersion === "string" ? record.schemaVersion : STATE_SCHEMA_VERSION,
    revision: record.revision,
    updatedAt: record.updatedAt,
    stateHash: typeof record.stateHash === "string" ? record.stateHash : null,
    lastAction: lastAction,
    lastRequestId: typeof record.lastRequestId === "string" ? record.lastRequestId : null,
    restoredFromRevision: restoredFromRevision,
    state: validatedState,
  };
}

function acceptCloudRecord(rawRecord) {
  const record = normaliseCloudRecord(rawRecord);
  if (record.state) {
    state = structuredClone(record.state);
    persistState(false).catch(function (error) {
      setSyncStatus("Local cache error", "error", text(error && error.message), true);
    });
  }
  syncMeta = {
    revision: record.revision,
    cloudUpdatedAt: record.updatedAt,
    dirty: false,
    cloudInitialized: true,
    lastError: null,
    pendingAction: null,
    pendingRequestId: null,
  };
  cloudMode = "cloud";
  localStateIsUntouchedStarter = false;
  pendingCloudRecord = null;
  persistSyncMeta();
  renderAll();
  setSyncStatus(
    "Synced",
    "",
    "Cloud revision " + record.revision + (record.updatedAt ? " | " + humanDate(record.updatedAt) : ""),
    false
  );
}

function showConflict(rawRecord) {
  const record = normaliseCloudRecord(rawRecord);
  saveRecoveryCopy("Before reviewing a cloud conflict").catch(function (error) {
    setSyncStatus("Conflict detected", "error", text(error && error.message), true);
  });
  pendingCloudRecord = record;
  syncMeta.lastError = "conflict";
  persistSyncMeta();
  setSyncStatus(
    "Conflict detected",
    "conflict",
    "Cloud revision " + record.revision + " changed first. Your local copy is still in this session while Recovery storage is checked.",
    true
  );
}

function scheduleCloudSave(delay) {
  clearTimeout(saveTimer);
  const wait = Number.isFinite(delay) ? delay : 900;
  saveTimer = setTimeout(function () {
    pushStateToCloud().catch(function () {});
  }, wait);
  if (!navigator.onLine) {
    setSyncStatus(
      "Offline",
      "offline",
      "Changes are cached on this device and will retry when the connection returns.",
      false
    );
  } else if (cloudMode === "local") {
    setSyncStatus(
      "Local only",
      "offline",
      "This environment has no canonical database. Changes remain on this device.",
      true
    );
  } else {
    setSyncStatus("Saving", "saving", "The local change is queued for secure cloud sync.", false);
  }
}

async function syncFromCloud() {
  if (syncInFlight) return;
  if (!navigator.onLine) {
    setSyncStatus("Offline", "offline", "Using the validated local cache.", false);
    return;
  }
  syncInFlight = true;
  setSyncStatus("Checking cloud", "saving", "Comparing this device with the canonical record.", false);
  try {
    const result = await apiFetch(ENDPOINTS.state, { method: "GET" });
    if (isDatabaseUnavailable(result.response, result.body)) {
      cloudMode = "local";
      setSyncStatus(
        "Local only",
        "offline",
        "Secure cloud storage is not connected in this environment. Local features remain available.",
        true
      );
      return;
    }
    if (!result.response.ok) {
      throw new Error(text(result.body && result.body.error) || "Cloud state could not be read.");
    }
    const record = normaliseCloudRecord(result.body);
    cloudMode = "cloud";

    if (record.state === null) {
      syncMeta.revision = record.revision;
      syncMeta.cloudInitialized = true;
      persistSyncMeta();
      if (hasMeaningfulState(state) || syncMeta.dirty) {
        syncMeta.dirty = true;
        syncMeta.pendingAction = "migration";
        syncMeta.pendingRequestId = "state:" + newUuid();
        persistSyncMeta();
        scheduleCloudSave(50);
      } else {
        syncMeta.dirty = false;
        persistSyncMeta();
        setSyncStatus("Synced", "", "Cloud record is ready. No content data has been added yet.", false);
      }
      return;
    }

    const firstLinkWithLocalData = !syncMeta.cloudInitialized && hasMeaningfulState(state) &&
      !localStateIsUntouchedStarter;
    if ((syncMeta.dirty && record.revision !== syncMeta.revision) || firstLinkWithLocalData) {
      showConflict(record);
      return;
    }
    if (syncMeta.dirty) {
      syncMeta.cloudInitialized = true;
      syncMeta.revision = record.revision;
      persistSyncMeta();
      scheduleCloudSave(50);
      return;
    }
    acceptCloudRecord(record);
  } catch (error) {
    syncMeta.lastError = text(error && error.message) || "Cloud sync failed.";
    persistSyncMeta();
    setSyncStatus("Sync error", "error", syncMeta.lastError + " Local data remains available.", true);
  } finally {
    syncInFlight = false;
  }
}

async function pushStateToCloud() {
  if (!syncMeta.dirty || syncInFlight || cloudMode === "local") return;
  if (!navigator.onLine) {
    setSyncStatus("Offline", "offline", "Changes are cached locally and will retry.", false);
    return;
  }

  syncInFlight = true;
  const sentState = structuredClone(state);
  const sentJson = JSON.stringify(sentState);
  const expectedRevision = syncMeta.revision;
  const sentRequestId = syncMeta.pendingRequestId || "state:" + newUuid();
  const sentAction = syncMeta.pendingAction || "edit";
  setSyncStatus("Saving", "saving", "Writing the latest validated state to the cloud.", false);

  try {
    const result = await apiFetch(ENDPOINTS.state, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: expectedRevision,
        state: sentState,
        action: sentAction,
        requestId: sentRequestId,
      }),
    });

    if (result.response.status === 409) {
      const conflict = normaliseCloudRecord(result.body);
      if (conflict.lastRequestId === sentRequestId) {
        syncMeta.revision = conflict.revision;
        syncMeta.cloudUpdatedAt = conflict.updatedAt;
        syncMeta.cloudInitialized = true;
        if (JSON.stringify(state) === sentJson) {
          acceptCloudRecord(conflict);
        } else {
          persistSyncMeta();
          scheduleCloudSave(50);
        }
        return;
      }
      showConflict(conflict);
      return;
    }
    if (isDatabaseUnavailable(result.response, result.body)) {
      cloudMode = "local";
      setSyncStatus(
        "Local only",
        "offline",
        "The canonical database is unavailable here. The change remains cached on this device.",
        true
      );
      return;
    }
    if (!result.response.ok) {
      throw new Error(text(result.body && result.body.error) || "Cloud save failed.");
    }

    const record = normaliseCloudRecord(result.body);
    const unchanged = JSON.stringify(state) === sentJson && syncMeta.pendingRequestId === sentRequestId;
    syncMeta.revision = record.revision;
    syncMeta.cloudUpdatedAt = record.updatedAt;
    syncMeta.cloudInitialized = true;
    syncMeta.lastError = null;
    syncMeta.dirty = !unchanged;
    if (unchanged) {
      syncMeta.pendingAction = null;
      syncMeta.pendingRequestId = null;
    }
    persistSyncMeta();
    if (unchanged) {
      state = record.state ? structuredClone(record.state) : state;
      persistState(false).catch(function (error) {
        setSyncStatus("Local cache error", "error", text(error && error.message), true);
      });
      renderAll();
      setSyncStatus("Synced", "", "Cloud revision " + record.revision + " | " + humanDate(record.updatedAt), false);
    } else {
      scheduleCloudSave(50);
    }
  } catch (error) {
    syncMeta.lastError = text(error && error.message) || "Cloud save failed.";
    persistSyncMeta();
    setSyncStatus("Sync error", "error", syncMeta.lastError + " Changes remain cached locally.", true);
  } finally {
    syncInFlight = false;
  }
}

async function writeStateServerFirst(candidate, action) {
  assertValidContentOsState(candidate);
  if (!navigator.onLine) throw new Error("Connect to the internet before " + action + ".");
  if (cloudMode !== "cloud") throw new Error("Secure cloud storage must be available before " + action + ".");
  if (syncInFlight || syncMeta.dirty) {
    throw new Error("Wait for current changes to finish syncing before " + action + ".");
  }

  const requestId = "state:" + newUuid();
  const result = await apiFetch(ENDPOINTS.state, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedRevision: syncMeta.revision,
      state: candidate,
      action: action,
      requestId: requestId,
    }),
  });
  if (result.response.status === 409) {
    showConflict(result.body);
    throw new Error("The cloud record changed first. Review the conflict before continuing.");
  }
  if (!result.response.ok) {
    throw new Error(text(result.body && result.body.error) || "The cloud change was not accepted.");
  }
  acceptCloudRecord(result.body);
  return normaliseCloudRecord(result.body);
}

async function reviewCloudConflict() {
  if (!pendingCloudRecord) {
    syncFromCloud().catch(function () {});
    return;
  }
  const accepted = confirm(
    "Load the cloud version on this device? Check Recovery and export the local copy first if you may need it."
  );
  if (!accepted) return;
  try {
    await saveRecoveryCopy("Before accepting the cloud conflict winner");
  } catch (error) {
    setSyncStatus("Conflict kept", "error", text(error && error.message), true);
    return;
  }
  acceptCloudRecord(pendingCloudRecord);
}

function initialiseNetworkSync() {
  window.addEventListener("online", function () {
    if (cloudMode === "local") cloudMode = "checking";
    syncFromCloud().then(flushAnalyticsQueue).then(function () {
      return Promise.all([readAnalytics(), readResearch(), readHistory()]);
    }).catch(function () {});
  });
  window.addEventListener("offline", function () {
    setSyncStatus("Offline", "offline", "Using the validated local cache.", false);
  });
}


function fillSelect(id, values, includeBlank) {
  const select = element(id);
  if (!select) return;
  const current = select.value;
  clearNode(select);
  if (includeBlank) {
    const option = makeNode("option", "", "All");
    option.value = "";
    select.appendChild(option);
  }
  values.forEach(function (value) {
    const option = makeNode("option", "", value);
    option.value = value;
    select.appendChild(option);
  });
  if (values.includes(current)) select.value = current;
}

function initialiseFormOptions() {
  fillSelect("familyFilter", DATA.families, true);
  fillSelect("stageFilter", DATA.stages, true);
  ["rFamily", "pFamily", "bFamily"].forEach(function (id) {
    fillSelect(id, DATA.families, false);
  });
  ["pStage", "bStage"].forEach(function (id) {
    fillSelect(id, DATA.stages, false);
  });
  fillSelect("cFamily", DATA.families, false);
  fillSelect("cStage", DATA.stages, false);
  fillSelect("bSection", DATA.bookSections, false);
  if (element("rCapturedAt") && !element("rCapturedAt").value) {
    element("rCapturedAt").value = toLocalInputValue(new Date());
  }
  const legacyCheckpoint = element("rSnapshot").querySelector('option[value="72h_legacy"]');
  if (legacyCheckpoint) legacyCheckpoint.disabled = true;
}

function useTopic(topic, stage, family, area) {
  clearSelectedResearchContext();
  element("pTopic").value = text(topic);
  element("pArea").value = text(area);
  if (DATA.stages.includes(stage)) element("pStage").value = stage;
  if (DATA.families.includes(family)) element("pFamily").value = family;
  scrollToNode(element("prompts"), "start");
  element("pTopic").focus();
}

function logTopic(topic, area, family, date) {
  element("rTopic").value = text(topic);
  element("rArea").value = text(area);
  if (DATA.families.includes(family)) element("rFamily").value = family;
  if (date) element("rDate").value = date + "T09:00";
  scrollToNode(element("results"), "start");
  element("rPostId").focus();
}

function sendTopicToBook(topic, stage, family, notes) {
  element("bTitle").value = text(topic);
  if (DATA.stages.includes(stage)) element("bStage").value = stage;
  if (DATA.families.includes(family)) element("bFamily").value = family;
  element("bNotes").value = text(notes).slice(0, 800);
  scrollToNode(element("book"), "start");
  element("bTitle").focus();
}

function monthLabel(month) {
  const parsed = new Date(month + "-01T12:00:00Z");
  return Number.isNaN(parsed.getTime()) ? month : parsed.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftCalendarMonth(offset) {
  const parsed = new Date(selectedCalendarMonth + "-01T12:00:00Z");
  parsed.setUTCMonth(parsed.getUTCMonth() + offset);
  selectedCalendarMonth = parsed.toISOString().slice(0, 7);
  renderAll();
}

function calendarEntriesForSelectedMonth() {
  return Object.entries(state.calendar).filter(function (entry) {
    return entry[0].startsWith(selectedCalendarMonth + "-");
  }).sort(function (left, right) { return left[0].localeCompare(right[0]); });
}

function resetPlanForm() {
  editingCalendarDate = null;
  ["cDate", "cTopic", "cArea"].forEach(function (id) {
    const node = element(id);
    if (node) node.value = "";
  });
  if (element("cFamily")) element("cFamily").selectedIndex = 0;
  if (element("cStage")) element("cStage").selectedIndex = 0;
  const summary = element("planEditorSummary");
  if (summary) summary.textContent = "Add or edit a plan item";
}

function prefillPlanForm(topic, area, family, stage, date) {
  editingCalendarDate = date && state.calendar[date] ? date : null;
  element("cDate").value = date || "";
  element("cTopic").value = text(topic);
  element("cArea").value = text(area);
  if (DATA.families.includes(family)) element("cFamily").value = family;
  if (DATA.stages.includes(stage)) element("cStage").value = stage;
  const editor = element("planEditor");
  const summary = element("planEditorSummary");
  if (summary) summary.textContent = editingCalendarDate ? "Edit plan item" : "Add plan item";
  if (editor) editor.open = true;
  scrollToNode(editor, "nearest");
  (date ? element("cTopic") : element("cDate")).focus();
}

async function savePlanItem() {
  const form = element("planForm");
  if (form && !form.checkValidity()) {
    const invalid = form.querySelector(":invalid");
    if (invalid) invalid.focus();
    form.reportValidity();
    return;
  }
  const date = element("cDate").value;
  if (Object.hasOwn(state.calendar, date) && date !== editingCalendarDate) {
    element("cDate").focus();
    throw new Error("That date already has a plan item. Edit the existing item or choose another date.");
  }
  const addsNewDate = !editingCalendarDate && !Object.hasOwn(state.calendar, date);
  if (addsNewDate && Object.keys(state.calendar).length >= MAX_CALENDAR_ENTRIES) {
    throw new Error("The plan already contains 500 dates. Delete an old item before adding another.");
  }
  const previous = editingCalendarDate ? state.calendar[editingCalendarDate] : null;
  const entry = {
    status: previous ? previous.status : "idea",
    topic: normaliseMultilineText(element("cTopic").value).slice(0, 240),
    area: normaliseMultilineText(element("cArea").value).slice(0, 160),
    family: element("cFamily").value,
    stage: element("cStage").value,
  };
  await updateState(function (candidate) {
    if (editingCalendarDate && editingCalendarDate !== date) delete candidate.calendar[editingCalendarDate];
    candidate.calendar[date] = entry;
  }, "edit");
  selectedCalendarMonth = date.slice(0, 7);
  resetPlanForm();
  if (element("planEditor")) element("planEditor").open = false;
  renderAll();
}

async function deletePlanItem(date) {
  const entry = state.calendar[date];
  if (!entry || !confirm("Delete this plan item? The prior cloud revision remains in History.")) return;
  await updateState(function (candidate) { delete candidate.calendar[date]; }, "edit");
}

function renderCalendar() {
  const grid = element("calendarGrid");
  if (!grid) return;
  clearNode(grid);
  const monthInput = element("calendarMonth");
  const label = element("calendarMonthLabel");
  if (monthInput) monthInput.value = selectedCalendarMonth;
  if (label) label.textContent = monthLabel(selectedCalendarMonth);
  const entries = calendarEntriesForSelectedMonth();
  if (!entries.length) {
    grid.appendChild(makeNode("div", "empty-state", "No plan items in " + monthLabel(selectedCalendarMonth) + "."));
    return;
  }

  entries.forEach(function (pair) {
    const date = pair[0];
    const entry = pair[1];
    const status = entry.status;

    const card = makeNode("article", "calendar-card");
    card.appendChild(makeNode("p", "meta", date + (entry.stage ? " | " + entry.stage : "")));
    card.appendChild(makeNode("h4", "hook", entry.topic || "Untitled plan item"));

    const labels = makeNode("div", "pill-row");
    if (entry.family) appendPill(labels, entry.family);
    if (entry.area) appendPill(labels, entry.area, "gold");
    appendPill(labels, status.toUpperCase(), "status-" + status);
    card.appendChild(labels);

    const actions = makeNode("div", "actions");
    const select = makeNode("select", "calendar-status");
    select.dataset.action = "calendar-status";
    select.dataset.date = date;
    select.setAttribute("aria-label", "Status for " + date);
    CALENDAR_STATUSES.forEach(function (value) {
      const option = makeNode("option", "", value);
      option.value = value;
      option.selected = value === status;
      select.appendChild(option);
    });
    actions.appendChild(select);
    actions.appendChild(makeButton("Use topic", "use-calendar-topic", "button secondary compact", { date: date }));
    actions.appendChild(makeButton("Add analytics", "log-calendar-topic", "button secondary compact", { date: date }));
    actions.appendChild(makeButton("Edit", "edit-plan-item", "button secondary compact", { date: date }));
    actions.appendChild(makeButton("Delete", "delete-plan-item", "button danger compact", { date: date }));
    card.appendChild(actions);
    grid.appendChild(card);
  });
}

function filteredTopics() {
  const query = text(element("topicSearch").value).trim().toLowerCase();
  const family = element("familyFilter").value;
  const stage = element("stageFilter").value;
  const use = element("useFilter").value;
  return DATA.topics.filter(function (topic) {
    const searchable = [topic.name, topic.hook, topic.family, topic.stage, topic.use, topic.keywords]
      .join(" ")
      .toLowerCase();
    return (!query || searchable.includes(query)) &&
      (!family || topic.family === family) &&
      (!stage || topic.stage === stage) &&
      (!use || topic.use === use);
  });
}

function renderTopics() {
  const grid = element("topicGrid");
  if (!grid) return;
  clearNode(grid);
  const topics = filteredTopics();
  if (!topics.length) {
    grid.appendChild(makeNode("div", "empty-state", "No topics match these filters."));
    return;
  }

  topics.forEach(function (topic) {
    const originalIndex = DATA.topics.indexOf(topic);
    const card = makeNode("article", "topic-card");
    card.appendChild(makeNode("p", "card-label", topic.name));
    card.appendChild(makeNode("blockquote", "topic-hook", topic.hook));
    const labels = makeNode("div", "pill-row");
    appendPill(labels, topic.family);
    appendPill(labels, topic.stage, "gold");
    appendPill(labels, topic.use, "coral");
    card.appendChild(labels);

    const actions = makeNode("div", "actions");
    actions.appendChild(makeButton("Use topic", "use-bank-topic", "button compact", { index: originalIndex }));
    actions.appendChild(makeButton("Add to plan", "plan-bank-topic", "button secondary compact", { index: originalIndex }));
    actions.appendChild(makeButton("Add analytics", "log-bank-topic", "button secondary compact", { index: originalIndex }));
    actions.appendChild(makeButton("Send to book", "book-bank-topic", "button secondary compact", { index: originalIndex }));
    card.appendChild(actions);
    grid.appendChild(card);
  });
}

async function saveBookItem() {
  const title = text(element("bTitle").value).trim();
  if (!title) {
    alert("Add a working chapter title first.");
    element("bTitle").focus();
    return;
  }
  const item = {
    id: nextNumericId(state.book),
    title: title.slice(0, 240),
    section: element("bSection").value,
    stage: element("bStage").value,
    family: element("bFamily").value,
    notes: normaliseMultilineText(element("bNotes").value).slice(0, 1200),
  };
  await updateState(function (candidate) {
    candidate.book.push(item);
  }, "edit");
  element("bTitle").value = "";
  element("bNotes").value = "";
}

async function deleteBookItem(id) {
  if (!Number.isSafeInteger(id) || !state.book.some(function (item) { return item.id === id; })) return;
  if (!confirm("Delete this book note? The previous cloud revision remains in History.")) return;
  await updateState(function (candidate) {
    candidate.book = candidate.book.filter(function (item) { return item.id !== id; });
  }, "edit");
}

function renderBook() {
  const list = element("bookList");
  if (!list) return;
  clearNode(list);
  if (!state.book.length) {
    list.appendChild(makeNode("div", "empty-state", "No book items saved yet."));
    return;
  }

  state.book.slice().reverse().forEach(function (item) {
    const card = makeNode("article", "mini book-card");
    card.appendChild(makeNode("h3", "", item.title));
    const labels = makeNode("div", "pill-row");
    appendPill(labels, item.section);
    appendPill(labels, item.stage, "gold");
    appendPill(labels, item.family, "coral");
    card.appendChild(labels);
    if (item.notes) card.appendChild(makeNode("p", "", item.notes));
    card.appendChild(makeButton("Delete", "delete-book", "button danger compact", { id: item.id }));
    list.appendChild(card);
  });
}


function setAnalyticsStatus(message, kind) {
  const node = element("analyticsFormStatus");
  if (!node) return;
  node.textContent = message;
  node.className = "subtle" + (kind ? " " + kind : "");
}

function numericInput(id, options) {
  const node = element(id);
  const raw = text(node.value).trim();
  if (raw === "") return null;
  const value = Number(raw);
  const integer = options && options.integer;
  const maximum = options && Number.isFinite(options.maximum) ? options.maximum : 1000000000000;
  if (!Number.isFinite(value) || value < 0 || value > maximum || (integer && !Number.isSafeInteger(value))) {
    throw new Error(node.labels && node.labels[0] ? node.labels[0].textContent + " is invalid." : id + " is invalid.");
  }
  return value;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), function (byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
}

async function publicationIdFor(platform, postRef) {
  const digest = await sha256(platform + "\n" + postRef);
  return "pub_" + digest.slice(0, 32);
}

function matchingPublication(platform, postRef) {
  const match = analyticsRecords.find(function (record) {
    return record.publication.platform === platform && record.publication.postRef === postRef;
  });
  if (match) return structuredClone(match.publication);
  const queued = analyticsQueue.find(function (entry) {
    return entry.payload.publication.platform === platform && entry.payload.publication.postRef === postRef;
  });
  return queued ? structuredClone(queued.payload.publication) : null;
}

function currentAnalyticsRevision(publicationId, checkpoint) {
  return analyticsRecords.reduce(function (maximum, record) {
    if (record.publication.publicationId !== publicationId || record.snapshot.checkpoint !== checkpoint) {
      return maximum;
    }
    return Math.max(maximum, record.revision);
  }, 0);
}

function ensureAnalyticsSource(platform, source) {
  const approved = {
    Instagram: ["Meta Business Suite", "Instagram Insights"],
    Facebook: ["Meta Business Suite"],
    TikTok: ["TikTok Analytics"],
    YouTube: ["YouTube Studio"],
  };
  return Boolean(approved[platform] && approved[platform].includes(source));
}

function updateSourceForPlatform() {
  const defaults = {
    Instagram: "Instagram Insights",
    Facebook: "Meta Business Suite",
    TikTok: "TikTok Analytics",
    YouTube: "YouTube Studio",
  };
  const platform = element("rPlatform").value;
  if (!ensureAnalyticsSource(platform, element("rSource").value)) {
    element("rSource").value = defaults[platform];
  }
  renderConnectorState();
}

async function buildTrackingPublication() {
  const title = text(element("rTopic").value).trim();
  const problemArea = text(element("rArea").value).trim();
  const platform = element("rPlatform").value;
  const postRef = text(element("rPostId").value).trim();
  const publishedAt = toUtcIso(element("rDate").value);
  if (!title || !problemArea || !postRef || !publishedAt) {
    throw new Error("Fill in the post title, problem area, post URL or ID, and published time below first.");
  }
  const existingPublication = matchingPublication(platform, postRef);
  if (existingPublication) return existingPublication;
  const publication = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    publicationId: await publicationIdFor(platform, postRef),
    episodeId: text(element("rEpisodeId").value).trim().slice(0, 100),
    platform: platform,
    postRef: postRef,
    publishedAt: publishedAt,
    title: title.slice(0, 240),
    topic: title.slice(0, 240),
    problemArea: problemArea.slice(0, 160),
    productFamily: element("rFamily").value,
    format: element("rFormat").value,
    durationSeconds: numericInput("rDurationSeconds", { integer: true, maximum: 1000000 }),
    slideCount: numericInput("rSlideCount", { integer: true, maximum: 1000000 }),
    hookType: element("rHookType").value,
    creativeVersion: text(element("rVersion").value).trim().slice(0, 80),
    ctaType: element("rCTA").value,
    experimentType: element("rExperiment").value,
  };
  assertValidPublication(publication);
  return publication;
}

async function trackPublicationAutomatically() {
  const form = element("automaticAnalyticsForm");
  const status = element("connectorFormStatus");
  if (!form.checkValidity()) { form.reportValidity(); return; }
  status.textContent = "Scheduling checkpoints…";
  try {
    const publication = await buildTrackingPublication();
    const connectionId = element("connectorConnection").value;
    const remoteMediaId = text(element("connectorMediaId").value).trim();
    const result = await apiFetch(ENDPOINTS.publications, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publication: publication, connectionId: connectionId, remoteMediaId: remoteMediaId }),
    });
    if (!result.response.ok) throw new Error(text(result.body && result.body.error) || "This post could not be scheduled.");
    status.textContent = "Tracked. The 24-hour, 7-day and 28-day checkpoints are scheduled.";
    element("connectorMediaId").value = "";
    await readConnectorState();
  } catch (error) {
    status.textContent = text(error && error.message);
  }
}

async function buildAnalyticsSubmission() {
  const title = text(element("rTopic").value).trim();
  const problemArea = text(element("rArea").value).trim();
  const platform = element("rPlatform").value;
  const postRef = text(element("rPostId").value).trim();
  const checkpoint = element("rSnapshot").value;
  const source = element("rSource").value;

  if (!title || !problemArea || !postRef) {
    throw new Error("Add the post title, problem area, and post URL or stable ID.");
  }
  if (checkpoint === "72h_legacy") {
    throw new Error("New manual entries use 24 hours, 7 days, or 28 days. Existing 72-hour records remain visible as legacy data.");
  }
  if (!ensureAnalyticsSource(platform, source)) {
    throw new Error("Choose an analytics source that matches the platform.");
  }

  const publishedAt = toUtcIso(element("rDate").value);
  const capturedAt = toUtcIso(element("rCapturedAt").value);
  if (!publishedAt) throw new Error("Add the time this post was published.");
  if (!capturedAt) throw new Error("Add the time this checkpoint was captured.");

  const metrics = {
    views: numericInput("rViews", { integer: true }),
    reach: numericInput("rReach", { integer: true }),
    averageWatchTimeSeconds: numericInput("rAvgWatchTime", { integer: false }),
    totalWatchTimeSeconds: numericInput("rTotalWatchTime", { integer: true }),
    likes: numericInput("rLikes", { integer: true }),
    commentsCount: numericInput("rRawComments", { integer: true }),
    saves: numericInput("rSaves", { integer: true }),
    shares: numericInput("rShares", { integer: true }),
  };
  const missingReason = element("rMissingReason").value;
  const missingReasons = {};
  ANALYTICS_METRICS.forEach(function (key) {
    const overrideNode = element(METRIC_REASON_FIELDS[key]);
    const override = text(overrideNode && overrideNode.value);
    missingReasons[key] = metrics[key] === null ? (override || missingReason || null) : null;
  });
  const missingReasonKey = ANALYTICS_METRICS.find(function (key) {
    return metrics[key] === null && missingReasons[key] === null;
  });
  if (missingReasonKey) {
    const overrideNode = element(METRIC_REASON_FIELDS[missingReasonKey]);
    throw new Error(
      "Choose a default reason or a per-metric reason for every blank metric" +
      (overrideNode && overrideNode.labels && overrideNode.labels[0] ? ", including " + overrideNode.labels[0].textContent : "") + "."
    );
  }

  const pattern = normaliseMultilineText(element("rPatternSummary").value);
  const experimentNote = normaliseMultilineText(element("rNotes").value);
  const summaryParts = [];
  if (pattern) summaryParts.push(pattern);
  if (experimentNote) summaryParts.push("Experiment observation: " + experimentNote);
  const deidentifiedThemeSummary = summaryParts.join(" ").slice(0, 400);

  const existingPublication = matchingPublication(platform, postRef);
  const publicationId = existingPublication ?
    existingPublication.publicationId :
    await publicationIdFor(platform, postRef);
  const publication = existingPublication || {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    publicationId: publicationId,
    episodeId: text(element("rEpisodeId").value).trim().slice(0, 100),
    platform: platform,
    postRef: postRef,
    publishedAt: publishedAt,
    title: title.slice(0, 240),
    topic: title.slice(0, 240),
    problemArea: problemArea.slice(0, 160),
    productFamily: element("rFamily").value,
    format: element("rFormat").value,
    durationSeconds: numericInput("rDurationSeconds", { integer: true, maximum: 1000000 }),
    slideCount: numericInput("rSlideCount", { integer: true, maximum: 1000000 }),
    hookType: element("rHookType").value,
    creativeVersion: text(element("rVersion").value).trim().slice(0, 80),
    ctaType: element("rCTA").value,
    experimentType: element("rExperiment").value,
  };

  const snapshotId = "snap_" + newUuid();
  const snapshot = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    snapshotId: snapshotId,
    publicationId: publication.publicationId,
    checkpoint: checkpoint,
    protocolVersion: ANALYTICS_PROTOCOL_VERSION,
    capturedAt: capturedAt,
    metrics: metrics,
    missingReasons: missingReasons,
    signals: {
      substantiveCommentsCount: numericInput("rComments", { integer: true, maximum: 1000000 }),
      dmProblemCount: numericInput("rDMs", { integer: true, maximum: 1000000 }),
      requestCount: numericInput("rRequests", { integer: true, maximum: 1000000 }),
      interestCount: numericInput("rInterest", { integer: true, maximum: 1000000 }),
      paidCount: numericInput("rPaid", { integer: true, maximum: 1000000 }),
    },
    deidentifiedThemeSummary: deidentifiedThemeSummary,
    collectionMethod: "manual",
    sourceSystem: source,
    sourceMetricVersion: "manual-ui-2026-09",
  };
  const payload = {
    publication: publication,
    snapshot: snapshot,
    idempotencyKey: "analytics:" + snapshotId,
  };
  const validation = validateAnalyticsSubmission(payload);
  if (!validation.valid) throw new Error(validation.error);
  const replacesLoadedCheckpoint = analyticsRecords.some(function (record) {
    return record.publication.publicationId === publication.publicationId &&
      record.snapshot.checkpoint === checkpoint;
  });
  if (analyticsRecords.length >= MAX_ANALYTICS_RECORDS && !replacesLoadedCheckpoint) {
    throw new Error("The 10,000-record client safety cap is reached. Export data before adding another publication.");
  }
  return {
    payload: payload,
    expectedRevision: currentAnalyticsRevision(publication.publicationId, checkpoint),
    queuedAt: new Date().toISOString(),
  };
}

function mergeAnalyticsRecord(record) {
  if (!validAnalyticsRecord(record)) throw new Error("Saved analytics response is invalid.");
  const nextRecords = analyticsRecords.filter(function (existing) {
    return !(
      existing.publication.publicationId === record.publication.publicationId &&
      existing.snapshot.checkpoint === record.snapshot.checkpoint &&
      existing.revision <= record.revision
    );
  });
  nextRecords.unshift(structuredClone(record));
  nextRecords.sort(function (left, right) {
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
  if (nextRecords.length > MAX_ANALYTICS_RECORDS) {
    throw new Error("Analytics exceed the safe 10,000-record client limit.");
  }
  analyticsRecords = nextRecords;
  persistAnalyticsCache().catch(function (error) {
    setAnalyticsStatus(text(error && error.message), "error");
  });
}

async function postAnalytics(entry) {
  const result = await apiFetch(ENDPOINTS.analytics, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-APC-Analytics-Expected-Revision": String(entry.expectedRevision),
    },
    body: JSON.stringify(entry.payload),
  });
  return result;
}

async function queueAnalytics(entry) {
  const duplicate = analyticsQueue.some(function (queued) {
    return queued.payload.snapshot.publicationId === entry.payload.snapshot.publicationId &&
      queued.payload.snapshot.checkpoint === entry.payload.snapshot.checkpoint;
  });
  if (duplicate) {
    throw new Error("This post and checkpoint already has an offline entry waiting to sync.");
  }
  if (analyticsQueue.length >= MAX_ANALYTICS_QUEUE) {
    throw new Error("The offline queue already has 100 snapshots. Reconnect or export a backup before adding another.");
  }
  const nextQueue = analyticsQueue.concat([structuredClone(entry)]);
  const persistence = await persistAnalyticsQueue(nextQueue);
  analyticsQueue = nextQueue;
  setAnalyticsStatus(
    persistence.indexedDbSaved ?
      "Saved offline. " + analyticsQueue.length + " analytics snapshot" + (analyticsQueue.length === 1 ? "" : "s") + " waiting to sync." :
      "Saved offline in browser storage. The secondary durable cache was unavailable.",
    persistence.indexedDbSaved ? "offline" : "warning"
  );
  renderResults();
}

async function discardQueuedAnalytics(snapshotId) {
  const entry = analyticsQueue.find(function (candidate) {
    return candidate.payload.snapshot.snapshotId === snapshotId;
  });
  if (!entry) return;
  if (!confirm("Discard this queued analytics snapshot? It has not been saved to the cloud.")) return;
  const nextQueue = analyticsQueue.filter(function (candidate) {
    return candidate.payload.snapshot.snapshotId !== snapshotId;
  });
  await persistAnalyticsQueue(nextQueue);
  analyticsQueue = nextQueue;
  setAnalyticsStatus(
    analyticsQueue.length ?
      analyticsQueue.length + " queued analytics snapshot(s) remain." :
      "The offline analytics queue is clear.",
    analyticsQueue.length ? "offline" : "success"
  );
  renderAll();
  await flushAnalyticsQueue();
}

async function saveAnalytics() {
  const form = element("analyticsForm");
  if (form && !form.checkValidity()) {
    const firstInvalid = form.querySelector(":invalid");
    if (firstInvalid) firstInvalid.focus();
    form.reportValidity();
    setAnalyticsStatus("Complete the required fields before saving.", "error");
    return;
  }
  setAnalyticsStatus("Validating snapshot", "saving");
  let entry;
  try {
    entry = await buildAnalyticsSubmission();
  } catch (error) {
    setAnalyticsStatus(text(error && error.message), "error");
    return;
  }

  if (!navigator.onLine || cloudMode === "local") {
    try {
      await queueAnalytics(entry);
      clearAnalyticsForm();
    } catch (error) {
      setAnalyticsStatus(text(error && error.message), "error");
    }
    return;
  }

  try {
    const result = await postAnalytics(entry);
    if (result.response.ok && result.body && result.body.record) {
      mergeAnalyticsRecord(result.body.record);
      const revision = result.body.record.revision;
      setAnalyticsStatus(
        (result.body.idempotent ? "Already saved" : "Saved") + " as checkpoint revision " + revision + ".",
        "success"
      );
      clearAnalyticsForm(true);
      renderAll();
      return;
    }
    if (result.response.status === 409) {
      if (result.body && result.body.code === "revision_conflict") {
        await readAnalytics();
        throw new Error("This checkpoint changed on another device. The latest revision was loaded. Review and save again.");
      }
      throw new Error(text(result.body && result.body.error) || "Analytics record conflicts with an existing post.");
    }
    if (isDatabaseUnavailable(result.response, result.body) || result.response.status >= 500) {
      await queueAnalytics(entry);
      clearAnalyticsForm(true);
      return;
    }
    throw new Error(text(result.body && result.body.error) || "Analytics snapshot was not accepted.");
  } catch (error) {
    if (error instanceof TypeError) {
      try {
        await queueAnalytics(entry);
        clearAnalyticsForm(true);
        return;
      } catch (queueError) {
        setAnalyticsStatus(text(queueError && queueError.message), "error");
        return;
      }
    }
    setAnalyticsStatus(text(error && error.message), "error");
  }
}

async function flushAnalyticsQueue() {
  if (!navigator.onLine || cloudMode === "local" || !analyticsQueue.length) return;
  setAnalyticsStatus("Syncing " + analyticsQueue.length + " offline snapshot(s)", "saving");

  while (analyticsQueue.length) {
    const entry = analyticsQueue[0];
    let result;
    try {
      result = await postAnalytics(entry);
    } catch {
      setAnalyticsStatus("Offline analytics remain queued on this device.", "offline");
      return;
    }
    if (result.response.ok && result.body && result.body.record) {
      mergeAnalyticsRecord(result.body.record);
      const nextQueue = analyticsQueue.slice(1);
      try {
        await persistAnalyticsQueue(nextQueue);
      } catch (persistenceError) {
        setAnalyticsStatus(text(persistenceError && persistenceError.message), "error");
        return;
      }
      analyticsQueue = nextQueue;
      continue;
    }
    if (result.response.status === 409 && result.body && result.body.code === "revision_conflict") {
      await readAnalytics();
      setAnalyticsStatus(
        "An offline checkpoint conflicts with a newer cloud revision. It remains queued for manual review.",
        "error"
      );
      return;
    }
    if (isDatabaseUnavailable(result.response, result.body) || result.response.status >= 500) {
      setAnalyticsStatus("Analytics storage is unavailable. Offline entries remain queued.", "offline");
      return;
    }
    setAnalyticsStatus(
      text(result.body && result.body.error) || "An offline entry needs manual review before syncing.",
      "error"
    );
    return;
  }
  setAnalyticsStatus("All offline analytics are synced.", "success");
  renderAll();
}

function validAnalyticsPage(value) {
  return exactKeys(value, ["schemaVersion", "view", "records", "nextCursor", "retentionPolicy"]) &&
    value.schemaVersion === ANALYTICS_SCHEMA_VERSION &&
    value.view === "latest" &&
    value.retentionPolicy === "indefinite" &&
    Array.isArray(value.records) &&
    value.records.length <= ANALYTICS_PAGE_LIMIT &&
    value.records.every(validAnalyticsRecord) &&
    (value.nextCursor === null || (
      typeof value.nextCursor === "string" &&
      value.nextCursor.length > 0 &&
      value.nextCursor.length <= 512 &&
      /^[A-Za-z0-9_-]+$/.test(value.nextCursor)
    ));
}

async function readAnalytics() {
  if (!navigator.onLine || cloudMode === "local") {
    renderResults();
    return;
  }
  try {
    const loaded = [];
    const seenCursors = new Set();
    const seenSnapshots = new Set();
    let cursor = null;
    while (true) {
      const query = new URLSearchParams({ view: "latest", limit: String(ANALYTICS_PAGE_LIMIT) });
      if (cursor !== null) query.set("cursor", cursor);
      const result = await apiFetch(ENDPOINTS.analytics + "?" + query.toString(), { method: "GET" });
      if (isDatabaseUnavailable(result.response, result.body)) {
        throw new Error("Canonical analytics storage is unavailable.");
      }
      if (!result.response.ok || !validAnalyticsPage(result.body)) {
        throw new Error("Analytics response failed strict pagination validation.");
      }
      if (loaded.length + result.body.records.length > MAX_ANALYTICS_RECORDS) {
        throw new Error("Analytics exceed the safe 10,000-record client limit.");
      }
      result.body.records.forEach(function (record) {
        const snapshotId = record.snapshot.snapshotId;
        if (seenSnapshots.has(snapshotId)) throw new Error("Analytics pagination returned a duplicate snapshot.");
        seenSnapshots.add(snapshotId);
        loaded.push(structuredClone(record));
      });
      if (result.body.nextCursor === null) break;
      if (seenCursors.has(result.body.nextCursor)) {
        throw new Error("Analytics pagination returned a cursor loop.");
      }
      seenCursors.add(result.body.nextCursor);
      cursor = result.body.nextCursor;
      if (loaded.length >= MAX_ANALYTICS_RECORDS) {
        throw new Error("Analytics pagination exceeds the safe client limit.");
      }
    }
    analyticsRecords = loaded;
    await persistAnalyticsCache();
    setAnalyticsStatus("Loaded " + loaded.length + " current analytics snapshot(s).", "success");
    renderAll();
  } catch (error) {
    setAnalyticsStatus(
      "Showing the last validated analytics cache. " + text(error && error.message),
      "offline"
    );
    renderResults();
  }
}

function clearAnalyticsForm(keepStatus) {
  [
    "rTopic", "rArea", "rPostId", "rEpisodeId", "rDate", "rDurationSeconds", "rSlideCount",
    "rVersion", "rViews", "rReach", "rAvgWatchTime", "rTotalWatchTime", "rLikes",
    "rRawComments", "rSaves", "rShares", "rComments", "rDMs", "rRequests", "rInterest",
    "rPaid", "rPatternSummary", "rNotes", "rLength",
  ].forEach(function (id) {
    const node = element(id);
    if (node) node.value = "";
  });
  element("rSnapshot").value = "24h";
  element("rExperiment").value = "Discovery post";
  element("rCTA").value = "";
  element("rMissingReason").value = "";
  Object.values(METRIC_REASON_FIELDS).forEach(function (id) {
    const node = element(id);
    if (node) node.value = "";
  });
  element("rCapturedAt").value = toLocalInputValue(new Date());
  updateSourceForPlatform();
  if (!keepStatus) setAnalyticsStatus("", "");
}

function legacyAnalyticsRows() {
  return state.results.map(function (result) {
    return {
      key: "legacy:" + result.id,
      publicationId: "legacy:" + result.id,
      topic: result.topic,
      area: result.area,
      family: result.family,
      platform: result.platform,
      date: result.date,
      checkpoint: result.snapshot === "72h" ? "72h_legacy" : result.snapshot,
      experiment: result.experiment,
      postRef: result.postId,
      format: result.format,
      hookType: result.hookType,
      creativeVersion: result.version,
      ctaType: result.cta,
      protocolVersion: "legacy",
      capturedAt: result.recordedAt,
      metrics: {
        views: result.metrics.views,
        reach: result.metrics.reach,
        averageWatchTimeSeconds: result.metrics.averageWatchTimeSeconds,
        totalWatchTimeSeconds: result.metrics.watchTimeSeconds,
        likes: result.metrics.likes,
        commentsCount: result.metrics.comments,
        saves: result.metrics.saves,
        shares: result.metrics.shares,
      },
      missingReasons: {
        views: result.missingReasons.views,
        reach: result.missingReasons.reach,
        averageWatchTimeSeconds: result.missingReasons.averageWatchTimeSeconds,
        totalWatchTimeSeconds: result.missingReasons.watchTimeSeconds,
        likes: result.missingReasons.likes,
        commentsCount: result.missingReasons.comments,
        saves: result.missingReasons.saves,
        shares: result.missingReasons.shares,
      },
      signals: {
        substantiveCommentsCount: result.signals.substantiveComments,
        dmProblemCount: result.signals.dms,
        requestCount: result.signals.requests,
        interestCount: result.signals.interest,
        paidCount: result.signals.paid,
      },
      summary: result.patternSummary,
      source: "Legacy Content OS",
      revision: 1,
      queued: false,
      legacy: true,
      sortTime: result.recordedAt || (result.date ? result.date + "T00:00:00Z" : null),
    };
  });
}

function sidecarRow(record, queued) {
  return {
    key: record.snapshot.snapshotId,
    publicationId: record.publication.publicationId,
    topic: record.publication.topic,
    area: record.publication.problemArea,
    family: record.publication.productFamily,
    platform: record.publication.platform,
    date: record.publication.publishedAt,
    checkpoint: record.snapshot.checkpoint,
    experiment: record.publication.experimentType,
    postRef: record.publication.postRef,
    format: record.publication.format,
    hookType: record.publication.hookType,
    creativeVersion: record.publication.creativeVersion,
    ctaType: record.publication.ctaType,
    protocolVersion: record.snapshot.protocolVersion,
    capturedAt: record.snapshot.capturedAt,
    metrics: structuredClone(record.snapshot.metrics),
    missingReasons: structuredClone(record.snapshot.missingReasons),
    signals: structuredClone(record.snapshot.signals),
    summary: record.snapshot.deidentifiedThemeSummary,
    source: record.snapshot.sourceSystem,
    revision: record.revision,
    queued: queued === true,
    legacy: record.snapshot.checkpoint === "72h_legacy" ||
      record.snapshot.collectionMethod === "legacy_migration" ||
      record.snapshot.sourceSystem === "Legacy Content OS",
    sortTime: queued === true ? record.createdAt : (record.snapshot.capturedAt || record.createdAt),
  };
}

function allAnalyticsRows() {
  const cloudRows = analyticsRecords.map(function (record) { return sidecarRow(record, false); });
  const queuedRows = analyticsQueue.map(function (entry) {
    return sidecarRow({
      publication: entry.payload.publication,
      snapshot: entry.payload.snapshot,
      revision: entry.expectedRevision + 1,
      createdAt: entry.queuedAt,
      archived: false,
    }, true);
  });
  return queuedRows.concat(cloudRows, legacyAnalyticsRows());
}

function sortedAnalyticsRows() {
  return allAnalyticsRows().slice().sort(function (left, right) {
    return Date.parse(right.sortTime || 0) - Date.parse(left.sortTime || 0);
  });
}

function filteredDisplayRows() {
  const searchNode = element("analyticsSearch");
  const platformNode = element("analyticsPlatformFilter");
  const checkpointNode = element("analyticsCheckpointFilter");
  const query = text(searchNode && searchNode.value).trim().toLowerCase();
  const platform = text(platformNode && platformNode.value);
  const checkpoint = text(checkpointNode && checkpointNode.value);
  return sortedAnalyticsRows().filter(function (row) {
    const searchable = [row.topic, row.area, row.family, row.postRef, row.source].join(" ").toLowerCase();
    return (!query || searchable.includes(query)) &&
      (!platform || row.platform === platform) &&
      (!checkpoint || row.checkpoint === checkpoint);
  });
}

function formatMetric(value, reason) {
  if (value === null || value === undefined) {
    return "Unknown" + (reason ? " (" + reason.replaceAll("_", " ") + ")" : "");
  }
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function appendMetric(parent, label, value, reason) {
  const item = makeNode("div", "result-metric");
  item.appendChild(makeNode("span", "result-metric-label", label));
  item.appendChild(makeNode("strong", "", formatMetric(value, reason)));
  parent.appendChild(item);
}

function renderResults() {
  const list = element("resultsTable");
  const summary = element("resultSummary");
  if (!list || !summary) return;
  clearNode(list);
  clearNode(summary);
  const allRows = sortedAnalyticsRows();
  const rows = filteredDisplayRows();
  const visibleRows = rows.slice(0, visibleResultLimit);
  const countNode = element("analyticsResultCount");
  const moreButton = element("analyticsShowMore");
  if (countNode) {
    countNode.textContent = rows.length + " matching of " + allRows.length + " loaded snapshot(s). Showing " +
      Math.min(rows.length, visibleRows.length) + ".";
  }
  if (moreButton) {
    moreButton.hidden = visibleRows.length >= rows.length;
    moreButton.textContent = "Show " + Math.min(DEFAULT_RESULT_LIMIT, rows.length - visibleRows.length) + " more";
  }

  if (!allRows.length) {
    list.appendChild(makeNode("div", "empty-state", "No analytics snapshots yet. Start with a 24-hour checkpoint."));
    return;
  }
  if (!rows.length) {
    list.appendChild(makeNode("div", "empty-state", "No saved snapshots match these filters."));
    return;
  }

  visibleRows.forEach(function (row) {
    const card = makeNode("article", "result-card");
    const heading = makeNode("div", "result-card-heading");
    const title = makeNode("div");
    title.appendChild(makeNode("h3", "", row.topic));
    title.appendChild(makeNode(
      "p",
      "subtle",
      row.area + " | " + row.platform + " | " + row.format + " | " + row.experiment
    ));
    heading.appendChild(title);
    const badges = makeNode("div", "pill-row");
    appendPill(badges, row.checkpoint, row.legacy ? "gold" : "primary");
    appendPill(badges, row.queued ? "Waiting to sync" : "Revision " + row.revision, row.queued ? "coral" : "");
    heading.appendChild(badges);
    card.appendChild(heading);

    const metrics = makeNode("div", "result-metrics");
    appendMetric(metrics, "Views", row.metrics.views, row.missingReasons.views);
    appendMetric(metrics, "Reach", row.metrics.reach, row.missingReasons.reach);
    appendMetric(metrics, "Average watch (seconds)", row.metrics.averageWatchTimeSeconds, row.missingReasons.averageWatchTimeSeconds);
    appendMetric(metrics, "Total watch (seconds)", row.metrics.totalWatchTimeSeconds, row.missingReasons.totalWatchTimeSeconds);
    appendMetric(metrics, "Likes", row.metrics.likes, row.missingReasons.likes);
    appendMetric(metrics, "Comments", row.metrics.commentsCount, row.missingReasons.commentsCount);
    appendMetric(metrics, "Saves", row.metrics.saves, row.missingReasons.saves);
    appendMetric(metrics, "Shares", row.metrics.shares, row.missingReasons.shares);
    card.appendChild(metrics);

    const signals = makeNode(
      "p",
      "subtle",
      "Useful signals: " +
        formatMetric(row.signals.substantiveCommentsCount) + " substantive comments, " +
        formatMetric(row.signals.dmProblemCount) + " problem DMs, " +
        formatMetric(row.signals.requestCount) + " requests, " +
        formatMetric(row.signals.interestCount) + " interest, " +
        formatMetric(row.signals.paidCount) + " paid."
    );
    card.appendChild(signals);
    if (row.summary) card.appendChild(makeNode("p", "pattern-summary", row.summary));

    card.appendChild(makeNode("p", "result-decision", distributionSummary(row)));
    card.appendChild(makeNode("p", "callout", "Next: " + postDecision(row)));

    const footer = makeNode("div", "result-card-footer");
    footer.appendChild(makeNode("span", "subtle", row.source + " | captured " + humanDate(row.capturedAt)));
    const safeUrl = safeExternalUrl(row.postRef);
    if (safeUrl) {
      const link = makeNode("a", "button secondary compact", "Open post");
      link.href = safeUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      footer.appendChild(link);
    } else if (row.postRef) {
      footer.appendChild(makeNode("span", "subtle long-id", "Post ID: " + row.postRef));
    }
    if (row.queued) {
      footer.appendChild(makeButton(
        "Discard queued snapshot",
        "discard-queued-analytics",
        "button danger compact",
        { snapshotId: row.key }
      ));
    }
    card.appendChild(footer);
    list.appendChild(card);
  });

  const latest = rows[0];
  summary.appendChild(makeNode(
    "div",
    "success",
    "Latest: " + latest.area + " at " + latest.checkpoint +
      ". Views " + formatMetric(latest.metrics.views, latest.missingReasons.views) +
      ", reach " + formatMetric(latest.metrics.reach, latest.missingReasons.reach) + "."
  ));
}


function analysisRows() {
  return allAnalyticsRows().filter(function (row) { return !row.queued && !row.legacy; });
}

function comparableRows(target) {
  return analysisRows().filter(function (row) {
    return row.key !== target.key &&
      row.publicationId !== target.publicationId &&
      row.platform === target.platform &&
      row.format === target.format &&
      row.checkpoint === target.checkpoint &&
      row.protocolVersion === target.protocolVersion;
  });
}

function formatRate(value) {
  return value === null ? "unknown" : value.toFixed(1) + " per 1,000 reach";
}

function distributionSummary(row) {
  if (row.legacy) {
    return "Legacy 72-hour data stays separate from the current comparison baseline.";
  }
  const saveRate = safeRate(row.metrics.saves, row.metrics.reach);
  const shareRate = safeRate(row.metrics.shares, row.metrics.reach);
  const comparable = comparableRows(row);
  const saveRates = comparable.map(function (item) {
    return safeRate(item.metrics.saves, item.metrics.reach);
  }).filter(Number.isFinite);
  const shareRates = comparable.map(function (item) {
    return safeRate(item.metrics.shares, item.metrics.reach);
  }).filter(Number.isFinite);
  if (saveRates.length < 3 || shareRates.length < 3) {
    return "Baseline building: " + saveRates.length + " of 3 finite save rates and " +
      shareRates.length + " of 3 finite share rates. Current save rate " +
      formatRate(saveRate) + ", share rate " + formatRate(shareRate) + ".";
  }

  const saveMedian = median(saveRates);
  const shareMedian = median(shareRates);
  if (saveRate === null || shareRate === null || saveMedian === null || shareMedian === null) {
    return "A comparable baseline exists, but a missing reach, save, or share value prevents a rate comparison.";
  }
  const saveDirection = saveRate > saveMedian ? "above" : "at or below";
  const shareDirection = shareRate > shareMedian ? "above" : "at or below";
  return "Saves are " + saveDirection + " the comparable median. Shares are " + shareDirection +
    " the comparable median. Compare the same checkpoint only.";
}

function preferredDecisionRows() {
  const priority = { "28d": 4, "7d": 3, "24h": 2, "72h_legacy": 1 };
  const selected = new Map();
  analysisRows().forEach(function (row) {
    const key = row.publicationId;
    const current = selected.get(key);
    if (!current || priority[row.checkpoint] > priority[current.checkpoint]) selected.set(key, row);
  });
  return Array.from(selected.values());
}

function independentAngles(rows) {
  return new Set(rows.map(function (row) { return text(row.topic).trim(); }).filter(Boolean)).size;
}

function valueOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function signalCountSummary(knownCount, notCounted) {
  if (!notCounted) return String(knownCount);
  return "at least " + knownCount + "; " + notCounted +
    (notCounted === 1 ? " field was" : " fields were") + " not counted";
}

function areaGate(area) {
  const rows = preferredDecisionRows().filter(function (row) { return row.area === area; });
  const primary = analysisRows().filter(function (row) {
    return row.area === area &&
      row.checkpoint === PRIMARY_CHECKPOINT &&
      ["Discovery post", "Replication post"].includes(row.experiment);
  });
  const angles = independentAngles(primary);
  const explicitValues = rows.flatMap(function (row) {
    return [row.signals.dmProblemCount, row.signals.requestCount, row.signals.interestCount];
  });
  const explicit = explicitValues.reduce(function (total, value) {
    return Number.isFinite(value) ? total + value : total;
  }, 0);
  const explicitNotCounted = explicitValues.filter(function (value) { return value === null; }).length;
  const interestTests = rows.filter(function (row) {
    return row.experiment === "Waitlist / interest test" &&
      Number.isFinite(row.signals.interestCount) && row.signals.interestCount > 0;
  });
  const paidWorkshopRows = rows.filter(function (row) { return row.experiment === "Paid workshop"; });
  const paidTests = paidWorkshopRows.filter(function (row) {
    return Number.isFinite(row.signals.paidCount) && row.signals.paidCount > 0;
  });
  const paid = paidWorkshopRows.reduce(function (total, row) {
    return Number.isFinite(row.signals.paidCount) ? total + row.signals.paidCount : total;
  }, 0);
  const paidNotCounted = paidWorkshopRows.filter(function (row) {
    return row.signals.paidCount === null;
  }).length;

  function decision(stage, action) {
    return {
      stage: stage,
      action: action,
      angles: angles,
      explicit: explicit,
      explicitNotCounted: explicitNotCounted,
      paid: paid,
      paidNotCounted: paidNotCounted,
    };
  }

  if (paidTests.length) {
    return decision(
      "PAID VALIDATED",
      "Improve the paid workshop from aggregate feedback before considering evergreen expansion."
    );
  }
  if (interestTests.length) {
    return decision(
      "READY FOR PAID WORKSHOP",
      "Run a paid 60 to 90 minute workshop before building a full course."
    );
  }
  if (angles >= 2 && explicit > 0) {
    return decision(
      "READY FOR INTEREST TEST",
      "Run a small Story, waitlist, or workshop-interest test using the same problem language."
    );
  }
  if (angles >= 2) {
    return decision(
      "REPLICATION COMPLETE",
      "Review distribution and useful signals, then test explicit interest only if the pattern is meaningful."
    );
  }
  if (angles === 1) {
    return decision(
      "NEEDS SECOND ANGLE",
      "Test one independent hook in the same problem area at the same 24-hour checkpoint."
    );
  }
  return decision("DISCOVERY", "Publish the first clean 24-hour test for this problem area.");
}

function postDecision(row) {
  if (row.experiment === "Paid workshop") {
    if (row.signals.paidCount === null) {
      return "Paid registrations were not counted. Complete the count before deciding whether to expand.";
    }
    return row.signals.paidCount > 0 ?
      "Paid proof captured. Improve before scaling." :
      "Paid registrations were counted as 0. Do not build the full course.";
  }
  if (row.experiment === "Waitlist / interest test") {
    if (row.signals.interestCount === null) {
      return "Interest responses were not counted. Complete the count before deciding what to test next.";
    }
    return row.signals.interestCount > 0 ?
      "Interest captured. The next gate is a paid workshop." :
      "Interest responses were counted as 0. Reframe or stop before building.";
  }
  return areaGate(row.area).action;
}

function renderProducts() {
  const board = element("productBoard");
  if (!board) return;
  clearNode(board);
  const rows = preferredDecisionRows();
  const areas = Array.from(new Set(rows.map(function (row) { return row.area; }).filter(Boolean))).sort();
  if (!areas.length) {
    board.appendChild(makeNode("div", "empty-state", "Product decisions appear after a 24-hour analytics snapshot is saved."));
    return;
  }

  areas.forEach(function (area) {
    const areaRows = rows.filter(function (row) { return row.area === area; });
    const gate = areaGate(area);
    const card = makeNode("article", "mini product-card");
    card.appendChild(makeNode("h3", "", area));
    const labels = makeNode("div", "pill-row");
    appendPill(labels, areaRows[0].family || "Unclassified");
    appendPill(labels, gate.stage, "gold");
    card.appendChild(labels);
    card.appendChild(makeNode("p", "", "Independent 24-hour angles: " + gate.angles));
    card.appendChild(makeNode(
      "p",
      "",
      "Aggregate pain or intent signals: " + signalCountSummary(gate.explicit, gate.explicitNotCounted)
    ));
    card.appendChild(makeNode(
      "p",
      "",
      "Paid registrations: " + signalCountSummary(gate.paid, gate.paidNotCounted)
    ));
    card.appendChild(makeNode("p", "callout", "Next: " + gate.action));
    board.appendChild(card);
  });
}

function renderBackupStatus() {
  const node = element("backupStatus");
  if (!node) return;
  const currentCount = analyticsRecords.length + state.results.length;
  const since = Math.max(0, currentCount - state.lastBackupResultCount);
  clearNode(node);
  if (!state.lastBackupAt) {
    node.appendChild(makeNode("strong", "danger-text", "Backup not exported yet. "));
    node.appendChild(document.createTextNode("Export after meaningful new results."));
  } else if (since >= 3) {
    node.appendChild(makeNode("strong", "danger-text", "Backup due. "));
    node.appendChild(document.createTextNode(since + " new snapshot(s) have been added."));
  } else {
    node.appendChild(makeNode("strong", "success-text", "Backup current. "));
    node.appendChild(document.createTextNode("Last export: " + humanDate(state.lastBackupAt) + "."));
  }
}

function refreshDashboard() {
  const monthEntries = calendarEntriesForSelectedMonth();
  const statuses = monthEntries.map(function (entry) { return entry[1]; });
  const completeStatuses = ["posted", "replicate", "validated", "stop"];
  const completed = statuses.filter(function (entry) {
    return completeStatuses.includes(entry.status);
  }).length;

  const primary = analysisRows().filter(function (row) {
    return row.checkpoint === PRIMARY_CHECKPOINT &&
      ["Discovery post", "Replication post"].includes(row.experiment);
  });
  const areas = Array.from(new Set(primary.map(function (row) { return row.area; }).filter(Boolean)));
  const replicated = areas.filter(function (area) {
    return independentAngles(primary.filter(function (row) { return row.area === area; })) >= 2;
  });
  const paidAreas = Array.from(new Set(preferredDecisionRows().filter(function (row) {
    return row.experiment === "Paid workshop" && valueOrZero(row.signals.paidCount) > 0;
  }).map(function (row) { return row.area; })));

  element("postsDone").textContent = String(completed);
  element("topicsTested").textContent = String(areas.length);
  element("replicatedCount").textContent = String(replicated.length);
  element("paidValidated").textContent = String(paidAreas.length);
  const totalPlanned = monthEntries.length;
  const progressText = totalPlanned ?
    completed + " of " + totalPlanned + " planned items complete in " + monthLabel(selectedCalendarMonth) + "." :
    "No plan items in " + monthLabel(selectedCalendarMonth) + ".";
  element("monthProgress").max = Math.max(1, totalPlanned);
  element("monthProgress").value = completed;
  element("monthProgress").textContent = progressText;
  element("monthProgress").setAttribute("aria-valuetext", progressText);
  if (element("monthProgressText")) element("monthProgressText").textContent = progressText;

  let nextAction = "Complete the next scheduled post, then capture its 24-hour checkpoint before drawing conclusions.";
  const gates = areas.map(areaGate);
  if (paidAreas.length) {
    nextAction = "Paid validation exists. Improve the workshop from aggregate feedback before expanding.";
  } else if (gates.some(function (gate) { return gate.stage === "READY FOR PAID WORKSHOP"; })) {
    nextAction = "An interest test passed. Run the small paid workshop next.";
  } else if (gates.some(function (gate) { return gate.stage === "READY FOR INTEREST TEST"; })) {
    nextAction = "A replicated problem has explicit signals. Run a small interest test next.";
  } else if (gates.some(function (gate) { return gate.stage === "NEEDS SECOND ANGLE"; })) {
    nextAction = "One problem has one clean test. Run a second independent angle at 24 hours.";
  }
  if (analyticsQueue.length) {
    nextAction = "Reconnect and sync " + analyticsQueue.length + " queued analytics snapshot(s), then continue the content plan.";
  }
  element("nextAction").textContent = nextAction;
  renderProducts();
  renderBackupStatus();
}


function setResearchStatus(label, kind, meta, detail) {
  const status = element("researchStatus");
  const runMeta = element("researchRunMeta");
  const information = element("researchDetail");
  if (!status || !runMeta || !information) return;
  status.textContent = label;
  status.className = "status-badge " + (kind || "neutral");
  runMeta.textContent = meta;
  information.textContent = detail;
}

function researchSourcesForItem(item, latestRun, latestItems) {
  if (!isPlainObject(item.data) || !isPlainObject(latestRun)) return [];
  let sourceIds = [];
  if (item.type === "finding" && Array.isArray(item.data.source_ids)) {
    sourceIds = item.data.source_ids;
  }
  if (item.type === "topic" && Array.isArray(item.data.finding_ids)) {
    latestItems.filter(function (candidate) {
      return candidate.type === "finding" && item.data.finding_ids.includes(candidate.sourceItemId);
    }).forEach(function (finding) {
      if (isPlainObject(finding.data) && Array.isArray(finding.data.source_ids)) {
        sourceIds = sourceIds.concat(finding.data.source_ids);
      }
    });
  }
  const uniqueIds = new Set(sourceIds);
  return Array.isArray(latestRun.sources) ? latestRun.sources.filter(function (source) {
    return isPlainObject(source) && uniqueIds.has(source.id) && safeExternalUrl(source.url);
  }) : [];
}

function isResearchRunFresh(run) {
  const generated = Date.parse(run && run.generatedAt);
  const age = Date.now() - generated;
  return Number.isFinite(generated) && age >= -5 * 60 * 1000 && age <= 14 * 24 * 60 * 60 * 1000;
}

function researchContextForItem(item) {
  const run = researchCache.runs.find(function (candidate) { return candidate.runId === item.runId; });
  if (!run || !isPlainObject(item.data)) return null;
  const runItems = researchCache.items.filter(function (candidate) { return candidate.runId === item.runId; });
  const relatedFindings = item.type === "topic" && Array.isArray(item.data.finding_ids) ?
    runItems.filter(function (candidate) {
      return candidate.type === "finding" && item.data.finding_ids.includes(candidate.sourceItemId);
    }).map(function (candidate) { return structuredClone(candidate.data); }) : [];
  const sources = researchSourcesForItem(item, run, runItems).map(structuredClone);
  const limitations = [item.data.limitations].concat(relatedFindings.map(function (finding) {
    return finding.limitations;
  })).filter(Boolean);
  return {
    itemId: item.itemId,
    runId: item.runId,
    type: item.type,
    topic: item.type === "topic" ? structuredClone(item.data) : null,
    finding: item.type === "finding" ? structuredClone(item.data) : null,
    relatedFindings: relatedFindings,
    sources: sources,
    limitations: limitations,
    promptSeed: item.type === "topic" ? text(item.data.prompt_seed) : "",
  };
}

function topicBankMatchForResearch(data) {
  const category = text(data && data.category).trim().toLowerCase();
  if (!category) return null;
  return DATA.topics.find(function (topic) {
    const name = topic.name.toLowerCase();
    return name === category || name.includes(category) || category.includes(name);
  }) || null;
}

function renderSelectedResearchContext() {
  const panel = element("selectedResearchContext");
  const detail = element("selectedResearchDetail");
  if (!panel || !detail) return;
  if (!selectedResearchContext) {
    panel.hidden = true;
    detail.textContent = "";
    return;
  }
  panel.hidden = false;
  const selected = selectedResearchContext.topic || selectedResearchContext.finding || {};
  detail.textContent = (selectedResearchContext.type === "topic" ? text(selected.hook) : text(selected.title)) +
    " | " + selectedResearchContext.sources.length + " governed source(s) | " +
    selectedResearchContext.limitations.length + " limitation note(s)";
}

function clearSelectedResearchContext() {
  selectedResearchContext = null;
  renderSelectedResearchContext();
}

function appendResearchCard(container, item, run, runItems, useful) {
  const data = isPlainObject(item.data) ? item.data : {};
  const card = makeNode("article", "research-card");
  card.appendChild(makeNode("p", "card-label", item.type === "topic" ? "Topic candidate" : "Research finding"));
  card.appendChild(makeNode("h3", "", item.type === "topic" ? data.hook : data.title));
  const summary = item.type === "topic" ?
    [data.parent_problem, data.possible_mechanism, data.practical_action].filter(Boolean).join(" ") :
    text(data.summary);
  if (summary) card.appendChild(makeNode("p", "", summary));
  if (data.limitations) card.appendChild(makeNode("p", "subtle", "Limit: " + data.limitations));

  const sources = researchSourcesForItem(item, run, runItems);
  if (sources.length) {
    const sourceRow = makeNode("div", "source-links");
    sources.forEach(function (source) {
      const link = makeNode("a", "", source.name);
      link.href = safeExternalUrl(source.url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      sourceRow.appendChild(link);
    });
    card.appendChild(sourceRow);
  }

  const actions = makeNode("div", "actions");
  actions.appendChild(makeButton(
    useful ? "Attach to prompt" : (item.type === "topic" ? "Use topic" : "Use finding"),
    "use-research",
    "button compact",
    { itemId: item.itemId }
  ));
  if (item.type === "topic") {
    actions.appendChild(makeButton("Add to plan", "plan-research-topic", "button secondary compact", { itemId: item.itemId }));
  }
  actions.appendChild(makeButton("Archive", "archive-research", "button secondary compact", { itemId: item.itemId }));
  card.appendChild(actions);
  container.appendChild(card);
}

function renderResearch() {
  const inbox = element("researchInbox");
  const useful = element("usefulResearch");
  if (!inbox || !useful) return;
  clearNode(inbox);
  clearNode(useful);
  if (!researchCache.runs.length) {
    inbox.appendChild(makeNode("div", "empty-state", "No research suggestions have been received."));
    useful.appendChild(makeNode("div", "empty-state", "Research you mark useful will remain visible here."));
    setResearchStatus(
      "Not connected",
      "neutral",
      "No research run loaded",
      "Manual topic and analytics features still work. Suggestions never publish automatically."
    );
    return;
  }

  const latestRun = researchCache.runs[0];
  const latestItems = researchCache.items.filter(function (item) {
    return isPlainObject(item) && item.runId === latestRun.runId;
  });
  const visibleItems = latestItems.filter(function (item) {
    return item.decision === "new" && ["topic", "finding"].includes(item.type);
  }).slice(0, 8);
  const analyticsStatus = text(latestRun.analyticsStatus);
  const stale = analyticsStatus !== "available" || !isResearchRunFresh(latestRun) || researchHistoryBounded;
  setResearchStatus(
    stale ? "Needs review" : "Ready",
    stale ? "warning" : "success",
    text(latestRun.runId) + " | " + humanDate(latestRun.generatedAt),
    stale ?
      (researchHistoryBounded ?
        "The newest bounded research history is loaded, but older pages remain beyond the 10-year client cap." :
        "The weekly feed is older than 14 days or did not have current analytics context. Treat every item as a suggestion, not a rule.") :
      "Suggestions are sourced and bounded. Only your explicit choice moves a topic into the prompt builder."
  );

  if (!visibleItems.length) {
    inbox.appendChild(makeNode("div", "empty-state", "No new items in the latest weekly run."));
  }

  visibleItems.forEach(function (item) {
    appendResearchCard(inbox, item, latestRun, latestItems, false);
  });

  const usedItems = researchCache.items.filter(function (item) {
    return item.decision === "used" && ["topic", "finding"].includes(item.type);
  });
  if (!usedItems.length) {
    useful.appendChild(makeNode("div", "empty-state", "Research you mark useful will remain visible here."));
  } else {
    usedItems.forEach(function (item) {
      const run = researchCache.runs.find(function (candidate) { return candidate.runId === item.runId; });
      if (!run) return;
      const runItems = researchCache.items.filter(function (candidate) { return candidate.runId === item.runId; });
      appendResearchCard(useful, item, run, runItems, true);
    });
  }
  renderSelectedResearchContext();
}

async function recordResearchDecision(itemId, decision) {
  if (!navigator.onLine || cloudMode === "local") {
    throw new Error("Research decisions need the secure cloud connection.");
  }
  const result = await apiFetch(ENDPOINTS.research, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itemId: itemId,
      decision: decision,
      requestId: newUuid(),
    }),
  });
  if (!result.response.ok) {
    throw new Error(text(result.body && result.body.error) || "Research decision was not saved.");
  }
  const storedDecision = decision === "archive" ? "archived" : "used";
  researchCache.items = researchCache.items.map(function (item) {
    if (item.itemId !== itemId) return item;
    const next = structuredClone(item);
    next.decision = storedDecision;
    next.decidedAt = result.body.decidedAt || new Date().toISOString();
    return next;
  });
  persistResearchCache();
  renderResearch();
}

async function useResearchItem(itemId) {
  const item = researchCache.items.find(function (candidate) { return candidate.itemId === itemId; });
  if (!item || !isPlainObject(item.data)) return;
  selectedResearchContext = researchContextForItem(item);
  if (item.type === "topic") {
    const data = item.data;
    const topicMatch = topicBankMatchForResearch(data);
    element("pTopic").value = text(data.hook);
    element("pArea").value = text(topicMatch ? topicMatch.name : (data.category || data.parent_problem)).slice(0, 160);
    if (topicMatch) {
      element("pFamily").value = topicMatch.family;
      element("pStage").value = topicMatch.stage;
    } else if (DATA.families.includes(data.category)) {
      element("pFamily").value = data.category;
    }
    if (["none", "save", "share", "comment_question", "story_question", "waitlist"].includes(data.ending)) {
      element("pEnding").value = data.ending;
    }
    element("pResearch").value = "Use current evidence where needed";
  }
  renderSelectedResearchContext();
  scrollToNode(element("prompts"), "start");
  try {
    await recordResearchDecision(itemId, "used");
  } catch (error) {
    setResearchStatus("Decision not synced", "warning", text(item.runId), text(error && error.message));
  }
}

async function archiveResearchItem(itemId) {
  try {
    await recordResearchDecision(itemId, "archive");
  } catch (error) {
    setResearchStatus("Archive not synced", "warning", "", text(error && error.message));
  }
}

async function readResearch() {
  if (!navigator.onLine || cloudMode === "local") {
    renderResearch();
    return;
  }
  try {
    const runs = [];
    const items = [];
    const runIds = new Set();
    const itemIds = new Set();
    const seenCursors = new Set();
    let bounded = false;
    let generatedAt = null;
    let cursor = null;
    while (true) {
      const query = new URLSearchParams({ limit: String(RESEARCH_PAGE_LIMIT) });
      if (cursor !== null) query.set("cursor", cursor);
      const result = await apiFetch(ENDPOINTS.research + "?" + query.toString(), { method: "GET" });
      if (isDatabaseUnavailable(result.response, result.body)) {
        throw new Error("Canonical research storage is unavailable.");
      }
      if (!result.response.ok || !validResearchPage(result.body)) {
        throw new Error("Research feed failed strict pagination validation.");
      }
      if (generatedAt === null) generatedAt = result.body.generatedAt;
      if (runs.length + result.body.runs.length > MAX_RESEARCH_RUNS ||
          items.length + result.body.items.length > MAX_RESEARCH_ITEMS) {
        bounded = true;
        break;
      }
      result.body.runs.forEach(function (run) {
        if (runIds.has(run.runId)) throw new Error("Research pagination returned a duplicate run.");
        runIds.add(run.runId);
        runs.push(structuredClone(run));
      });
      result.body.items.forEach(function (item) {
        if (itemIds.has(item.itemId)) throw new Error("Research pagination returned a duplicate item.");
        itemIds.add(item.itemId);
        items.push(structuredClone(item));
      });
      if (result.body.nextCursor === null) break;
      if (seenCursors.has(result.body.nextCursor)) throw new Error("Research pagination returned a cursor loop.");
      seenCursors.add(result.body.nextCursor);
      cursor = result.body.nextCursor;
      if (runs.length >= MAX_RESEARCH_RUNS || items.length >= MAX_RESEARCH_ITEMS) {
        bounded = true;
        break;
      }
    }
    researchCache = {
      schemaVersion: RESEARCH_FEED_SCHEMA,
      generatedAt: generatedAt || new Date().toISOString(),
      runs: runs,
      items: items,
      nextCursor: bounded ? cursor : null,
    };
    researchHistoryBounded = bounded;
    persistResearchCache();
    renderResearch();
  } catch (error) {
    renderResearch();
    const latestRun = researchCache.runs[0];
    setResearchStatus(
      "Refresh failed",
      "warning",
      latestRun ? text(latestRun.runId) + " | cached" : "No cached research",
      "The live refresh failed. Validated cached research remains visible. " + text(error && error.message)
    );
  }
}


function endingInstruction(value) {
  const instructions = {
    none: "No CTA is required. End with a clear, useful takeaway and let it land.",
    save: "Invite a save only if the content is genuinely useful to revisit.",
    share: "Invite a share only if it helps another family understand the problem.",
    comment_question: "End with one low-pressure, deidentified comment question.",
    story_question: "Use one Story question for aggregate product research.",
    waitlist: "Invite workshop or waitlist interest without implying proven demand.",
  };
  return instructions[value] || instructions.none;
}

function analyticsLearningSummary(area) {
  const normalizedArea = text(area).trim().toLowerCase();
  const rows = analysisRows().filter(function (row) {
    return text(row.area).trim().toLowerCase() === normalizedArea;
  });
  if (!rows.length) {
    return "No current, non-legacy analytics snapshots are loaded for this problem area.";
  }
  const cohorts = new Map();
  rows.forEach(function (row) {
    const label = [row.platform, row.format, row.checkpoint, row.protocolVersion].join(" | ");
    if (!cohorts.has(label)) cohorts.set(label, []);
    cohorts.get(label).push(row);
  });
  const cohortSummaries = Array.from(cohorts.entries()).map(function (entry) {
    const label = entry[0];
    const cohortRows = entry[1];
    const saveRates = cohortRows.map(function (row) {
      return safeRate(row.metrics.saves, row.metrics.reach);
    }).filter(Number.isFinite);
    const shareRates = cohortRows.map(function (row) {
      return safeRate(row.metrics.shares, row.metrics.reach);
    }).filter(Number.isFinite);
    return {
      label: label,
      count: cohortRows.length,
      summary: label + ": " + cohortRows.length + " snapshot(s), median save rate " +
        formatRate(median(saveRates)) + " (n=" + saveRates.length + "), median share rate " +
        formatRate(median(shareRates)) + " (n=" + shareRates.length + ").",
    };
  }).sort(function (left, right) { return right.count - left.count || left.label.localeCompare(right.label); });
  const decisionRows = preferredDecisionRows().filter(function (row) {
    return text(row.area).trim().toLowerCase() === normalizedArea;
  });
  const signalValues = decisionRows.flatMap(function (row) {
    return [row.signals.dmProblemCount, row.signals.requestCount, row.signals.interestCount];
  });
  const knownSignals = signalValues.reduce(function (total, value) {
    return Number.isFinite(value) ? total + value : total;
  }, 0);
  const notCounted = signalValues.filter(function (value) { return value === null; }).length;
  const shownCohorts = cohortSummaries.slice(0, 3).map(function (cohort) { return cohort.summary; });
  if (cohortSummaries.length > shownCohorts.length) {
    shownCohorts.push((cohortSummaries.length - shownCohorts.length) + " smaller cohort(s) omitted for brevity.");
  }
  return rows.length + " current non-legacy snapshot(s), grouped without mixing cohorts. " + shownCohorts.join(" ") +
    " Preferred one-per-publication signal rows: " + decisionRows.length + ". Problem or intent signals: " +
    signalCountSummary(knownSignals, notCounted) + ". This is descriptive internal learning, not causal proof.";
}

function buildPrompt() {
  const topic = text(element("pTopic").value).trim();
  if (!topic) {
    alert("Choose or type a topic first.");
    element("pTopic").focus();
    return;
  }
  const area = text(element("pArea").value).trim() || "Unclassified problem";
  const stage = element("pStage").value;
  const family = element("pFamily").value;
  const output = element("pOutput").value;
  const goal = element("pGoal").value;
  const platform = element("pPlatform").value;
  const wording = element("pLocked").value;
  const research = element("pResearch").value;
  const ending = endingInstruction(element("pEnding").value);

  const header = [
    "CREATE A FINAL APC PRODUCTION PACKAGE",
    "",
    "Topic or hook: " + topic,
    "Problem area: " + area,
    "Life stage: " + stage,
    "Product family: " + family,
    "Primary goal: " + goal,
    "Platform: " + platform,
    "Wording: " + wording,
    "Evidence: " + research,
    "Ending: " + ending,
    "",
    "APC ANALYTICS LEARNING FOR THIS PROBLEM AREA",
    analyticsLearningSummary(area),
    "",
    "SELECTED GOVERNED RESEARCH CONTEXT",
    selectedResearchContext ? JSON.stringify(selectedResearchContext, null, 2) : "No governed research item is attached.",
    "Use attached research only within its stated sources and limitations. Do not invent missing evidence.",
    "",
    "MEASUREMENT PROTOCOL",
    "- Capture 24 hours first, then 7 days and 28 days.",
    "- Keep platform, format, checkpoint, and protocol separate when comparing.",
    "- Preserve blanks as unknown. Never turn them into zero.",
    "- Require a second independent angle before product validation.",
    "- Require explicit interest, then paid workshop proof, before a full course build.",
    "",
    "APC BOUNDARIES",
    "- Start from a recognisable parent moment, not a textbook explanation.",
    "- Separate observation from interpretation and avoid one-cause claims.",
    "- Give one practical thing to notice or try.",
    "- Use deidentified patterns only. Do not include names, handles, or private messages.",
    "- Fact-check material claims and show evidence limits.",
    "- Medication stays with prescribers.",
    "- Do not use em dashes.",
  ];

  const packages = {
    content: [
      "",
      "OUTPUT",
      "Return one polished, mobile-friendly content development package with:",
      "- final hook and one clear teaching mechanism",
      "- short-form script or carousel copy suited to the selected platform",
      "- caption, evidence notes, optional ending, production notes, and QA",
      "- one product hypothesis and one book reuse angle",
      "- one measurable experiment for the selected checkpoint",
    ],
    carousel: [
      "",
      "OUTPUT",
      "Return a ready-to-produce six-slide carousel package:",
      "1. parent moment",
      "2. intensify the contradiction",
      "3. careful reframe",
      "4. possible mechanisms to check",
      "5. one practical observation or tool",
      "6. clear takeaway with the optional ending above",
      "Include caption, source notes, 1080 by 1350 and 1080 by 1920 production guidance, and phone-scale QA.",
    ],
    youtube: [
      "",
      "OUTPUT",
      "Return a complete 8 to 15 minute YouTube package with:",
      "- title options, thumbnail concepts, final spoken script, chapters, and visual plan",
      "- evidence notes, description, pinned comment, and phone-friendly Shorts adaptations",
      "- a natural close that follows the optional ending above",
      "- one book angle, one workshop opportunity, and final QA",
    ],
    validation: [
      "",
      "OUTPUT",
      "Assess whether the problem is ready for REPLICATE, INTEREST TEST, PAID WORKSHOP, BUILD AFTER PAID PROOF, or STOP.",
      "Use only comparable checkpoints. Separate distribution, resonance, and commercial intent.",
      "Return one follow-up concept, one small interest test, exact evidence gates, and a conservative recommendation.",
    ],
  };

  element("promptText").textContent = header.concat(packages[output] || packages.content).join("\n");
  element("builtPrompt").hidden = false;
  scrollToNode(element("builtPrompt"), "nearest");
}

async function copyPrompt() {
  const value = element("promptText").textContent;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element("promptText"));
    selection.removeAllRanges();
    selection.addRange(range);
    alert("The prompt is selected. Copy it with your device copy command.");
  }
}

function validHistoryRecord(record) {
  if (!isPlainObject(record) ||
      !Number.isSafeInteger(record.revision) || record.revision < 1 ||
      !["2.1", "2.2", STATE_SCHEMA_VERSION].includes(record.schemaVersion) ||
      (record.updatedAt !== null && !isCanonicalUtcTimestamp(record.updatedAt))) {
    return false;
  }
  if (record.schemaVersion !== STATE_SCHEMA_VERSION) {
    return record.action === "legacy" && record.requestId === null &&
      record.restoredFromRevision === null && record.stateHash === "legacy-unhashed";
  }
  const restoredFromRevisionIsValid = record.restoredFromRevision === null || (
    Number.isSafeInteger(record.restoredFromRevision) &&
    record.restoredFromRevision >= 0 &&
    record.restoredFromRevision < record.revision
  );
  return record.updatedAt !== null &&
    ["edit", "import", "reset", "migration", "restore"].includes(record.action) &&
    typeof record.requestId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(record.requestId) &&
    restoredFromRevisionIsValid &&
    (record.action === "restore" ? record.restoredFromRevision !== null : record.restoredFromRevision === null) &&
    typeof record.stateHash === "string" && /^[a-f0-9]{64}$/.test(record.stateHash);
}

function validHistoryPage(value) {
  return exactKeys(value, ["schemaVersion", "revisions", "nextCursor"]) &&
    value.schemaVersion === STATE_SCHEMA_VERSION &&
    Array.isArray(value.revisions) && value.revisions.length <= 100 &&
    value.revisions.every(validHistoryRecord) &&
    (value.nextCursor === null || (
      typeof value.nextCursor === "string" && value.nextCursor.length > 0 && value.nextCursor.length <= 128 &&
      /^[A-Za-z0-9_-]+$/.test(value.nextCursor)
    ));
}

function renderHistory() {
  const list = element("historyList");
  const status = element("historyStatus");
  const showOlder = element("showOlderHistory");
  if (!list || !status || !showOlder) return;
  clearNode(list);
  if (!historyRecords.length) {
    status.textContent = cloudMode === "local" ?
      "History needs the secure cloud database." :
      "No previous revisions are available yet.";
    showOlder.hidden = true;
    return;
  }
  const visible = historyRecords.slice(0, visibleHistoryLimit);
  status.textContent = "Showing " + visible.length + " of " + historyRecords.length +
    " immutable revision(s).";
  visible.forEach(function (record) {
    const row = makeNode("div", "history-row");
    const information = makeNode("div");
    const provenance = record.restoredFromRevision === null ? "" :
      " | from revision " + record.restoredFromRevision;
    information.appendChild(makeNode("strong", "", "Revision " + record.revision + " | " + record.action + provenance));
    information.appendChild(makeNode("p", "subtle", humanDate(record.updatedAt)));
    row.appendChild(information);
    row.appendChild(makeButton("Restore", "restore-history", "button secondary compact", { revision: record.revision }));
    list.appendChild(row);
  });
  showOlder.hidden = visible.length >= historyRecords.length;
  showOlder.textContent = "Show " + Math.min(50, historyRecords.length - visible.length) + " older";
}

async function readHistory() {
  if (!navigator.onLine || cloudMode === "local") {
    renderHistory();
    return;
  }
  try {
    const loaded = [];
    const revisions = new Set();
    const cursors = new Set();
    let cursor = null;
    while (true) {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor !== null) query.set("cursor", cursor);
      const result = await apiFetch(ENDPOINTS.history + "?" + query.toString(), { method: "GET" });
      if (!result.response.ok || !validHistoryPage(result.body)) throw new Error("History could not be loaded.");
      if (loaded.length + result.body.revisions.length > MAX_HISTORY_RECORDS) {
        throw new Error("History exceeds the safe 10,000-record client limit.");
      }
      result.body.revisions.forEach(function (record) {
        if (revisions.has(record.revision)) throw new Error("History pagination returned a duplicate revision.");
        revisions.add(record.revision);
        loaded.push(structuredClone(record));
      });
      if (result.body.nextCursor === null) break;
      if (cursors.has(result.body.nextCursor)) throw new Error("History pagination returned a cursor loop.");
      cursors.add(result.body.nextCursor);
      cursor = result.body.nextCursor;
      if (loaded.length >= MAX_HISTORY_RECORDS) throw new Error("History exceeds the safe client limit.");
    }
    historyRecords = loaded;
    visibleHistoryLimit = DEFAULT_HISTORY_LIMIT;
    renderHistory();
  } catch (error) {
    element("historyStatus").textContent = "History is unavailable. Your current state was not changed. " +
      text(error && error.message);
  }
}

async function restoreHistory(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) return;
  if (syncMeta.dirty || syncInFlight) {
    alert("Wait for current changes to sync before restoring history.");
    return;
  }
  if (!confirm("Restore revision " + revision + " as a new cloud revision? Your current state will remain in History.")) return;
  try {
    await saveRecoveryCopy("Before history restore");
  } catch (error) {
    alert(text(error && error.message));
    return;
  }
  try {
    const result = await apiFetch(ENDPOINTS.history, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: syncMeta.revision,
        revision: revision,
        requestId: "state:" + newUuid(),
      }),
    });
    if (result.response.status === 409) {
      showConflict(result.body);
      return;
    }
    if (!result.response.ok) throw new Error(text(result.body && result.body.error) || "Revision could not be restored.");
    acceptCloudRecord(result.body);
    await readHistory();
  } catch (error) {
    alert(text(error && error.message));
  }
}

function validateBackupEnvelope(value) {
  if (!isPlainObject(value)) throw new Error("Backup must be a plain JSON object.");
  const currentKeys = [
    "format", "schemaVersion", "exportedAt", "cloudRevision",
    "state", "analytics", "analyticsQueue", "research",
  ];
  if (exactKeys(value, currentKeys)) {
    if (value.format !== BACKUP_FORMAT || value.schemaVersion !== STATE_SCHEMA_VERSION) {
      throw new Error("Backup version is not supported.");
    }
    if (!isCanonicalUtcTimestamp(value.exportedAt)) {
      throw new Error("Backup timestamp is invalid.");
    }
    if (!Number.isSafeInteger(value.cloudRevision) || value.cloudRevision < 0) {
      throw new Error("Backup cloud revision is invalid.");
    }
    assertValidContentOsState(value.state);
    if (!Array.isArray(value.analytics) || value.analytics.length > MAX_ANALYTICS_RECORDS ||
        !value.analytics.every(validAnalyticsRecord)) {
      throw new Error("Backup analytics failed validation.");
    }
    if (!Array.isArray(value.analyticsQueue) || value.analyticsQueue.length > MAX_ANALYTICS_QUEUE ||
        !value.analyticsQueue.every(validQueuedAnalytics)) {
      throw new Error("Backup analytics queue failed validation.");
    }
    if (!validResearchCache(value.research)) throw new Error("Backup research failed validation.");
    return {
      format: value.format,
      schemaVersion: value.schemaVersion,
      exportedAt: value.exportedAt,
      cloudRevision: value.cloudRevision,
      state: structuredClone(value.state),
      analytics: value.analytics.map(structuredClone),
      analyticsQueue: value.analyticsQueue.map(structuredClone),
      research: structuredClone(value.research),
    };
  }

  const legacyEnvelopeKeys = [
    "protocol", "schemaVersion", "cloudRevision", "cloudUpdatedAt", "exportedAt", "state",
  ];
  if (exactKeys(value, legacyEnvelopeKeys)) {
    if (!["2.1", "2.2"].includes(value.schemaVersion) ||
        !Number.isSafeInteger(value.cloudRevision) ||
        value.cloudRevision < 0 ||
        !isCanonicalUtcTimestamp(value.exportedAt) ||
        (value.cloudUpdatedAt !== null && !isCanonicalUtcTimestamp(value.cloudUpdatedAt)) ||
        typeof value.protocol !== "string") {
      throw new Error("Legacy backup envelope is invalid.");
    }
    const migratedState = migrateContentOsState(value.state);
    assertValidContentOsState(migratedState);
    return {
      format: "apc.content-os.backup.legacy",
      schemaVersion: STATE_SCHEMA_VERSION,
      exportedAt: value.exportedAt,
      cloudRevision: value.cloudRevision,
      state: migratedState,
      analytics: [],
      analyticsQueue: [],
      research: emptyResearchCache(),
    };
  }

  if (["2.1", "2.2"].includes(value.version)) {
    const migratedState = migrateContentOsState(value);
    assertValidContentOsState(migratedState);
    return {
      format: "apc.content-os.backup.legacy-raw",
      schemaVersion: STATE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      cloudRevision: 0,
      state: migratedState,
      analytics: [],
      analyticsQueue: [],
      research: emptyResearchCache(),
    };
  }
  throw new Error("Backup envelope has unexpected or missing fields.");
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
}

function exportRecoveryCopy() {
  if (!recoveryCopy || !validRecoveryCopy(recoveryCopy)) {
    alert("No validated local recovery copy is available to export.");
    return;
  }
  downloadJson(
    "APC_Content_OS_Recovery_" + recoveryCopy.savedAt.slice(0, 10) + ".json",
    recoveryCopy
  );
}

async function restoreRecoveryCopy() {
  if (!recoveryCopy || !validRecoveryCopy(recoveryCopy)) {
    alert("No validated local recovery copy is available to restore.");
    return;
  }
  if (!confirm("Restore this local recovery as a new cloud revision? Current analytics and research remain unchanged.")) return;
  const target = structuredClone(recoveryCopy);
  try {
    await saveRecoveryCopy("Before local recovery restore");
    await writeStateServerFirst(target.state, "import");
    await readHistory();
    alert("The validated local recovery was restored as a new cloud revision.");
  } catch (error) {
    alert(text(error && error.message) || "The recovery copy could not be restored.");
  }
}

async function exportData() {
  const now = new Date().toISOString();
  await updateState(function (candidate) {
    candidate.lastBackupAt = now;
    candidate.lastBackupResultCount = analyticsRecords.length + candidate.results.length;
  }, "edit");
  const envelope = {
    format: BACKUP_FORMAT,
    schemaVersion: STATE_SCHEMA_VERSION,
    exportedAt: now,
    cloudRevision: syncMeta.revision,
    state: structuredClone(state),
    analytics: analyticsRecords.map(structuredClone),
    analyticsQueue: analyticsQueue.map(structuredClone),
    research: structuredClone(researchCache),
  };
  downloadJson("APC_Content_OS_v2.3_Reference_Archive_" + now.slice(0, 10) + ".json", envelope);
}

async function importData(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error("Backup exceeds the 64 MB import limit.");
    const parsed = JSON.parse(await file.text());
    const envelope = validateBackupEnvelope(parsed);
    const researchItemCount = envelope.research.items.length;
    const preview = [
      "Import this validated planning state and offline queue?",
      "",
      Object.keys(envelope.state.calendar).length + " calendar statuses",
      envelope.state.book.length + " book notes",
      envelope.state.results.length + " legacy state snapshots",
      envelope.analytics.length + " exported analytics records",
      envelope.analyticsQueue.length + " queued analytics records",
      researchItemCount + " exported research items",
      "",
      "Exported analytics and research are reference copies only.",
      "Cloud analytics and research remain canonical and are not overwritten.",
    ].join("\n");
    if (!confirm(preview)) return;
    await saveRecoveryCopy("Before backup import");
    await writeStateServerFirst(envelope.state, "import");
    await readAnalytics();
    const queueResult = await mergeRecoveredAnalyticsQueue(envelope.analyticsQueue);
    await Promise.all([readResearch(), readHistory()]);
    await flushAnalyticsQueue();
    alert(
      "The validated state was imported as a new cloud revision. " +
      queueResult.restored + " queued analytics snapshot(s) remain after deduplication."
    );
  } catch (error) {
    alert(text(error && error.message) || "Backup could not be imported.");
  } finally {
    fileInput.value = "";
  }
}

async function resetAll() {
  if (syncMeta.dirty || syncInFlight) {
    alert("Wait for current changes to sync before resetting.");
    return;
  }
  const confirmation = prompt("Type RESET to replace synced planning data with an empty state. Analytics and research history are preserved.");
  if (confirmation !== "RESET") return;
  try {
    await saveRecoveryCopy("Before reset");
    await writeStateServerFirst(defaultContentOsState(), "reset");
    await readHistory();
    alert("The synced working state was reset. Analytics, research, and revision history were preserved.");
  } catch (error) {
    alert(text(error && error.message));
  }
}


function renderAll() {
  renderCalendar();
  renderTopics();
  renderResults();
  renderResearch();
  renderSelectedResearchContext();
  renderBook();
  refreshDashboard();
  renderHistory();
  renderRecoveryCopy();
  renderConnectorState();
}

function handleClick(event) {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const action = control.dataset.action;

  if (action === "scroll-prompts") {
    scrollToNode(element("prompts"), "start");
  } else if (action === "scroll-results") {
    scrollToNode(element("results"), "start");
  } else if (action === "connect-provider") {
    const provider = control.dataset.connectorProvider;
    if (["meta", "tiktok", "youtube"].includes(provider)) {
      location.assign(ENDPOINTS.connections + "/" + provider + "/start?returnTo=" + encodeURIComponent("/content-os/#results"));
    }
  } else if (action === "disconnect-connector") {
    disconnectConnector(control.dataset.connectionId, control.dataset.provider).catch(function (error) {
      element("connectorFormStatus").textContent = text(error && error.message);
    });
  } else if (action === "previous-month") {
    shiftCalendarMonth(-1);
  } else if (action === "next-month") {
    shiftCalendarMonth(1);
  } else if (action === "cancel-plan-edit") {
    resetPlanForm();
    element("planEditor").open = false;
  } else if (action === "sync-retry") {
    if (cloudMode === "local") cloudMode = "checking";
    syncFromCloud().catch(function () {});
  } else if (action === "sync-review-conflict") {
    reviewCloudConflict().catch(function (error) {
      setSyncStatus("Conflict kept", "error", text(error && error.message), true);
    });
  } else if (action === "use-calendar-topic" || action === "log-calendar-topic") {
    const date = control.dataset.date;
    const entry = state.calendar[date];
    if (!entry) return;
    if (action === "use-calendar-topic") useTopic(entry.topic, entry.stage, entry.family, entry.area);
    else logTopic(entry.topic, entry.area, entry.family, date);
  } else if (action === "edit-plan-item") {
    const date = control.dataset.date;
    const entry = state.calendar[date];
    if (entry) prefillPlanForm(entry.topic, entry.area, entry.family, entry.stage, date);
  } else if (action === "delete-plan-item") {
    deletePlanItem(control.dataset.date).catch(function (error) { alert(text(error && error.message)); });
  } else if (action === "use-bank-topic" || action === "plan-bank-topic" ||
      action === "log-bank-topic" || action === "book-bank-topic") {
    const topic = DATA.topics[Number(control.dataset.index)];
    if (!topic) return;
    if (action === "use-bank-topic") useTopic(topic.hook, topic.stage, topic.family, topic.name);
    if (action === "plan-bank-topic") prefillPlanForm(topic.hook, topic.name, topic.family, topic.stage, "");
    if (action === "log-bank-topic") logTopic(topic.hook, topic.name, topic.family, "");
    if (action === "book-bank-topic") sendTopicToBook(topic.hook, topic.stage, topic.family, topic.name);
  } else if (action === "clear-analytics") {
    clearAnalyticsForm();
  } else if (action === "discard-queued-analytics") {
    discardQueuedAnalytics(control.dataset.snapshotId).catch(function () {});
  } else if (action === "show-more-analytics") {
    visibleResultLimit += DEFAULT_RESULT_LIMIT;
    renderResults();
  } else if (action === "build-prompt") {
    buildPrompt();
  } else if (action === "clear-research-context") {
    clearSelectedResearchContext();
  } else if (action === "copy-prompt") {
    copyPrompt().catch(function () {});
  } else if (action === "save-book") {
    saveBookItem().catch(function (error) { alert(text(error && error.message)); });
  } else if (action === "delete-book") {
    deleteBookItem(Number(control.dataset.id)).catch(function (error) { alert(text(error && error.message)); });
  } else if (action === "refresh-research") {
    readResearch().catch(function () {});
  } else if (action === "use-research") {
    useResearchItem(control.dataset.itemId).catch(function () {});
  } else if (action === "plan-research-topic") {
    const item = researchCache.items.find(function (candidate) { return candidate.itemId === control.dataset.itemId; });
    if (item && item.type === "topic" && isPlainObject(item.data)) {
      const topicMatch = topicBankMatchForResearch(item.data);
      prefillPlanForm(
        item.data.hook,
        topicMatch ? topicMatch.name : (item.data.category || item.data.parent_problem),
        topicMatch ? topicMatch.family : (DATA.families.includes(item.data.category) ? item.data.category : ""),
        topicMatch ? topicMatch.stage : "",
        ""
      );
    }
  } else if (action === "archive-research") {
    archiveResearchItem(control.dataset.itemId).catch(function () {});
  } else if (action === "export-data") {
    exportData().catch(function (error) { alert(text(error && error.message)); });
  } else if (action === "export-recovery-copy") {
    exportRecoveryCopy();
  } else if (action === "restore-recovery-copy") {
    restoreRecoveryCopy().catch(function (error) { alert(text(error && error.message)); });
  } else if (action === "reset-all") {
    resetAll().catch(function () {});
  } else if (action === "refresh-history") {
    readHistory().catch(function () {});
  } else if (action === "show-older-history") {
    visibleHistoryLimit += 50;
    renderHistory();
  } else if (action === "restore-history") {
    restoreHistory(Number(control.dataset.revision)).catch(function () {});
  }
}

function handleChange(event) {
  const control = event.target;
  const action = control.dataset ? control.dataset.action : "";

  if (action === "calendar-status") {
    const date = control.dataset.date;
    const status = control.value;
    if (!Object.hasOwn(state.calendar, date) || !CALENDAR_STATUSES.includes(status)) return;
    updateState(function (candidate) {
      candidate.calendar[date] = { ...candidate.calendar[date], status: status };
    }, "edit").catch(function (error) {
      setSyncStatus("Local save failed", "error", text(error && error.message), true);
    });
  } else if (action === "import-data") {
    importData(control).catch(function () {});
  }

  if (["familyFilter", "stageFilter", "useFilter"].includes(control.id)) renderTopics();
  if (control.id === "rPlatform") updateSourceForPlatform();
  if (control.id === "calendarMonth" && /^\d{4}-\d{2}$/.test(control.value)) {
    selectedCalendarMonth = control.value;
    renderAll();
  }
  if (["analyticsPlatformFilter", "analyticsCheckpointFilter"].includes(control.id)) {
    visibleResultLimit = DEFAULT_RESULT_LIMIT;
    renderResults();
  }
}

async function recoverLocalCaches() {
  let hasCurrentState = false;
  try {
    hasCurrentState = Boolean(localStorage.getItem(STORAGE.state) || STORAGE.legacyState.some(function (key) {
      return Boolean(localStorage.getItem(key));
    }));
  } catch {
    hasCurrentState = true;
  }

  if (!hasCurrentState) {
    try {
      const recoveredState = await idbGet("state", "main");
      if (recoveredState) {
        const migrated = migrateContentOsState(recoveredState);
        assertValidContentOsState(migrated);
        state = migrated;
        localStateIsUntouchedStarter = false;
        await persistState(false);
      }
    } catch {
      startupWarning = startupWarning || "The IndexedDB planning state could not be recovered.";
    }
  }

  try {
    const recoveredAnalytics = await idbGet("cache", "analytics");
    if (recoveredAnalytics !== undefined) {
      if (!Array.isArray(recoveredAnalytics) || recoveredAnalytics.length > MAX_ANALYTICS_RECORDS ||
          !recoveredAnalytics.every(validAnalyticsRecord)) {
        throw new Error("IndexedDB analytics cache failed validation.");
      }
      analyticsRecords = recoveredAnalytics.map(structuredClone);
      await persistAnalyticsCache();
    }
  } catch (error) {
    startupWarning = startupWarning || text(error && error.message) || "The analytics cache could not be recovered.";
  }

  try {
    const recoveredQueue = await idbGet("cache", "analyticsQueue");
    if (recoveredQueue !== undefined) {
      if (!Array.isArray(recoveredQueue) || recoveredQueue.length > MAX_ANALYTICS_QUEUE ||
          !recoveredQueue.every(validQueuedAnalytics)) {
        throw new Error("IndexedDB analytics queue failed validation.");
      }
      await mergeRecoveredAnalyticsQueue(recoveredQueue);
    }
  } catch (error) {
    startupWarning = startupWarning || text(error && error.message) || "The offline queue could not be recovered.";
  }

  try {
    const recoveredResearch = await idbGet("cache", "research");
    if (recoveredResearch !== undefined && validResearchCache(recoveredResearch)) {
      researchCache = structuredClone(recoveredResearch);
      persistResearchCache();
    }
  } catch {
    startupWarning = startupWarning || "The research cache could not be recovered.";
  }

  await loadLatestRecoveryCopy();
}

async function initialise() {
  initialiseFormOptions();
  initialiseSectionNavigation();
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  element("topicSearch").addEventListener("input", renderTopics);
  element("analyticsSearch").addEventListener("input", function () {
    visibleResultLimit = DEFAULT_RESULT_LIMIT;
    renderResults();
  });
  element("analyticsForm").addEventListener("submit", function (event) {
    event.preventDefault();
    saveAnalytics().catch(function (error) { setAnalyticsStatus(text(error && error.message), "error"); });
  });
  element("automaticAnalyticsForm").addEventListener("submit", function (event) {
    event.preventDefault();
    trackPublicationAutomatically().catch(function (error) {
      element("connectorFormStatus").textContent = text(error && error.message);
    });
  });
  element("planForm").addEventListener("submit", function (event) {
    event.preventDefault();
    savePlanItem().catch(function (error) { alert(text(error && error.message)); });
  });
  initialiseNetworkSync();

  await recoverLocalCaches();
  renderAll();
  if (startupWarning) {
    setSyncStatus("Local recovery used", "warning", startupWarning, true);
  }

  await syncFromCloud();
  await Promise.all([readAnalytics(), readResearch(), readHistory(), readConnectorState()]);
  await flushAnalyticsQueue();
  renderAll();
}

initialise().catch(function (error) {
  setSyncStatus(
    "Content OS needs attention",
    "error",
    text(error && error.message) || "The app could not finish starting. Validated local data was not changed.",
    true
  );
});
