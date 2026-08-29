import fs from 'node:fs/promises';
import path from 'node:path';
import { createPageRouteMap, loadManifest, root, run } from './lib.mjs';
import { createCanvasPublishSource, createCanvasRuntimeSource } from './tailwind-build-lib.mjs';

const requireTargets = process.argv.includes('--require-targets');
const manifest = await loadManifest();
const routes = createPageRouteMap(manifest, { requireRemote: requireTargets });
const tailwindPages = manifest.pages.filter((page) => page.build?.kind === 'tailwind');
let css = null;

if (tailwindPages.length) {
  const buildDefinitions = new Set(
    tailwindPages.map((page) => JSON.stringify([page.build.styleEntry, page.build.config])),
  );
  if (buildDefinitions.size !== 1) {
    throw new Error('当前构建器要求所有 Tailwind 页面共享 styleEntry 和 config');
  }
  const [tailwindPage] = tailwindPages;
  const cacheDirectory = path.join(root, '.cache/experiments/tailwind');
  const generatedCssPath = path.join(cacheDirectory, 'tailwind.css');
  await fs.mkdir(cacheDirectory, { recursive: true });
  run(
    path.join(root, 'node_modules/.bin/tailwindcss'),
    [
      '-i',
      tailwindPage.build.styleEntry,
      '-o',
      path.relative(root, generatedCssPath),
      '--config',
      tailwindPage.build.config,
      '--minify',
    ],
    { echo: true },
  );
  css = await fs.readFile(generatedCssPath, 'utf8');
}

const outputs = [];
for (const page of manifest.pages) {
  const authorSourcePath = path.join(root, page.authorSource);
  const outputPath = path.join(root, page.source);
  const authorSource = await fs.readFile(authorSourcePath, 'utf8');
  let output;
  if (page.build?.kind === 'tailwind') {
    output = createCanvasPublishSource(authorSource, css, routes);
  } else if (page.build?.kind === 'canvas') {
    output = createCanvasRuntimeSource(authorSource, routes);
  } else {
    throw new Error(`页面 ${page.key} 使用了未知构建类型：${page.build?.kind}`);
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, output, 'utf8');
  outputs.push({
    pageKey: page.key,
    authorSource: page.authorSource,
    output: page.source,
    outputBytes: Buffer.byteLength(output),
  });
}

console.log(
  JSON.stringify(
    {
      success: true,
      routes,
      cssBytes: css ? Buffer.byteLength(css) : 0,
      outputs,
    },
    null,
    2,
  ),
);
