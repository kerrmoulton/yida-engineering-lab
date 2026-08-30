import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

if (process.env.YIDA_LAB_CONFIRM_SELF_ONLY_COMPLETE !== '1') {
  throw new Error('真实流程更新与同意已阻断：必须显式设置 YIDA_LAB_CONFIRM_SELF_ONLY_COMPLETE=1');
}

const target = await loadTarget({ requireRemote: true, pageKey: 'platform.processSandbox' });
const localTargets = await readOptionalJson('config/targets.local.json');
const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || target.manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名');
const pageUrl = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin).href;
const runId = new Date()
  .toISOString()
  .replace(/[^0-9]/g, '')
  .slice(0, 17);
const updatedSummary = `本人流程桥完成验证 ${runId}`;
const updatedPayload = JSON.stringify({ schemaVersion: 1, purpose: 'self-only-complete', runId });
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
const outputDirectory = path.join(root, '.cache/playwright/platform-process');
await fs.mkdir(profilePath, { recursive: true });
await fs.mkdir(outputDirectory, { recursive: true });
const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'chrome',
  headless: process.env.YIDA_LAB_REMOTE_HEADLESS === '1',
  viewport: { width: 1440, height: 1100 },
});

function readLifecycleEvidence(page) {
  return page.getByTestId('lifecycle-evidence').innerText().then(JSON.parse);
}

async function waitForPhase(page, phases, timeout = 30_000) {
  await page.waitForFunction(
    (expectedPhases) => {
      const text = document.querySelector('[data-testid="lifecycle-evidence"]')?.textContent;
      if (!text) return false;
      try {
        return expectedPhases.includes(JSON.parse(text).phase);
      } catch {
        return false;
      }
    },
    phases,
    { timeout },
  );
}

try {
  const page = context.pages()[0] || (await context.newPage());
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const heading = page.getByRole('heading', { name: '宜搭平台流程沙箱' });
  const loginActions = await completeKnownYidaLogin(
    page,
    heading,
    localTargets?.browserAuth?.organization || null,
  );
  await heading.waitFor({ state: 'visible', timeout: 15_000 });

  await page.getByTestId('lifecycle-inspect').click();
  await waitForPhase(page, ['ready', 'failed']);
  const preflight = await readLifecycleEvidence(page);
  if (preflight.phase !== 'ready') {
    throw new Error(`生命周期门禁未通过：${preflight.error || 'unknown'}`);
  }
  if (
    !preflight.identityMatched ||
    !preflight.discovery?.uniqueMatch ||
    preflight.discovery?.taggedSelfOnlyCount !== 1 ||
    preflight.operations?.currentUserTodoCount !== 1
  ) {
    throw new Error('生命周期门禁证据不满足唯一本人实验流程约束');
  }

  await page.getByLabel('申请摘要').fill(updatedSummary);
  await page.getByLabel('实验载荷').fill(updatedPayload);
  await page.getByTestId('lifecycle-update-acknowledge').check();
  const updateButton = page.getByTestId('lifecycle-update');
  if (await updateButton.isDisabled()) throw new Error('明确确认后更新按钮仍被禁用');
  await updateButton.click();
  await waitForPhase(page, ['updated', 'failed']);
  const updated = await readLifecycleEvidence(page);
  if (updated.phase !== 'updated') throw new Error(`流程更新失败：${updated.error || 'unknown'}`);
  if (!updated.completion?.updatePerformed || !updated.completion?.updateVerified) {
    throw new Error('页面未确认流程字段更新并回读一致');
  }

  await page.getByTestId('lifecycle-approve-acknowledge').check();
  const approveButton = page.getByTestId('lifecycle-approve');
  if (await approveButton.isDisabled()) throw new Error('明确确认后同意按钮仍被禁用');
  await approveButton.click();
  await waitForPhase(page, ['complete', 'failed']);
  const evidence = await readLifecycleEvidence(page);
  if (evidence.phase !== 'complete') {
    throw new Error(`流程同意失败：${evidence.error || 'unknown'}`);
  }
  if (
    !evidence.completion?.approvalPerformed ||
    evidence.completion?.result !== 'AGREE' ||
    evidence.completion?.statusAfter !== 'COMPLETED' ||
    evidence.operations?.currentUserTodoCount !== 0 ||
    evidence.safety?.deleteAllowed !== false
  ) {
    throw new Error('页面未形成 AGREE、COMPLETED、待办清零且禁止删除的完整证据');
  }
  if (!(await approveButton.isDisabled())) throw new Error('完成后同意按钮未锁定');
  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);

  const screenshotPath = path.join(outputDirectory, `process-complete-${runId}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const result = {
    success: true,
    pageKey: target.page.key,
    loginActions,
    runId,
    updateVerified: evidence.completion.updateVerified,
    result: evidence.completion.result,
    statusAfter: evidence.completion.statusAfter,
    currentUserTodoCount: evidence.operations.currentUserTodoCount,
    recordDeleted: false,
    pageErrors: 0,
    screenshot: path.relative(root, screenshotPath),
  };
  await writeJsonAtomic('.cache/playwright/platform-process/complete-result.json', result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
