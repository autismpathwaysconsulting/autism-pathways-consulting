import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_FILES = Object.freeze(["index.html", "login.css", "portal.css", "portal-data.js", "portal.js"]);

export async function buildPathwayPreview(root = resolve(dirname(fileURLToPath(import.meta.url)), "..")) {
  const publicRoot = join(root, "public");
  const output = join(root, "dist");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const file of PUBLIC_FILES) await copyFile(join(publicRoot, file), join(output, file));
  const actual = (await readdir(output, { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name).sort();
  const expected = [...PUBLIC_FILES].sort();
  if (actual.join("\0") !== expected.join("\0")) throw new Error(`Unexpected pathway preview output: ${relative(root, output).split(sep).join("/")}`);
  return { output, files: actual };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildPathwayPreview();
  console.log(`Built ${result.files.length} isolated pathway preview files.`);
}

