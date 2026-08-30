import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

const target = await loadTarget({ requireRemote: true, pageKey: 'platform.apiCrud' });
const localTargets = await readOptionalJson('config/targets.local.json');
const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || target.manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名');

const pageUrl = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin).href;
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
const outputDirectory = path.join(root, '.cache/playwright/platform-crud');
await fs.mkdir(profilePath, { recursive: true });
await fs.mkdir(outputDirectory, { recursive: true });
const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'chrome',
  headless: process.env.YIDA_LAB_REMOTE_HEADLESS === '1',
  viewport: { width: 1440, height: 1000 },
});

try {
  const page = context.pages()[0] || (await context.newPage());
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const heading = page.getByRole('heading', { name: '宜搭 API 桥受控 CRUD 实验' });
  const loginActions = await completeKnownYidaLogin(
    page,
    heading,
    localTargets?.browserAuth?.organization || null,
  );
  await heading.waitFor({ state: 'visible', timeout: 15_000 });

  const readEvidence = async () => JSON.parse(await page.locator('pre.crud-code').innerText());
  const waitForPhase = async (phases) => {
    await page.waitForFunction(
      (expectedPhases) => {
        const value = document.querySelector('pre.crud-code')?.textContent;
        if (!value) return false;
        try {
          return expectedPhases.includes(JSON.parse(value).phase);
        } catch {
          return false;
        }
      },
      phases,
      { timeout: 30_000 },
    );
    return readEvidence();
  };

  const initial = await readEvidence();
  if (initial.schemaVersion !== 1 || initial.safety?.level !== 'L3') throw new Error('L3 证据契约不正确');
  if (!initial.expectedAppMatched) throw new Error('运行时应用与构建目标不一致');
  if (!initial.bridge?.available || !initial.bridge?.ready || initial.bridge.methods.length !== 5) {
    throw new Error('CRUD 桥方法不完整');
  }

  let completed;
  try {
    await page.getByTestId('crud-start').click();
    const prepared = await waitForPhase(['awaiting-delete', 'failed']);
    if (prepared.phase !== 'awaiting-delete') throw new Error(`CRUD 删除前阶段失败：${prepared.error}`);
    if (prepared.steps.length !== 6 || prepared.cleanup?.required !== true) {
      throw new Error('CRUD 删除前证据不完整');
    }

    await page.getByTestId('crud-delete').click();
    completed = await waitForPhase(['complete', 'failed']);
  } catch (error) {
    const cleanupButton = page.getByTestId('crud-delete');
    let cleanup = 'not-required';
    if (await cleanupButton.isEnabled().catch(() => false)) {
      await cleanupButton.click();
      const cleanupEvidence = await waitForPhase(['complete', 'failed']);
      cleanup = cleanupEvidence.phase;
    }
    throw new Error(`${error.message}；故障清理结果：${cleanup}`);
  }
  if (completed.phase !== 'complete') throw new Error(`CRUD 删除阶段失败：${completed.error}`);
  if (completed.steps.length !== 9 || completed.steps.some((item) => item.status !== 'passed')) {
    throw new Error('CRUD 步骤未全部通过');
  }
  if (
    completed.cleanup?.required !== false ||
    completed.cleanup?.completed !== true ||
    completed.cleanup?.remainingRecords !== 0
  ) {
    throw new Error('CRUD 清理状态不正确');
  }
  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);

  const serialized = JSON.stringify(completed);
  const forbiddenValues = [
    localTargets?.browserAuth?.organization?.corpId,
    localTargets?.browserAuth?.organization?.corpName,
    localTargets?.resources?.['platform.formSandbox']?.formUuid,
    ...Object.values(localTargets?.resources?.['platform.formSandbox']?.fields || {}),
  ].filter(Boolean);
  for (const value of forbiddenValues) {
    if (serialized.includes(value)) throw new Error('脱敏证据包含本地组织或资源标识');
  }
  if (/FINST[-_]|YIDA_RUNTIME_LAB_/.test(serialized)) throw new Error('脱敏证据包含实例 ID 或运行标记');

  const screenshotPath = path.join(outputDirectory, 'controlled-crud.png');
  const evidencePath = path.join(outputDirectory, 'controlled-crud.evidence.json');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeJsonAtomic(path.relative(root, evidencePath), completed);
  const result = {
    success: true,
    pageKey: target.page.key,
    loginActions,
    assertions: {
      safetyLevel: 'L3',
      expectedAppMatched: true,
      bridgeMethods: 5,
      passedSteps: 9,
      maxCreatedRecords: 1,
      exactDeleteByInstanceId: true,
      remainingRecords: 0,
      pageErrors: 0,
    },
    screenshot: path.relative(root, screenshotPath),
    evidence: path.relative(root, evidencePath),
  };
  await writeJsonAtomic('.cache/playwright/platform-crud/result.json', result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
