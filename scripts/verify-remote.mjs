import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, fetchLiveSchema, findCanvasComponent, loadTarget, readOptionalJson, root } from './lib.mjs';

export async function verifyRemote({ requireBaseline = true, pageKey } = {}) {
  const { page, appType } = await loadTarget({ requireRemote: true, pageKey });
  const live = await fetchLiveSchema(appType, page.formUuid);
  const canvas = findCanvasComponent(live.content);
  const runtimeCode = String(canvas?.props?.runtimeCode || '');
  if (!canvas || !runtimeCode.trim()) throw new Error('远端 Schema 未找到有效 YidaCodeCanvas.runtimeCode');

  const baseline = await readOptionalJson(page.baseline);
  const liveSemanticSha256 = digest(live.content);
  if (requireBaseline && !baseline) throw new Error('缺少远端发布基线');
  if (baseline && baseline.liveSemanticSha256 !== liveSemanticSha256) {
    throw new Error('远端 Schema 与发布基线不一致');
  }

  const source = await fs.readFile(path.join(root, page.source), 'utf8');
  return {
    success: true,
    pageKey: page.key,
    appType,
    formUuid: page.formUuid,
    hasYidaCodeCanvas: true,
    runtimeCodeBytes: runtimeCode.length,
    runtimeCodeSha256: digest(runtimeCode),
    liveSemanticSha256,
    sourceSha256: digest(source),
    baselineMatched: Boolean(baseline),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  console.log(JSON.stringify(await verifyRemote(), null, 2));
}
