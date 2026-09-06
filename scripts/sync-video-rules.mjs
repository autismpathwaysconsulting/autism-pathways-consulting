import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const START = "<!-- CONTENT_OS_ACTIVE_RULES_START -->";
const END = "<!-- CONTENT_OS_ACTIVE_RULES_END -->";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "content-os/video-rules.js");
const sourceArgument = process.argv[2];
const checkOnly = process.argv.includes("--check");

if (!sourceArgument || sourceArgument === "--check") {
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
const versionLine = activeRules.find(line => line.startsWith("MASTER VERSION: "));
if (!versionLine || !/^MASTER VERSION: \d{4}-\d{2}-\d{2}\.\d+$/.test(versionLine)) {
  throw new Error("The active-rule block has no valid MASTER VERSION line.");
}
if (!activeRules.some(line => line.startsWith("SOURCE POLICY: "))) {
  throw new Error("The active-rule block has no SOURCE POLICY line.");
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
