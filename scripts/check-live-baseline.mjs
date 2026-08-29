import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, fetchLiveSchema, findCanvasComponent, loadTarget, readOptionalJson, root } from './lib.mjs';

export function assessLiveBaseline({ baseline, appType, formUuid, liveSemanticSha256, runtimeCode }) {
  if (!baseline) {
    if (runtimeCode.trim()) {
      throw new Error('远端页面已有 Canvas 代码但本地没有发布基线，停止首次发布以防覆盖');
    }
    return { mode: 'initial-blank-page' };
  }
  if (baseline.appType !== appType || baseline.formUuid !== formUuid) {
    throw new Error('发布基线与 manifest.json 的目标资源不一致');
  }
  if (baseline.liveSemanticSha256 !== liveSemanticSha256) {
    throw new Error(
      `线上页面已偏离 Git 发布基线，停止发布\nexpected=${baseline.liveSemanticSha256}\nactual=${liveSemanticSha256}`,
    );
  }
  return { mode: 'baseline-match' };
}

export async function evaluateLiveGuard({ pageKey } = {}) {
  const { page, appType } = await loadTarget({ requireRemote: true, pageKey });
  const live = await fetchLiveSchema(appType, page.formUuid);
  const liveSemanticSha256 = digest(live.content);
  const canvas = findCanvasComponent(live.content);
  const runtimeCode = String(canvas?.props?.runtimeCode || '');
  const baseline = await readOptionalJson(page.baseline);
  const assessment = assessLiveBaseline({
    baseline,
    appType,
    formUuid: page.formUuid,
    liveSemanticSha256,
    runtimeCode,
  });

  if (assessment.mode === 'initial-blank-page') {
    return {
      success: true,
      mode: 'initial-blank-page',
      pageKey: page.key,
      appType,
      formUuid: page.formUuid,
      liveSemanticSha256,
      remoteRuntimeCodeBytes: 0,
    };
  }

  const source = await fs.readFile(path.join(root, page.source), 'utf8');
  return {
    success: true,
    mode: 'baseline-match',
    pageKey: page.key,
    appType,
    formUuid: page.formUuid,
    liveSemanticSha256,
    localSourceChanged: digest(source) !== baseline.sourceSha256,
    remoteRuntimeCodeBytes: runtimeCode.length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  console.log(JSON.stringify(await evaluateLiveGuard(), null, 2));
}
