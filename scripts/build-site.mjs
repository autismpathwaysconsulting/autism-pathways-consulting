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
  "apc-layout-repairs.css",
  "apc-offer-scan.css",
  "apc-topic-images.css",
  "course-escalation-480.webp",
  "course-escalation-960.webp",
  "guide-bedtime-480.webp",
  "guide-bedtime-960.webp",
  "guide-communication-480.webp",
  "guide-communication-960.webp",
  "guide-echolalia-480.webp",
  "guide-echolalia-960.webp",
  "guide-mealtimes-480.webp",
  "guide-mealtimes-960.webp",
  "guide-meltdowns-480.webp",
  "guide-meltdowns-960.webp",
  "guide-mornings-480.webp",
  "guide-mornings-960.webp",
  "guide-school-collapse-480.webp",
  "guide-school-collapse-960.webp",
  "guide-screens-480.webp",
  "guide-screens-960.webp",
  "guide-sensory-public-480.webp",
  "guide-sensory-public-960.webp",
  "guide-task-initiation-480.webp",
  "guide-task-initiation-960.webp",

  "404.html",
  "apc-parent-minimal.css",
  "apc-minimal-pages.css",
  "apc-audience-theme.css",
  "apc-schools.css",
  "apc-visual-language.css",
  "apc-image-led.css",
  "apc-section-visuals.css",
  "learning-workshop-480.webp",
  "learning-workshop-960.webp",
  "school-classroom-480.webp",
  "school-classroom-960.webp",
  "course-study-480.webp",
  "course-study-960.webp",
  "school-classroom-hero.svg",
  "home-support-materials-480.webp",
  "home-support-materials-960.webp",
  "first-step-call-materials-480.webp",
  "one-concern-session-materials-480.webp",
  "APC-School-Training-Overview.pdf",
  "content-os/programmes/follow-up.html",
  "content-os/programmes/follow-up.js",

  "programmes.html",
  "programmes.css",
  "programme-interest.js",
  "programme-explorer.js",
  "programme-volunteering-480.webp",
  "programme-volunteering-960.webp",
  "programme-money-480.webp",
  "programme-money-960.webp",
  "programme-camp-480.webp",
  "programme-camp-960.webp",
  "content-os/programmes/index.html",
  "content-os/programmes/resources.html",
  "content-os/programmes/files/APC_Saturday_Scouting_Pack.pdf",
  "content-os/programmes/files/APC_Saturday_Scouting_Pack.docx",
  "content-os/programmes/files/APC_Community_Crew_Partner_Brief.pdf",
  "content-os/programmes/files/APC_Community_Crew_Partner_Brief.docx",
  "content-os/programmes/readiness.html",
  "content-os/programmes/readiness.js",
  "content-os/programmes/app.js",
  "content-os/programmes/style.css",
  "guide-visual-mornings.svg",
  "guide-visual-bedtime.svg",
  "guide-visual-mealtimes.svg",
  "guide-visual-screens.svg",
  "guide-visual-communication.svg",
  "guide-visual-echolalia.svg",
  "guide-visual-meltdowns.svg",
  "guide-visual-school-collapse.svg",
  "guide-visual-sensory-public.svg",
  "guide-visual-task-initiation.svg",

  "apc-school-enquiry.js",
  "apc-navigation.js",
  "apc-navigation.css",
  "apc-audience-pages.css",
  "blog.html",
  "parents.html",
  "about.html",
  "autism-friendly-places-kl-pj.html",
  "autism-friendly-places-cover.webp",
  "places-one-utama-play-photo-400.webp",
  "places-one-utama-play-photo-800.webp",
  "places-one-utama-quiet-photo-400.webp",
  "places-we-rock-photo-400.webp",
  "places-gsc-photo-400.webp",
  "places-gsc-photo-800.webp",
  "places-sunway-putra-photo-400.webp",
  "places-toy8-photo-400.webp",
  "places-toy8-photo-800.webp",
  "places-sunway-velocity-photo-400.webp",
  "places-yl-gelateria-photo-400.webp",
  "autism-friendly-places-cover-400.webp",
  "autism-friendly-places-cover-800.webp",
  "places-we-rock.webp",
  "places-one-utama-play-photo.webp",
  "places-one-utama-quiet-photo.webp",
  "places-we-rock-photo.webp",
  "places-gsc-photo.webp",
  "places-sunway-putra-photo.webp",
  "places-toy8-photo.webp",
  "places-sunway-velocity-photo.webp",
  "places-yl-gelateria-photo.webp",
  "places-one-utama.webp",
  "places-gsc.webp",
  "places-sunway-putra.webp",
  "places-toy8.webp",
  "places-sunway-velocity.webp",
  "places-yl-gelateria.webp",

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
  "dm-sans-latin-v17.woff2",
  "dm-serif-display-latin-v17.woff2",
  "dm-sans-OFL.txt",
  "dm-serif-display-OFL.txt",
  "hero-clarity-path-768.webp",
  "hero-clarity-path-384.webp",
  "cj-photo-224.webp",
  "apc-logo-160.webp",
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
  "apc-article-layout.css",
  "apc-option-d-primary-logo.png",
  "apc-option-d-primary-logo.webp",
  "apple-touch-icon.png",
  "cj-photo.JPG",
  "cj-photo.webp",
  "favicon-32x32.png",
  "hero-clarity-path-v1.png",
  "hero-clarity-path-v1.webp",
  "icon-192.png",
  "icon-512.png",
  "og-image.png",
  "The_Complete_Malaysian_Parent_Guide_by_CJ_Lim_APC.pdf",
  "site.webmanifest",
  "sitemap.xml",
  "robots.txt",
  "_redirects",
  "_headers",
  "_routes.json",
  "connect/index.html",
  "pay/index.html",
  "pathways-lab/index.html",
  "pathways-lab/app.js",
  "pathways-lab/app-core.js",
  "pathways-lab/model.js",
  "pathways-lab/app-fixes.js",
  "content-os/index.html",
  "content-os/login.css",
  "content-os/app.css",
  "content-os/app.js",
  "content-os/analytics.js",
  "content-os/instagram-reels.js",
  "content-os/research-schema.js",
  "content-os/schema.js",
  "content-os/topic-bank.js",
  "content-os/episode-learning.js",
  "content-os/video-rules.js",
  "content-os/episodes/index.html",
  "content-os/episodes/app.js",
  "content-os/practice/index.html",
  "content-os/practice/app.js",
  "content-os/calm-feedback/index.html",
  "content-os/calm-feedback/app.js",
  "content-os/website/index.html",
  "content-os/website/app.js",
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
  const platformCanonicalRoot = process.platform === "darwin" && requestedRoot.startsWith("/var/")
    ? `/private${requestedRoot}`
    : requestedRoot;
  if (root !== platformCanonicalRoot) throw new Error("Project root must not resolve through symlinks.");

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
