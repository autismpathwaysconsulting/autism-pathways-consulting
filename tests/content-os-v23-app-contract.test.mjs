import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(relativePath) {
  return readFile(new URL("../" + relativePath, import.meta.url), "utf8");
}

test("manual analytics offers current checkpoints and platform sources only", async () => {
  const html = await source("content-os/index.html");
  assert.match(html, /<label for="rDate">Published<\/label>/);
  assert.match(html, /id="rDate"[^>]*required/);
  assert.match(html, /value="72h_legacy"\s+disabled/);
  assert.doesNotMatch(html, /<option>Legacy Content OS<\/option>/);
  assert.match(html, />Reset planning data<\/button>/);
});

test("backup and recovery include the validated offline analytics queue", async () => {
  const app = await source("content-os/app.js");
  assert.match(app, /MAX_IMPORT_BYTES = 64 \* 1024 \* 1024/);
  assert.match(app, /"state", "analytics", "analyticsQueue", "research"/);
  assert.match(app, /value\.analyticsQueue\.every\(validQueuedAnalytics\)/);
  assert.match(app, /mergeRecoveredAnalyticsQueue\(envelope\.analyticsQueue\)/);
  assert.match(app, /data-action/);
  assert.match(app, /"discard-queued-analytics"/);
  assert.match(app, /Discard this queued analytics snapshot/);
});

test("reference archive copy states the restore boundary", async () => {
  const html = await source("content-os/index.html");
  const app = await source("content-os/app.js");

  assert.match(html, />Export reference archive<\/button>/);
  assert.match(html, />Import planning \+ offline queue<input/);
  assert.match(html, /Cloud analytics and research are never overwritten\./);
  assert.match(app, /Reference_Archive_/);
  assert.match(app, /Exported analytics and research are reference copies only\./);
});

test("planner refuses a silent date overwrite and history starts compact", async () => {
  const app = await source("content-os/app.js");

  assert.match(app, /Object\.hasOwn\(state\.calendar, date\) && date !== editingCalendarDate/);
  assert.match(app, /That date already has a plan item\./);
  assert.match(app, /const DEFAULT_HISTORY_LIMIT = 20/);
  assert.match(app, /historyRecords\.slice\(0, visibleHistoryLimit\)/);
  assert.match(app, /show-older-history/);
  assert.match(app, /\[a-f0-9\]\{64\}/);
});

test("unknown product signals are not treated as measured zero", async () => {
  const app = await source("content-os/app.js");

  assert.match(
    app,
    /row\.signals\.paidCount === null[\s\S]*Paid registrations were not counted\./
  );
  assert.match(
    app,
    /row\.signals\.interestCount === null[\s\S]*Interest responses were not counted\./
  );
  assert.match(app, /Number\.isFinite\(row\.signals\.paidCount\) && row\.signals\.paidCount > 0/);
  assert.match(app, /Number\.isFinite\(row\.signals\.interestCount\) && row\.signals\.interestCount > 0/);
  assert.match(app, /Number\.isFinite\(value\) \? total \+ value : total/);
  assert.match(
    app,
    /Number\.isFinite\(row\.signals\.paidCount\) \? total \+ row\.signals\.paidCount : total/
  );
  assert.match(app, /explicitNotCounted: explicitNotCounted/);
  assert.match(app, /paidNotCounted: paidNotCounted/);
  assert.match(app, /signalCountSummary\(gate\.explicit, gate\.explicitNotCounted\)/);
  assert.match(app, /signalCountSummary\(gate\.paid, gate\.paidNotCounted\)/);
  assert.match(app, /fields? (?:was|were)["']?\)? \+ ["'] not counted/);
  assert.doesNotMatch(app, /No paid proof yet/);
  assert.doesNotMatch(app, /Interest is not demonstrated yet/);
});

test("current cloud state enforces restore provenance semantics", async () => {
  const app = await source("content-os/app.js");

  assert.match(app, /record\.restoredFromRevision === undefined \? null : record\.restoredFromRevision/);
  assert.match(
    app,
    /\(lastAction === "restore"\) !== \(restoredFromRevision !== null\)[\s\S]*Cloud restore provenance does not match its action\./
  );
  assert.match(app, /lastAction: lastAction/);
});

test("section navigation stays compact without capturing vertical page scroll", async () => {
  const html = await source("content-os/index.html");
  const css = await source("content-os/app.css");
  const app = await source("content-os/app.js");

  assert.match(html, /href="#dashboard" aria-current="location"/);
  assert.match(css, /scroll-snap-type: x proximity/);
  assert.match(css, /scroll-snap-stop: normal/);
  assert.match(css, /touch-action: pan-x pan-y/);
  assert.doesNotMatch(css, /overscroll-behavior-inline: contain/);
  assert.match(css, /\.page-section \+ \.page-section/);
  assert.match(app, /function initialiseSectionNavigation\(\)/);
  assert.match(app, /new IntersectionObserver/);
  assert.match(app, /setAttribute\("aria-current", "location"\)/);
  assert.match(app, /nav\.scrollTo\(\{ left:/);
  assert.doesNotMatch(app, /current\.scrollIntoView/);
});
