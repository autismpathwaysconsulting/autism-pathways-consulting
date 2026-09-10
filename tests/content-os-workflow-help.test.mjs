import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const studio = readFileSync(new URL("../content-os/episodes/index.html", import.meta.url), "utf8");
const home = readFileSync(new URL("../content-os/index.html", import.meta.url), "utf8");
test("workflow help is collapsed, accessible and covers all six situations", () => {
  assert.match(studio, /<details id="workflowHelp">/);
  assert.equal((studio.match(/<th scope="row">/g) || []).length, 6);
  assert.match(studio, /Dedicated link-only audit saving is not implemented/);
  assert.match(studio, /Winner-library saving is not connected/);
  assert.match(studio, /Show me how — prepare or change my script/);
});
test("dashboard links to the existing Studio tutorial and workflows", () => {
  assert.match(home, /episodes\/\?help=workflow#overview/);
  assert.match(home, /Open Episode Studio/);
  const nav = home.match(/<nav class="section-nav"[\s\S]*?<\/nav>/)[0];
  assert.doesNotMatch(nav, /Choose idea|Build episode|Film \+ edit|Final review/);
  assert.match(nav, /Published posts \+ analytics/);
});
