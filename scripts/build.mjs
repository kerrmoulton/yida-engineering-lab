import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { loadManifest, readJson, root, writeJsonAtomic } from './lib.mjs';

const mode = process.argv[2] || 'test';
if (!['test', 'production'].includes(mode)) throw new Error('构建模式只能是 test 或 production');

const outdir = path.join(root, '.cache', 'build', 'bundles', mode);
await fs.rm(outdir, { recursive: true, force: true });
await fs.mkdir(outdir, { recursive: true });

const manifest = await loadManifest();
const pages = [];
for (const page of manifest.pages) {
  const contract = await readJson(page.contract);
  const pageOutdir = path.join(outdir, page.key.replaceAll(/[^a-zA-Z0-9._-]/g, '-'));
  const result = await build({
    entryPoints: [path.join(root, page.source)],
    outdir: pageOutdir,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    outExtension: { '.js': '.jsx' },
    external: contract.allowedImports,
    metafile: true,
    sourcemap: true,
    logLevel: 'info',
  });
  const imports = [
    ...new Set(
      Object.values(result.metafile.outputs).flatMap((item) => item.imports.map((entry) => entry.path)),
    ),
  ];
  pages.push({
    pageKey: page.key,
    source: page.source,
    outputDirectory: path.relative(root, pageOutdir),
    importedModules: imports.sort(),
    outputBytes: Object.values(result.metafile.outputs).reduce((sum, item) => sum + item.bytes, 0),
  });
}
const report = {
  success: true,
  mode,
  outputDirectory: path.relative(root, outdir),
  pages,
};
await writeJsonAtomic(`.cache/build/${mode}.json`, report);
console.log(JSON.stringify(report, null, 2));
