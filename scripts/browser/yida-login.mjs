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

export async function completeKnownYidaLogin(page, readyLocator, browserOrganization) {
  const actions = [];
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await readyLocator.isVisible().catch(() => false)) return actions;
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
