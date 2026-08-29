import fs from 'node:fs/promises';
import path from 'node:path';
import { loadManifest, readJson, root } from './lib.mjs';

const manifest = await loadManifest();
const results = [];
for (const page of manifest.pages) {
  const contract = await readJson(page.contract);
  const sourcePath = path.join(root, page.source);
  const source = await fs.readFile(sourcePath, 'utf8');

  if (!page.source.endsWith(contract.sourceExtension)) {
    throw new Error(`${page.key}: 源码扩展名必须是 ${contract.sourceExtension}`);
  }

  const imports = [
    ...source.matchAll(/(?:^|;)\s*import\s*(?:[^'";]*?\bfrom\s*)?['"]([^'"]+)['"]/gm),
    ...source.matchAll(/(?:^|;)\s*export\s+[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm),
  ].map((match) => match[1]);
  const unknownImports = [...new Set(imports.filter((name) => !contract.allowedImports.includes(name)))];
  if (unknownImports.length) {
    throw new Error(`${page.key}: 发现未列入 Canvas 白名单的依赖：${unknownImports.join(', ')}`);
  }

  for (const marker of contract.requiredSourceMarkers) {
    if (!source.includes(marker)) throw new Error(`${page.key}: 源码缺少必要标记：${marker}`);
  }
  for (const pattern of contract.forbiddenSourcePatterns) {
    if (source.includes(pattern)) throw new Error(`${page.key}: 源码命中禁止模式：${pattern}`);
  }

  if (!new RegExp(`(?:function|const|let|class)\\s+${contract.entryComponent}\\b`).test(source)) {
    throw new Error(`${page.key}: 源码缺少入口组件 ${contract.entryComponent}`);
  }
  if (contract.requiredDefaultExport && !source.includes(`export default ${contract.entryComponent}`)) {
    throw new Error(`${page.key}: 源码必须默认导出 ${contract.entryComponent}`);
  }

  if (contract.forbidEmoji) {
    const emoji = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    if (emoji.test(source)) throw new Error(`${page.key}: Canvas 产物禁止包含 emoji`);
  }

  const secretPattern =
    /(access[_-]?token|refresh[_-]?token|app[_-]?secret|authorization)\s*[:=]\s*['"][^'"]+/i;
  if (secretPattern.test(source)) throw new Error(`${page.key}: 源码疑似包含硬编码凭证`);
  results.push({
    pageKey: page.key,
    source: page.source,
    entryComponent: contract.entryComponent,
    imports: [...new Set(imports)].sort(),
  });
}

console.log(
  JSON.stringify(
    {
      success: true,
      pages: results,
      checks: {
        extension: true,
        importAllowlist: true,
        requiredMarkers: true,
        forbiddenPatterns: true,
        noEmoji: true,
        noHardcodedSecrets: true,
      },
    },
    null,
    2,
  ),
);
