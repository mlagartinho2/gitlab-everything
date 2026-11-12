import { expect, test } from '@playwright/test';

// Runs against the demo data, which is rebuilt on every page load.
test('overview, drawers and actions', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/g\/1\/overview$/);
  await expect(page.locator('.tile')).toHaveCount(4);
  await expect(page.locator('.chart svg rect').first()).toBeVisible();

  await page.locator('.att button').first().click();
  await expect(page.locator('.drawer')).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();

  await page.getByRole('link', { name: 'Merge requests', exact: true }).click();
  await page.locator('.tbl tr.click').first().click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.toast')).toContainText('Approved');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'New issue' }).click();
  await page.locator('#ni-title-input').fill('Rotate the staging certificates');
  await page.getByRole('button', { name: 'Create issue' }).click();
  await expect(page.locator('.toast')).toContainText('Created #');
});

test('scope tree, pipelines, members and API explorer', async ({ page }) => {
  await page.goto('/');
  await page.locator('.tree .nl', { hasText: 'Payments' }).click();
  await expect(page.locator('.scope-head h1')).toHaveText('Payments');

  await page.getByRole('link', { name: 'Pipelines', exact: true }).click();
  await page.locator('.seg button', { hasText: 'Failed' }).click();
  await page.locator('.tbl tr.click').first().click();
  await expect(page.locator('.drawer .stage').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'Members', exact: true }).click();
  await expect(page.locator('.tbl tbody tr').first()).toBeVisible();

  await page.getByRole('link', { name: 'API explorer', exact: true }).click();
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.resmeta .tag').first()).toHaveText('200');
});
