import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import { onRequest } from "../functions/api/site-metrics.js";
import { onRequest as report } from "../functions/api/content-os/site-metrics.js";
import { onRequest as auth } from "../functions/_middleware.js";

function database() {
  const db = new DatabaseSync(":memory:");
  return { db, prepare(sql) {
    const make = args => ({ bind: (...values) => make(values),
      run: async () => db.prepare(sql).run(...args),
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    });
    return make([]);
  }, batch: statements => Promise.all(statements.map(statement => statement.run())) };
}
const requestFor = (body, headers = {}) => new Request("https://autismpathwaysconsulting.com/api/site-metrics", {
  method: "POST", headers: { Origin: "https://autismpathwaysconsulting.com", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});

test("counters aggregate without identity, expire old totals, and expose a bounded report", async () => {
  const storage = database();
  storage.db.exec(await readFile(new URL("../site-metrics-migrations/0001_daily_counts.sql", import.meta.url), "utf8"));
  storage.db.exec("INSERT INTO daily_counts VALUES ('2020-01-01','home','page_view',1)");
  const env = { APC_CONTENT_OS_ENVIRONMENT: "production", APC_SITE_METRICS_DB: storage };
  for (let i = 0; i < 2; i++) assert.equal((await onRequest({ request: requestFor({ page: "services", event: "page_view" }), env })).status, 204);
  const rows = storage.db.prepare("SELECT * FROM daily_counts").all();
  assert.equal(rows.length, 1); assert.equal(rows[0].count, 2);
  assert.deepEqual(Object.keys(rows[0]), ["day", "page", "event", "count"]);
  const result = await report({ request: new Request("https://autismpathwaysconsulting.com/api/content-os/site-metrics"), env });
  assert.equal((await result.json()).rows[0].count, 2);
  storage.db.close();
});

test("collector rejects unsupported data, respects privacy signals and has no preview writes", async () => {
  let writes = 0;
  const env = { APC_CONTENT_OS_ENVIRONMENT: "production", APC_SITE_METRICS_DB: { prepare() { writes++; throw Error(); } } };
  for (const body of [{ page: "services", event: "page_view", email: "test@example.com" }, { page: "/private", event: "page_view" }, { page: "about", event: "booking_submitted" }, null]) {
    assert.equal((await onRequest({ request: requestFor(body), env })).status, 400);
  }
  assert.equal((await onRequest({ request: requestFor({ page: "home", event: "page_view" }, { DNT: "1" }), env })).status, 204);
  assert.equal((await onRequest({ request: requestFor({ page: "home", event: "page_view" }), env: { ...env, APC_CONTENT_OS_ENVIRONMENT: "preview" } })).status, 503);
  assert.equal(writes, 0);
});

test("website report remains behind existing Content OS authentication", async () => {
  const result = await auth({ request: new Request("https://autismpathwaysconsulting.com/api/content-os/site-metrics"), env: { APC_CONTENT_OS_ENVIRONMENT: "production", APC_CONTENT_OS_AUTH: "test-only-secret", APC_CONTENT_OS_DB: {} }, next: () => { throw Error("must authenticate first"); } });
  assert.equal(result.status, 401);
});

test("browser counters ignore form payloads, deduplicate callbacks, and respect privacy", async () => {
  const source = await readFile(new URL("../homepage.js", import.meta.url), "utf8");
  const start = source.indexOf("// Only broad page categories");
  const end = source.indexOf("const bookingLoad", start);
  function browser(navigator = {}, pathname = "/services") {
    const calls = []; const listeners = {};
    const context = { window: { location: { origin: "https://autismpathwaysconsulting.com", pathname, href: "https://autismpathwaysconsulting.com/services?private=excluded" } }, navigator,
      document: { visibilityState: "visible", addEventListener: (event, callback) => { listeners[event] = callback; } },
      fetch: (...args) => { calls.push(args); return Promise.resolve(); }, URL, Set };
    vm.createContext(context); vm.runInContext(source.slice(start, end), context);
    return { calls, context, listeners };
  }
  const active = browser();
  vm.runInContext('recordSiteMetric("booking_submitted"); recordSiteMetric("booking_submitted");', active.context);
  assert.equal(active.calls.length, 2);
  assert.deepEqual(JSON.parse(active.calls[1][1].body), { page: "services", event: "booking_submitted" });
  assert.equal(active.calls[1][1].credentials, "omit");
  assert.equal(active.calls[1][1].referrerPolicy, "no-referrer");
  assert.equal(browser({ doNotTrack: "1" }).calls.length, 0);
  assert.equal(browser({ globalPrivacyControl: true }).calls.length, 0);
  assert.equal(browser({}, "/privacy").calls.length, 0);
  assert.match(source, /action: "bookingSuccessfulV2",\s*callback: \(\) => recordSiteMetric\("booking_submitted"\)/);
});
