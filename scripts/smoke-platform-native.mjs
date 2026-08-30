import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

const target = await loadTarget({ requireRemote: true, pageKey: 'platform.nativeComponents' });
const localTargets = await readOptionalJson('config/targets.local.json');
const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || target.manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名');
const pageUrl = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin).href;
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
const outputDirectory = path.join(root, '.cache/playwright/platform-native');
const allowSyntheticUpload = process.env.YIDA_LAB_ALLOW_SYNTHETIC_UPLOAD === '1';
const requestedUploadComponents = new Set(
  (process.env.YIDA_LAB_SYNTHETIC_UPLOAD_COMPONENTS || 'AttachmentField,ImageField')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
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
  const uploadTransportEvidence = [];
  let activeUploadProbe = null;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (!activeUploadProbe) return;
    const request = response.request();
    if (!['xhr', 'fetch'].includes(request.resourceType())) return;
    uploadTransportEvidence.push({
      component: activeUploadProbe,
      method: request.method(),
      resourceType: request.resourceType(),
      status: response.status(),
    });
  });
  page.on('requestfailed', (request) => {
    if (!activeUploadProbe || !['xhr', 'fetch'].includes(request.resourceType())) return;
    uploadTransportEvidence.push({
      component: activeUploadProbe,
      method: request.method(),
      resourceType: request.resourceType(),
      status: 'transport-failed',
    });
  });
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const heading = page.getByRole('heading', { name: '宜搭原生组件兼容性实验' });
  const loginActions = await completeKnownYidaLogin(
    page,
    heading,
    localTargets?.browserAuth?.organization || null,
  );
  await heading.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(() => {
    const value = document.querySelector('pre.native-code')?.textContent;
    if (!value) return false;
    try {
      return JSON.parse(value).components.every((item) =>
        item.batch === 1 ? item.status !== 'unsupported' : item.message !== '已发现，等待挂载',
      );
    } catch {
      return false;
    }
  });
  const evidence = JSON.parse(await page.locator('pre.native-code').innerText());
  if (!evidence.expectedAppMatched) throw new Error('运行时应用与构建目标不一致');
  if (evidence.safety?.level !== 'L1' || evidence.safety?.mutations !== false) {
    throw new Error('L1 安全声明不正确');
  }
  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);
  const failed = evidence.components.filter((item) => item.batch === 1 && item.status !== 'mounted');
  if (failed.length) throw new Error(`原生组件未挂载：${JSON.stringify(failed)}`);
  const secondBatchMountFailures = evidence.components.filter(
    (item) => item.batch === 2 && item.status === 'failed',
  );
  if (secondBatchMountFailures.length) {
    throw new Error(`第二批原生组件挂载失败：${JSON.stringify(secondBatchMountFailures)}`);
  }

  const identity = await page.evaluate(() => ({
    userName: window.loginUser?.userName || '',
    deptName: window.loginUser?.deptName || '',
  }));
  if (!identity.userName || !identity.deptName) throw new Error('当前登录人上下文缺少姓名或部门名称');
  const readEvidence = async () => JSON.parse(await page.locator('pre.native-code').innerText());
  const waitForInteraction = async (name, expected) => {
    await page.waitForFunction(
      ({ componentName, expectedValue }) => {
        const text = document.querySelector('pre.native-code')?.textContent;
        if (!text) return false;
        const interaction = JSON.parse(text).interactions?.[componentName];
        if (!interaction) return false;
        return Object.entries(expectedValue).every(([key, value]) => {
          if (key === 'minimumChangeEvents') return interaction.changeEvents >= value;
          if (key === 'valueCount') return interaction.valueShape.count === value;
          return interaction[key] === value;
        });
      },
      { componentName: name, expectedValue: expected },
    );
  };
  const chooseOrganizationValue = async (placeholder, searchText) => {
    await page.getByPlaceholder(placeholder).click();
    const search = page.locator('input[placeholder="搜索"]:visible').first();
    await search.waitFor({ state: 'visible' });
    await search.fill(searchText);
    const option = page.locator('[role="option"]:visible').filter({ hasText: searchText }).first();
    await option.waitFor({ state: 'visible' });
    await option.click();
    await page.keyboard.press('Escape');
  };

  await chooseOrganizationValue('请选择当前组织成员（可不选择）', identity.userName);
  await waitForInteraction('EmployeeField', { selected: true, minimumChangeEvents: 1 });
  await page.getByTestId('EmployeeField-clear').click();
  await waitForInteraction('EmployeeField', { cleared: true, valueCount: 0 });
  await page.getByTestId('EmployeeField-refill').click();
  await waitForInteraction('EmployeeField', { controlledRefill: true, valueCount: 1 });
  await page.getByTestId('EmployeeField-clear').click();
  await waitForInteraction('EmployeeField', { cleared: true, valueCount: 0 });

  await chooseOrganizationValue('请选择部门（可不选择）', identity.deptName);
  await waitForInteraction('DepartmentField', { selected: true, minimumChangeEvents: 1 });
  await page.getByTestId('DepartmentField-clear').click();
  await waitForInteraction('DepartmentField', { cleared: true, valueCount: 0 });
  await page.getByTestId('DepartmentField-refill').click();
  await waitForInteraction('DepartmentField', { controlledRefill: true, valueCount: 1 });
  await page.getByTestId('DepartmentField-clear').click();
  await waitForInteraction('DepartmentField', { cleared: true, valueCount: 0 });

  await page.getByPlaceholder('请选择实验选项').click();
  await page.locator('[role="option"]:visible').filter({ hasText: '选项 A' }).first().click();
  await waitForInteraction('SelectField', { selected: true, minimumChangeEvents: 1 });
  await page.getByTestId('SelectField-clear').click();
  await waitForInteraction('SelectField', { cleared: true, valueCount: 0 });

  const uploadFixtures = {
    AttachmentField: {
      name: 'openyida-synthetic-probe.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('OpenYida synthetic upload probe\n', 'utf8'),
    },
    ImageField: {
      name: 'openyida-synthetic-probe.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    },
  };
  const remoteUploadResults = {};
  for (const name of ['AttachmentField', 'ImageField']) {
    const component = evidence.components.find((item) => item.name === name);
    if (component?.status !== 'mounted') continue;
    const card = page.locator('.ant-card').filter({ hasText: name }).first();
    const input = card.locator('input[type="file"]');
    await input.setInputFiles(uploadFixtures[name]);
    await waitForInteraction(name, { selected: true, minimumChangeEvents: 1, valueCount: 1 });
    await page.getByTestId(`${name}-clear`).click();
    await waitForInteraction(name, { cleared: true, valueCount: 0 });
    await page.getByTestId(`${name}-refill`).click();
    await waitForInteraction(name, { controlledRefill: true, valueCount: 1 });
    await page.getByTestId(`${name}-clear`).click();
    await waitForInteraction(name, { cleared: true, valueCount: 0 });
  }

  for (const name of allowSyntheticUpload ? ['AttachmentField', 'ImageField'] : []) {
    if (!requestedUploadComponents.has(name)) continue;
    const component = evidence.components.find((item) => item.name === name);
    if (component?.status !== 'mounted') continue;
    const card = page.locator('.ant-card').filter({ hasText: name }).first();
    const input = card.locator('input[type="file"]');
    await page.getByTestId(`${name}-enable-upload`).click();
    await waitForInteraction(name, { remoteUploadEnabled: true });
    activeUploadProbe = name;
    await input.setInputFiles([]);
    await input.setInputFiles(uploadFixtures[name]);
    await waitForInteraction(name, { remoteUploadAttempted: true });
    await page.waitForFunction(
      (componentName) => {
        const text = document.querySelector('pre.native-code')?.textContent;
        if (!text) return false;
        const interaction = JSON.parse(text).interactions?.[componentName];
        return interaction?.remoteUploadSucceeded || interaction?.remoteUploadFailed;
      },
      name,
      { timeout: 60_000 },
    );
    const uploadedEvidence = await readEvidence();
    const upload = uploadedEvidence.interactions[name];
    activeUploadProbe = null;
    if (!upload.remoteUploadSucceeded || upload.remoteUploadFailed) {
      remoteUploadResults[name] = {
        attempted: true,
        supportedByStandaloneComponent: false,
        failureShape: {
          file: upload.uploadErrorFileShape,
          value: upload.uploadErrorValueShape,
        },
        transport: uploadTransportEvidence.filter((item) => item.component === name),
      };
      continue;
    }
    if (!upload.valueShape.itemKeys.some((key) => /url|download|preview|status/i.test(key))) {
      throw new Error(`${name} 上传成功但返回结构缺少可识别的文件字段`);
    }
    if (name === 'ImageField') {
      const thumbnail = card.locator('img').last();
      await thumbnail.waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForFunction(
        (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        await thumbnail.elementHandle(),
      );
    }
    await page.getByTestId(`${name}-clear`).click();
    await waitForInteraction(name, {
      componentValueClearedAfterUpload: true,
      valueCount: 0,
    });
    remoteUploadResults[name] = {
      attempted: true,
      supportedByStandaloneComponent: true,
      componentValueCleared: true,
      transport: uploadTransportEvidence.filter((item) => item.component === name),
    };
  }

  const interactionEvidence = await readEvidence();
  const anyRemoteUploadSucceeded = Object.values(remoteUploadResults).some(
    (item) => item.supportedByStandaloneComponent,
  );
  if (
    interactionEvidence.safety?.mutations !== anyRemoteUploadSucceeded ||
    interactionEvidence.safety?.syntheticFilesOnly !== true ||
    interactionEvidence.safety?.remoteFileDeletionGuaranteed !== false
  ) {
    throw new Error('伪造文件上传后的安全声明不正确');
  }
  const interactionFailures = interactionEvidence.components.filter(
    (item) => item.batch === 1 && item.status !== 'mounted',
  );
  if (interactionFailures.length) {
    throw new Error(`交互后原生组件状态异常：${JSON.stringify(interactionFailures)}`);
  }
  await page.getByTestId('file-sandbox-open').click();
  const fileSandboxIframe = page.locator('iframe[title="宜搭文件存储实验沙箱"]');
  await fileSandboxIframe.waitFor({ state: 'visible', timeout: 20_000 });
  const fileSandboxSrc = await fileSandboxIframe.getAttribute('src');
  if (!fileSandboxSrc?.includes('/submission/') || !fileSandboxSrc.includes('isRenderNav=false')) {
    throw new Error('真实表单上传容器路由不符合 submission 隐藏导航契约');
  }
  const fileSandboxFrame = await (await fileSandboxIframe.elementHandle()).contentFrame();
  if (!fileSandboxFrame) throw new Error('真实表单上传容器 iframe 未建立内容上下文');
  await fileSandboxFrame.getByText('伪造测试附件', { exact: true }).waitFor({ state: 'visible' });
  await fileSandboxFrame.getByText('伪造测试图片', { exact: true }).waitFor({ state: 'visible' });
  await page.locator('.ant-drawer-close').click();
  await fileSandboxIframe.waitFor({ state: 'hidden' });
  const serializedEvidence = JSON.stringify(interactionEvidence);
  for (const sensitiveValue of [identity.userName, identity.deptName]) {
    if (serializedEvidence.includes(sensitiveValue)) throw new Error('脱敏证据包含人员或部门名称');
  }
  const screenshotPath = path.join(outputDirectory, 'native-components.png');
  const evidencePath = path.join(outputDirectory, 'native-components.evidence.json');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeJsonAtomic(path.relative(root, evidencePath), interactionEvidence);
  const result = {
    success: true,
    pageKey: target.page.key,
    loginActions,
    mounted: evidence.components.map(({ name, source, status }) => ({ name, source, status })),
    interactions: {
      EmployeeField: {
        popup: true,
        search: true,
        selectCurrentUser: true,
        clear: true,
        controlledRefill: true,
      },
      DepartmentField: {
        popup: true,
        search: true,
        selectCurrentDepartment: true,
        clear: true,
        controlledRefill: true,
      },
      SelectField: { popup: true, select: true, clear: true },
      AttachmentField: {
        available:
          interactionEvidence.components.find((item) => item.name === 'AttachmentField')?.status ===
          'mounted',
        localSelect: true,
        remoteUploadAuthorized: allowSyntheticUpload,
        remoteUpload: remoteUploadResults.AttachmentField || null,
        syntheticOnly: true,
        clear: true,
        controlledRefill: true,
      },
      ImageField: {
        available:
          interactionEvidence.components.find((item) => item.name === 'ImageField')?.status === 'mounted',
        localSelect: true,
        remoteUploadAuthorized: allowSyntheticUpload,
        remoteUpload: remoteUploadResults.ImageField || null,
        syntheticOnly: true,
        thumbnailPreview: Boolean(remoteUploadResults.ImageField?.supportedByStandaloneComponent),
        clear: true,
        controlledRefill: true,
      },
      DataManageViews: {
        status: interactionEvidence.components.find((item) => item.name === 'DataManageViews')?.status,
        mountOnly: true,
      },
      FileSandboxFormContainer: {
        responsiveDrawer: true,
        submissionRoute: true,
        hideNavigation: true,
        uploadTriggered: false,
      },
    },
    pageErrors: 0,
    screenshot: path.relative(root, screenshotPath),
    evidence: path.relative(root, evidencePath),
  };
  await writeJsonAtomic('.cache/playwright/platform-native/result.json', result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
