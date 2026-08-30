import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

const target = await loadTarget({ requireRemote: true, pageKey: 'platform.runtimeInventory' });
const localTargets = await readOptionalJson('config/targets.local.json');
const browserOrganization = localTargets?.browserAuth?.organization || null;
const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || target.manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名，请在 config/targets.local.json 配置 webOrigin');

const pageUrl = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin).href;
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
await fs.mkdir(profilePath, { recursive: true });
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
  const heading = page.getByRole('heading', { name: '宜搭运行时只读探针' });
  const loginActions = await completeKnownYidaLogin(page, heading, browserOrganization);
  const screenshotPath = path.join(root, '.cache/playwright/platform-runtime/runtime-inventory.png');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });

  try {
    await heading.waitFor({ state: 'visible', timeout: 15_000 });
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const pageText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    throw new Error(
      `远程页面未出现运行时探针。已执行认证动作: ${loginActions.join(', ') || '无'}。页面摘要: ${pageText.slice(0, 600)}\n${error.message}`,
    );
  }

  const evidenceText = await page.locator('pre.runtime-code').innerText({ timeout: 15_000 });
  const inventory = JSON.parse(evidenceText);
  if (inventory?.schemaVersion !== 1) throw new Error('运行时证据 schemaVersion 不正确');
  if (inventory?.safety?.level !== 'L0') throw new Error('运行时探针没有保持 L0');
  if (inventory?.safety?.sensitiveValuesRedacted !== true) throw new Error('运行时证据未声明脱敏');
  if (inventory?.safety?.unknownFunctionsCalled !== false) throw new Error('运行时探针调用了未知函数');
  if (inventory?.expectedAppMatched !== true) throw new Error('运行时 appType 与构建目标不一致');
  if (pageErrors.length) throw new Error(`远程页面出现运行时错误：${pageErrors.join(' | ')}`);

  const serialized = JSON.stringify(inventory);
  const forbiddenValues = [
    localTargets?.browserAuth?.organization?.corpId,
    localTargets?.browserAuth?.organization?.corpName,
  ].filter(Boolean);
  for (const value of forbiddenValues) {
    if (serialized.includes(value)) throw new Error('脱敏证据包含本地组织身份值');
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  const evidencePath = path.join(root, '.cache/playwright/platform-runtime/runtime-inventory.evidence.json');
  await writeJsonAtomic(path.relative(root, evidencePath), inventory);
  const result = {
    success: true,
    pageKey: target.page.key,
    checkedAt: new Date().toISOString(),
    loginActions,
    assertions: {
      heading: true,
      expectedAppMatched: true,
      safetyLevel: 'L0',
      sensitiveValuesRedacted: true,
      unknownFunctionsCalled: false,
      pageErrors: 0,
    },
    discovered: {
      capabilityCount: inventory.capabilities.length,
      availableCapabilityCount: inventory.capabilities.filter((item) => item.source !== 'none').length,
      nativeComponentNames: inventory.nativeComponentNames,
    },
    screenshot: path.relative(root, screenshotPath),
    evidence: path.relative(root, evidencePath),
  };
  await writeJsonAtomic('.cache/playwright/platform-runtime/runtime-inventory.json', result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
