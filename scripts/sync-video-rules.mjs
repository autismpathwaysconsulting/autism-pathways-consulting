import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const START = "<!-- CONTENT_OS_ACTIVE_RULES_START -->";
const END = "<!-- CONTENT_OS_ACTIVE_RULES_END -->";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "content-os/video-rules.js");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const sourceArguments = args.filter(arg => arg !== "--check");
const sourceArgument = sourceArguments[0] || process.env.APC_VIDEO_RULES_MASTER_PATH;

if (!sourceArgument || sourceArguments.length > 1 || args.filter(arg => arg === "--check").length > 1) {
  throw new Error("Usage: node scripts/sync-video-rules.mjs /absolute/path/to/APC_Video_Rules_and_Winning_Examples.md [--check]");
}
if (!isAbsolute(sourceArgument)) throw new Error("The canonical rules path must be absolute.");

const sourcePath = await realpath(sourceArgument);
const markdown = await readFile(sourcePath, "utf8");
const startIndex = markdown.indexOf(START);
const endIndex = markdown.indexOf(END);
if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex || markdown.indexOf(START, startIndex + START.length) >= 0 || markdown.indexOf(END, endIndex + END.length) >= 0) {
  throw new Error("The canonical rules file must contain exactly one ordered active-rule block.");
}

const activeRules = markdown
  .slice(startIndex + START.length, endIndex)
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean);
// This is the deliberately public projection schema, not permission to export
// arbitrary private-master sections. Review new rule labels before adding them.
const publicRuleLabels = new Set([
  "MASTER RULE SOURCE", "MASTER VERSION", "SOURCE POLICY", "REPLICATION POLICY",
  "CURRENT AUDIENCE DEFAULT", "CONTENT PRIORITY", "TOPIC GATE", "DEFAULT OPENING",
  "DUAL-SIGNAL HOOK", "THREE-HOOK STACK", "COMPARISON ROUTE", "CURIOSITY BRIDGE",
  "BODY", "DEMONSTRATION RULE", "SAVE/SHARE PAYOFF", "SAVE TRIGGER", "ALGORITHM CLAIMS",
  "CREDENTIAL", "CTA", "EMOTION", "LENGTH", "TWO-PERSON FORMAT", "VISUAL CARDS",
  "SAFE ZONE", "EVIDENCE", "SAFETY", "PROOF", "PRESERVE", "OUTPUT", "FORMAT", "EXPORT", "SCHEDULING",
]);
const labels = activeRules.map(line => line.split(": ", 1)[0]);
if (labels.some(label => !publicRuleLabels.has(label)) || new Set(labels).size !== labels.length) {
  throw new Error("The active-rule block contains an unreviewed or duplicate public rule label.");
}
const versionLine = activeRules.find(line => line.startsWith("MASTER VERSION: "));
if (!versionLine || !/^MASTER VERSION: \d{4}-\d{2}-\d{2}\.\d+$/.test(versionLine)) {
  throw new Error("The active-rule block has no valid MASTER VERSION line.");
}
if (!activeRules.some(line => line.startsWith("SOURCE POLICY: "))) {
  throw new Error("The active-rule block has no SOURCE POLICY line.");
}
if (!activeRules.includes("MASTER RULE SOURCE: APC-AI-OS/02_CONTENT_SYSTEM/APC_Video_Rules_and_Winning_Examples.md")) {
  throw new Error("The active-rule block does not identify the canonical master source.");
}

const version = versionLine.slice("MASTER VERSION: ".length);
const sha256 = createHash("sha256").update(markdown).digest("hex");
const generated = [
  "// Generated from the canonical APC-AI-OS master. Do not edit by hand.",
  "export const MASTER_VIDEO_RULES = Object.freeze({",
  `  version: ${JSON.stringify(version)},`,
  "  sourceRepository: \"autismpathwaysconsulting/APC-AI-OS\",",
  "  sourcePath: \"02_CONTENT_SYSTEM/APC_Video_Rules_and_Winning_Examples.md\",",
  `  sha256: ${JSON.stringify(sha256)},`,
  "  legacySourcesAllowed: false,",
  `  activeRules: Object.freeze(${JSON.stringify(activeRules, null, 2).replace(/^/gm, "  ").trimStart()}),`,
  "});",
  "",
  "export function masterVideoRulePromptLines() {",
  "  return [",
  "    \"APC MASTER VIDEO RULES\",",
  "    \"Canonical source: \" + MASTER_VIDEO_RULES.sourceRepository + \"/\" + MASTER_VIDEO_RULES.sourcePath,",
  "    \"Version: \" + MASTER_VIDEO_RULES.version,",
  "    \"SHA-256: \" + MASTER_VIDEO_RULES.sha256,",
  "    \"Legacy rule sources allowed: NO\",",
  "    \"\",",
  "    ...MASTER_VIDEO_RULES.activeRules,",
  "  ];",
  "}",
  "",
].join("\n");

if (checkOnly) {
  const current = await readFile(outputPath, "utf8");
  if (current !== generated) throw new Error("The Content OS video-rules projection is stale.");
  console.log("Video-rules projection matches master " + version + " at " + sha256 + ".");
} else {
  await writeFile(outputPath, generated, "utf8");
  console.log("Synced master video rules " + version + " to content-os/video-rules.js at " + sha256 + ".");
}
