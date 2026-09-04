import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";

import { buildSite, PUBLIC_FILES } from "../scripts/build-site.mjs";

function assetVersion(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "apc-site-build-"));
  for (const relativePath of PUBLIC_FILES) {
    const path = join(root, ...relativePath.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "fixture:" + relativePath);
  }
  for (const relativePath of [
    "CLAUDE.md",
    "DESIGN.md",
    "Credientials (Full).png",
    "package.json",
    "wrangler.jsonc",
    "docs/internal.md",
    "tests/private.test.mjs",
    "migrations/0001.sql",
    "scripts/private.mjs",
    "functions/_middleware.js",
  ]) {
    const path = join(root, ...relativePath.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "private:" + relativePath);
  }
  return root;
}

async function walk(directory, root = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, root));
    else files.push(relative(root, path).split(sep).join("/"));
  }
  return files;
}

test("site build emits exactly the public allowlist", async () => {
  const root = await fixture();
  try {
    const result = await buildSite(root);
    assert.deepEqual((await walk(result.output)).sort(), [...PUBLIC_FILES].sort());
    for (const required of [
      "index.html",
      "_headers",
      "_routes.json",
      "connect/index.html",
      "pay/index.html",
      "content-os/index.html",
      "content-os/app.css",
      "content-os/app.js",
      "content-os/analytics.js",
      "content-os/research-schema.js",
      "content-os/schema.js",
      "content-os/episodes/index.html",
      "content-os/episodes/app.js",
    ]) {
      assert.equal((await lstat(join(result.output, ...required.split("/")))).isFile(), true);
    }
    for (const excluded of [
      "CLAUDE.md",
      "DESIGN.md",
      "Credientials (Full).png",
      "package.json",
      "wrangler.jsonc",
      "docs/internal.md",
      "tests/private.test.mjs",
      "migrations/0001.sql",
      "scripts/private.mjs",
      "functions/_middleware.js",
    ]) {
      await assert.rejects(readFile(join(result.output, ...excluded.split("/"))), /ENOENT/);
    }
    assert.equal(
      await readFile(join(root, "functions/_middleware.js"), "utf8"),
      "private:functions/_middleware.js",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("site build fails closed on missing allowlisted files", async () => {
  const root = await fixture();
  try {
    await unlink(join(root, "index.html"));
    await assert.rejects(buildSite(root), /Missing allowlisted public file: index\.html/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("site build fails closed on source and output symlinks", async () => {
  const sourceRoot = await fixture();
  const outputRoot = await fixture();
  const external = await mkdtemp(join(tmpdir(), "apc-site-external-"));
  try {
    await unlink(join(sourceRoot, "index.html"));
    await writeFile(join(sourceRoot, "outside.html"), "outside");
    await symlink(join(sourceRoot, "outside.html"), join(sourceRoot, "index.html"));
    await assert.rejects(buildSite(sourceRoot), /Symlinks are not allowed/);

    await symlink(external, join(outputRoot, "dist"), "dir");
    await assert.rejects(buildSite(outputRoot), /Existing dist must be a real directory/);
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});

test("Cloudflare Pages uses the allowlisted build output", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(config.pages_build_output_dir, "dist");
  assert.equal(packageJson.scripts.build, "node scripts/build-site.mjs");
});

test("shared asset query versions match their content hashes", async () => {
  const projectRoot = new URL("../", import.meta.url);
  const expectedVersions = new Map([
    ["apc-design-system.css", assetVersion(await readFile(new URL("../apc-design-system.css", import.meta.url)))],
    ["homepage.js", assetVersion(await readFile(new URL("../homepage.js", import.meta.url)))],
  ]);
  const referenceCounts = new Map([...expectedVersions.keys()].map(asset => [asset, 0]));

  for (const relativePath of PUBLIC_FILES.filter(path => path.endsWith(".html"))) {
    const html = await readFile(new URL(relativePath, projectRoot), "utf8");
    for (const [asset, expectedVersion] of expectedVersions) {
      const escapedAsset = asset.replaceAll(".", "\\.");
      const references = [...html.matchAll(new RegExp(`${escapedAsset}(?:\\?v=([^\\s\"'>]+))?`, "g"))];
      referenceCounts.set(asset, referenceCounts.get(asset) + references.length);
      for (const reference of references) {
        assert.equal(
          reference[1],
          expectedVersion,
          `${relativePath} must version ${asset} with its current content hash`,
        );
      }
    }
  }

  for (const [asset, count] of referenceCounts) {
    assert.ok(count >= 25, `Expected shared ${asset} references across public pages`);
  }
});
