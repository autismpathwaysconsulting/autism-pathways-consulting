import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { MASTER_VIDEO_RULES } from "../content-os/video-rules.js";

const START = "<!-- CONTENT_OS_ACTIVE_RULES_START -->";
const END = "<!-- CONTENT_OS_ACTIVE_RULES_END -->";
const syntheticMaster = [
  "PRIVATE BEFORE: synthetic excluded audit notes",
  START,
  "MASTER RULE SOURCE: APC-AI-OS/02_CONTENT_SYSTEM/APC_Video_Rules_and_Winning_Examples.md",
  "MASTER VERSION: 2026-09-27.2",
  "SOURCE POLICY: Synthetic active rules only.",
  "DEFAULT OPENING: Use a truthful practical hook.",
  END,
  "PRIVATE AFTER: synthetic excluded historical examples",
  "",
].join("\n");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "apc-video-rules-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "content-os"));
  const script = join(root, "scripts/sync-video-rules.mjs");
  const master = join(root, "private-master.md");
  const output = join(root, "content-os/video-rules.js");
  await copyFile(new URL("../scripts/sync-video-rules.mjs", import.meta.url), script);
  await writeFile(master, syntheticMaster);
  const run = (args = [master], env = {}) => spawnSync(process.execPath, [script, ...args], {
    cwd: root, encoding: "utf8", env: { ...process.env, APC_VIDEO_RULES_MASTER_PATH: "", ...env },
  });
  return { master, output, run };
}

test("current public projection pins the reviewed master and practical hook rules", () => {
  assert.equal(MASTER_VIDEO_RULES.version, "2026-09-27.2");
  assert.equal(MASTER_VIDEO_RULES.sha256, "b61858a9bbe12cd9b437aefb62b13c2d276d145804e06f6463132f7fe140a97a");
  for (const label of ["CONTENT PRIORITY", "TOPIC GATE", "THREE-HOOK STACK", "COMPARISON ROUTE", "DEMONSTRATION RULE", "SAVE/SHARE PAYOFF", "ALGORITHM CLAIMS"]) {
    assert.ok(MASTER_VIDEO_RULES.activeRules.some(rule => rule.startsWith(label + ": ")), label);
  }
  assert.ok(!MASTER_VIDEO_RULES.activeRules.some(rule => rule.includes('Begin with "Can I tell you something?" followed immediately')));
});

test("sync publishes only the marked block and hashes exact master bytes", async t => {
  const { master, output, run } = await fixture(t);
  assert.equal(run().status, 0);
  const generated = await readFile(output, "utf8");
  assert.doesNotMatch(generated, /PRIVATE BEFORE|PRIVATE AFTER|historical examples/);
  assert.ok(generated.includes(createHash("sha256").update(syntheticMaster).digest("hex")));
  assert.equal(run([master, "--check"]).status, 0);
  assert.equal(run(["--check", master]).status, 0);
  assert.equal(run(["--check"], { APC_VIDEO_RULES_MASTER_PATH: master }).status, 0);
  assert.equal(await readFile(output, "utf8"), generated);
});

test("freshness check fails without a source and on active or private-master drift without writing", async t => {
  const { master, output, run } = await fixture(t);
  assert.equal(run().status, 0);
  const generated = await readFile(output, "utf8");
  assert.notEqual(run(["--check"]).status, 0);
  assert.notEqual(run(["relative-master.md", "--check"]).status, 0);
  assert.notEqual(run([master, "unexpected"]).status, 0);
  for (const changed of [
    syntheticMaster.replace("truthful practical", "truthful specific"),
    syntheticMaster + "Another private audit note.\n",
  ]) {
    await writeFile(master, changed);
    const result = run([master, "--check"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /projection is stale/);
    assert.equal(await readFile(output, "utf8"), generated);
  }
});

test("sync fails closed for malformed, duplicated or unreviewed rule blocks", async t => {
  const { master, output, run } = await fixture(t);
  assert.equal(run().status, 0);
  const generated = await readFile(output, "utf8");
  for (const malformed of [
    syntheticMaster.replace(START, ""),
    syntheticMaster + START,
    syntheticMaster + END,
    syntheticMaster.replace(START, END).replace(END + "\nPRIVATE AFTER", START + "\nPRIVATE AFTER"),
    syntheticMaster.replace("MASTER VERSION: 2026-09-27.2", "MASTER VERSION: invalid"),
    syntheticMaster.replace("SOURCE POLICY: Synthetic active rules only.\n", ""),
    syntheticMaster.replace("MASTER RULE SOURCE: APC-AI-OS/", "MASTER RULE SOURCE: other/"),
    syntheticMaster.replace(END, "MASTER VERSION: 2026-09-28.1\n" + END),
    syntheticMaster.replace(END, "PRIVATE CLIENT NOTES: Must never be exported.\n" + END),
  ]) {
    await writeFile(master, malformed);
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(output, "utf8"), generated);
  }
});

test("the rule refresh retains the existing scoped Founder overrides after master defaults", async () => {
  for (const path of ["../content-os/episodes/app.js", "../content-os/app.js"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const start = source.indexOf("...masterVideoRulePromptLines()");
    assert.ok(start >= 0);
    const prompt = source.slice(start);
    assert.match(prompt, /FOUNDER-APPROVED/);
    assert.match(prompt, /(?:scoped override|overrides conflicting creative defaults)/);
    assert.match(source, /(?:Statistics, catchphrases|Statistics are optional)/);
  }
});
