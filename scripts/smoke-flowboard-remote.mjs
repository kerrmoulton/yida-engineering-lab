import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

const target = await loadTarget({ requireRemote: true, pageKey: 'flowboard.board' });
const localTargets = await readOptionalJson('config/targets.local.json');
const browserOrganization = localTargets?.browserAuth?.organization || null;
const transportIndex = process.argv.indexOf('--transport');
const transport = transportIndex === -1 ? 'connector' : process.argv[transportIndex + 1];
if (!['connector', 'direct'].includes(transport)) {
  throw new Error('--transport 只支持 connector 或 direct');
}
const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || target.manifest.application.webOrigin;
if (!webOrigin) {
  throw new Error('缺少宜搭网页域名，请在 config/targets.local.json 配置 webOrigin');
}
const pageUrlObject = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin);
pageUrlObject.searchParams.set('transport', transport);
const pageUrl = pageUrlObject.href;
const apiHealthUrl = 'http://127.0.0.1:4318/api/health';
let apiProcess = null;

async function apiIsReady() {
  try {
    return (await fetch(apiHealthUrl)).ok;
  } catch {
    return false;
  }
}

async function ensureApi() {
  if (await apiIsReady()) return false;
  apiProcess = spawn(
    path.join(root, 'node_modules/.bin/tsx'),
    ['labs/flowboard-fullstack/server/src/index.ts'],
    {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await apiIsReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Flowboard API 未能在 20 秒内启动');
}

async function clickSingleVisible(locator, options = {}) {
  if ((await locator.count()) !== 1 || !(await locator.isVisible())) return false;
  await locator.click(options);
  return true;
}

async function clickNamedControl(scope, name) {
  const semanticButton = scope.getByRole('button', { name, exact: true });
  if (await clickSingleVisible(semanticButton)) return true;
  return clickSingleVisible(scope.getByText(name, { exact: true }));
}

async function completeKnownYidaLogin(page, heading) {
  const actions = [];
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await heading.isVisible().catch(() => false)) return actions;
    const activePages = page.locator('.app-page.app-page-curr');
    const scope = (await activePages.count()) === 1 ? activePages : page;

    const knownButtons = [
      { name: '立即登录', action: 'account-login' },
      { name: '同意', action: 'oauth-consent' },
      { name: '登录', action: 'login' },
    ];
    let clickedKnownButton = false;
    for (const button of knownButtons) {
      if (await clickNamedControl(scope, button.name)) {
        actions.push(button.action);
        clickedKnownButton = true;
        await page.waitForTimeout(500);
        break;
      }
    }
    if (clickedKnownButton) continue;

    if (browserOrganization?.corpName) {
      const organization = scope.getByText(browserOrganization.corpName, { exact: true });
      const organizationRow = organization.locator('xpath=ancestor::tr[1]');
      const target = (await organizationRow.count()) === 1 ? organizationRow : organization;
      if (await clickSingleVisible(target, { force: true })) {
        actions.push(`organization:${browserOrganization.corpId || browserOrganization.corpName}`);
        await page.waitForTimeout(500);
        continue;
      }
    }

    await page.waitForTimeout(500);
  }
  return actions;
}

await ensureApi();
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
await fs.mkdir(profilePath, { recursive: true });
const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'chrome',
  headless: process.env.YIDA_LAB_REMOTE_HEADLESS === '1',
  viewport: { width: 1440, height: 1000 },
});

try {
  await context.grantPermissions(['local-network-access'], { origin: new URL(webOrigin).origin });
  const page = context.pages()[0] || (await context.newPage());
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const screenshotPath = path.join(root, `.cache/playwright/flowboard/remote-smoke-${transport}.png`);
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  const heading = page.getByRole('heading', { name: 'Flowboard' });
  const loginActions = await completeKnownYidaLogin(page, heading);
  try {
    await heading.waitFor({ state: 'visible', timeout: 10_000 });
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const pageText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    throw new Error(
      `远程页面未出现 Flowboard。URL: ${page.url()}。已执行认证动作: ${loginActions.join(', ') || '无'}。页面摘要: ${pageText.slice(0, 500)}\n${error.message}`,
    );
  }
  const healthLabel = transport === 'connector' ? '测试连接器在线' : '本地 API 在线';
  try {
    await page
      .locator('body')
      .filter({ hasText: healthLabel })
      .waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const pageText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    throw new Error(
      `Flowboard 未出现预期传输状态“${healthLabel}”。页面摘要: ${pageText.slice(0, 800)}\n${error.message}`,
    );
  }
  const taskCards = page.getByRole('article');
  const taskCount = await taskCards.count();
  if (taskCount < 1) throw new Error('远程页面已加载，但没有渲染任何任务卡片');
  if (pageErrors.length) throw new Error(`远程页面出现运行时错误：${pageErrors.join(' | ')}`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const evidence = {
    success: true,
    pageKey: target.page.key,
    transport,
    loginActions,
    checkedAt: new Date().toISOString(),
    assertions: { heading: true, healthLabel, minimumTaskCards: 1, taskCount, pageErrors: 0 },
    screenshot: path.relative(root, screenshotPath),
  };
  await writeJsonAtomic(`.cache/playwright/flowboard/remote-smoke-${transport}.json`, evidence);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await context.close();
  if (apiProcess) apiProcess.kill('SIGTERM');
}
