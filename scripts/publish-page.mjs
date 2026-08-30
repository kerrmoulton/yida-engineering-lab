import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluateLiveGuard } from './check-live-baseline.mjs';
import {
  commandJson,
  digest,
  fetchLiveSchema,
  findCanvasComponent,
  loadTarget,
  root,
  run,
  writeJsonAtomic,
} from './lib.mjs';

const target = await loadTarget({ requireRemote: true });
const sourceFlagIndex = process.argv.indexOf('--source');
const sourcePath =
  sourceFlagIndex >= 0 && process.argv[sourceFlagIndex + 1]
    ? process.argv[sourceFlagIndex + 1]
    : target.page.source;
const evidenceFlagIndex = process.argv.indexOf('--evidence');
const evidencePath =
  evidenceFlagIndex >= 0 && process.argv[evidenceFlagIndex + 1]
    ? process.argv[evidenceFlagIndex + 1]
    : `.cache/release/${target.page.key.replaceAll(/[^a-zA-Z0-9._-]/g, '-')}.json`;
const guard = await evaluateLiveGuard({ pageKey: target.page.key });
console.log(JSON.stringify({ stage: 'live-guard', ...guard }, null, 2));

const publishOutput = run(
  process.env.YIDA_LAB_OPENYIDA_BIN || 'openyida',
  ['publish', sourcePath, target.appType, target.page.formUuid, '--canvas', '--health-check'],
  { echo: true },
);
const published = commandJson(
  publishOutput,
  (value) =>
    value?.success === true && value?.formUuid === target.page.formUuid && value?.healthCheck?.ok === true,
);
if (published.healthCheck?.ok !== true) throw new Error('发布命令未返回 healthCheck.ok=true');
if (
  published.healthCheck?.displayComponentPresent !== true &&
  published.healthCheck?.readback?.hasYidaCodeCanvas !== true
) {
  throw new Error('发布健康检查未确认 display Canvas 组件');
}

const live = await fetchLiveSchema(target.appType, target.page.formUuid);
const canvas = findCanvasComponent(live.content);
const runtimeCode = String(canvas?.props?.runtimeCode || '');
if (!runtimeCode.trim()) throw new Error('独立回读未找到 runtimeCode');
const source = await fs.readFile(path.join(root, sourcePath), 'utf8');
const baseline = {
  schemaVersion: 1,
  pageKey: target.page.key,
  pageName: target.page.name,
  environment: target.manifest.application.environment,
  capturedAt: new Date().toISOString(),
  appType: target.appType,
  formUuid: target.page.formUuid,
  source: sourcePath,
  sourceSha256: digest(source),
  liveSemanticSha256: digest(live.content),
  runtimeCodeSha256: digest(runtimeCode),
  runtimeCodeBytes: runtimeCode.length,
  publishEvidence: {
    publishMode: published.publishMode || 'canvas',
    healthCheckOk: true,
    hasYidaCodeCanvas: true,
    publishedContentMatched: published.healthCheck?.publishedContentMatched === true,
  },
};
await writeJsonAtomic(target.page.baseline, baseline);
await writeJsonAtomic(evidencePath, { success: true, guard, baseline });
console.log(JSON.stringify({ success: true, stage: 'baseline-captured', baseline }, null, 2));
