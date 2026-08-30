import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

if (process.env.YIDA_LAB_CONFIRM_SELF_ONLY_TERMINATE !== '1') {
  throw new Error('真实流程终止已阻断：必须显式设置 YIDA_LAB_CONFIRM_SELF_ONLY_TERMINATE=1');
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
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
const outputDirectory = path.join(root, '.cache/playwright/platform-process');
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
  const heading = page.getByRole('heading', { name: '宜搭平台流程沙箱' });
  const loginActions = await completeKnownYidaLogin(
    page,
    heading,
    localTargets?.browserAuth?.organization || null,
  );
  await heading.waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('lifecycle-inspect').click();
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-testid="lifecycle-evidence"]')?.textContent;
    if (!text) return false;
    try {
      return ['ready', 'failed'].includes(JSON.parse(text).phase);
    } catch {
      return false;
    }
  });
  const preflight = JSON.parse(await page.getByTestId('lifecycle-evidence').innerText());
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
  await page.getByTestId('lifecycle-acknowledge').check();
  const terminateButton = page.getByTestId('lifecycle-terminate');
  if (await terminateButton.isDisabled()) throw new Error('明确确认后终止按钮仍被禁用');
  await terminateButton.click();
  await page.waitForFunction(
    () => {
      const text = document.querySelector('[data-testid="lifecycle-evidence"]')?.textContent;
      if (!text) return false;
      try {
        return ['complete', 'failed'].includes(JSON.parse(text).phase);
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 30_000 },
  );
  const evidence = JSON.parse(await page.getByTestId('lifecycle-evidence').innerText());
  if (evidence.phase !== 'complete') {
    throw new Error(`流程终止失败：${evidence.error || 'unknown'}`);
  }
  if (
    !evidence.termination?.performed ||
    evidence.termination?.statusBefore !== 'RUNNING' ||
    evidence.termination?.statusAfter !== 'TERMINATED'
  ) {
    throw new Error('页面未确认流程状态由 RUNNING 变为 TERMINATED');
  }
  if (!(await terminateButton.isDisabled())) throw new Error('终止成功后按钮未锁定');
  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);

  const screenshotPath = path.join(outputDirectory, `process-terminate-${runId}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const result = {
    success: true,
    pageKey: target.page.key,
    loginActions,
    runId,
    phase: evidence.phase,
    uniqueMatch: evidence.discovery.uniqueMatch,
    statusBefore: evidence.termination.statusBefore,
    statusAfter: evidence.termination.statusAfter,
    recordDeleted: false,
    pageErrors: 0,
    screenshot: path.relative(root, screenshotPath),
  };
  await writeJsonAtomic('.cache/playwright/platform-process/terminate-result.json', result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
