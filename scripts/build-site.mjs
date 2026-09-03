import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_FILES = Object.freeze([
  "404.html",
  "about.html",
  "bedtime.html",
  "booking-confirmed-call.html",
  "booking-confirmed-session.html",
  "cancellation-policy.html",
  "communication.html",
  "course-waitlist.html",
  "disclaimer.html",
  "echolalia.html",
  "free-tool.html",
  "homepage.js",
  "index.html",
  "mealtimes.html",
  "meltdowns.html",
  "mornings.html",
  "pay.html",
  "privacy.html",
  "resources.html",
  "school-collapse.html",
  "schools.html",
  "screens.html",
  "sensory-public.html",
  "services.html",
  "start.html",
  "task-initiation.html",
  "terms.html",
  "thank-you-free-guide.html",
  "apc-design-system.css",
  "apc-option-d-primary-logo.png",
  "apc-option-d-primary-logo.webp",
  "apple-touch-icon.png",
  "cj-photo.JPG",
  "cj-photo.webp",
  "favicon-32x32.png",
  "icon-192.png",
  "icon-512.png",
  "og-image.png",
  "The_Complete_Malaysian_Parent_Guide_by_CJ_Lim_APC.pdf",
  "site.webmanifest",
  "sitemap.xml",
  "robots.txt",
  "_redirects",
  "_routes.json",
  "connect/index.html",
  "pay/index.html",
  "content-os/index.html",
  "content-os/app.css",
  "content-os/app.js",
  "content-os/analytics.js",
  "content-os/research-schema.js",
  "content-os/schema.js",
]);

const DENIED_FIRST_SEGMENTS = new Set([
  ".git",
  ".github",
  ".openai",
  ".wrangler",
  "dist",
  "docs",
  "functions",
  "migrations",
  "node_modules",
  "scripts",
  "tests",
]);

const DENIED_FILENAMES = new Set([
  ".env",
  ".gitignore",
  "claude.md",
  "credientials (full).png",
  "design.md",
  "package-lock.json",
  "package.json",
  "wrangler.json",
  "wrangler.jsonc",
  "wrangler.toml",
]);

function inside(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent !== "" && pathFromParent !== ".." &&
    !pathFromParent.startsWith(".." + sep) && !posix.isAbsolute(pathFromParent.split(sep).join("/"));
}

function validateAllowlist(files) {
  const seen = new Set();
  for (const file of files) {
    if (typeof file !== "string" || !file || file.includes("\\") || file.includes("\0") ||
        posix.isAbsolute(file) || posix.normalize(file) !== file) {
      throw new Error("Unsafe public path: " + String(file));
    }
    const parts = file.split("/");
    if (parts.some(part => !part || part === "." || part === "..")) {
      throw new Error("Unsafe public path: " + file);
    }
    const first = parts[0].toLowerCase();
    const filename = parts.at(-1).toLowerCase();
    if (DENIED_FIRST_SEGMENTS.has(first) || DENIED_FILENAMES.has(filename)) {
      throw new Error("Operational path cannot be public: " + file);
    }
    if (seen.has(file)) throw new Error("Duplicate public path: " + file);
    seen.add(file);
  }
}

async function safeSourceFile(root, relativePath) {
  let current = root;
  const parts = relativePath.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error("Missing allowlisted public file: " + relativePath);
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error("Symlinks are not allowed in public paths: " + relativePath);
    }
    if (index < parts.length - 1 && !stats.isDirectory()) {
      throw new Error("Public path parent is not a directory: " + relativePath);
    }
    if (index === parts.length - 1 && !stats.isFile()) {
      throw new Error("Allowlisted public path is not a regular file: " + relativePath);
    }
  }
  const resolvedSource = resolve(root, ...parts);
  if (!inside(root, resolvedSource)) throw new Error("Public source escapes the project root: " + relativePath);
  const canonicalSource = await realpath(resolvedSource);
  if (canonicalSource !== resolvedSource) {
    throw new Error("Public source resolves through a symlink: " + relativePath);
  }
  return resolvedSource;
}

async function outputFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Build output contains a symlink: " + path);
    if (entry.isDirectory()) {
      files.push(...await outputFiles(path, root));
    } else if (entry.isFile()) {
      files.push(relative(root, path).split(sep).join("/"));
    } else {
      throw new Error("Build output contains an unsupported file type: " + path);
    }
  }
  return files;
}

export async function buildSite(projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")) {
  validateAllowlist(PUBLIC_FILES);
  const requestedRoot = resolve(projectRoot);
  const rootStats = await lstat(requestedRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error("Project root must be a real directory.");
  }
  const root = await realpath(requestedRoot);
  if (root !== requestedRoot) throw new Error("Project root must not resolve through symlinks.");

  const sources = new Map();
  for (const relativePath of PUBLIC_FILES) {
    sources.set(relativePath, await safeSourceFile(root, relativePath));
  }

  const output = resolve(root, "dist");
  if (dirname(output) !== root || !inside(root, output)) {
    throw new Error("Build output must be the project dist directory.");
  }
  try {
    const outputStats = await lstat(output);
    if (outputStats.isSymbolicLink() || !outputStats.isDirectory()) {
      throw new Error("Existing dist must be a real directory.");
    }
    await outputFiles(output);
    await rm(output, { recursive: true, force: false });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(output, { recursive: false });

  for (const relativePath of PUBLIC_FILES) {
    const source = sources.get(relativePath);
    const destination = resolve(output, ...relativePath.split("/"));
    if (!inside(output, destination)) throw new Error("Build destination escapes dist: " + relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }

  const actualFiles = (await outputFiles(output)).sort();
  const expectedFiles = [...PUBLIC_FILES].sort();
  if (actualFiles.length !== expectedFiles.length ||
      actualFiles.some((file, index) => file !== expectedFiles[index])) {
    throw new Error("Build output does not exactly match the public allowlist.");
  }
  return { output, files: actualFiles };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = await buildSite();
  console.log("Built " + result.files.length + " allowlisted public files in dist.");
}
