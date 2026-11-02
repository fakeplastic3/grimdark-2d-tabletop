import { expect, test } from '@playwright/test';

test('start, recover, concede, and replay a local training match', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Original training rules — official 11th Edition mode is unavailable.')).toBeVisible();
  await page.getByRole('button', { name: 'Deploy forces' }).click();
  await expect(page.getByRole('navigation', { name: 'Current game phase' })).toContainText('Deployment');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Recovered the last valid local match.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Concede as commander 1' }).click();
  await expect(page.locator('.result-banner')).toContainText('wins.');
  await page.getByRole('button', { name: 'Replay match' }).click();
  await expect(page.getByRole('slider', { name: 'Replay position' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Return to match' }).click();
  await expect(page.locator('.result-banner')).toContainText('wins.');
  expect(errors).toEqual([]);
});
