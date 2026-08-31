import { expect, test } from '@playwright/test';

test('advances the complete synthetic lifecycle and locks the result', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '绩效运行总览', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '绩效指标与量化' }).click();
  await expect(page.getByRole('heading', { name: '绩效指标与量化', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '返回运行总览' }).click();
  await expect(page.getByRole('heading', { name: '绩效运行总览', level: 1 })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '重置合成数据' }).click();
  await page.getByRole('button', { name: '确认重置' }).click();
  await page.getByRole('button', { name: '前往个人绩效配置' }).click();
  await page.getByRole('button', { name: '保存并提交配置' }).click();
  await page.getByRole('button', { name: '返回运行总览' }).click();
  await page.getByRole('button', { name: '前往数据填报与自评' }).click();
  await page.getByLabel('周期目标达成率实际值').fill('112');
  await page.getByLabel('交付质量实际值').fill('92');
  await page.getByLabel('协作与改进实际值').fill('88');
  await page.getByRole('button', { name: '提交实际数据' }).click();
  await page.getByLabel('周期目标达成率自评分').fill('39');
  await page.getByLabel('交付质量自评分').fill('32');
  await page.getByLabel('协作与改进自评分').fill('23');
  await page.getByRole('button', { name: '提交员工自评' }).click();
  await page.getByRole('button', { name: '返回运行总览' }).click();
  await page.getByRole('button', { name: '前往评价、核算与结算' }).click();
  const reviewValues: Array<[string, string]> = [
    ['合成直属评价人-周期目标达成率评分', '38'],
    ['合成直属评价人-交付质量评分', '32'],
    ['合成直属评价人-协作与改进评分', '23'],
    ['合成协作评价人-周期目标达成率评分', '37'],
    ['合成协作评价人-交付质量评分', '31'],
    ['合成协作评价人-协作与改进评分', '22'],
    ['合成矩阵评价人-周期目标达成率评分', '39'],
    ['合成矩阵评价人-交付质量评分', '33'],
    ['合成矩阵评价人-协作与改进评分', '24'],
  ];
  for (const [label, value] of reviewValues) await page.getByLabel(label).fill(value);
  await page.getByRole('button', { name: '提交评价矩阵' }).click();
  await page.getByRole('button', { name: '核算并锁定结果' }).click();
  await expect(page.getByText('本周期已结算，只读锁定生效。')).toBeVisible();
  await expect(page.getByText('94.8 · A')).toBeVisible();
});
